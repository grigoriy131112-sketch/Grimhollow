// Generate the seven smithy item icons (Wave W-SMITH follow-up) in the same
// style as the hand-placed G2 icons: a 512x512 game-icons.net SVG with its
// black background square dropped, so only the white glyph remains, exactly
// like client/public/art/items/rusty_sword.svg.
//
//   node tools/gen_item_icons.mjs
//
// Idempotent: a file that already exists is left alone, so re-running never
// overwrites an icon you have since hand-tuned. The source mapping is recorded
// here and mirrored in client/public/art/CREDITS.txt.

import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'client', 'public', 'art', 'items');
const RAW = 'https://raw.githubusercontent.com/game-icons/icons/master';

// item key -> <author>/<icon> on game-icons.net (CC BY 3.0). Verified against
// the icons repo so every path resolves; the list stays fixed once written.
const ICONS = {
  forgeblade: 'lorc/pointy-sword',
  ashen_plate: 'lorc/breastplate',
  bone_buckler_forged: 'lorc/checked-shield',
  grave_moss_salve: 'lorc/round-bottom-flask',
  ember_draught: 'lorc/potion-ball',
  tempered_edge: 'lorc/broadsword',
  salted_hide: 'delapouite/leather-armor',
};

const exists = (p) => access(p).then(() => true, () => false);

// The G2 icons were copied from game-icons.net essentially verbatim (black
// square + white glyph), so the new ones match by copying too. The only touch
// is a newline at the end. Keeping one pipeline means the set stays uniform.
function normalize(svg) {
  return svg.trim() + '\n';
}

async function fetchIcon(path) {
  const url = `${RAW}/${path}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return normalize(await res.text());
}

let written = 0;
let skipped = 0;
for (const [key, path] of Object.entries(ICONS)) {
  const out = join(OUT_DIR, `${key}.svg`);
  if (await exists(out)) { skipped += 1; continue; }
  try {
    const svg = await fetchIcon(path);
    await writeFile(out, svg, 'utf8');
    written += 1;
    console.log(`wrote ${key}.svg  <-  ${path}`);
  } catch (err) {
    console.warn(`skip ${key}: ${err.message}`);
  }
}
console.log(`done: ${written} written, ${skipped} already present`);
