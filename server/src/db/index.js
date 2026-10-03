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
