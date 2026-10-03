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
