// Build the world plate and the land mask from one source engraving.
//
//   node tools/gen_world_mask.mjs <source.jpg>
//
// Writes:
//   client/public/art/maps/world-antique.jpg   the dark chart the client draws
//   server/test-support/world-mask.json        the land/sea grid the tests use
//
// Both come from the same pixels, so the picture and "every location stands on
// land" can never disagree. The engraving is a public-domain 1784 world map on
// Mercator (see client/public/art/CREDITS.txt); only the tone is changed.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node tools/gen_world_mask.mjs <source.jpg>');
  process.exit(1);
}

const OUT_IMAGE = join(ROOT, 'client', 'public', 'art', 'maps', 'world-antique.jpg');
const OUT_MASK = join(ROOT, 'server', 'test-support', 'world-mask.json');

const COLS = 140;
const ROWS = 86;

// --- 1. crop the neatline: keep the drawn world, drop the frame -------------
const sheet = await sharp(SRC).extract({ left: 110, top: 110, width: 3280, height: 1940 })
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const W = sheet.info.width;
const H = sheet.info.height;
const raw = sheet.data;

// --- 2. the plate: shift the tone to the near-black house style -------------
await sharp(raw, { raw: { width: W, height: H, channels: 1 } })
  .linear(0.6, -52)
  .resize(1600, 1024, { fit: 'fill' })
  .jpeg({ quality: 84 })
  .toFile(OUT_IMAGE);
console.log('wrote', OUT_IMAGE);

// --- 3. land mask: hatching density separates land from open sea ------------
// Land is hatched (high-frequency detail); open water is smooth. Low-pass the
// sheet, take the absolute difference, then average that detail over a wide box
// (a uniform mean, matching how the plate was tuned). Threshold the result,
// then average down to the mask grid.
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y += 1) {
    let acc = 0;
    for (let x = -r; x <= r; x += 1) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x += 1) {
      tmp[y * w + x] = acc / win;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let acc = 0;
    for (let y = -r; y <= r; y += 1) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = acc / win;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

const f32 = Float32Array.from(raw);
const lowp = boxBlur(f32, W, H, 13);
const hp = new Float32Array(W * H);
for (let i = 0; i < W * H; i += 1) hp[i] = Math.abs(f32[i] - lowp[i]);
const dens = boxBlur(hp, W, H, 40);

const grid = new Float64Array(COLS * ROWS);
const x0 = new Int32Array(COLS + 1);
const y0 = new Int32Array(ROWS + 1);
for (let c = 0; c <= COLS; c += 1) x0[c] = Math.floor((c * W) / COLS);
for (let r = 0; r <= ROWS; r += 1) y0[r] = Math.floor((r * H) / ROWS);
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    let sum = 0;
    let cnt = 0;
    for (let y = y0[r]; y < y0[r + 1]; y += 1) {
      for (let x = x0[c]; x < x0[c + 1]; x += 1) { sum += dens[y * W + x]; cnt += 1; }
    }
    grid[r * COLS + c] = cnt ? sum / cnt : 0;
  }
}

const sorted = [...grid].sort((a, b) => a - b);
const th = sorted[Math.floor(sorted.length * 0.55)];
const mask = [];
for (let r = 0; r < ROWS; r += 1) {
  let row = '';
  for (let c = 0; c < COLS; c += 1) row += grid[r * COLS + c] > th ? '1' : '0';
  mask.push(row);
}

writeFileSync(OUT_MASK, JSON.stringify({ cols: COLS, rows: ROWS, mask }));
console.log('wrote', OUT_MASK, 'threshold', th.toFixed(1));

// --- 4. preview: label the biggest landmasses so placement is easy ----------
const lab = new Int16Array(COLS * ROWS).fill(-1);
let nc = 0;
for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
  if (mask[r][c] !== '1' || lab[r * COLS + c] !== -1) continue;
  const stack = [[r, c]];
  lab[r * COLS + c] = nc;
  let size = 0;
  while (stack.length) {
    const [y, x] = stack.pop();
    size += 1;
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = y + dy; const nx = x + dx;
      if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) continue;
      if (mask[ny][nx] !== '1' || lab[ny * COLS + nx] !== -1) continue;
      lab[ny * COLS + nx] = nc;
      stack.push([ny, nx]);
    }
  }
  nc += 1;
}
const sizes = new Array(nc).fill(0);
for (let i = 0; i < COLS * ROWS; i += 1) if (lab[i] >= 0) sizes[lab[i]] += 1;
const big = sizes.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
const LETTER = 'ABCDEFGHIJ';
const byLabel = new Map();
big.slice(0, 10).forEach(([, i], rank) => byLabel.set(i, LETTER[rank]));
console.log('    ' + Array.from({ length: COLS }, (_, c) => Math.floor(c / 10) % 10).join(''));
console.log('    ' + Array.from({ length: COLS }, (_, c) => c % 10).join(''));
for (let r = 0; r < ROWS; r += 1) {
  let row = '';
  for (let c = 0; c < COLS; c += 1) {
    const l = lab[r * COLS + c];
    row += l < 0 ? '.' : (byLabel.get(l) || '#');
  }
  console.log(`${String(r).padStart(3, ' ')} ${row}`);
}
console.log('landmasses:', big.slice(0, 8).map(([s, i]) => `${byLabel.get(i) || '#'}:${s}`).join(' '));
