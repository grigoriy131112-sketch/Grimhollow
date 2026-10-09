import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, getMember, grantMemberXp } from './party.js';
import { getLocation, recordVisit } from './world.js';
import { startBattle } from './battles.js';
import { resolveRoadEncounter } from './encounters.js';
import { grantItem } from './items.js';
import { advanceQuest } from './quests.js';
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
  recordVisit(travel.character_id, travel.to_id);
  const arrivedAt = getLocation(travel.to_id);
  // A completed road reports the arrival to the quests service, so a `visit`
  // objective ("сходить в Сумеречную гавань") advances without the manual button.
  if (arrivedAt) {
    try { advanceQuest(travel.character_id, { type: 'visit', target: arrivedAt.name }); } catch { /* best-effort */ }
  }
  // Grant on the first *arrival at* the chapel, not the first time it was ever
  // seen: opening the place from the map calls recordVisited (a mere sighting),
  // which used to consume the first-visit flag before the party ever walked in,
  // so the key could never drop. Tracked as a durable unlock, so it is granted
  // exactly once per hero.
  const found = grantChapelKey(travel.character_id, arrivedAt);
  return { ...buildView({ ...travel, state, arrived: 1 }, now), found };
}

// The drowned chapel's discovery item, granted once per hero.
function grantChapelKey(characterId, location) {
  if (!location || location.name !== RITUAL_SITE) return null;
  const db = getDb();
  const flag = `item:${RITUAL_ITEM}`;
  const already = db.prepare('INSERT OR IGNORE INTO character_unlocks (character_id, flag, quest_key) VALUES (?, ?, ?)')
    .run(characterId, flag, `${RITUAL_SITE}:${RITUAL_ITEM}`);
  if (already.changes === 0) return null; // already found it once
  grantItem(characterId, RITUAL_ITEM, 1);
  return { key: RITUAL_ITEM, ...itemInfo(RITUAL_ITEM) };
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
  let loot = null;
  if (outcome.kind === 'battle') {
    // The beast is not drawn from the destination's own hunt list: the road's
    // danger band and biome pick it from the shared bestiary pool, so a road
    // ambush can meet a horror neither endpoint would offer. When nothing can be
    // met (a bare band, a missing spawn) the road stays quiet instead of
    // stranding the party on a broken encounter.
    const spawned = resolveRoadEncounter({
      danger: plan.danger, biome: plan.biome, seed: plan.seed, minute: caught.pending.minute,
    });
    if (spawned && spawned.encounter.id) {
      try {
        battle = startBattle({
          characterId: travel.character_id,
          monsterId: spawned.encounter.id,
          locationId: travel.to_id,
          kind: 'encounter',
          loot: spawned.loot,
        });
        loot = spawned.loot;
        finalOutcome = { ...finalOutcome, monster: spawned.encounter.name };
      } catch {
        finalOutcome = { kind: 'nothing', text: 'Дорога пуста — бой не состоялся.' };
      }
    } else {
      finalOutcome = { kind: 'nothing', text: 'Дорога пуста — бой не состоялся.' };
    }
  } else if (outcome.kind === 'gold' || outcome.kind === 'heal' || outcome.kind === 'mana') {
    // `nothing` is a valid outcome (a quiet road, a dodge) and has nothing to apply;
    // only the ones with a resource effect are handed to applyOutcome.
    applyOutcome(travel.character_id, outcome);
  }

  const answered = { ...caught, cursor: caught.cursor + 1, pending: null, lastOutcome: { choice, ...finalOutcome } };
  const next = resume(answered, now);
  return { travel: commit(travel, next, now), outcome: finalOutcome, battleId: battle?.id ?? null, loot };
}

// Persist the new state, or finish the trip if the far end has been reached.
function commit(travel, state, now) {
  if (hasArrived(state, travel.minutes, now)) return finish(travel, state, now);
  saveState(travel.id, state);
  return getTravelView(travel.id, now);
}

// Apply an outcome to the leader and, where it makes sense, the whole party.
const RESOURCE_OUTCOMES = new Set(['gold', 'heal', 'mana']);
function applyOutcome(characterId, outcome) {
  if (!outcome || !RESOURCE_OUTCOMES.has(outcome.kind)) return;
  const db = getDb();
  const character = requireCharacter(characterId);
  const members = activeMembers(characterId).map((m) => getMember(m.id));

  if (outcome.kind === 'gold') {
    // Outcomes are computed from a seeded RNG, but guard the arithmetic so a
    // malformed delta can never store NaN/NULL into the purse.
    const delta = Math.round(Number(outcome.delta) || 0);
    const gold = Math.max(0, character.gold + delta);
    db.prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, characterId);
    return;
  }

  if (outcome.kind === 'heal') {
    const hp = Number(outcome.hp) || 0;
    const mana = Number(outcome.mana) || 0;
    const stamina = Number(outcome.stamina) || 0;
    healCharacter(characterId, { hp, mana, stamina });
    members.forEach((m) => grantMemberXp(m.id, {
      hp: Math.min(m.stats.maxHp, m.hp + Math.round(hp / 2)),
      mana: Math.min(m.stats.maxMana, m.mana + Math.round(mana / 2)),
      stamina: Math.min(m.stats.maxStamina, m.stamina + Math.round(stamina / 2)),
    }));
    return;
  }

  if (outcome.kind === 'mana') {
    const delta = Number(outcome.delta) || 0;
    healCharacter(characterId, { mana: delta });
    members.forEach((m) => grantMemberXp(m.id, { mana: Math.min(m.stats.maxMana, m.mana + Math.round(delta / 2)) }));
  }
}

function healCharacter(characterId, { hp, mana, stamina }) {
  const db = getDb();
  const c = requireCharacter(characterId);
  // Current resources live on the character; their ceilings live in `stats` under
  // maxHp/maxMana/maxStamina (there is no `stats.hp`). Reading the bare field name
  // made every clamp NaN, which the DB then stored as NULL — a full heal.
  const clamp = (value, delta, max) => (delta == null ? undefined : Math.min(max, value + delta));
  db.prepare("UPDATE characters SET hp = ?, mana = ?, stamina = ?, updated_at = datetime('now') WHERE id = ?")
    .run(
      clamp(c.hp, hp, c.stats.maxHp) ?? c.hp,
      clamp(c.mana, mana, c.stats.maxMana) ?? c.mana,
      clamp(c.stamina, stamina, c.stats.maxStamina) ?? c.stamina,
      characterId,
    );
}
