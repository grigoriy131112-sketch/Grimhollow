// Small shared helpers for drawing the charts: a deterministic PRNG so the
// hand-inked wobble on a road is the same every render, and the danger palette.

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

export const DANGER_COLORS = ['#5f7a3f', '#a8862a', '#b5672f', '#a13f2a', '#8a2020', '#5f1830'];
export const dangerColor = (d) => DANGER_COLORS[Math.min(Math.max(d, 1), 5)] || '#6b5335';
