// Land mask for the map tests, derived from the shared world geometry.
//
// The world is now drawn from vector coastlines (client/src/world-geo.json,
// authored by tools/gen_world_geo.mjs), so the mask is computed from the same
// polygons the client draws rather than sampled from a raster. This is what
// keeps "every location stands on land" honest: change the coast and both the
// picture and this grid move together.
//
// 102 rows x 160 columns over the 1000x640 map viewBox; '1' is land, '0' is sea.

import { landMask } from '../src/game/world_geo.js';

export const LAND_MASK_COLS = 160;
export const LAND_MASK_ROWS = 102;

export const LAND_MASK = landMask(LAND_MASK_COLS, LAND_MASK_ROWS);
