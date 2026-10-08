// The shape of Grimhollow, read from the same plate the client draws.
//
// The world is one generated fantasy chart (client/public/art/maps/world-chart.svg),
// recoloured by tools/gen_world_map.mjs, which also writes the land/sea grid
// server/test-support/world-mask.json from those very pixels. Here we only
// answer whether a point is land — so the picture and the "every location is on
// land" guarantee can never drift apart: change the plate, regenerate the mask,
// and both move together.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MASK = JSON.parse(
  readFileSync(join(HERE, '..', '..', 'test-support', 'world-mask.json'), 'utf8'),
);

export const WORLD = { w: 1000, h: 640 };
export const LAND_MASK_COLS = MASK.cols;
export const LAND_MASK_ROWS = MASK.rows;

// The grid, as an array of '1'/'0' rows. This is exactly what the tests sample.
export const LAND_MASK = MASK.mask;

function cell(x, y) {
  const col = Math.min(LAND_MASK_COLS - 1, Math.max(0, Math.floor((x / WORLD.w) * LAND_MASK_COLS)));
  const row = Math.min(LAND_MASK_ROWS - 1, Math.max(0, Math.floor((y / WORLD.h) * LAND_MASK_ROWS)));
  return LAND_MASK[row][col];
}

// Is this world point on land?
export function isLand(x, y) {
  return cell(x, y) === '1';
}

const COLS = LAND_MASK_COLS;
const ROWS = LAND_MASK_ROWS;

function seaCell(x, y) {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((x / WORLD.w) * COLS)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((y / WORLD.h) * ROWS)));
  return LAND_MASK[r][c] === '0';
}

function cellCenter(col, row) {
  return [(col + 0.5) / COLS * WORLD.w, (row + 0.5) / ROWS * WORLD.h];
}

// The sea cell nearest a (possibly inland) point, found by a widening ring so a
// gate that sits right on the shore resolves to the water beside it.
function nearestSea(x, y) {
  const c0 = Math.min(COLS - 1, Math.max(0, Math.floor((x / WORLD.w) * COLS)));
  const r0 = Math.min(ROWS - 1, Math.max(0, Math.floor((y / WORLD.h) * ROWS)));
  for (let ring = 0; ring < Math.max(COLS, ROWS); ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const r = r0 + dr; const c = c0 + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && LAND_MASK[r][c] === '0') return [c, r];
      }
    }
  }
  return null;
}

// A point-to-point segment stays on water if every sampled cell is sea.
function waterSeg(ax, ay, bx, by) {
  const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 5));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!seaCell(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

// Keep only the corners a straight water line cannot skip, so the lane is a
// handful of points that still never cross land.
function simplify(points) {
  const out = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i += 1) {
    if (!waterSeg(...points[anchor], ...points[i])) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// The sailing line between two points, following open water instead of cutting
// straight across the land. Returns world points from `from` to `to` (the gates
// themselves, so the lane touches each port), or the straight pair if no water
// route exists. Deterministic: the mask is fixed, so the line never wobbles.
export function seaRoute(from, to) {
  const start = nearestSea(from[0], from[1]);
  const end = nearestSea(to[0], to[1]);
  if (!start || !end) return [from, to];
  const [sc, sr] = start; const [ec, er] = end;

  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const seen = new Uint8Array(COLS * ROWS);
  const idx = (c, r) => r * COLS + c;
  const queue = [idx(sc, sr)];
  seen[idx(sc, sr)] = 1;
  let found = false;
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    if (cur === idx(ec, er)) { found = true; break; }
    const c = cur % COLS; const r = (cur - c) / COLS;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc; const nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const ni = idx(nc, nr);
        if (seen[ni] || LAND_MASK[nr][nc] === '1') continue;
        seen[ni] = 1; prev[ni] = cur; queue.push(ni);
      }
    }
  }
  if (!found) return [from, to];

  const cells = [];
  for (let cur = idx(ec, er); cur !== -1; cur = prev[cur]) {
    const c = cur % COLS; const r = (cur - c) / COLS;
    cells.push(cellCenter(c, r));
  }
  cells.reverse();
  return [from, ...simplify(cells), to];
}
