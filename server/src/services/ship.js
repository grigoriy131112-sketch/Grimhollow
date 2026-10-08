// Ship persistence and the port shipyard (Wave W-SHIP). A hero buys a ship in a
// port for gold; it stays there and waits. Upgrades are forged at the dock,
// which runs on the same real clock as a road (game/travel.js MS_PER_MINUTE),
// and points come only from sea battles (W-SEA awards them).

import { getDb, transaction } from '../db/index.js';
import { MS_PER_MINUTE } from '../game/travel.js';
import { CROSSING_GATES } from '../game/continent_travel.js';
import {
  SHIP_PRICE, DOCK_HAND_GOLD, MAX_SHIP_LEVEL,
  upgradesByKey, levelUpCost, minutesForLevel, minutesForLevelUp, canLevelUp,
  componentCap, buildShipTree, bonusesFrom,
} from '../game/ship.js';

const nowMs = () => Date.now();
const isPortName = (name) => CROSSING_GATES.includes(name);

function locationOf(characterId) {
  const row = getDb().prepare(
    `SELECT l.id, l.name FROM characters c JOIN locations l ON l.id = c.location_id WHERE c.id = ?`,
  ).get(characterId);
  return row || null;
}

function requireCharacter(characterId) {
  const row = getDb().prepare('SELECT id, gold FROM characters WHERE id = ?').get(characterId);
  if (!row) throw new Error('Персонаж не найден');
  return row;
}

function shipRow(characterId) {
  return getDb().prepare('SELECT * FROM ships WHERE character_id = ?').get(characterId) || null;
}

export function forgedMap(shipId) {
  const rows = getDb().prepare('SELECT key, level FROM ship_upgrades WHERE ship_id = ?').all(shipId);
  const forged = {};
  for (const r of rows) if (r.level > 0) forged[r.key] = r.level;
  return forged;
}

// Every class the party can field: the leader plus the active companions.
function partyClasses(characterId) {
  const leader = getDb().prepare('SELECT class FROM characters WHERE id = ?').get(characterId);
  const members = getDb().prepare(
    "SELECT class FROM party_members WHERE leader_id = ? AND status = 'active'",
  ).all(characterId);
  return [...new Set([leader?.class, ...members.map((m) => m.class)].filter(Boolean))];
}

function activeWork(shipId) {
  return getDb().prepare(
    "SELECT * FROM ship_works WHERE ship_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
  ).get(shipId) || null;
}

// Apply a job whose time has come. Returns the fresh ship row, or null when the
// job is not due yet. Idempotent: the active job is re-read inside the
// transaction and only applied if it is still active, so two concurrent reads
// cannot apply the same job twice.
function resolveWork(shipId, now = nowMs()) {
  const work = activeWork(shipId);
  if (!work) return null;
  const state = JSON.parse(work.state || '{}');
  const startMs = state.startMs || now;
  if (now - startMs < work.minutes * MS_PER_MINUTE) return null;

  transaction((d) => {
    const current = d.prepare("SELECT * FROM ship_works WHERE id = ? AND status = 'active'").get(work.id);
    if (!current) return;
    if (current.kind === 'level') {
      d.prepare("UPDATE ships SET level = ?, updated_at = datetime('now') WHERE id = ?").run(current.to_level, shipId);
    } else {
      // UPDATE first, then INSERT only if no row exists, so a component that was
      // deleted between start and completion is re-created instead of vanishing.
      const updated = d.prepare('UPDATE ship_upgrades SET level = ? WHERE ship_id = ? AND key = ?')
        .run(current.to_level, shipId, current.upgrade_key);
      if (updated.changes === 0) {
        d.prepare('INSERT INTO ship_upgrades (ship_id, key, level) VALUES (?, ?, ?)')
          .run(shipId, current.upgrade_key, current.to_level);
      }
    }
    d.prepare("UPDATE ship_works SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(current.id);
  });
  return work;
}

export function getShipView(characterId, now = nowMs()) {
  const character = requireCharacter(characterId);
  let ship = shipRow(characterId);
  if (ship) { resolveWork(ship.id, now); ship = shipRow(characterId); }

  const loc = locationOf(characterId);
  const atPort = !!loc && isPortName(loc.name);
  const forged = ship ? forgedMap(ship.id) : {};
  // resolveWork already applied a due job, so this returns the next job or none.
  const work = ship ? activeWork(ship.id) : null;
  // A ship remembers the port it was bought in, so the header can name a port
  // even while the hero stands elsewhere.
  let inPortName = loc ? loc.name : null;
  if (!atPort && ship && ship.home_port_id) {
    const home = getDb().prepare('SELECT name FROM locations WHERE id = ?').get(ship.home_port_id);
    if (home) inPortName = home.name;
  }
  const state = work ? JSON.parse(work.state || '{}') : {};
  const elapsed = work ? now - (state.startMs || now) : 0;
  const remainingMs = work ? Math.max(0, work.minutes * MS_PER_MINUTE - elapsed) : 0;

  const tree = buildShipTree({
    ship,
    forged,
    points: ship ? ship.points : 0,
    classKeys: partyClasses(characterId),
    atPort,
    inPortName,
  });
  tree.gold = character.gold;
  tree.dockHandGold = DOCK_HAND_GOLD;
  tree.work = work ? {
    id: work.id,
    kind: work.kind,
    upgradeKey: work.upgrade_key,
    toLevel: work.to_level,
    minutes: work.minutes,
    hired: !!work.hired,
    remainingMs,
    done: remainingMs <= 0,
  } : null;
  return tree;
}

export function buyShip(characterId, { name } = {}) {
  const character = requireCharacter(characterId);
  const loc = locationOf(characterId);
  if (!loc || !isPortName(loc.name)) throw new Error('Корабль можно купить только в порту.');
  if (shipRow(characterId)) throw new Error('У вас уже есть корабль.');
  if (character.gold < SHIP_PRICE) throw new Error('Не хватает золота на корабль.');

  transaction((d) => {
    d.prepare('UPDATE characters SET gold = gold - ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(SHIP_PRICE, characterId);
    d.prepare('INSERT INTO ships (character_id, name, home_port_id, level) VALUES (?, ?, ?, 1)')
      .run(characterId, (name || '').trim() || 'Корабль', loc.id);
  });
  return getShipView(characterId);
}

// Forge one level of a component, or raise the ship's own level. Both take dock
// time; `hired` pays gold to halve it.
export function startWork(characterId, { upgradeKey, levelUp = false, hired = false } = {}) {
  const loc = locationOf(characterId);
  if (!loc || !isPortName(loc.name)) throw new Error('Улучшать корабль можно только в порту.');
  const ship = shipRow(characterId);
  if (!ship) throw new Error('У вас ещё нет корабля.');
  resolveWork(ship.id);
  if (activeWork(ship.id)) throw new Error('Версталь уже занята: дождитесь окончания работ.');

  const forged = forgedMap(ship.id);
  const cap = componentCap(ship.level, forged);

  let kind; let key = null; let toLevel; let baseMinutes; let basePoints;
  if (levelUp) {
    const check = canLevelUp(ship.level, forged);
    if (!check.ok) throw new Error(check.reason);
    kind = 'level';
    toLevel = ship.level + 1;
    baseMinutes = minutesForLevelUp(toLevel);
    basePoints = levelUpCost(ship.level);
  } else {
    const u = upgradesByKey[upgradeKey];
    if (!u) throw new Error('Такого улучшения нет.');
    if (ship.level < u.level) throw new Error(`Откроется на уровне корабля ${u.level}.`);
    const rank = forged[upgradeKey] || 0;
    if (rank >= MAX_SHIP_LEVEL) throw new Error('Это улучшение уже полностью прокачано.');
    if (rank >= cap) throw new Error('Нужен более высокий уровень корабля.');
    kind = 'component';
    key = upgradeKey;
    toLevel = rank + 1;
    baseMinutes = minutesForLevel(toLevel, u.heavy);
    basePoints = u.base * toLevel;
  }

  const minutes = hired ? Math.max(1, Math.ceil(baseMinutes / 2)) : baseMinutes;
  const goldCost = hired ? DOCK_HAND_GOLD * toLevel : 0;

  transaction((d) => {
    const row = d.prepare('SELECT points FROM ships WHERE id = ?').get(ship.id);
    if ((row.points || 0) < basePoints) throw new Error('Не хватает очков корабля.');
    const ch = d.prepare('SELECT gold FROM characters WHERE id = ?').get(characterId);
    if (ch.gold < goldCost) throw new Error('Не хватает золота на мастеровых.');
    d.prepare("UPDATE ships SET points = points - ?, updated_at = datetime('now') WHERE id = ?")
      .run(basePoints, ship.id);
    if (goldCost) {
      d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?")
        .run(goldCost, characterId);
    }
    d.prepare(
      `INSERT INTO ship_works (ship_id, kind, upgrade_key, to_level, minutes, hired, paid_points, paid_gold, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(ship.id, kind, key, toLevel, minutes, hired ? 1 : 0, basePoints, goldCost, JSON.stringify({ startMs: nowMs() }));
  });
  return getShipView(characterId);
}

// Only W-SEA calls this: a won sea battle pays ship points.
export function awardShipPoints(characterId, amount = 0) {
  const n = Math.max(0, Math.floor(amount));
  const ship = shipRow(characterId);
  if (!ship || !n) return ship ? ship.points : 0;
  getDb().prepare("UPDATE ships SET points = points + ?, updated_at = datetime('now') WHERE id = ?")
    .run(n, ship.id);
  return ship.points + n;
}

// The flat bonuses a sea battle applies, plus the ship's level. `gunSlots` is
// the same number the tree reports (base 1 plus every slot upgrade), so a
// battle reads one honest figure.
export function getShipBonuses(characterId) {
  const ship = shipRow(characterId);
  if (!ship) return null;
  const bonuses = bonusesFrom(forgedMap(ship.id));
  return { level: ship.level, ...bonuses, gunSlots: 1 + bonuses.gunSlots };
}
