// Named save slots (Wave G4). A slot freezes one character's full live state as
// JSON so it can be listed, loaded back, exported or imported. This wraps the
// existing tables (characters, party_members, party_relations, party_upgrades,
// character_items, character_visits); the auto-save behaviour is untouched — a
// slot is only ever written when the player asks for one.

import { getDb, transaction } from '../db/index.js';
import { CLASSES } from '../game/classes.js';
import { MAX_LEVEL } from '../game/rules.js';
import { getCharacter } from './characters.js';

export const SNAPSHOT_VERSION = 1;

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

const clampRelation = (v) => Math.max(0, Math.min(100, Number.isFinite(Number(v)) ? Number(v) : 50));

function requireCharacter(characterId) {
  const row = getDb().prepare('SELECT id FROM characters WHERE id = ?').get(characterId);
  if (!row) throw new Error('Персонаж не найден');
  return row;
}

function defaultName() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `Сохранение ${stamp}`;
}

// Everything that makes up a character's playable state, as a plain object that
// can be stored in a slot or handed straight to export/import.
export function captureSnapshot(characterId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!row) throw new Error('Персонаж не найден');

  const members = db.prepare('SELECT * FROM party_members WHERE leader_id = ? ORDER BY id').all(characterId);
  const indexByMemberId = new Map(members.map((m, i) => [m.id, i]));
  const relations = db.prepare('SELECT from_member_id, to_member_id, value FROM party_relations WHERE leader_id = ?').all(characterId);
  const upgrades = db.prepare('SELECT node, points FROM party_upgrades WHERE leader_id = ?').all(characterId);
  const items = db.prepare('SELECT item_key, qty FROM character_items WHERE character_id = ? ORDER BY item_key').all(characterId);
  const visits = db.prepare('SELECT location_id FROM character_visits WHERE character_id = ?').all(characterId);

  return {
    version: SNAPSHOT_VERSION,
    character: {
      name: row.name,
      class: row.class,
      level: row.level,
      xp: row.xp,
      hp: row.hp,
      mana: row.mana,
      stamina: row.stamina,
      gold: row.gold,
      portrait: row.portrait,
      locationId: row.location_id,
      partyPoints: row.party_points,
      fate: row.fate || 'alive',
      fateRef: row.fate_ref,
    },
    items: items.map((i) => ({ key: i.item_key, qty: i.qty })),
    // Party identity inside a snapshot is positional (index), so relations stay
    // attached even when two companions share a template_key.
    party: members.map((m) => ({
      templateKey: m.template_key,
      name: m.name,
      class: m.class,
      level: m.level,
      xp: m.xp,
      hp: m.hp,
      mana: m.mana,
      stamina: m.stamina,
      portrait: m.portrait,
      history: m.history,
      pluses: parseJson(m.pluses, []),
      minuses: parseJson(m.minuses, []),
      source: m.source,
      status: m.status,
      recruitLog: parseJson(m.recruit_log, []),
    })),
    relations: relations
      .filter((r) => indexByMemberId.has(r.from_member_id))
      .map((r) => ({
        fromIndex: indexByMemberId.get(r.from_member_id),
        toIndex: r.to_member_id == null ? null : indexByMemberId.get(r.to_member_id) ?? null,
        value: r.value,
      })),
    upgrades: upgrades.map((u) => ({ node: u.node, points: u.points })),
    visits: visits.map((v) => v.location_id),
  };
}

// A snapshot must be a plausible character state; reject garbage before it can
// half-overwrite a live hero.
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Сохранение повреждено');
  if (snapshot.version != null && Number(snapshot.version) > SNAPSHOT_VERSION) {
    throw new Error('Сохранение создано более новой версией игры');
  }
  const c = snapshot.character;
  if (!c || typeof c !== 'object') throw new Error('В сохранении нет героя');
  const name = String(c.name || '').trim();
  if (!name) throw new Error('У героя нет имени');
  if (!CLASSES[c.class]) throw new Error(`Неизвестный класс: ${c.class}`);
  const level = Number(c.level);
  if (!Number.isFinite(level) || level < 1 || level > MAX_LEVEL) {
    throw new Error('Недопустимый уровень героя');
  }
  if (snapshot.party != null && !Array.isArray(snapshot.party)) throw new Error('Сохранение повреждено');
  return true;
}

// Write a snapshot into the DB, either over an existing hero or as a fresh one.
// Returns the id of the character that now holds the state.
export function applySnapshot(snapshot, { characterId = null } = {}) {
  validateSnapshot(snapshot);
  const c = snapshot.character;

  return transaction((db) => {
    let targetId = characterId;
    if (targetId == null) {
      const info = db.prepare(
        `INSERT INTO characters (name, class, level, xp, hp, mana, stamina, gold, portrait, location_id, party_points, fate, fate_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        c.name, c.class, c.level, c.xp, c.hp ?? null, c.mana ?? null, c.stamina ?? null,
        c.gold ?? 0, c.portrait ?? null, c.locationId ?? null, c.partyPoints ?? 0,
        c.fate || 'alive', c.fateRef ?? null,
      );
      targetId = info.lastInsertRowid;
    } else {
      if (!db.prepare('SELECT id FROM characters WHERE id = ?').get(targetId)) {
        throw new Error('Персонаж не найден');
      }
      db.prepare(
        `UPDATE characters SET name=?, class=?, level=?, xp=?, hp=?, mana=?, stamina=?, gold=?, portrait=?,
         location_id=?, party_points=?, fate=?, fate_ref=?, updated_at=datetime('now') WHERE id=?`,
      ).run(
        c.name, c.class, c.level, c.xp, c.hp ?? null, c.mana ?? null, c.stamina ?? null,
        c.gold ?? 0, c.portrait ?? null, c.locationId ?? null, c.partyPoints ?? 0,
        c.fate || 'alive', c.fateRef ?? null, targetId,
      );
      // A load replaces state wholesale: clear what the hero has now so no
      // stale item, companion or upgrade survives the restore.
      db.prepare('DELETE FROM character_items WHERE character_id = ?').run(targetId);
      db.prepare('DELETE FROM party_members WHERE leader_id = ?').run(targetId);
      db.prepare('DELETE FROM party_relations WHERE leader_id = ?').run(targetId);
      db.prepare('DELETE FROM party_upgrades WHERE leader_id = ?').run(targetId);
      db.prepare('DELETE FROM character_visits WHERE character_id = ?').run(targetId);
      db.prepare('DELETE FROM travels WHERE character_id = ?').run(targetId);
    }

    const insItem = db.prepare('INSERT INTO character_items (character_id, item_key, qty) VALUES (?, ?, ?)');
    for (const it of snapshot.items || []) insItem.run(targetId, it.key, it.qty ?? 1);

    const insMember = db.prepare(
      `INSERT INTO party_members (leader_id, template_key, name, class, level, xp, hp, mana, stamina, portrait, history, pluses, minuses, source, status, recruit_log)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const idByIndex = [];
    (snapshot.party || []).forEach((m, i) => {
      const info = insMember.run(
        targetId, m.templateKey, m.name, m.class, m.level ?? 1, m.xp ?? 0,
        m.hp ?? null, m.mana ?? null, m.stamina ?? null, m.portrait ?? null,
        m.history || '', JSON.stringify(m.pluses || []), JSON.stringify(m.minuses || []),
        m.source || 'road', m.status || 'active', JSON.stringify(m.recruitLog || []),
      );
      idByIndex[i] = info.lastInsertRowid;
    });

    const insRel = db.prepare(
      'INSERT OR REPLACE INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, ?, ?)',
    );
    for (const r of snapshot.relations || []) {
      const fromId = idByIndex[r.fromIndex];
      if (fromId == null) continue;
      const toId = r.toIndex == null ? null : idByIndex[r.toIndex];
      if (r.toIndex != null && toId == null) continue;
      insRel.run(targetId, fromId, toId, clampRelation(r.value));
    }

    const insUp = db.prepare('INSERT OR REPLACE INTO party_upgrades (leader_id, node, points) VALUES (?, ?, ?)');
    for (const u of snapshot.upgrades || []) insUp.run(targetId, u.node, u.points ?? 0);

    const insVisit = db.prepare('INSERT OR IGNORE INTO character_visits (character_id, location_id) VALUES (?, ?)');
    for (const locId of snapshot.visits || []) insVisit.run(targetId, locId);

    return targetId;
  });
}

function metaOf(row) {
  return {
    id: row.id,
    characterId: row.character_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSaves(characterId) {
  requireCharacter(characterId);
  return getDb()
    .prepare('SELECT id, character_id, name, created_at, updated_at FROM saves WHERE character_id = ? ORDER BY updated_at DESC, id DESC')
    .all(characterId)
    .map(metaOf);
}

export function getSave(id) {
  const row = getDb().prepare('SELECT id, character_id, name, created_at, updated_at FROM saves WHERE id = ?').get(id);
  return row ? metaOf(row) : null;
}

export function createSave(characterId, name) {
  requireCharacter(characterId);
  const label = String(name || '').trim() || defaultName();
  if (label.length > 60) throw new Error('Имя сохранения слишком длинное (до 60 символов)');
  const snapshot = captureSnapshot(characterId);
  const info = getDb()
    .prepare('INSERT INTO saves (character_id, name, snapshot) VALUES (?, ?, ?)')
    .run(characterId, label, JSON.stringify(snapshot));
  return getSave(info.lastInsertRowid);
}

// The full stored snapshot, for download/export.
export function exportSave(id) {
  const row = getDb().prepare('SELECT * FROM saves WHERE id = ?').get(id);
  if (!row) throw new Error('Сохранение не найдено');
  return { ...metaOf(row), snapshot: parseJson(row.snapshot, null) };
}

// Restore a slot into the hero it belongs to. Returns the fresh sheet.
export function loadSave(id) {
  const row = getDb().prepare('SELECT * FROM saves WHERE id = ?').get(id);
  if (!row) throw new Error('Сохранение не найдено');
  const snapshot = parseJson(row.snapshot, null);
  const characterId = applySnapshot(snapshot, { characterId: row.character_id });
  return { characterId, character: getCharacter(characterId) };
}

export function deleteSave(id) {
  return getDb().prepare('DELETE FROM saves WHERE id = ?').run(id).changes > 0;
}

// Take an exported snapshot and put it back into the world: over `characterId`
// when given, otherwise as a brand-new hero. Returns the restored sheet.
export function importSave(snapshot, { characterId = null } = {}) {
  const id = applySnapshot(snapshot, { characterId: characterId == null ? null : Number(characterId) });
  return { characterId: id, character: getCharacter(id) };
}
