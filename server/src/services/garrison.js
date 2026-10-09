// The clan's garrison (Wave W-CLAN-ROSTER). A companion the leader stations in
// the clan is not gone -- it keeps its party_members sheet and can be recalled
// at any moment -- but while it serves the clan it rides out on raids on its
// own and brings back gold, trophies and the odd name.
//
// Everything here is computed from the real clock, capped by a stored watermark
// (`clan_garrison.last_tick_ms`): time passed is the only thing that pays, and
// the tick advances by at most MAX_TICKS at once, so idling can never be
// re-farmed by reloading. Outcomes are re-derived from a hash of the tick, so a
// reload of the same tick would give the same raid; the watermark just stops it
// from paying twice.
//
// Nothing in play changes for a hero with no garrison -- tickGarrison() pays
// nothing and rolls no events when nobody serves the clan.

import { getDb, transaction } from '../db/index.js';
import { grantNames } from './clan.js';
import { grantItem } from './items.js';
import { CLASSES } from '../game/classes.js';
import { hashString } from '../game/travel.js';
import { companionTemplate, traitInfo, COMPANIONS } from '../game/companions.js';
import { doctrineByKey, buildingByKey } from '../db/seed_clan.js';

// One garrison tick is 5 real minutes; one "day" of raids is two ticks (10 real
// minutes). Deliberately slow -- this is a background trickle, not a faucet.
export const MS_PER_TICK = 5 * 60_000;
export const MAX_TICKS = 48;                 // six hours' worth, the idle cap
export const GOLD_PER_TICK = 6;              // per serving companion
export const NAMES_EVERY_TICKS = 6;          // the clan forges a name this often
export const TROPHY_EVERY_TICKS = 4;         // a raid brings a trophy this often
export const EVENT_CHANCE = 0.12;            // per companion-tick
export const FALL_CHANCE = 0.2;              // of an event, the companion falls
export const PETITION_CHANCE_PER_TICK = 0.25;
export const MAX_PETITION_CANDIDATES = 3;

const TROPHIES = ['bitter_herb', 'mana_lichen', 'glowcap', 'bread_loaf', 'clean_water'];

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

// A small deterministic generator keyed off a hash, same shape as travel.js's.
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function garrisonRow(clanId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM clan_garrison WHERE clan_id = ?').get(clanId);
  if (!row) {
    // A clan's clock starts at the real now, so the world pays only for time
    // lived since the garrison first woke -- never for the epoch before it.
    const start = Date.now();
    db.prepare('INSERT INTO clan_garrison (clan_id, last_tick_ms) VALUES (?, ?)').run(clanId, start);
    row = { clan_id: clanId, last_tick_ms: start };
  }
  return row;
}

// Everyone the leader has stationed in the clan (active, assignment = 'clan').
export function garrisonMembers(leaderId) {
  return getDb().prepare(
    "SELECT * FROM party_members WHERE leader_id = ? AND status = 'active' AND assignment = 'clan' ORDER BY joined_at, id",
  ).all(leaderId);
}

// The clan's «рейд» modifiers. The doctrine with a gold price (Летописцы) slows
// the trickle; a Дом летописей forges more names; a Склад adds nothing to gold
// but the trade bonus is applied elsewhere.
function raidModifiers(clanRow) {
  const doc = doctrineByKey(clanRow.doctrine);
  const goldRate = doc?.effects?.goldRate || 0;            // negative for chroniclers
  const clash = doc?.effects?.madnessRisk ? 1.5 : 1;       // Оттепель raids are riskier
  const buildings = getDb().prepare('SELECT * FROM clan_buildings WHERE clan_id = ?').all(clanRow.id);
  const namesBonus = buildings
    .filter((b) => b.type === 'house_of_records')
    .reduce((sum, b) => sum + (buildingByKey(b.type)?.effects?.namesPerRitual || 0) * b.tier, 0);
  return { goldRate, clash, namesBonus };
}

// Simulate `ticks` of raiding by `members`, starting after `baseTick` (the
// first unpaid tick). Pure: the same inputs always yield the same report, so a
// reload cannot reroll it.
export function simulateRaids({ clanId, baseTick, ticks, members, mods }) {
  let gold = 0;
  let names = 0;
  const trophies = [];
  const events = [];
  const fallen = [];

  for (let i = 0; i < ticks; i += 1) {
    const tick = baseTick + i + 1;
    const live = members.filter((m) => !fallen.includes(m.id));
    if (live.length === 0) break;
    const roll = rngFrom(hashString(`${clanId}:tick:${tick}`));

    for (const m of live) {
      // A bad event can take a companion out of the raid.
      if (roll() < EVENT_CHANCE * mods.clash) {
        if (roll() < FALL_CHANCE) {
          fallen.push(m.id);
          events.push({ tick, kind: 'fall', memberId: m.id, name: m.name, text: `${m.name} не вернулся из рейда.` });
        } else {
          events.push({ tick, kind: 'wound', memberId: m.id, name: m.name, text: `${m.name} вернулся из рейда раненым.` });
        }
        continue;
      }
      gold += Math.max(0, Math.round(GOLD_PER_TICK * (1 + mods.goldRate)));
    }

    if ((tick % TROPHY_EVERY_TICKS) === 0 && live.length) {
      trophies.push(TROPHIES[Math.floor(roll() * TROPHIES.length)]);
    }
    if ((tick % NAMES_EVERY_TICKS) === 0) {
      names += 1 + mods.namesBonus;
    }
  }

  return { gold, names, trophies, events, fallen };
}

// Advance the garrison's clock and pay out what the elapsed time earned. Safe
// to call on every read. Returns { ticks, gold, names, trophies, events }.
export function tickGarrison(leaderId, now = Date.now()) {
  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId);
  if (!clanRow) return null;
  const g = garrisonRow(clanRow.id);
  const elapsed = Math.max(0, now - (g.last_tick_ms || 0));
  const ticks = Math.min(MAX_TICKS, Math.floor(elapsed / MS_PER_TICK));
  const members = garrisonMembers(leaderId);
  const baseTick = Math.floor((g.last_tick_ms || 0) / MS_PER_TICK);

  // Nothing has elapsed: pay nothing, advance nothing.
  if (ticks <= 0) return { ticks: 0, gold: 0, names: 0, trophies: [], events: [], fallen: [], petitions: 0 };

  // Time passed. Raise the watermark in one transaction, add the raid's gold,
  // and retire anyone who did not come back.
  const mods = raidModifiers(clanRow);
  const report = members.length
    ? simulateRaids({ clanId: clanRow.id, baseTick, ticks, members, mods })
    : { gold: 0, names: 0, trophies: [], events: [], fallen: [] };

  transaction((d) => {
    d.prepare("UPDATE clan_garrison SET last_tick_ms = last_tick_ms + ?, updated_at = datetime('now') WHERE clan_id = ?")
      .run(ticks * MS_PER_TICK, clanRow.id);
    if (report.gold > 0) {
      d.prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?")
        .run(report.gold, leaderId);
    }
    for (const id of report.fallen) {
      d.prepare("UPDATE party_members SET status = 'dead', hp = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    }
  });

  // Names and trophies go through the same helpers play uses (grantNames is a
  // no-op-safe wrapper; a clan always exists here).
  if (report.names > 0) grantNames(leaderId, report.names);
  for (const key of report.trophies) grantItem(leaderId, key, 1);

  // Petitions share the same clock, resolved on the same ticks (whether or not
  // anyone is in the garrison -- people apply to the clan, not to the roster).
  const petitions = rollPetitions(clanRow, leaderId, baseTick, ticks);

  return { ticks, ...report, petitions };
}

// --- petitions (people asking to join of their own accord) ------------------

// Does a given tick open a petition? Pure and deterministic: re-deriving the
// same tick always gives the same answer, which is what stops a reload from
// rerolling it.
export function petitionTickOpens(clanId, tick) {
  return rngFrom(hashString(`${clanId}:petition:${tick}`))() < PETITION_CHANCE_PER_TICK;
}

// Roll petitions for the ticks just advanced. One shared clock with the raids:
// a tick is resolved once, so the same tick can never spawn two different
// askers, and reloading cannot reroll it.
function rollPetitions(clanRow, leaderId, baseTick, ticks) {
  let pending = getDb().prepare(
    "SELECT * FROM clan_petitions WHERE clan_id = ? AND status = 'pending'",
  ).all(clanRow.id);
  if (pending.length >= MAX_PETITION_CANDIDATES) return 0;

  const taken = new Set(getDb().prepare(
    "SELECT template_key FROM party_members WHERE leader_id = ? AND status != 'left'",
  ).all(leaderId).map((r) => r.template_key));
  for (const p of pending) taken.add(p.template_key);
  const pool = COMPANIONS.map((t) => t.key);

  let opened = 0;
  for (let i = 0; i < ticks && pending.length + opened < MAX_PETITION_CANDIDATES; i += 1) {
    const tick = baseTick + i + 1;
    if (!petitionTickOpens(clanRow.id, tick)) continue;
    const roll = rngFrom(hashString(`${clanRow.id}:petition:${tick}`));
    roll();   // consume the gate value so the pick is a fresh draw
    const free = pool.filter((k) => !taken.has(k));
    if (!free.length) break;
    const key = free[Math.floor(roll() * free.length)];
    taken.add(key);
    opened += 1;
    getDb().prepare(
      "INSERT INTO clan_petitions (clan_id, template_key, day, status) VALUES (?, ?, ?, 'pending')",
    ).run(clanRow.id, key, tick);
  }
  return opened;
}

// The pending petitions for a clan. Reading never rolls -- tickGarrison() does.
export function listPetitions(leaderId) {
  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId);
  if (!clanRow) return { petitions: [] };
  const rows = getDb().prepare(
    "SELECT * FROM clan_petitions WHERE clan_id = ? AND status = 'pending' ORDER BY id",
  ).all(clanRow.id);
  return { petitions: rows.map(petitionView) };
}

function petitionView(row) {
  const t = companionTemplate(row.template_key);
  if (!t) return { id: row.id, key: row.template_key, name: row.template_key, day: row.day };
  return {
    id: row.id,
    key: t.key,
    name: t.name,
    class: t.class,
    className: CLASSES[t.class]?.label || t.class,
    level: t.level,
    portrait: t.portrait ? `/art/portraits/${t.portrait}.svg` : null,
    history: t.history,
    plus: t.plus.map(traitInfo),
    minus: t.minus.map(traitInfo),
    day: row.day,
  };
}

// Accept a petition: station the asker in the clan garrison (a party_members
// row with assignment = 'clan'), so the leader can recall them later.
export function acceptPetition(leaderId, petitionId) {
  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId);
  if (!clanRow) throw new Error('У этого героя ещё нет клана');
  const row = getDb().prepare("SELECT * FROM clan_petitions WHERE id = ? AND clan_id = ?").get(petitionId, clanRow.id);
  if (!row) throw new Error('Такого прошения нет');
  if (row.status !== 'pending') throw new Error('Прошение уже решено');
  const t = companionTemplate(row.template_key);
  if (!t) throw new Error('Такого спутника не существует');
  const already = getDb().prepare(
    "SELECT 1 FROM party_members WHERE leader_id = ? AND template_key = ? AND status != 'left'",
  ).get(leaderId, t.key);
  if (already) throw new Error('Этот спутник уже служит');

  transaction((d) => {
    d.prepare(
      `INSERT INTO party_members (leader_id, template_key, name, class, level, xp, hp, mana, stamina, portrait, history, pluses, minuses, source, status, assignment, recruit_log)
       VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?, ?, ?, 'guild', 'active', 'clan', ?)`,
    ).run(
      leaderId, t.key, t.name, t.class, t.level, t.portrait || null, t.history,
      JSON.stringify(t.plus), JSON.stringify(t.minus),
      JSON.stringify([{ text: `${t.name} сам просится в клан и принят.` }]),
    );
    d.prepare("UPDATE clan_petitions SET status = 'accepted' WHERE id = ?").run(petitionId);
  });
  return { accepted: true, member: garrisonMembers(leaderId).at(-1) };
}

// Turn a petition away; it never comes back.
export function declinePetition(leaderId, petitionId) {
  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId);
  if (!clanRow) throw new Error('У этого героя ещё нет клана');
  const row = getDb().prepare("SELECT * FROM clan_petitions WHERE id = ? AND clan_id = ?").get(petitionId, clanRow.id);
  if (!row) throw new Error('Такого прошения нет');
  getDb().prepare("UPDATE clan_petitions SET status = 'declined' WHERE id = ?").run(petitionId);
  return { declined: true };
}

// What the garrison currently holds, plus the raid view on the current clock.
export function getGarrison(leaderId, now = Date.now()) {
  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId);
  if (!clanRow) return null;
  const members = garrisonMembers(leaderId).map((row) => ({
    id: row.id,
    templateKey: row.template_key,
    name: row.name,
    class: row.class,
    className: CLASSES[row.class]?.label || row.class,
    level: row.level,
    portrait: row.portrait ? `/art/portraits/${row.portrait}.svg` : null,
    history: row.history,
    plus: parseJson(row.pluses, []).map(traitInfo),
    minus: parseJson(row.minuses, []).map(traitInfo),
    assignment: 'clan',
  }));
  const g = garrisonRow(clanRow.id);
  const goldPerTick = Math.round(GOLD_PER_TICK * (1 + (raidModifiers(clanRow).goldRate || 0)));
  return {
    members,
    count: members.length,
    msPerTick: MS_PER_TICK,
    goldPerTick,
    namesEveryTicks: NAMES_EVERY_TICKS,
    lastTickMs: g.last_tick_ms || 0,
    nextTickAt: (g.last_tick_ms || 0) + MS_PER_TICK,
    // The standards the clan can recall. `recallKeeps` is the base of the point.
    recallRule: 'recall respects the party cap — the clan is a reserve, not a bypass',
  };
}
