// Browser stand-in for Node's `node:sqlite` (Node 24 built-in), backed by
// sql.js (SQLite compiled to WebAssembly). Implements exactly the surface the
// Grimhollow server uses: DatabaseSync, exec, prepare, and a statement with
// all()/get()/run() returning { changes, lastInsertRowid }. The whole game
// database is kept in memory and mirrored to IndexedDB after every write, so a
// page reload resumes the same world.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQLPromise = null;
let SQL = null;

export function initSqlite() {
  if (!SQLPromise) {
    SQLPromise = initSqlJs({ locateFile: () => wasmUrl }).then((mod) => {
      SQL = mod;
      return mod;
    });
  }
  return SQLPromise;
}

const DB_NAME = 'grimhollow';
const STORE = 'sqlite';
const KEY = 'world';

function idbOpen() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbLoad() {
  try {
    const db = await idbOpen();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSave(bytes) {
  try {
    const db = await idbOpen();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* private mode: keep running in memory only */
  }
}

// node:sqlite is synchronous; sql.js is too, but reading the persisted image
// from IndexedDB is async. We preload it once at bootstrap (see preloadSqlite)
// and hand the bytes to the DatabaseSync constructor synchronously.
export async function preloadSqlite() {
  await initSqlite();
  const bytes = await idbLoad();
  globalThis.__GRIMHOLLOW_DB_BYTES__ = bytes || null;
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

class StatementSync {
  constructor(database, sql) {
    this._database = database;
    this._sql = sql;
  }

  _bind(params) {
    const stmt = this._database._db.prepare(this._sql);
    if (params.length) stmt.bind(params.map(normalize));
    return stmt;
  }

  all(...params) {
    const stmt = this._bind(params);
    const rows = [];
    try {
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  get(...params) {
    const stmt = this._bind(params);
    try {
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  run(...params) {
    const db = this._database._db;
    db.run(this._sql, params.map(normalize));
    const changes = db.getRowsModified();
    const row = db.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = row && row[0] && row[0].values[0] ? row[0].values[0][0] : 0;
    this._database._schedulePersist();
    return { changes, lastInsertRowid };
  }
}

class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('sql.js not initialised — call preloadSqlite() first');
    const bytes = globalThis.__GRIMHOLLOW_DB_BYTES__;
    this._db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this._persistTimer = null;
  }

  exec(sql) {
    try {
      this._db.exec(sql);
    } catch (err) {
      // sql.js raises on empty statements; node:sqlite tolerates them.
      if (!/no statement/i.test(String(err && err.message))) throw err;
    }
    this._schedulePersist();
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  close() {
    this._db.close();
  }

  _schedulePersist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      idbSave(this._db.export());
    }, 250);
  }
}

export { DatabaseSync };
export default { DatabaseSync };
