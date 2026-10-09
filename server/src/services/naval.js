// The sea (Wave W-SEA): pirates, sea monsters, non-repeating Fortune islands,
// the ship's papers and the voyage that ties them together. The fight itself is
// pure (game/naval.js); this service persists its state, settles the outcome and
// hangs the voyage / papers on top. Ship points are awarded here on a won sea
// battle -- the only source (W-SHIP exposes the hook).

import { getDb, transaction } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, getMember } from './party.js';
import { getLocation, recordVisit } from './world.js';
import { getShipBonuses, awardShipPoints } from './ship.js';
import { hasItem, takeItem } from './items.js';
import { advanceQuest, listUnlocks } from './quests.js';
import { routeFor, CROSSING_GATES } from '../game/continent_travel.js';
import {
  createSeaBattle, takeSeaAction, previewAction,
  seaPoints, playerSide, enemySideOf, rollVoyage, LORE_NOTES,
} from '../game/naval.js';

const SEA_DEFEAT_GOLD_PENALTY = 0.25;

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const clampTier = (t) => Math.max(1, Math.min(10, Math.floor(Number(t) || 1)));

function requireCharacter(characterId) {
  const c = getCharacter(characterId);
  if (!c) throw new Error('Персонаж не найден');
  return c;
}

// --- party strength (a compact summary the pure engine boards with) ----------

function partySummary(characterId) {
  const leader = requireCharacter(characterId);
  const members = activeMembers(characterId).map((m) => getMember(m.id));
  const attack = (leader.stats.attack || 0) + members.reduce((s, m) => s + (m.stats.attack || 0), 0);
  const defense = (leader.stats.defense || 0) + members.reduce((s, m) => s + (m.stats.defense || 0), 0);
  return { attack, defense, members: members.length + 1 };
}

// --- naval battles -----------------------------------------------------------

function battleRow(id) {
  return getDb().prepare('SELECT * FROM naval_battles WHERE id = ?').get(id) || null;
}

function activeBattleRow(characterId) {
  return getDb().prepare(
    "SELECT * FROM naval_battles WHERE character_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
  ).get(characterId) || null;
}

// Open a sea fight. Enemies scale with the ship's tier (= its level); a `tier`
// argument overrides it (a voyage names the tier explicitly).
export function startNavalBattle(characterId, { kind, tier, voyageId = null, seed } = {}) {
  const bonuses = getShipBonuses(characterId);
  if (!bonuses) throw new Error('Сначала купите корабль в порту.');
  if (activeBattleRow(characterId)) throw new Error('У вас уже идёт морской бой.');

  const safeKind = kind === 'sea_monster' ? 'sea_monster' : 'pirates';
  const t = clampTier(tier ?? bonuses.level);
  const party = partySummary(characterId);
  const seaSeed = seed || `${characterId}:${safeKind}:${t}:${voyageId ?? 'free'}`;
  const state = createSeaBattle({ kind: safeKind, tier: t, ship: { level: bonuses.level, bonuses, party }, seed: seaSeed });

  const info = getDb().prepare(
    `INSERT INTO naval_battles (character_id, kind, tier, voyage_id, state, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
  ).run(characterId, safeKind, t, voyageId, JSON.stringify(state));

  // The enemy may have decided the fight before the player acted (a faster foe).
  // Settle it now so a battle is never "active" with no turn to take.
  const row = battleRow(info.lastInsertRowid);
  if (state.over) return settleNaval(row);
  return getNavalView(info.lastInsertRowid);
}

export function getNavalView(id) {
  const row = battleRow(id);
  if (!row) return null;
  const state = parseJson(row.state, null);
  if (!state) return null;
  const hero = playerSide(state);
  const foe = enemySideOf(state);
  const activeKey = state.order[state.turnIndex % state.order.length];
  return {
    id: row.id,
    characterId: row.character_id,
    kind: row.kind,
    tier: row.tier,
    voyageId: row.voyage_id,
    status: row.status,
    over: !!state.over,
    winner: state.winner || null,
    round: state.round,
    isPlayerTurn: !state.over && activeKey === hero.key,
    player: navalSideView(hero),
    enemy: navalSideView(foe),
    actions: seaActions(state),
    result: parseJson(row.result, null),
  };
}

function navalSideView(s) {
  return {
    key: s.key, side: s.side, kind: s.kind, name: s.name,
    hull: { hp: s.hull.hp, maxHp: s.hull.maxHp },
    guns: s.guns ? { count: s.guns.count, damage: s.guns.damage, cooldown: s.guns.cooldown, accuracy: s.guns.accuracy } : null,
    attack: s.attack ?? null,
    evade: s.evade, speed: s.speed,
    crew: s.crew ? { hp: s.crew.hp, maxHp: s.crew.maxHp, count: s.crew.count } : null,
    cooldowns: s.cooldowns || {},
  };
}

// Which actions the player may attempt this turn, with honest previews.
function seaActions(state) {
  const p = playerSide(state);
  const list = ['broadside'];
  if (p.crew && p.crew.hp > 0 && enemySideOf(state).crew && enemySideOf(state).crew.hp > 0) list.push('board');
  if (p.ram) list.push('ram');
  return list;
}

export function getNavalPreview(id, action) {
  const row = battleRow(id);
  if (!row) return null;
  const state = parseJson(row.state, null);
  if (!state || state.over) return null;
  return previewAction(state, action || { type: 'broadside' });
}

export function takeNavalTurn(id, action = {}) {
  const row = battleRow(id);
  if (!row) throw new Error('Бой не найден');
  if (row.status !== 'active') throw new Error('Бой уже окончен');
  const state = parseJson(row.state, null);
  const { state: next, events } = takeSeaAction(state, action, Math.random);
  getDb().prepare("UPDATE naval_battles SET state = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(next), id);
  const fresh = battleRow(id);
  if (next.over) return { ...settleNaval(fresh), events };
  return { ...getNavalView(id), events };
}

export function fleeNavalBattle(id) {
  const row = battleRow(id);
  if (!row || row.status !== 'active') throw new Error('Бой не найден или уже окончен');
  const report = { outcome: 'fled', text: 'Корабль разрывает бой и уходит.' };
  getDb().prepare("UPDATE naval_battles SET status = 'fled', result = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(report), id);
  logPaper(row.character_id, { kind: 'flee', text: 'Отступили в море, ушли от боя.' });
  return getNavalView(id);
}

// Settle a finished fight once: pay the winner, write the papers, advance quests.
function settleNaval(row) {
  if (!row || row.status !== 'active') {
    return row ? getNavalView(row.id) : null;
  }
  const state = parseJson(row.state, null);
  const won = state?.winner === 'player';
  const characterId = row.character_id;
  const points = won ? seaPoints(row.kind, row.tier) : 0;
  const xp = won ? 10 + row.tier * 6 : 0;
  const gold = won ? 20 + row.tier * 10 : 0;

  const db = getDb();
  const report = { outcome: won ? 'won' : 'lost', kind: row.kind, tier: row.tier, points, xp, gold };
  // Pay the ship points first so the stored report carries the running total.
  if (won) report.shipPoints = awardShipPoints(characterId, points);

  transaction((d) => {
    if (won) {
      d.prepare("UPDATE characters SET xp = xp + ?, gold = gold + ?, updated_at = datetime('now') WHERE id = ?")
        .run(xp, gold, characterId);
    } else {
      // A lost sea fight is survivable, like a land defeat: the hero limps home
      // with 1 HP and loses a quarter of the purse. The ship is not sunk.
      const c = d.prepare('SELECT gold FROM characters WHERE id = ?').get(characterId);
      const lost = Math.floor((c?.gold ?? 0) * SEA_DEFEAT_GOLD_PENALTY);
      d.prepare("UPDATE characters SET hp = 1, gold = gold - ?, updated_at = datetime('now') WHERE id = ?")
        .run(lost, characterId);
      report.goldLost = lost;
    }
    d.prepare("UPDATE naval_battles SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?")
      .run(won ? 'won' : 'lost', JSON.stringify(report), row.id);
  });

  if (won) {
    logPaper(characterId, {
      kind: 'battle',
      text: row.kind === 'pirates'
        ? `Отбились от пиратов (ярус ${row.tier}). +${points} очков корабля.`
        : `Убили морское чудовище (ярус ${row.tier}). +${points} очков корабля.`,
    });
    try {
      advanceQuest(characterId, { type: 'kill', target: row.kind === 'pirates' ? 'пират' : 'морской монстр' });
    } catch { /* quests are optional */ }
  } else {
    logPaper(characterId, { kind: 'defeat', text: 'Проиграли морской бой и едва ушли.' });
  }

  return { ...getNavalView(row.id), rewards: report };
}

// --- the ship's papers (journal + auto log) ----------------------------------

function papersRow(characterId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM ship_papers WHERE character_id = ?').get(characterId);
  if (!row) {
    db.prepare('INSERT INTO ship_papers (character_id) VALUES (?)').run(characterId);
    row = db.prepare('SELECT * FROM ship_papers WHERE character_id = ?').get(characterId);
  }
  return row;
}

export function logPaper(characterId, entry) {
  const row = papersRow(characterId);
  const log = parseJson(row.log, []);
  log.push({ at: new Date().toISOString(), ...entry });
  getDb().prepare("UPDATE ship_papers SET log = ?, updated_at = datetime('now') WHERE character_id = ?")
    .run(JSON.stringify(log.slice(-200)), characterId);
  return entry;
}

export function getPapers(characterId) {
  const row = papersRow(characterId);
  const unlocks = listUnlocks(characterId);
  const autoNotes = unlocks
    .map((u) => LORE_NOTES[u.flag])
    .filter(Boolean)
    .map((text) => ({ text, auto: true }));
  return {
    notes: row.notes || '',
    log: parseJson(row.log, []).slice().reverse(),
    lore: autoNotes,
  };
}

export function setPapersNotes(characterId, notes = '') {
  papersRow(characterId);
  getDb().prepare("UPDATE ship_papers SET notes = ?, updated_at = datetime('now') WHERE character_id = ?")
    .run(String(notes).slice(0, 20000), characterId);
  return getPapers(characterId);
}

// --- voyages (the crossing, opened up) ---------------------------------------

const voyageRow = (id) => getDb().prepare('SELECT * FROM voyages WHERE id = ?').get(id) || null;
const activeVoyageRow = (characterId) => getDb().prepare(
  'SELECT * FROM voyages WHERE character_id = ? AND resolved = 0 ORDER BY id DESC LIMIT 1',
).get(characterId) || null;

// Set sail between two ports. Deterministic, like a road: the stops are drawn
// from the seed and stored once, so a reload cannot reroll the sea. The fare and
// the toll are charged up front; the party is placed at the far port and the
// stops are then resolved one by one (a fight, or an island worth a note).
export function startVoyage({ characterId, fromId, toId } = {}) {
  requireCharacter(characterId);
  const bonuses = getShipBonuses(characterId);
  if (!bonuses) throw new Error('Сначала купите корабль в порту.');

  const from = getLocation(fromId);
  const to = getLocation(toId);
  if (!from || !to) throw new Error('Локация не найдена');
  if (!CROSSING_GATES.includes(from.name) || !CROSSING_GATES.includes(to.name)) {
    throw new Error('Отсюда нет морского пути');
  }
  const here = getDb().prepare('SELECT location_id FROM characters WHERE id = ?').get(characterId)?.location_id;
  if (here == null) recordVisit(characterId, from.id);
  else if (here !== from.id) throw new Error('Отряд не находится здесь');

  const existing = activeVoyageRow(characterId);
  if (existing) return getVoyageView(characterId);

  const route = routeFor(from.name, to.name);
  if (!route) throw new Error('Между этими берегами нет пути');

  const character = requireCharacter(characterId);
  const missing = [];
  if ((route.gold ?? 0) > character.gold) missing.push(`${route.gold - character.gold} золота`);
  if (route.item && !hasItem(characterId, route.item.key, route.item.qty)) missing.push(route.item.label);
  if (missing.length) throw new Error(`Не хватает: ${missing.join(', ')}`);

  const seed = `${from.id}->${to.id}`;
  const plan = rollVoyage({ seed, tier: bonuses.level, danger: from.danger ?? 1 });

  transaction((d) => {
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?")
      .run(route.gold ?? 0, characterId);
    if (route.item) takeItem(characterId, route.item.key, route.item.qty);
    d.prepare(
      `INSERT INTO voyages (character_id, from_id, to_id, route_key, seed, stops) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(characterId, from.id, to.id, route.key, seed, JSON.stringify(plan.stops));
  });

  // The voyage lands the party at the far port; the sea shows itself along the way.
  recordVisit(characterId, to.id);
  logPaper(characterId, { kind: 'voyage', text: `Вышли из ${from.name} в ${to.name}.` });
  return getVoyageView(characterId);
}

export function getVoyageView(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) return null;
  return voyageView(row);
}

function voyageView(row) {
  const stops = parseJson(row.stops, []);
  const resolved = !!row.resolved;
  const stop = !resolved && row.cursor < stops.length ? stops[row.cursor] : null;
  const active = activeBattleRow(row.character_id);
  return {
    id: row.id,
    characterId: row.character_id,
    from: getLocation(row.from_id)?.name || null,
    to: getLocation(row.to_id)?.name || null,
    seed: row.seed,
    stops,
    cursor: row.cursor,
    stop,
    done: resolved,
    inBattle: !!active,
    battleId: active ? active.id : null,
  };
}

// Resolve the stop the voyage has reached: an island is logged, a fight is
// opened. The cursor advances either way; once it passes the list the voyage is
// over and the party is already standing at the far port.
export function resolveVoyageStop(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) throw new Error('Нет активного плавания');
  const stops = parseJson(row.stops, []);
  if (activeBattleRow(characterId)) throw new Error('Сначала закончите морской бой');
  if (row.cursor >= stops.length) {
    getDb().prepare("UPDATE voyages SET resolved = 1, updated_at = datetime('now') WHERE id = ?").run(row.id);
    return { voyage: voyageView(voyageRow(row.id)), battleId: null };
  }

  const stop = stops[row.cursor];
  let battleId = null;
  if (stop.kind === 'island') {
    logPaper(characterId, { kind: 'island', text: `Открыт остров: ${stop.island?.name || 'безымянный'} — ${stop.island?.description || ''}` });
    try { advanceQuest(characterId, { type: 'visit', target: `остров:${stop.island?.id || ''}` }); } catch { /* optional */ }
  } else {
    const battle = startNavalBattle(characterId, { kind: stop.kind, tier: stop.tier, voyageId: row.id, seed: `${row.seed}:${row.cursor}` });
    battleId = battle?.id ?? null;
  }

  const nextCursor = row.cursor + 1;
  const done = nextCursor >= stops.length;
  getDb().prepare("UPDATE voyages SET cursor = ?, resolved = ?, updated_at = datetime('now') WHERE id = ?")
    .run(nextCursor, done ? 1 : 0, row.id);

  return { voyage: voyageView(voyageRow(row.id)), battleId, stop };
}

export { CROSSING_GATES };
