// Apply the seed files' current map coords to an existing database, mirroring
// the UPDATE seed.js already does via backfillMap() for Мордрат. The continent
// and settlement seeds skip when their rows already exist, so after a re-layout
// this bring the live DB in line without a destructive reseed.
//
//   DB_PATH=/path/to.sqlite node tools/apply_coords.mjs
//   DB_PATH=/path/to.sqlite node -e "await import('./tools/apply_coords.mjs')"

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FILES = [
  join(ROOT, 'server/src/db/seed.js'),
  join(ROOT, 'server/src/db/seed_continents.js'),
  join(ROOT, 'server/src/db/seed_settlements.js'),
];

function blockContinent(src, idx) {
  const before = src.slice(0, idx);
  const m = before.match(/name:\s*'(Мордрат|Морозная Колыбель|Кор-Ашан|Вольные Гавани|Зелёный Предел)'/g);
  return m ? m[m.length - 1].match(/'(.*)'/)[1] : null;
}

const locs = [];
for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  const re = /\{\s*name:\s*'([^']+)'[^{}]*x:\s*(-?\d+)\s*,\s*y:\s*(-?\d+)[^{}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let continent = blockContinent(src, m.index);
    if (file.includes('settlements')) continent = 'Мордрат';
    locs.push({ name: m[1], x: +m[2], y: +m[3], continent });
  }
}

const dbPath = process.env.DB_PATH || join(ROOT, 'server/src/data/grimhollow.sqlite');
const db = new DatabaseSync(dbPath);
const stmt = db.prepare('UPDATE locations SET map_x=?, map_y=? WHERE name=?');
let updated = 0, missing = 0;
const missingNames = [];
for (const l of locs) {
  const info = stmt.run(l.x, l.y, l.name);
  if (info.changes === 0) { missing++; missingNames.push(l.name); }
  else updated++;
}
console.log(`updated ${updated} locations in ${dbPath}${missing ? `; ${missing} not found: ${missingNames.join(', ')}` : ''}`);