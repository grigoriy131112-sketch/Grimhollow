// The shape of Grimhollow, read from the same plate the client draws.
//
// The world is one antique chart (client/public/art/maps/world-antique.jpg),
// recoloured by tools/gen_world_mask.mjs, which also writes the land/sea grid
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
