// The shape of Grimhollow, read from the shared geometry the client also draws.
//
// client/src/world-geo.json is written by tools/gen_world_geo.mjs and holds each
// continent's coastlines (closed rings of world points). The client renders
// those rings; here we only answer whether a point is land. Because both sides
// read the same file, the picture and the "every location is on land" test can
// never drift apart — the old design sampled a raster, so swapping the image
// silently broke the guarantee.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEO = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'client', 'src', 'world-geo.json'), 'utf8'));

export const WORLD = GEO.world;

export const CONTINENTS_GEO = GEO.continents.map((c) => ({
  name: c.name,
  cx: c.cx, cy: c.cy,
  label: c.label,
  rect: c.rect,
  rings: c.rings,
}));

export const SEAS = GEO.seas;

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Is this world point on some continent's land?
export function isLand(x, y) {
  for (const c of CONTINENTS_GEO) {
    for (const ring of c.rings) if (inRing(x, y, ring)) return true;
  }
  return false;
}

// Which continent owns a point (or null for open sea).
export function continentAt(x, y) {
  for (const c of CONTINENTS_GEO) {
    for (const ring of c.rings) if (inRing(x, y, ring)) return c.name;
  }
  return null;
}

// A coarse land/sea grid for tests and tooling. '1' is land, '0' is sea.
export function landMask(cols = 160, rows = 102) {
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    let row = '';
    for (let c = 0; c < cols; c += 1) {
      const x = ((c + 0.5) / cols) * WORLD.w;
      const y = ((r + 0.5) / rows) * WORLD.h;
      row += isLand(x, y) ? '1' : '0';
    }
    grid.push(row);
  }
  return grid;
}
