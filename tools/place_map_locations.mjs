// Place every map location on its OWN continent's land.
//
//   node tools/place_map_locations.mjs
//
// Why: the authored seed coordinates predate the current generated plate, so some
// places fell in the sea or on the wrong island (a port floating in water, a
// swamp on another continent). This tool projects each place onto the land of the
// continent its seed section belongs to, keeping it as close as possible to the
// authored point so regional clusters survive.
//
// It works from the same two sources of truth the app uses:
//   - client/public/art/maps/world-chart.svg  (the drawn coast)
//   - server/test-support/world-mask.json     (the exact land/sea grid the tests
//                                              and isLand() sample)
// so a placement is on screen and in the tests at once. Ports snap to the shore;
// inland places snap to the nearest interior land. Seals are kept apart.
//
// Writes x/y back into the seed files. Run `npm test` afterwards.

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PLATE = join(ROOT, 'client', 'public', 'art', 'maps', 'world-chart.svg');
const CANON = JSON.parse(readFileSync(join(ROOT, 'server', 'test-support', 'world-mask.json'), 'utf8'));
const GEO = JSON.parse(readFileSync(join(ROOT, 'client', 'src', 'world-geo.json'), 'utf8'));
const FILES = [
  join(ROOT, 'server', 'src', 'db', 'seed.js'),
  join(ROOT, 'server', 'src', 'db', 'seed_continents.js'),
  join(ROOT, 'server', 'src', 'db', 'seed_settlements.js'),
];

const W = 1000, H = 640;
const COLS = 280, ROWS = 172;           // fine grid over the plate (2x the test mask)
const GX = W / COLS, GY = H / ROWS;
const MIN_GAP = 40;                      // px between seal centres
const PORT_GAP = 55;                     // ports want a wider berth (halo + label)

// --- the fine land bitmap, straight from the plate ---------------------------
const { data } = await sharp(readFileSync(PLATE), { density: 96 })
  .resize(COLS, ROWS, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const fine = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) fine[r * COLS + c] = data[(r * COLS + c) * 3 + 1] > 28 ? 1 : 0;

// canonical-land guard: the tests sample CANON at 1000x640; a coordinate is only
// acceptable if that same point reads as '1' there.
const canonLand = (x, y) => {
  const c = Math.min(CANON.cols - 1, Math.max(0, Math.floor((x / W) * CANON.cols)));
  const r = Math.min(CANON.rows - 1, Math.max(0, Math.floor((y / H) * CANON.rows)));
  return CANON.mask[r][c] === '1';
};
const cxOf = (c) => (c + 0.5) * GX, cyOf = (r) => (r + 0.5) * GY;
const okCell = (r, c) => fine[r * COLS + c] === 1 && canonLand(cxOf(c), cyOf(r));

// --- connected land blobs on the fine grid -----------------------------------
const blob = new Int32Array(COLS * ROWS).fill(-1);
let nextBlob = 1;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (!fine[r * COLS + c] || blob[r * COLS + c] !== -1) continue;
  const id = nextBlob++; const st = [[r, c]]; blob[r * COLS + c] = id;
  while (st.length) {
    const [rr, cc] = st.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
      if (!fine[nr * COLS + nc] || blob[nr * COLS + nc] !== -1) continue;
      blob[nr * COLS + nc] = id; st.push([nr, nc]);
    }
  }
}
// continent -> blob, by the geo anchor nearest the blob (anchor sits on the isle)
const blobs = new Map(); // id -> {cells:[[r,c]...]}
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const b = blob[r * COLS + c]; if (b <= 0) continue;
  if (!blobs.has(b)) blobs.set(b, []);
  blobs.get(b).push([r, c]);
}
const blobSizes = [...blobs].map(([id, cs]) => [id, cs.length]).sort((a, b) => b[1] - a[1]);
const bigIds = blobSizes.slice(0, 6).map(([id]) => id);
const contBlob = {};
for (const c of GEO.continents) {
  let best = null, bd = Infinity;
  for (const id of bigIds) {
    const cs = blobs.get(id);
    // nearest cell of this blob to the anchor
    let dmin = Infinity;
    for (const [r, cc] of cs) { const d = Math.hypot(cxOf(cc) - c.cx, cyOf(r) - c.cy); if (d < dmin) dmin = d; }
    if (dmin < bd) { bd = dmin; best = id; }
  }
  contBlob[c.name] = best;
}
console.log('continent -> blob:', Object.entries(contBlob).map(([k, v]) => `${k}=${v}(${blobs.get(v).length})`).join('  '));

// shore cells: a blob cell with sea within SHORE_REACH cells
const SHORE_REACH = 2;
const shore = new Map();
for (const [name, id] of Object.entries(contBlob)) {
  const set = new Set();
  for (const [r, c] of blobs.get(id)) {
    let edge = false;
    for (let dr = -SHORE_REACH; dr <= SHORE_REACH && !edge; dr++) for (let dc = -SHORE_REACH; dc <= SHORE_REACH; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || blob[nr * COLS + nc] !== id) { edge = true; break; }
    }
    if (edge) set.add(r * COLS + c);
  }
  shore.set(name, set);
}

// --- read the seeds ----------------------------------------------------------
const GATES = ['Сумеречная гавань', 'Ледяной причал', 'Порт Свободных Капитанов', 'Порт Солёного Стекла', 'Зелёный причал'];
function blockContinent(src, idx) {
  const before = src.slice(0, idx);
  const m = before.match(/name:\s*'(Мордрат|Морозная Колыбель|Кор-Ашан|Вольные Гавани|Зелёный Предел)'/g);
  return m ? m[m.length - 1].match(/'(.*)'/)[1] : null;
}
function readAll() {
  const out = [];
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    const re = /\{\s*name:\s*'([^']+)'[^{}]*x:\s*(-?\d+)\s*,\s*y:\s*(-?\d+)[^{}]*\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      let continent = blockContinent(src, m.index);
      if (file.includes('settlements')) continent = 'Мордрат';
      out.push({ name: m[1], x: +m[2], y: +m[3], isPort: GATES.includes(m[1]), file, continent });
    }
  }
  return out;
}
const LOCS = readAll();
console.log('parsed', LOCS.length, 'locations');

// --- placement ---------------------------------------------------------------
// Keep authored coordinates whenever they are already right (on the continent's
// own land, ports on the shore); only the places that fell in the sea or on the
// wrong island are moved — to the nearest valid cell of their own continent.
// Ports are settled first so they claim the shore.
const placed = [];
const usedPts = []; // integer points already claimed (kept or moved)
function cellOf(x, y) {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((x / W) * COLS)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((y / H) * ROWS)));
  return [r, c];
}
const isShoreCell = (r, c) => shore.get(contOf(r, c))?.has(r * COLS + c) ?? false;
const contOf = (r, c) => Object.entries(contBlob).find(([, id]) => id === blob[r * COLS + c])?.[0];
function validAt(loc, x, y) {
  if (!canonLand(x, y)) return false;
  const [r, c] = cellOf(x, y);
  if (fine[r * COLS + c] !== 1 || contOf(r, c) !== loc.continent) return false;
  return !loc.isPort || isShoreCell(r, c);
}
function candidatesFor(loc) {
  const cells = loc.isPort ? [...shore.get(loc.continent)] : blobs.get(contBlob[loc.continent]).map(([r, c]) => r * COLS + c);
  const out = [];
  for (const flat of cells) {
    const r = Math.floor(flat / COLS), c = flat % COLS;
    if (!okCell(r, c)) continue;
    out.push([cxOf(c), cyOf(r)]);
  }
  return out;
}
const order = [...LOCS].sort((a, b) => (a.isPort === b.isPort ? 0 : a.isPort ? -1 : 1));
const result = new Map();
const KEEP_GAP = 30; // a kept authorial point is only kept if it clears this
for (const l of order) {
  if (validAt(l, l.x, l.y)) {
    let nearest = Infinity;
    for (const [ux, uy] of usedPts) { const d = Math.hypot(ux - l.x, uy - l.y); if (d < nearest) nearest = d; }
    if (nearest >= KEEP_GAP) {
      placed.push([l.x, l.y]); usedPts.push([l.x, l.y]);
      result.set(l.name, { x: l.x, y: l.y, kept: true });
      continue;
    }
  }
  const cands = candidatesFor(l);
  if (!cands.length) { console.error(`no candidate cells for ${l.name}`); process.exit(1); }
  let best = null, bestMin = 0;
  for (const minInt of [30, 24, 18, 12, 6, 0]) {
    best = null; let bestDist = Infinity;
    for (const [x, y] of cands) {
      const ix = Math.round(x), iy = Math.round(y);
      let nearestInt = Infinity;
      for (const [ux, uy] of usedPts) { const d = Math.hypot(ux - ix, uy - iy); if (d < nearestInt) nearestInt = d; }
      if (nearestInt < minInt) continue;
      const distAuth = Math.hypot(x - l.x, y - l.y);
      if (distAuth < bestDist) { bestDist = distAuth; best = [x, y, distAuth, ix, iy]; }
    }
    if (best) { bestMin = minInt; break; }
  }
  if (!best) { console.error(`no free point for ${l.name}`); process.exit(1); }
  placed.push([best[0], best[1]]);
  usedPts.push([best[3], best[4]]);
  result.set(l.name, { x: Math.round(best[0]), y: Math.round(best[1]), kept: false, moved: best[2], sep: bestMin });
}

console.log('\nplacements:');
const bad = [];
let keptN = 0, movedN = 0;
for (const l of order) {
  const r = result.get(l.name);
  const ok = canonLand(r.x, r.y);
  if (!ok) bad.push(l.name);
  if (r.kept) keptN++; else movedN++;
  const tag = l.isPort ? 'PORT' : '    ';
  const how = r.kept ? 'kept' : `moved ${r.moved.toFixed(0)}px`;
  console.log(`${tag} ${l.name.padEnd(26)} -> (${String(r.x).padStart(4)},${String(r.y).padStart(4)}) ${ok ? 'on ' + l.continent : 'BAD'} ${how}`);
}
console.log(`\nkept ${keptN}, moved ${movedN}`);
if (bad.length) { console.error('BAD:', bad.join(', ')); process.exit(1); }

// --- write back --------------------------------------------------------------
let fails = 0;
for (const l of LOCS) {
  const r = result.get(l.name);
  let src = readFileSync(l.file, 'utf8');
  const esc = l.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(name:\\s*'${esc}'[^{}]*?)(x:\\s*)(-?\\d+)(\\s*,\\s*y:\\s*)(-?\\d+)`);
  if (!re.test(src)) { console.error(`  !! pattern not found: ${l.name}`); fails++; continue; }
  src = src.replace(re, (m, pre, xk, xv, mid, yv) => `${pre}${xk}${r.x}${mid}${r.y}`);
  writeFileSync(l.file, src);
}
console.log(fails ? `\n${fails} replacements failed` : '\nall seed files updated');