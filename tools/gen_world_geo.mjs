// Generate the world's land geometry. Run: `node tools/gen_world_geo.mjs`.
//
// The world is one flat chart (x 0..1000, y 0..640). Each continent is an
// organic blob: a closed ring of points around a centre, its radius nudged by
// smooth seeded noise so every coast is irregular but stable. Вольные Гавани is
// an archipelago, so it is a scatter of islets.
//
// This script is the only place the shapes are computed. It writes
// client/src/world-geo.json, which both the client (drawing) and the server
// (the "every location is on land" test) read — so the picture and the
// guarantee can never disagree.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'src', 'world-geo.json');

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (n) => Math.round(n * 10) / 10;

function blobRing(cx, cy, rx, ry, seed, { n = 84, amp = 0.16, lobes = 3 } = {}) {
  const rng = rngFrom(hash(seed));
  const phase = [rng() * 6.283, rng() * 6.283, rng() * 6.283, rng() * 6.283];
  const w = [0.55, 0.3, 0.18, 0.1];
  const pts = [];
  for (let k = 0; k < n; k += 1) {
    const a = (2 * Math.PI * k) / n;
    let wob = 1;
    for (let i = 0; i < w.length; i += 1) wob += amp * w[i] * Math.sin((lobes + i) * a + phase[i]);
    pts.push([r1(cx + Math.cos(a) * rx * wob), r1(cy + Math.sin(a) * ry * wob)]);
  }
  return pts;
}

const DESIGN = [
  {
    name: 'Мордрат', cx: 480, cy: 300, label: [480, 250],
    rings: [blobRing(480, 300, 158, 118, 'mordrat', { amp: 0.17, lobes: 3 })],
    rect: [322, 182, 316, 236],
  },
  {
    name: 'Морозная Колыбель', cx: 250, cy: 120, label: [250, 78],
    rings: [blobRing(250, 120, 152, 96, 'frozen', { amp: 0.2, lobes: 4 })],
    rect: [98, 24, 304, 192],
  },
  {
    name: 'Вольные Гавани', cx: 120, cy: 360, label: [120, 250],
    rings: [
      blobRing(92, 322, 54, 40, 'havens-a', { amp: 0.24, lobes: 3 }),
      blobRing(150, 372, 46, 38, 'havens-b', { amp: 0.26, lobes: 4 }),
      blobRing(96, 430, 40, 34, 'havens-c', { amp: 0.24, lobes: 3 }),
      blobRing(186, 300, 30, 26, 'havens-d', { amp: 0.28, lobes: 3 }),
      blobRing(150, 452, 26, 22, 'havens-e', { amp: 0.3, lobes: 3 }),
    ],
    rect: [30, 260, 196, 220],
  },
  {
    name: 'Кор-Ашан', cx: 470, cy: 552, label: [470, 610],
    rings: [blobRing(470, 552, 178, 74, 'ashan', { amp: 0.16, lobes: 4 })],
    rect: [292, 470, 356, 148],
  },
  {
    name: 'Зелёный Предел', cx: 832, cy: 330, label: [832, 470],
    rings: [blobRing(832, 330, 134, 122, 'green', { amp: 0.2, lobes: 3 })],
    rect: [694, 200, 276, 260],
  },
];

const SEAS = [
  { name: 'Море Забвения', x: 505, y: 92, size: 20, arc: true },
  { name: 'Море Стужи', x: 150, y: 232, size: 12 },
  { name: 'Море Утонувших', x: 300, y: 470, size: 12 },
  { name: 'Стеклянное море', x: 300, y: 590, size: 13 },
  { name: 'Живой океан', x: 905, y: 470, size: 13 },
  { name: 'Сумеречный пролив', x: 650, y: 300, size: 10 },
];

const geo = {
  world: { w: 1000, h: 640 },
  continents: DESIGN,
  seas: SEAS,
};
writeFileSync(OUT, `${JSON.stringify(geo, null, 2)}\n`);
console.log('wrote', OUT);

// --- sanity: every authored location must sit on its own continent's land ---
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const isLand = (x, y) => DESIGN.some((c) => c.rings.some((r) => inRing(x, y, r)));

const CHECK = {
  'Мордрат': [
    ['Перекрёсток висельников', 470, 300], ['Плачущая низина', 370, 250],
    ['Утонувшая дорога', 410, 360], ['Пепельный лес', 560, 250],
    ['Сумеречная гавань', 495, 205], ['Пещеры, изгрызенные приливом', 600, 330],
    ['Затонувшая часовня', 470, 388], ['Костяные поля', 585, 360],
    ['Чёрный шпиль', 350, 330], ['Гримхольд', 520, 230], ['Соляной Брод', 420, 270],
  ],
  'Морозная Колыбель': [
    ['Ледяной причал', 175, 78], ['Фьорд Стеклянных Слёз', 250, 95],
    ['Замёрзшее море', 205, 150], ['Ледяные гробницы', 300, 150],
  ],
  'Кор-Ашан': [
    ['Порт Солёного Стекла', 365, 522], ['Стеклянные дюны', 445, 548],
    ['Зеркальное марево', 520, 548], ['Подземный архив', 588, 560],
  ],
  'Вольные Гавани': [
    ['Порт Свободных Капитанов', 92, 322], ['Рифовый маяк', 150, 372],
    ['Затонувший город', 96, 430], ['Кладбище кораблей', 150, 452],
  ],
  'Зелёный Предел': [
    ['Зелёный причал', 790, 250], ['Корни-дороги', 850, 300],
    ['Сердце Леса', 880, 360], ['Привитые', 770, 350],
  ],
};

let bad = 0;
for (const [continent, locs] of Object.entries(CHECK)) {
  const c = DESIGN.find((d) => d.name === continent);
  for (const [name, x, y] of locs) {
    const own = c.rings.some((r) => inRing(x, y, r));
    const anywhere = isLand(x, y);
    if (!own) { bad += 1; console.log(`  OFF-LAND ${continent} / ${name} (${x},${y}) own=${own} land=${anywhere}`); }
  }
}
console.log(bad === 0 ? 'all authored locations on their own land' : `${bad} OFF-LAND`);
