// Test environment. MUST be the first import in every test file, before any
// module that opens the database or reads LLM config. It points the tests at a
// throwaway database so they never touch the live game data, and turns the LLM
// layer off so replies are deterministic.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DB_PATH = path.join(__dirname, '.tmp', 'test.sqlite');
process.env.LLM_PROVIDER = 'off';

fs.mkdirSync(path.dirname(process.env.DB_PATH), { recursive: true });
for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`, `${process.env.DB_PATH}-wal`]) {
  try { fs.rmSync(f); } catch { /* fresh start */ }
}
