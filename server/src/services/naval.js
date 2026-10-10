// The sea (Wave W-SEA, opened up by W-ISLES): pirates, sea monsters, the ship's
// papers and the voyage that ties them together. The fight itself is pure
// (game/naval.js); this service persists its state, settles the outcome and
// hangs the voyage / papers on top. Ship points are awarded here on a won sea
// battle -- the only source (W-SHIP exposes the hook).
//
// A voyage reaches a stop and, since W-ISLES, an island stop is no longer a mere
// note: the party is asked whether to put in, and if it accepts it goes ashore on
// a real hidden location -- it walks it, fights what haunts it, searches its hoard,
// and then puts back to sea. The islands are the sea's own hidden continent; a
// voyage is the only way to set foot on one.

import { getDb, transaction } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, getMember } from './party.js';
import { getLocation, recordVisit } from './world.js';
import { getShipBonuses, awardShipPoints } from './ship.js';
import { hasItem, takeItem, grantItem } from './items.js';
import { advanceQuest, listUnlocks } from './quests.js';
import { routeFor, CROSSING_GATES } from '../game/continent_travel.js';
import {
  createSeaBattle, takeSeaAction, previewAction,
  seaPoints, playerSide, enemySideOf, rollVoyage, LORE_NOTES,
} from '../game/naval.js';
import { islandByKey, islandGold, islandItem, ISLANDS } from '../game/islands.js';

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
// stops are then resolved one by one (a fight, or an island the sea offers).
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

  // The sea sets out from the home port but the party is not landed yet: it stays
  // on the open water (mode 'voyage') until every stop has been answered, then
  // the voyage lands it at the far port. `from_id` remembers the shore it left.
  recordVisit(characterId, from.id);
  logPaper(characterId, { kind: 'voyage', text: `Вышли из ${from.name} в ${to.name}.` });
  return getVoyageView(characterId);
}

export function getVoyageView(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) return null;
  return voyageView(row);
}

// Where the party stands during the voyage, for the client to route on:
//   voyage  -- on the open water, a stop waits to be answered
//   island  -- ashore on the stop's island (id in ashore)
//   aside   -- held at the home port while a fight is settled elsewhere
//   done    -- every stop answered, the party has landed at the far port
function voyageMode(row) {
  if (row.resolved) return 'done';
  if (row.mode === 'island' && row.ashore_id) return 'island';
  if (row.mode === 'aside') return 'aside';
  return 'voyage';
}

function voyageView(row) {
  const stops = parseJson(row.stops, []);
  const resolved = !!row.resolved;
  const stop = !resolved && row.cursor < stops.length ? stops[row.cursor] : null;
  const mode = voyageMode(row);
  const active = activeBattleRow(row.character_id);
  // The island the stop points at, resolved to the real seeded location the
  // party goes ashore on. Null for a pirate / monster stop.
  const island = stop?.kind === 'island' ? islandLocation(stop.island?.key) : null;
  return {
    id: row.id,
    characterId: row.character_id,
    from: getLocation(row.from_id)?.name || null,
    to: getLocation(row.to_id)?.name || null,
    seed: row.seed,
    stops,
    cursor: row.cursor,
    stop,
    mode,
    done: resolved,
    ashore: row.ashore_id || null,
    islandId: island?.id || null,
    island: island ? { id: island.id, name: island.name, description: island.description } : (stop?.island || null),
    inBattle: !!active,
    battleId: active ? active.id : null,
  };
}

// The seeded hidden location a stop's island key points at.
function islandLocation(key) {
  if (!key) return null;
  const isle = islandByKey(key);
  if (!isle) return null;
  return getDb().prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.name) || null;
}

// Resolve the stop the voyage has reached. A fight is opened at once; an island
// raises the question instead -- the party decides whether to put in or sail on.
// The cursor advances when the stop is answered (sailPastIsland / putInIsland),
// not merely on reaching it.
export function resolveVoyageStop(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) throw new Error('Нет активного плавания');
  const stops = parseJson(row.stops, []);
  if (activeBattleRow(characterId)) throw new Error('Сначала закончите морской бой');
  if (row.mode === 'island') throw new Error('Сначала вернитесь на корабль');
  if (row.cursor >= stops.length) {
    getDb().prepare("UPDATE voyages SET resolved = 1, updated_at = datetime('now') WHERE id = ?").run(row.id);
    return { voyage: voyageView(voyageRow(row.id)), battleId: null };
  }

  const stop = stops[row.cursor];
  if (stop.kind === 'island') {
    // The sea asks; the party answers. Nothing is logged and the cursor does not
    // move until the answer comes.
    return { voyage: voyageView(row), battleId: null, stop, ask: 'island' };
  }

  const battle = startNavalBattle(characterId, { kind: stop.kind, tier: stop.tier, voyageId: row.id, seed: `${row.seed}:${row.cursor}` });
  const battleId = battle?.id ?? null;
  advanceVoyageCursor(row, stops.length);
  return { voyage: voyageView(voyageRow(row.id)), battleId, stop };
}

// Move past the current stop: once the list runs out, the voyage is over and the
// party lands at the far port. Landing here (not at start) is what lets an island
// stop keep the party ashore mid-voyage while a finished one still reaches port.
function advanceVoyageCursor(row, total) {
  const nextCursor = row.cursor + 1;
  const done = nextCursor >= total;
  getDb().prepare("UPDATE voyages SET cursor = ?, resolved = ?, mode = ?, updated_at = datetime('now') WHERE id = ?")
    .run(nextCursor, done ? 1 : 0, done ? 'done' : 'voyage', row.id);
  if (done) recordVisit(row.character_id, row.to_id);
}

// The party refuses the island and holds its course: the stop is passed, the ship
// never puts in. The sea takes note in the papers.
export function sailPastIsland(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) throw new Error('Нет активного плавания');
  if (row.mode === 'island') throw new Error('Сначала вернитесь на корабль');
  const stops = parseJson(row.stops, []);
  const stop = row.cursor < stops.length ? stops[row.cursor] : null;
  if (!stop || stop.kind !== 'island') throw new Error('Сейчас нечего обходить');
  logPaper(characterId, { kind: 'island_skipped', text: `Прошли мимо острова ${stop.island?.name || ''} — не стали причаливать.` });
  advanceVoyageCursor(row, stops.length);
  return { voyage: voyageView(voyageRow(row.id)), sailedPast: true };
}

// The party accepts: it puts in and steps ashore. The stop's island becomes the
// place the character stands (a real location), the discovery is recorded, and
// the shore it left is remembered so it can put back to sea from here.
export function putInIsland(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) throw new Error('Нет активного плавания');
  if (row.mode === 'island') return { voyage: voyageView(row), landed: true };
  const stops = parseJson(row.stops, []);
  const stop = row.cursor < stops.length ? stops[row.cursor] : null;
  if (!stop || stop.kind !== 'island') throw new Error('Сейчас некуда причаливать');
  const isle = islandByKey(stop.island?.key);
  const island = isleLocation(isle);
  if (!island) throw new Error('Этот остров море не отдаёт');

  const from = getDb().prepare('SELECT location_id FROM characters WHERE id = ?').get(characterId)?.location_id;
  const db = getDb();
  transaction((d) => {
    d.prepare("UPDATE voyages SET mode = 'island', ashore_id = ?, island_ref = ?, updated_at = datetime('now') WHERE id = ?")
      .run(island.id, stop.island?.key || null, row.id);
    d.prepare('INSERT OR IGNORE INTO island_discoveries (character_id, island_id, from_id) VALUES (?, ?, ?)')
      .run(characterId, island.id, from ?? null);
  });
  recordVisit(characterId, island.id);
  logPaper(characterId, { kind: 'island', text: `Причалили к острову: ${island.name}.` });
  try { advanceQuest(characterId, { type: 'visit', target: `остров:${stop.island?.key || ''}` }); } catch { /* optional */ }
  return { voyage: voyageView(voyageRow(row.id)), landed: true, locationId: island.id };
}

function isleLocation(isle) {
  if (!isle) return null;
  return getDb().prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.name) || null;
}

// Push off the island and put back to sea. The party returns to the water beside
// the island (mode 'voyage'), the island stop is passed, and the voyage carries
// on -- the party is no longer stranded ashore.
export function leaveIsland(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row) throw new Error('Нет активного плавания');
  if (row.mode !== 'island' || !row.ashore_id) throw new Error('Отряд не на острове');
  const stops = parseJson(row.stops, []);
  const stop = row.cursor < stops.length ? stops[row.cursor] : null;

  const home = row.from_id;
  getDb().prepare("UPDATE voyages SET mode = 'voyage', ashore_id = NULL, updated_at = datetime('now') WHERE id = ?").run(row.id);
  recordVisit(characterId, home);
  logPaper(characterId, { kind: 'island_depart', text: `Покинули остров ${stop?.island?.name || ''} и вышли в море.` });
  advanceVoyageCursor(row, stops.length);
  return { voyage: voyageView(voyageRow(row.id)), afloat: true };
}

// Search the hoard of the island the party stands on: one roll, once. Returns the
// spoils. Searching a second time finds only what was already taken -- so the
// discovery row remembers, and the answer is honest.
export function searchIsland(characterId) {
  const row = activeVoyageRow(characterId);
  if (!row || row.mode !== 'island' || !row.ashore_id) throw new Error('Отряд не на острове');
  const isle = islandByKey(row.island_ref);
  const island = isleLocation(isle);
  if (!island) throw new Error('Этот остров море не отдаёт');

  const db = getDb();
  const disc = db.prepare('SELECT * FROM island_discoveries WHERE character_id = ? AND island_id = ?').get(characterId, island.id);
  if (disc?.searched) return { alreadySearched: true, found: [], gold: 0 };

  const gold = islandGold(isle, Math.random());
  const item = islandItem(isle, Math.random());
  transaction((d) => {
    d.prepare('UPDATE island_discoveries SET searched = 1 WHERE character_id = ? AND island_id = ?').run(characterId, island.id);
    d.prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?").run(gold, characterId);
  });
  const found = [];
  if (item && item.qty > 0) { grantItem(characterId, item.key, item.qty); found.push(item); }
  logPaper(characterId, { kind: 'island_loot', text: `Обыскали остров ${island.name}: ${gold} золота.` });
  return { alreadySearched: false, gold, found, island: { id: island.id, name: island.name } };
}

// The claim the ship's papers carry for this island, learned on a first landing.
export function islandClaims(characterId) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT d.*, l.name AS island_name FROM island_discoveries d JOIN locations l ON l.id = d.island_id WHERE d.character_id = ? ORDER BY d.id',
  ).all(characterId);
  return rows.map((r) => {
    const isle = ISLANDS.find((i) => i.name === r.island_name) || null;
    return { islandId: r.island_id, name: r.island_name, note: isle?.note || null, searched: !!r.searched };
  });
}

// Rewrite the legacy 'island' stop shape (an inline Fortune island) to the seeded
// key a database that predates W-ISLES may still hold. Safe to call on read.
export function normalizeVoyageStop(stop) {
  if (!stop || stop.kind !== 'island') return stop;
  if (stop.island?.key) return stop;
  const name = stop.island?.name;
  const isle = name ? ISLANDS.find((i) => i.name === name) : null;
  if (isle) return { ...stop, island: { key: isle.key, name: isle.name, description: isle.description } };
  return stop;
}

export { CROSSING_GATES };
