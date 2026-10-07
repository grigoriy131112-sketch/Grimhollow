// Cut a per-continent chart out of the shared world plate.
//
// The global map is one generated plate with every landmass in one drawing
// (client/public/art/maps/world-chart.svg). A continent map must show only that
// one continent, so this tool copies the plate's coastline paths for the
// requested continent's island(s) — and its small satellite islets — into its
// own file, re-framed to the same 1000x640 sheet the global map uses but zoomed
// so the land fills most of the frame. Nothing else is drawn: no neighbours.
//
//   node tools/gen_continent_maps.mjs
//
// Writes client/public/art/maps/continent-<slug>.svg for each continent and
// records the file on the continent entry in client/src/world-geo.json (key
// `map`). Locations keep their world `x`/`y`, and because each output shares
// the world viewBox, a continent map can place a marker at exactly (x, y).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATE = join(ROOT, 'client', 'public', 'art', 'maps', 'world-chart.svg');
const GEO = join(ROOT, 'client', 'src', 'world-geo.json');
const OUT_DIR = join(ROOT, 'client', 'public', 'art', 'maps');

const WORLD = { w: 1000, h: 640 };
const FILL = '#403a32';
const STROKE = '#c9b587';
const SEA = '#070a0e';
const FILL_RULE = 'evenodd';
const JOIN = 'round';
const MARGIN = 0.06; // share of the sheet left as sea on the tightest axis

const SLUG = {
  'Мордрат': 'mordrat',
  'Морозная Колыбель': 'moroznaya-kolybel',
  'Кор-Ашан': 'kor-ashan',
  'Вольные Гавани': 'volnye-gavani',
  'Зелёный Предел': 'zeleny-predel',
};

const svg = readFileSync(PLATE, 'utf8');
const view = /viewBox="([^"]+)"/.exec(svg)[1].split(/[ ,]+/).map(Number);
if (view[2] !== WORLD.w || view[3] !== WORLD.h) {
  throw new Error(`plate viewBox ${view.join(' ')} is not ${WORLD.w}x${WORLD.h}`);
}
const gm = /<g\b[^>]*transform="matrix\(([^)]+)\)"[^>]*>/.exec(svg);
const [a, b, c, d, e, f] = gm[1].split(/[ ,]+/).map(Number);
const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]);

const nums = /-?\d*\.?\d+(?:e-?\d+)?/gi;
function bboxWorld(dd) {
  const v = dd.match(nums).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < v.length; i += 2) {
    const X = a * v[i] + c * v[i + 1] + e;
    const Y = b * v[i] + d * v[i + 1] + f;
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y);
    x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, area: (x1 - x0) * (y1 - y0) };
}

const boxes = paths.map(bboxWorld);
const geo = JSON.parse(readFileSync(GEO, 'utf8'));

// Bind each island path to the continent whose centre it is nearest; a path
// that is not the closest to any centre is a satellite islet and follows the
// nearest mainland island.
const assignments = geo.continents.map(() => []);
for (let i = 0; i < boxes.length; i++) {
  let best = 0, bd = Infinity;
  geo.continents.forEach((con, k) => {
    const dist = Math.hypot(boxes[i].cx - con.cx, boxes[i].cy - con.cy);
    if (dist < bd) { bd = dist; best = k; }
  });
  assignments[best].push(i);
}

// Decide which assigned paths are the mainland(s): anything within ~1.5x the
// largest island's diagonal is kept together; tiny islets are already in the
// same bucket because they were nearest the same continent centre.
geo.continents.forEach((con, k) => {
  const idx = assignments[k];
  if (!idx.length) throw new Error(`no island paths for ${con.name}`);
  const cx0 = Math.min(...idx.map((i) => boxes[i].x0));
  const cy0 = Math.min(...idx.map((i) => boxes[i].y0));
  const cx1 = Math.max(...idx.map((i) => boxes[i].x1));
  const cy1 = Math.max(...idx.map((i) => boxes[i].y1));
  const cw = cx1 - cx0, ch = cy1 - cy0;
  const scale = Math.min((WORLD.w * (1 - MARGIN)) / cw, (WORLD.h * (1 - MARGIN)) / ch);
  const tx = WORLD.w / 2 - scale * (cx0 + cw / 2);
  const ty = WORLD.h / 2 - scale * (cy0 + ch / 2);

  // Fold the framing scale into the plate's own diagonal matrix. The stroke is
  // divided back out so the coastline keeps the same weight as the global map.
  const m = [a * scale, 0, 0, d * scale, e * scale + tx, f * scale + ty];
  const strokeWidth = (1.344 * a) / (a * scale); // == 1.344 / scale

  const body = idx.map((i) => `    <path d="${paths[i]}"/>`).join('\n');
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD.w} ${WORLD.h}" width="${WORLD.w}" height="${WORLD.h}">
  <rect x="0" y="0" width="${WORLD.w}" height="${WORLD.h}" fill="${SEA}"/>
  <g transform="matrix(${m.map((n) => n.toFixed(4)).join(' ')})"
     fill="${FILL}" fill-rule="${FILL_RULE}" stroke="${STROKE}" stroke-width="${strokeWidth.toFixed(4)}" stroke-linejoin="${JOIN}">
${body}
  </g>
</svg>
`;
  const slug = SLUG[con.name] || con.name.toLowerCase().replace(/\s+/g, '-');
  const file = `continent-${slug}.svg`;
  writeFileSync(join(OUT_DIR, file), out);
  con.map = `/art/maps/${file}`;
  console.log(`${con.name.padEnd(20)} -> ${file}  islands=${idx.length} frame=scale ${scale.toFixed(3)}`);
});

writeFileSync(GEO, `${JSON.stringify(geo, null, 1)}\n`);
console.log(`updated ${GEO}`);
