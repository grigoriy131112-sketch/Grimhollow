import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, getMember, grantMemberXp } from './party.js';
import { getLocation, recordVisit } from './world.js';
import { startBattle } from './battles.js';
import { grantItem } from './items.js';
import { RITUAL_ITEM, itemInfo } from '../game/items.js';
import { RITUAL_SITE } from '../game/revival.js';
import {
  planTravel, startState, tick, resume, hasArrived, elapsedWalkMs, currentMinute,
  MS_PER_MINUTE, encounterOptions, resolveEncounter,
} from '../game/travel.js';

// Wall-clock time, injectable so tests can drive the road without waiting.
const clock = () => Date.now();

function requireCharacter(characterId) {
  const c = getCharacter(characterId);
  if (!c) throw new Error('Персонаж не найден');
  return c;
}

function loadTravel(id) {
  const row = getDb().prepare('SELECT * FROM travels WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state) };
}

function saveState(id, state) {
  getDb().prepare("UPDATE travels SET state = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(state), id);
}

function locationView(id) {
  const l = getLocation(id);
  if (!l) return null;
  return { id: l.id, name: l.name, scene: l.scene, biome: l.biome, danger: l.danger, isSafe: !!l.is_safe };
}

// The engine works in map coordinates (x/y); a stored location uses map_x/map_y.
function roadPoint(loc) {
  if (!loc) return null;
  return { id: loc.id, x: loc.map_x, y: loc.map_y, biome: loc.biome, danger: loc.danger, isSafe: !!loc.is_safe };
}

function planFor(travel) {
  return planTravel({
    from: roadPoint(getLocation(travel.from_id)), to: roadPoint(getLocation(travel.to_id)),
    seed: `${travel.from_id}->${travel.to_id}`,
  });
}

// Begin a trip between two neighbouring places. A character may only be on one
// road at a time, so an unfinished journey is returned rather than replaced.
export function startTravel({ characterId, fromId, toId, now = clock() }) {
  requireCharacter(characterId);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM travels WHERE character_id = ? AND arrived = 0 ORDER BY id DESC LIMIT 1').get(characterId);
  if (existing) return getTravelView(existing.id, now);

  const from = getLocation(fromId);
  const to = getLocation(toId);
  if (!from || !to) throw new Error('Локация не найдена');
  if (from.id === to.id) throw new Error('Вы уже здесь');

  // The party can only set out from where it actually stands. Without this a
  // client could name any place as the origin and teleport across the map.
  const here = db.prepare('SELECT location_id FROM characters WHERE id = ?').get(characterId)?.location_id;
  if (here == null) {
    // A character that has never been placed begins its journey at the origin.
    recordVisit(characterId, from.id);
  } else if (here !== from.id) {
    throw new Error('Отряд не находится здесь');
  }

  const road = db.prepare('SELECT 1 FROM connections WHERE from_id = ? AND to_id = ?').get(from.id, to.id);
  if (!road) throw new Error('Между этими местами нет дороги');

  const plan = planTravel({ from: roadPoint(from), to: roadPoint(to) });
  const state = startState(plan, now);
  const info = db.prepare(
    `INSERT INTO travels (character_id, from_id, to_id, minutes, state) VALUES (?, ?, ?, ?, ?)`,
  ).run(characterId, from.id, to.id, plan.minutes, JSON.stringify(state));
  return getTravelView(info.lastInsertRowid, now);
}

// Read a journey, first letting the clock catch it up. If the road is done the
// trip is marked arrived and stays readable: the client keeps polling, so the
// finishing poll must see `arrived: true` rather than a 404.
export function getTravelView(id, now = clock()) {
  const travel = loadTravel(id);
  if (!travel) return null;
  if (travel.arrived) return buildView(travel, now);

  const before = travel.state;
  const state = tick(before, now);

  if (hasArrived(state, travel.minutes, now)) return finish(travel, state, now);
  if (state !== before) saveState(id, state);
  return buildView({ ...travel, state }, now);
}

// Mark a road complete: remember where the party arrived, keep the row so the
// arrival is idempotent, and hand back the arrived view. The drowned chapel
// yields the key the resurrection ritual needs the first time it is entered.
function finish(travel, state, now) {
  getDb().prepare("UPDATE travels SET state = ?, arrived = 1, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(state), travel.id);
  const { firstVisit } = recordVisit(travel.character_id, travel.to_id);
  const arrivedAt = getLocation(travel.to_id);
  let found = null;
  if (firstVisit && arrivedAt && arrivedAt.name === RITUAL_SITE) {
    grantItem(travel.character_id, RITUAL_ITEM, 1);
    found = { key: RITUAL_ITEM, ...itemInfo(RITUAL_ITEM) };
  }
  return { ...buildView({ ...travel, state, arrived: 1 }, now), found };
}

function buildView(travel, now) {
  const state = travel.state;
  const pending = state.pending;
  const elapsed = elapsedWalkMs(state, now);
  const arrived = !!travel.arrived || hasArrived(state, travel.minutes, now);
  const minute = arrived ? travel.minutes : Math.min(travel.minutes, currentMinute(state, now));
  const totalMs = travel.minutes * MS_PER_MINUTE;

  return {
    id: travel.id,
    characterId: travel.character_id,
    from: locationView(travel.from_id),
    to: locationView(travel.to_id),
    minutes: travel.minutes,
    minute,
    progress: Math.max(0, Math.min(1, totalMs ? elapsed / totalMs : 1)),
    arrived,
    // True while a stop holds the party: the road does not advance until answered.
    paused: !!pending,
    stopsLeft: Math.max(0, state.events.length - state.cursor),
    // When the party will arrive if nothing stops them again (null while paused).
    arrivesAt: pending || arrived ? null : now + Math.max(0, totalMs - elapsed),
    pending: pending ? { minute: pending.minute, title: pending.encounter.title } : null,
    encounter: pending
      ? { id: pending.encounter.id, kind: pending.encounter.kind, title: pending.encounter.title, options: encounterOptions(pending.encounter) }
      : null,
    lastOutcome: state.lastOutcome || null,
  };
}

// Answer the encounter that has stopped the party. Time spent deciding does not
// count against the road: the walk resumes from the stop's minute.
export function chooseTravel(id, choice, now = clock()) {
  const travel = loadTravel(id);
  if (!travel) return null;

  const caught = tick(travel.state, now);
  if (!caught.pending) throw new Error('Сейчас нечего решать');

  const plan = planFor(travel);
  const outcome = resolveEncounter({ encounter: caught.pending.encounter, choice, seed: plan.seed, danger: plan.danger });

  let battle = null;
  let finalOutcome = outcome;
  if (outcome.kind === 'battle') {
    // A road can end somewhere with nothing left to fight; fall back to a quiet
    // resolution rather than stranding the party on a broken encounter.
    try {
      battle = startBattle({ characterId: travel.character_id, locationId: travel.to_id });
    } catch {
      finalOutcome = { kind: 'nothing', text: 'Дорога пуста — бой не состоялся.' };
    }
  } else {
    applyOutcome(travel.character_id, outcome);
  }

  const answered = { ...caught, cursor: caught.cursor + 1, pending: null, lastOutcome: { choice, ...finalOutcome } };
  const next = resume(answered, now);
  return { travel: commit(travel, next, now), outcome: finalOutcome, battleId: battle?.id ?? null };
}

// Persist the new state, or finish the trip if the far end has been reached.
function commit(travel, state, now) {
  if (hasArrived(state, travel.minutes, now)) return finish(travel, state, now);
  saveState(travel.id, state);
  return getTravelView(travel.id, now);
}

// Apply an outcome to the leader and, where it makes sense, the whole party.
function applyOutcome(characterId, outcome) {
  const db = getDb();
  const character = requireCharacter(characterId);
  const members = activeMembers(characterId).map((m) => getMember(m.id));

  if (outcome.kind === 'gold') {
    const gold = Math.max(0, character.gold + outcome.delta);
    db.prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, characterId);
    return;
  }

  if (outcome.kind === 'heal') {
    healCharacter(characterId, outcome);
    members.forEach((m) => grantMemberXp(m.id, {
      hp: Math.min(m.stats.maxHp, m.hp + Math.round(outcome.hp / 2)),
      mana: Math.min(m.stats.maxMana, m.mana + Math.round(outcome.mana / 2)),
      stamina: Math.min(m.stats.maxStamina, m.stamina + Math.round(outcome.stamina / 2)),
    }));
    return;
  }

  if (outcome.kind === 'mana') {
    healCharacter(characterId, { mana: outcome.delta });
    members.forEach((m) => grantMemberXp(m.id, { mana: Math.min(m.stats.maxMana, m.mana + Math.round(outcome.delta / 2)) }));
  }
}

function healCharacter(characterId, { hp, mana, stamina }) {
  const db = getDb();
  const c = requireCharacter(characterId);
  const clamp = (field, delta) => (delta == null ? undefined : Math.min(c.stats[field], c[field] + delta));
  db.prepare("UPDATE characters SET hp = ?, mana = ?, stamina = ?, updated_at = datetime('now') WHERE id = ?")
    .run(
      clamp('hp', hp) ?? c.hp,
      clamp('mana', mana) ?? c.mana,
      clamp('stamina', stamina) ?? c.stamina,
      characterId,
    );
}
