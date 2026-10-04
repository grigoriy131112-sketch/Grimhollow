// Party (отряд) persistence and orchestration.
//
// The leader is a normal character. Companions are party_members rows holding
// their own sheet (class/level/hp/...) plus a history, traits and how they were
// found. Relationships are directed: each member feels something toward the
// leader and toward every other member.

import { getDb, transaction } from '../db/index.js';
import { deriveCharacter, levelFromXp } from '../game/rules.js';
import { CLASSES } from '../game/classes.js';
import {
  COMPANIONS, RECRUIT_SOURCES, PORTRAITS,
  companionTemplate, templatePrice, listSources,
  seedOpinionToPlayer, seedBondBetween, shouldLeave,
  acceptanceChance, clampRelation, traitInfo,
  LEAVE_THRESHOLD,
} from '../game/companions.js';
import { getBonuses } from './upgrades.js';
import { applyBonusesToSource } from '../game/party_upgrades.js';

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

// --- recruitment board ------------------------------------------------------

// Everyone who could be found from a given source, with their asking price and
// the honest chance the leader would currently have to recruit them.
export function getRecruitBoard(leaderId, sourceKey) {
  const leader = requireLeader(leaderId);
  const source = sourceKey || null;
  const roster = COMPANIONS
    .filter((t) => !source || (t.sources || []).includes(source))
    .filter((t) => !isRecruited(leaderId, t.key));

  const charisma = charismaOf(leader);
  return roster.map((t) => {
    const price = templatePrice(t);
    const chance = acceptanceChance(t, {
      source: source || t.sources[0], relationToPlayer: t.opinion ?? 50, charisma, goldOffered: price,
    });
    return {
      key: t.key,
      name: t.name,
      class: t.class,
      className: CLASSES[t.class]?.label || t.class,
      level: t.level,
      portrait: t.portrait ? `/art/portraits/${t.portrait}.svg` : null,
      history: t.history,
      plus: t.plus.map(traitInfo),
      minus: t.minus.map(traitInfo),
      opinion: t.opinion,
      sources: t.sources.map((s) => ({ key: s, ...RECRUIT_SOURCES[s] })),
      price,
      method: RECRUIT_SOURCES[source || t.sources[0]]?.method || 'free',
      acceptChance: Math.round(chance * 100),
    };
  });
}

export function listSourcesWithCounts(leaderId) {
  return listSources().map((s) => ({
    ...s,
    available: COMPANIONS.filter((t) => (t.sources || []).includes(s.key) && !isRecruited(leaderId, t.key)).length,
  }));
}

function isRecruited(leaderId, templateKey) {
  const row = getDb().prepare(
    "SELECT 1 FROM party_members WHERE leader_id = ? AND template_key = ? AND status != 'left'",
  ).get(leaderId, templateKey);
  return !!row;
}

function charismaOf(leader) {
  // No charisma stat exists yet: use accuracy+evasion as a stand-in for presence,
  // normalised to 0..100 so diplomacy math stays meaningful.
  const s = leader.stats;
  return clampRelation(40 + (s.accuracy + s.evasion) / 2);
}

// --- joining ----------------------------------------------------------------

// Recruit a companion. `rng` is injectable so the outcome is testable.
export function recruit(leaderId, templateKey, { source, goldOffered = 0 } = {}, rng = Math.random) {
  const leader = requireLeader(leaderId);
  const t = companionTemplate(templateKey);
  if (!t) throw new Error('Такого спутника не существует');
  if (isRecruited(leaderId, t.key)) throw new Error('Этот спутник уже в отряде');

  // The roster is capped; the Мuster branch raises it one rank at a time.
  const roster = getBonuses(leaderId).roster;
  if (activeMembers(leaderId).length >= roster) {
    throw new Error(`Отряд уже полон (${roster}). Укрепите ветвь «Сбор».`);
  }

  const srcKey = source || t.sources[0];
  if (!RECRUIT_SOURCES[srcKey]) throw new Error('Неизвестный способ набора');
  if (!(t.sources || []).includes(srcKey)) throw new Error('Этого спутника так не найти');

  const price = templatePrice(t);
  const chance = acceptanceChance(t, {
    source: srcKey, relationToPlayer: t.opinion ?? 50, charisma: charismaOf(leader), goldOffered,
  });
  const accepted = rng() < chance;
  if (!accepted) {
    return { accepted: false, chance: Math.round(chance * 100), name: t.name };
  }

  // Gold-priced sources cost the asking price; the offer must cover it.
  const method = RECRUIT_SOURCES[srcKey].method;
  let goldPaid = 0;
  if (method === 'gold' || method === 'ransom') {
    if (goldOffered < price) throw new Error('Предложено слишком мало золота');
    if (leader.gold < price) throw new Error('Недостаточно золота, чтобы нанять его');
    goldPaid = price;
  }

  const memberId = transaction((db) => {
    if (goldPaid > 0) {
      db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(goldPaid, leaderId);
    }
    const info = db.prepare(
      `INSERT INTO party_members (leader_id, template_key, name, class, level, xp, hp, mana, stamina, portrait, history, pluses, minuses, source, status, recruit_log)
       VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?, ?, ?, ?, 'active', ?)`,
    ).run(
      leaderId, t.key, t.name, t.class, t.level, t.portrait || null, t.history,
      JSON.stringify(t.plus), JSON.stringify(t.minus), srcKey,
      JSON.stringify([{ text: `${t.name} присоединяется к отряду (${RECRUIT_SOURCES[srcKey].name}).` }]),
    );
    const newId = info.lastInsertRowid;

    // Opinion of the leader.
    const toLeader = seedOpinionToPlayer(t, { source: srcKey, goldPaid });
    db.prepare('INSERT OR REPLACE INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, NULL, ?)')
      .run(leaderId, newId, toLeader);

    // How the newcomer and every existing member feel about each other.
    for (const other of activeMembers(leaderId)) {
      const otherT = companionTemplate(other.template_key);
      const mutual = otherT ? seedBondBetween(t, otherT) : 50;
      db.prepare('INSERT OR REPLACE INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, ?, ?)')
        .run(leaderId, newId, other.id, mutual);
      db.prepare('INSERT OR REPLACE INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, ?, ?)')
        .run(leaderId, other.id, newId, mutual);
    }
    return newId;
  });

  return { accepted: true, chance: Math.round(chance * 100), member: getMember(memberId), goldPaid };
}

// --- reading ----------------------------------------------------------------

function requireLeader(id) {
  const row = getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!row) throw new Error('Персонаж не найден');
  return deriveCharacter(row);
}

export function activeMembers(leaderId) {
  return getDb().prepare(
    "SELECT * FROM party_members WHERE leader_id = ? AND status = 'active' ORDER BY joined_at, id",
  ).all(leaderId);
}

export function getMember(id) {
  const row = getDb().prepare('SELECT * FROM party_members WHERE id = ?').get(id);
  return row ? deriveMember(row) : null;
}

function deriveMember(row) {
  // A companion is statted like a character of the same class/level.
  const sheet = deriveCharacter({ ...row, class: row.class, level: row.level });
  return {
    id: row.id,
    leaderId: row.leader_id,
    templateKey: row.template_key,
    name: row.name,
    class: row.class,
    className: sheet.className,
    level: sheet.level,
    xp: sheet.xp,
    hp: sheet.hp,
    mana: sheet.mana,
    stamina: sheet.stamina,
    stats: sheet.stats,
    abilities: sheet.abilities,
    portrait: row.portrait ? `/art/portraits/${row.portrait}.svg` : null,
    history: row.history,
    plus: parseJson(row.pluses, []).map(traitInfo),
    minus: parseJson(row.minuses, []).map(traitInfo),
    source: row.source,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

// Full party view: leader, members, and the relationship matrix.
export function getParty(leaderId) {
  const leader = requireLeader(leaderId);
  const members = activeMembers(leaderId).map(deriveMember);
  const relRows = getDb().prepare('SELECT * FROM party_relations WHERE leader_id = ?').all(leaderId);

  const relationToLeader = {};
  const bonds = {};
  for (const m of members) {
    bonds[m.id] = [];
    const row = relRows.find((r) => r.from_member_id === m.id && r.to_member_id === null);
    relationToLeader[m.id] = row ? row.value : 50;
  }
  for (const m of members) {
    for (const other of members) {
      if (m.id === other.id) continue;
      const row = relRows.find((r) => r.from_member_id === m.id && r.to_member_id === other.id);
      bonds[m.id].push({ key: other.id, name: other.name, value: row ? row.value : 50 });
    }
  }

  const withRelations = members.map((m) => ({
    ...m,
    relationToLeader: relationToLeader[m.id],
    bonds: bonds[m.id],
    leaving: shouldLeave({ relationToPlayer: relationToLeader[m.id], bonds: bonds[m.id] }),
  }));

  // Fold the party tree in for display: leader and every companion show base
  // plus bonus, matching what they fight with. Battles boost from raw sheets,
  // so these enriched views must never be fed back into startBattle().
  const bonuses = getBonuses(leader.id);
  const enriched = withRelations.map((m) => {
    const b = applyBonusesToSource(m, bonuses);
    return { ...m, stats: b.stats, hp: b.hp, mana: b.mana, stamina: b.stamina };
  });

  return {
    leader: (() => {
      const b = applyBonusesToSource(leader, bonuses);
      return {
        id: leader.id, name: leader.name, class: leader.class, className: leader.className,
        level: leader.level, hp: b.hp, mana: b.mana, stamina: b.stamina,
        stats: b.stats, gold: leader.gold, portrait: leader.portrait,
      };
    })(),
    members: enriched,
    size: enriched.length,
    leaveThreshold: LEAVE_THRESHOLD,
    bonuses: {
      roster: bonuses.roster, regenMana: bonuses.regenMana,
      regenStamina: bonuses.regenStamina, startFull: bonuses.startFull,
      percents: Object.fromEntries(Object.entries(bonuses.mult).map(([k, v]) => [k, Math.round(v * 100)])),
    },
  };
}

// --- leaving ----------------------------------------------------------------

// Apply a relationship change, then evict anyone who has fallen below the
// threshold with the leader or with a peer.
export function adjustRelation(memberId, toMemberId, delta) {
  const member = getDb().prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!member) throw new Error('Спутник не найден');
  const db = getDb();
  const row = db.prepare('SELECT * FROM party_relations WHERE from_member_id = ? AND to_member_id IS ?')
    .get(memberId, toMemberId ?? null);
  const next = clampRelation((row?.value ?? 50) + delta);
  if (row) db.prepare('UPDATE party_relations SET value = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next, row.id);
  else db.prepare('INSERT INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, ?, ?)')
    .run(member.leader_id, memberId, toMemberId ?? null, next);
  return next;
}

export function sweepDepartures(leaderId) {
  const party = getParty(leaderId);
  const left = [];
  for (const m of party.members) {
    if (m.leaving.leave) {
      const peer = m.bonds.find((b) => b.key === m.leaving.peerKey);
      const reason = m.leaving.reason === 'leader'
        ? 'отношения с предводителем упали ниже предела'
        : `отношения с ${peer?.name || 'соратником'} упали ниже предела`;
      markLeft(m.id, reason);
      left.push({ id: m.id, name: m.name, reason });
    }
  }
  return left;
}

export function markLeft(memberId, reason = 'покинул отряд') {
  const db = getDb();
  const member = db.prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!member) return false;
  const log = parseJson(member.recruit_log, []);
  log.push({ text: `${member.name} покидает отряд: ${reason}.` });
  db.prepare("UPDATE party_members SET status = 'left', recruit_log = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(log), memberId);
  return true;
}

export function setMemberStatus(memberId, status) {
  const allowed = ['active', 'dead', 'left'];
  if (!allowed.includes(status)) throw new Error('Недопустимый статус спутника');
  return getDb().prepare("UPDATE party_members SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, memberId).changes > 0;
}

// A companion who falls in battle is dead for good (until a resurrection ritual).
export function markDead(memberId) {
  const db = getDb();
  const member = db.prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!member) return false;
  const log = parseJson(member.recruit_log, []);
  log.push({ text: `${member.name} погибает в бою.` });
  db.prepare("UPDATE party_members SET status = 'dead', hp = 0, recruit_log = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(log), memberId);
  return true;
}

// Bring a fallen companion back: alive again at full strength, rejoining the
// active roster. Called only after the death-realm boss is beaten.
export function reviveMember(memberId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!row) throw new Error('Спутник не найден');
  const sheet = deriveCharacter({ ...row, hp: null, mana: null, stamina: null });
  const log = parseJson(row.recruit_log, []);
  log.push({ text: `${row.name} возвращается из царства мёртвых.` });
  db.prepare(
    "UPDATE party_members SET status = 'active', hp = ?, mana = ?, stamina = ?, recruit_log = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(sheet.stats.maxHp, sheet.stats.maxMana, sheet.stats.maxStamina, JSON.stringify(log), memberId);
  return getMember(memberId);
}

// How a revival lands, by character: the one pulled back feels gratitude or
// resentment according to their traits, and the living who watched the leader
// walk into death for a peer warm to them a little.
export function applyRevivalRelations(memberId, { revivalDelta, witnessDelta }) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!row) return { revived: 0, witnesses: [] };

  const revivedDelta = adjustRelation(memberId, null, revivalDelta);
  const witnesses = [];
  for (const m of activeMembers(row.leader_id)) {
    if (m.id === memberId) continue;
    const value = adjustRelation(m.id, null, witnessDelta);
    witnesses.push({ memberId: m.id, name: m.name, relation: value, delta: witnessDelta });
  }
  return { revived: revivedDelta, witnesses };
}

// Everyone who fell and can still be called back, for the ritual screen.
export function fallenMembers(leaderId) {
  return getDb().prepare("SELECT * FROM party_members WHERE leader_id = ? AND status = 'dead' ORDER BY id")
    .all(leaderId).map(deriveMember);
}

// Persist a companion's resources after a fight, applying level-ups from XP.
export function grantMemberXp(memberId, { xpGained = 0, hp, mana, stamina } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM party_members WHERE id = ?').get(memberId);
  if (!row) throw new Error('Спутник не найден');

  const newXp = row.xp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > row.level;

  const before = deriveCharacter({ ...row, hp: null, mana: null, stamina: null });
  const fresh = deriveCharacter({ ...row, level: newLevel, xp: newXp, hp: null, mana: null, stamina: null });
  const next = (value, field) => {
    if (value === null || value === undefined) return fresh.stats[field];
    if (leveledUp) return fresh.stats[field];
    return Math.max(0, Math.min(value, fresh.stats[field]));
  };

  db.prepare(
    "UPDATE party_members SET level=?, xp=?, hp=?, mana=?, stamina=?, updated_at=datetime('now') WHERE id=?",
  ).run(newLevel, newXp, next(hp, 'maxHp'), next(mana, 'maxMana'), next(stamina, 'maxStamina'), memberId);

  return { xp: newXp, level: newLevel, leveledUp, maxHp: fresh.stats.maxHp, previousMaxHp: before.stats.maxHp };
}

export { PORTRAITS };
