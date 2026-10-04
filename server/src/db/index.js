import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'grimhollow.sqlite');

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

// Additive migrations for databases created before a column existed.
function migrate(d) {
  const columns = (table) => d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns('battles').includes('result')) {
    d.exec('ALTER TABLE battles ADD COLUMN result TEXT');
  }
  const locCols = columns('locations');
  if (!locCols.includes('map_x')) d.exec('ALTER TABLE locations ADD COLUMN map_x REAL');
  if (!locCols.includes('map_y')) d.exec('ALTER TABLE locations ADD COLUMN map_y REAL');
  if (!locCols.includes('scene')) d.exec('ALTER TABLE locations ADD COLUMN scene TEXT');
  if (!locCols.includes('biome')) d.exec('ALTER TABLE locations ADD COLUMN biome TEXT');
  if (!columns('connections').includes('minutes')) d.exec('ALTER TABLE connections ADD COLUMN minutes INTEGER');
  if (!columns('travels').includes('arrived')) {
    d.exec('ALTER TABLE travels ADD COLUMN arrived INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns('characters').includes('location_id')) {
    d.exec('ALTER TABLE characters ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL');
  }
  if (!columns('characters').includes('party_points')) {
    d.exec('ALTER TABLE characters ADD COLUMN party_points INTEGER NOT NULL DEFAULT 0');
  }
  const battleCols = columns('battles');
  if (!battleCols.includes('kind')) d.exec("ALTER TABLE battles ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal'");
  if (!battleCols.includes('revive_member')) d.exec('ALTER TABLE battles ADD COLUMN revive_member INTEGER');
  const charCols = columns('characters');
  if (!charCols.includes('fate')) d.exec("ALTER TABLE characters ADD COLUMN fate TEXT NOT NULL DEFAULT 'alive'");
  if (!charCols.includes('fate_ref')) d.exec('ALTER TABLE characters ADD COLUMN fate_ref INTEGER');
}

export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb() {
  if (db) { db.close(); db = undefined; }
}
