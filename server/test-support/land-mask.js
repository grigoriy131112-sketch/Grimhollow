// Land mask for the map tests, derived from the shared world plate.
//
// The world is drawn from client/public/art/maps/world-antique.jpg; the very
// same pixels are thresholded into server/test-support/world-mask.json by
// tools/gen_world_mask.mjs. This is what keeps "every location stands on land"
// honest: change the plate and both the picture and this grid move together.
//
// 86 rows x 140 columns over the 1000x640 map viewBox; '1' is land, '0' is sea.

import { LAND_MASK, LAND_MASK_COLS, LAND_MASK_ROWS } from '../src/game/world_geo.js';

export { LAND_MASK, LAND_MASK_COLS, LAND_MASK_ROWS };
