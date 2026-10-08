// Build the world plate, the continent rectangles and the land mask from one
// generated fantasy map.
//
//   node tools/gen_world_map.mjs <source.svg> [--analyze]
//
// The source is an Azgaar's Fantasy Map Generator SVG export (a generated,
// fictional world — see client/public/art/CREDITS.txt). We take only the drawn
// landmasses and the ocean, recolour them to the house style, and write:
//
//   client/public/art/maps/world-chart.svg   the single plate the client draws
//   client/src/world-geo.json                continent rectangles and sea labels
//   server/test-support/world-mask.json      the land/sea grid the tests use
//
// The mask is thresholded from the very plate we emit, so the picture and the
// "every location stands on land" guarantee can never disagree.
//
// --analyze only prints the landmass table (used to place continents/locations)
// and writes nothing.

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = process.argv[2];
const ANALYZE = process.argv.includes('--analyze');
if (!SRC) {
  console.error('usage: node tools/gen_world_map.mjs <source.svg> [--analyze]');
  process.exit(1);
}

const OUT_PLATE = join(ROOT, 'client', 'public', 'art', 'maps', 'world-chart.svg');
const OUT_GEO = join(ROOT, 'client', 'src', 'world-geo.json');
const OUT_MASK = join(ROOT, 'server', 'test-support', 'world-mask.json');

// --- house style --------------------------------------------------------------
const SEA = '#070a0e';   // near-black sea
const LAND = '#403a32';  // ash-dark land
const COAST = '#c9b587'; // bone coast

// The game's world viewBox. The plate is emitted already fitted to it, so the
// client can draw it 1:1 with no stretch.
const WORLD = { w: 1000, h: 640 };

const COLS = 140;
const ROWS = 86;

// --- 1. pull the land geometry out of the generated SVG -----------------------
const doc = readFileSync(SRC, 'utf8');

function group(doc, id) {
  const m = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*>`).exec(doc);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth > 0) {
    const nxt = /<g\b|<\/g>/.exec(doc.slice(i));
    if (!nxt) break;
    const j = i + nxt.index;
    depth += doc.startsWith('</', j) ? -1 : 1;
    i = j + (doc.startsWith('</', j) ? 4 : nxt[0].length);
  }
  return doc.slice(m.index, i);
}

// Every drawn feature (coastline/landmass polygon) keyed by its id.
const defs = group(doc, 'featurePaths');
if (!defs) throw new Error('no <g id="featurePaths"> in the source SVG');
const features = new Map();
for (const tag of defs.match(/<path\b[^>]*>/g) || []) {
  const id = /\bid="([^"]+)"/.exec(tag)?.[1];
  const d = /\bd="([^"]+)"/.exec(tag)?.[1];
  if (id && d) features.set(id, d);
}

// The land mask lists, in order, the features that are land (the ocean is what
// is left over). We keep that order so even-odd holes (lakes) stay holes.
const landMask = /<mask id="land">([\s\S]*?)<\/mask>/.exec(doc)?.[1] || '';
const landIds = [...landMask.matchAll(/<use\b[^>]*href="#(feature_[^"]+)"/g)].map((m) => m[1]);
if (!landIds.length) throw new Error('no land features in the source SVG');

const svgW = Number(/<svg\b[^>]*\bwidth="([\d.]+)"/.exec(doc)?.[1]) || 1920;
const svgH = Number(/<svg\b[^>]*\bheight="([\d.]+)"/.exec(doc)?.[1]) || 1080;

// Fit the whole sheet into the world box, preserving aspect and centring it, so
// the coast is never squashed.
const scale = Math.min(WORLD.w / svgW, WORLD.h / svgH);
const ox = (WORLD.w - svgW * scale) / 2;
const oy = (WORLD.h - svgH * scale) / 2;

// --- 2. the plate: one recoloured drawing, already in world coordinates -------
const landPaths = landIds.map((id) => `<path d="${features.get(id)}"/>`).join('\n    ');
const plate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD.w} ${WORLD.h}" width="${WORLD.w}" height="${WORLD.h}">
  <rect x="0" y="0" width="${WORLD.w}" height="${WORLD.h}" fill="${SEA}"/>
  <g transform="matrix(${scale.toFixed(6)} 0 0 ${scale.toFixed(6)} ${ox.toFixed(4)} ${oy.toFixed(4)})"
     fill="${LAND}" fill-rule="evenodd" stroke="${COAST}" stroke-width="${(0.7 / scale).toFixed(4)}" stroke-linejoin="round">
    ${landPaths}
  </g>
</svg>
`;

// --- 3. rasterize the plate into the land/sea grid ----------------------------
// We render the very file we just wrote, so the grid is literally the picture.
async function landMaskFromPlate(svg, cols, rows) {
  const { data } = await sharp(Buffer.from(svg), { density: 96 })
    .resize(cols, rows, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = [];
  for (let r = 0; r < rows; r += 1) {
    let row = '';
    for (let c = 0; c < cols; c += 1) {
      const g = data[(r * cols + c) * 3 + 1]; // green channel separates ash land from near-black sea
      row += g > 28 ? '1' : '0';
    }
    mask.push(row);
  }
  return mask;
}

// --- 4. find the landmasses so continents can be bound to real shapes ---------
async function landmasses(svg, cols, rows) {
  const mask = await landMaskFromPlate(svg, cols, rows);
  const label = new Int16Array(cols * rows).fill(-1);
  let n = 0;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (mask[r][c] !== '1' || label[r * cols + c] !== -1) continue;
    const stack = [[r, c]];
    label[r * cols + c] = n;
    while (stack.length) {
      const [y, x] = stack.pop();
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy; const nx = x + dx;
        if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
        if (mask[ny][nx] !== '1' || label[ny * cols + nx] !== -1) continue;
        label[ny * cols + nx] = n;
        stack.push([ny, nx]);
      }
    }
    n += 1;
  }
  const boxes = Array.from({ length: n }, () => ({ size: 0, x0: cols, y0: rows, x1: -1, y1: -1 }));
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const l = label[r * cols + c];
    if (l < 0) continue;
    const b = boxes[l];
    b.size += 1;
    b.x0 = Math.min(b.x0, c); b.y0 = Math.min(b.y0, r);
    b.x1 = Math.max(b.x1, c); b.y1 = Math.max(b.y1, r);
  }
  const toWorld = (b) => ({
    size: b.size,
    cx: Math.round(((b.x0 + b.x1 + 1) / 2 / cols) * WORLD.w),
    cy: Math.round(((b.y0 + b.y1 + 1) / 2 / rows) * WORLD.h),
    rect: [
      +((b.x0 / cols) * WORLD.w).toFixed(1),
      +((b.y0 / rows) * WORLD.h).toFixed(1),
      +(((b.x1 + 1) / cols) * WORLD.w).toFixed(1),
      +(((b.y1 + 1) / rows) * WORLD.h).toFixed(1),
    ],
  });
  return { mask, list: boxes.map(toWorld).sort((a, b) => b.size - a.size) };
}

const { list } = await landmasses(plate, 280, 172);
const mask = await landMaskFromPlate(plate, COLS, ROWS);

// --- 5. report ----------------------------------------------------------------
console.log('sheet', svgW + 'x' + svgH, '-> scale', scale.toFixed(4), 'offset', ox.toFixed(1), oy.toFixed(1));
console.log('landmasses (world coords):');
for (const [i, m] of list.slice(0, 12).entries()) {
  console.log(`  ${i}: cells=${String(m.size).padStart(5)} centre=(${m.cx},${m.cy}) rect=[${m.rect.join(', ')}]`);
}
console.log('    ' + Array.from({ length: COLS }, (_, c) => Math.floor(c / 10) % 10).join(''));
console.log('    ' + Array.from({ length: COLS }, (_, c) => c % 10).join(''));
for (let r = 0; r < ROWS; r += 1) console.log(String(r).padStart(3, ' ') + ' ' + mask[r].replace(/1/g, '#'));

if (ANALYZE) process.exit(0);

// --- 6. write everything ------------------------------------------------------
writeFileSync(OUT_PLATE, plate);
writeFileSync(OUT_MASK, JSON.stringify({ cols: COLS, rows: ROWS, mask }));
console.log('wrote', OUT_PLATE);
console.log('wrote', OUT_MASK);
