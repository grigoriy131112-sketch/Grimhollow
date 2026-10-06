// Geometry shared by the two charts. The world is authored as one flat map
// (x 0..1000, y 0..640); each continent owns a rectangle of that plane. The
// global chart draws the continents as landmasses at hand-placed anchors, and
// the continent chart zooms one land to fill the panel. Both project the same
// authored points, so a place never moves relative to its neighbours.

export const WORLD = { w: 1000, h: 640 };

// Where each continent's landmass sits on the global chart: [x, y, w, h]. The
// anchors leave open water between the lands, and the landmass blob is padded to
// roughly fill its anchor without spilling into a neighbour.
export const CONTINENT_ANCHORS = [
  { name: 'Мордрат', rect: [340, 190, 300, 260] },
  { name: 'Морозная Колыбель', rect: [45, 40, 240, 200] },
  { name: 'Вольные Гавани', rect: [42, 330, 220, 200] },
  { name: 'Кор-Ашан', rect: [340, 480, 300, 140] },
  { name: 'Зелёный Предел', rect: [700, 40, 260, 200] },
];

// Names of the seas, laid on the open water between the lands. The five lands
// are named in docs/lore/continents.md; the seas are named to match the lore
// ("море помнит всё", the glass sea, the frozen sea).
export const SEAS = [
  { name: 'Море Забвения', x: 505, y: 90, size: 20, arc: true },
  { name: 'Море Стужи', x: 150, y: 288, size: 12 },
  { name: 'Море Утонувших', x: 150, y: 600, size: 12 },
  { name: 'Стеклянное море', x: 300, y: 560, size: 13 },
  { name: 'Живой океан', x: 800, y: 400, size: 13 },
  { name: 'Сумеречный пролив', x: 668, y: 330, size: 10 },
];

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

function boundsOf(locs) {
  const xs = locs.map((l) => l.x).filter((v) => v != null);
  const ys = locs.map((l) => l.y).filter((v) => v != null);
  if (!xs.length) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Map authored points of one continent into a target rectangle, preserving
// aspect ratio and centring inside the rect. `pad` is a fraction of the extent.
function fit(loc, bounds, rect, pad = 0.22) {
  const [rx, ry, rw, rh] = rect;
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(rw / (bw * (1 + 2 * pad)), rh / (bh * (1 + 2 * pad)));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: rx + rw / 2 + (loc.x - cx) * scale,
    y: ry + rh / 2 + (loc.y - cy) * scale,
    scale,
  };
}

// A projector for the global chart: every location lands inside its continent's
// anchor, and the anchor itself is exposed so landmasses and labels can be drawn.
export function makeProjector(map) {
  const anchors = new Map(CONTINENT_ANCHORS.map((a) => [a.name, a]));
  const bounds = new Map();
  for (const l of map.locations) {
    const b = bounds.get(l.continentName);
    if (!b) bounds.set(l.continentName, boundsOf([l]));
    else {
      bounds.set(l.continentName, {
        minX: Math.min(b.minX, l.x), minY: Math.min(b.minY, l.y),
        maxX: Math.max(b.maxX, l.x), maxY: Math.max(b.maxY, l.y),
      });
    }
  }
  const project = (loc) => {
    const anchor = anchors.get(loc.continentName);
    const b = bounds.get(loc.continentName);
    if (!anchor || !b) return { x: null, y: null, scale: 1 };
    return fit(loc, b, anchor.rect);
  };
  return { project, anchors, bounds };
}

// A projector for a single continent's panel: its own points fill a local
// viewBox of the given size, leaving `margin` px of open sea around the land so
// the relief and its labels are never clipped.
export function makeLocalProjector(locations, w, h, pad = 0.16, margin = 0) {
  const b = boundsOf(locations);
  if (!b) return () => ({ x: w / 2, y: h / 2, scale: 1 });
  return (loc) => fit(loc, b, [margin, margin, w - 2 * margin, h - 2 * margin], pad);
}

// An organic landmass outline drawn through a set of points: sort them by angle
// around the centroid, push each outward, then smooth with quadratic curves.
export function blobPath(points, pad, seed) {
  const pts = points.filter((p) => p.x != null && p.y != null);
  if (pts.length < 3) return '';
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rng = rngFrom(hash(seed));
  const ring = pts
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx), r: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((u, v) => u.a - v.a)
    .map(({ p, r }) => {
      const rr = r + pad * (0.75 + rng() * 0.5);
      const a = Math.atan2(p.y - cy, p.x - cx) + (rng() - 0.5) * 0.12;
      return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
    });
  const n = ring.length;
  let d = `M${r1(ring[0].x)},${r1(ring[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    d += ` Q${r1(a.x)},${r1(a.y)} ${r1(mx)},${r1(my)}`;
  }
  return `${d} Z`;
}

// A lightly wobbled poly-line, so overlay roads read as hand-inked.
export function wobbleLine(pts, rng, amp = 2) {
  if (pts.length < 2) return '';
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2 + (rng() - 0.5) * amp;
    const my = (y0 + y1) / 2 + (rng() - 0.5) * amp;
    d += ` Q${r1(mx)},${r1(my)} ${r1(x1)},${r1(y1)}`;
  }
  return d;
}

// Parallel diagonal rules for an engraver's hatching. Meant to be drawn inside
// a clipPath of a landmass: they run at 45°, spaced `gap` px, across the box.
export function hatchLines(minX, minY, maxX, maxY, gap = 8) {
  const lines = [];
  const span = (maxX - minX) + (maxY - minY);
  for (let o = -((maxY - minY)); o < span; o += gap) {
    const x0 = minX + o;
    lines.push([x0, minY, x0 + (maxY - minY), maxY]);
  }
  return lines;
}

export const DANGER_COLORS = ['#5f7a3f', '#a8862a', '#b5672f', '#a13f2a', '#8a2020', '#5f1830'];
export const dangerColor = (d) => DANGER_COLORS[Math.min(Math.max(d, 1), 5)] || '#6b5335';
