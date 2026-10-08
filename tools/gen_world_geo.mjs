// Derive each continent's clickable shape from the world plate.
//
//   node tools/gen_world_geo.mjs
//
// gen_world_map.mjs draws the world as one picture and cuts the land/sea mask
// from it; this tool reads that same committed plate and works out which land
// belongs to which continent, then writes a `hits` path (in world coordinates)
// onto each continent in client/src/world-geo.json.
//
// The global map uses those paths as its click targets. Rectangles cannot be
// used for that: the continents' bounding boxes overlap, so a rectangle over a
// tall northern landmass sits entirely inside the eastern one's box and swallows
// every click. Tracing the real land instead gives each continent exactly the
// ground it owns — no overlaps, and clicking open sea does nothing.

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PLATE = join(ROOT, 'client', 'public', 'art', 'maps', 'world-chart.svg');
const GEO = join(ROOT, 'client', 'src', 'world-geo.json');

const W = 1000;
const H = 640;
const COLS = 280;
const ROWS = 172;
const MIN_ISLAND = 50; // cells; below this a blob is a speck, not a continent

const svg = readFileSync(PLATE);
const { data } = await sharp(svg, { density: 96 })
  .resize(COLS, ROWS, { fit: 'fill' })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const land = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    land[r * COLS + c] = data[(r * COLS + c) * 3 + 1] > 28 ? 1 : 0; // green channel splits ash land from sea
  }
}

// Flood-fill the land into connected blobs.
const label = new Int16Array(COLS * ROWS).fill(-1);
const blobs = [];
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    if (!land[r * COLS + c] || label[r * COLS + c] !== -1) continue;
    const id = blobs.length;
    const cells = [];
    const stack = [[r, c]];
    label[r * COLS + c] = id;
    while (stack.length) {
      const [y, x] = stack.pop();
      cells.push([y, x]);
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy; const nx = x + dx;
        if (ny < 0 || nx < 0 || ny >= ROWS || nx >= COLS) continue;
        if (!land[ny * COLS + nx] || label[ny * COLS + nx] !== -1) continue;
        label[ny * COLS + nx] = id;
        stack.push([ny, nx]);
      }
    }
    blobs.push(cells);
  }
}

const worldX = (c) => ((c + 0.5) / COLS) * W;
const worldY = (r) => ((r + 0.5) / ROWS) * H;

const geo = JSON.parse(readFileSync(GEO, 'utf8'));
const names = geo.continents.map((c) => c.name);
const anchors = new Map(geo.continents.map((c) => [c.name, [c.cx, c.cy]]));

// Each continent owns the blobs nearest its published centre. Only real
// landmasses count; specks are ignored so they cannot claim a stray click.
const owned = new Map(names.map((n) => [n, []]));
for (const cells of blobs) {
  if (cells.length < MIN_ISLAND) continue;
  const cx = cells.reduce((s, [r, c]) => s + worldX(c), 0) / cells.length;
  const cy = cells.reduce((s, [r, c]) => s + worldY(r), 0) / cells.length;
  let best = null;
  let bestD = Infinity;
  for (const n of names) {
    const [ax, ay] = anchors.get(n);
    const d = Math.hypot(cx - ax, cy - ay);
    if (d < bestD) { bestD = d; best = n; }
  }
  owned.get(best).push(cells);
}

// A blob's ground as one path: a rectangle per horizontal run of cells. Cheap to
// hit-test, exact to the traced land, and never overlapping another continent.
function hitPath(cellSets) {
  const byRow = new Map();
  for (const cells of cellSets) {
    for (const [r, c] of cells) {
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(c);
    }
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const h = +(H / ROWS).toFixed(2);
  let d = '';
  for (const r of rows) {
    const cols = byRow.get(r).sort((a, b) => a - b);
    let start = cols[0];
    let prev = cols[0];
    const flush = (a, b) => {
      const x = +(worldX(a) - W / COLS / 2).toFixed(2);
      const y = +(worldY(r) - h / 2).toFixed(2);
      const w = +(((b - a + 1) / COLS) * W).toFixed(2);
      d += `M${x} ${y}h${w}v${h}h${-w}z`;
    };
    for (let i = 1; i < cols.length; i += 1) {
      if (cols[i] === prev + 1) { prev = cols[i]; continue; }
      flush(start, prev);
      start = cols[i];
      prev = cols[i];
    }
    flush(start, prev);
  }
  return d;
}

for (const c of geo.continents) {
  c.hits = hitPath(owned.get(c.name));
}

writeFileSync(GEO, `${JSON.stringify(geo, null, 1)}\n`);

console.log('continent click shapes (blobs / path length):');
for (const c of geo.continents) {
  console.log(`  ${c.name.padEnd(18)} blobs=${owned.get(c.name).length} path=${c.hits.length} chars`);
}
console.log('wrote', GEO);
