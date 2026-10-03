// NPC persistence: seeding named inhabitants into their locations and reading
// them back. Design data lives in game/npcs.js.

import { getDb, transaction } from '../db/index.js';
import { NPCS } from '../game/npcs.js';
import { traitInfo } from '../game/companions.js';

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

// Insert any NPC from the design list that is not in the database yet. Safe to
// run on every boot: it only adds, never duplicates or overwrites.
export function seedNpcs() {
  const db = getDb();
  const existing = new Set(db.prepare('SELECT key FROM npcs').all().map((r) => r.key));
  const missing = NPCS.filter((n) => !existing.has(n.key));
  if (!missing.length) return { skipped: true };

  transaction((d) => {
    const locId = d.prepare('SELECT id FROM locations WHERE name = ?');
    const ins = d.prepare(
      `INSERT OR IGNORE INTO npcs (location_id, key, name, role, class, portrait, description, pluses, minuses, opinion, mood, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calm', 'world')`,
    );
    for (const n of missing) {
      const loc = locId.get(n.location);
      ins.run(loc?.id ?? null, n.key, n.name, n.role, n.class, n.portrait || null, n.description,
        JSON.stringify(n.plus || []), JSON.stringify(n.minus || []), n.opinion ?? 50);
    }
  });
  return { added: missing.length };
}

function deriveNpc(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    role: row.role,
    class: row.class,
    portrait: row.portrait ? `/art/portraits/${row.portrait}.svg` : null,
    description: row.description,
    locationId: row.location_id,
    traits: [...parseJson(row.pluses, []), ...parseJson(row.minuses, [])],
    plus: parseJson(row.pluses, []).map(traitInfo),
    minus: parseJson(row.minuses, []).map(traitInfo),
    baseOpinion: row.opinion,
    mood: row.mood,
    source: row.source,
  };
}

export function getNpc(id) {
  const row = getDb().prepare('SELECT * FROM npcs WHERE id = ?').get(id);
  return row ? deriveNpc(row) : null;
}

export function getNpcByKey(key) {
  const row = getDb().prepare('SELECT * FROM npcs WHERE key = ?').get(key);
  return row ? deriveNpc(row) : null;
}

// Everyone who lives in a location, ordered by name.
export function npcsAtLocation(locationId) {
  return getDb().prepare('SELECT * FROM npcs WHERE location_id = ? ORDER BY name').all(locationId).map(deriveNpc);
}

export function listNpcs() {
  return getDb().prepare('SELECT * FROM npcs ORDER BY name').all().map(deriveNpc);
}
