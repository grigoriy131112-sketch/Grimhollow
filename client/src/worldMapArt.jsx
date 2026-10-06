// The dark chart of Grimhollow, drawn from the shared geometry in
// world-geo.json. Both the global map and the continent map render this same
// picture — the global one shows the whole world, a continent map just points
// its viewBox at one continent's rectangle. So the continents are literally
// part of one drawing, not images pasted onto it, and there is exactly one
// style: near-black sea, ash-dark land, bone coastlines and dull gold letters.
//
// The coastlines are ours (tools/gen_world_geo.mjs); nothing here is licensed
// art. The land sits under everything else, which is only roads, seals and
// labels.

import geo from './world-geo.json';

export const WORLD = geo.world;
export const CONTINENTS = geo.continents;
export const SEAS = geo.seas;

export function ringPath(ring) {
  let d = `M${ring[0][0]},${ring[0][1]}`;
  for (let i = 1; i < ring.length; i += 1) d += ` L${ring[i][0]},${ring[i][1]}`;
  return `${d} Z`;
}

// Parallel diagonal rules across the whole sheet. They read as the engraver's
// sea hatching; the land is filled opaquely on top, so the rules only show on
// the water.
function seaHatch(gap = 14) {
  const lines = [];
  const span = WORLD.w + WORLD.h;
  for (let o = -WORLD.h; o < span; o += gap) {
    lines.push([o, 0, o + WORLD.h, WORLD.h]);
  }
  return lines;
}

// The chart itself, in world coordinates. `only` limits the land to one
// continent (a continent map does not need its neighbours). `seaLabels` adds
// the names of the waters, which belong on the global sheet.
export function WorldArt({ only = null, seaLabels = false }) {
  const continents = only ? CONTINENTS.filter((c) => c.name === only) : CONTINENTS;
  const clipId = (name) => `wmap-clip-${CONTINENTS.findIndex((c) => c.name === name)}`;
  return (
    <g className="wmap">
      <defs>
        <radialGradient id="wmap-sea-grad" cx="50%" cy="46%" r="78%">
          <stop offset="0%" stopColor="#0b0b12" />
          <stop offset="100%" stopColor="#050509" />
        </radialGradient>
        <radialGradient id="wmap-land-grad" cx="46%" cy="42%" r="80%">
          <stop offset="0%" stopColor="#171310" />
          <stop offset="100%" stopColor="#0d0b09" />
        </radialGradient>
        {continents.map((c) => (
          <clipPath key={c.name} id={clipId(c.name)}>
            {c.rings.map((r, i) => <path key={i} d={ringPath(r)} />)}
          </clipPath>
        ))}
      </defs>

      <rect x={0} y={0} width={WORLD.w} height={WORLD.h} fill="url(#wmap-sea-grad)" />
      <g className="wmap-sea-hatch">
        {seaHatch().map(([x0, y0, x1, y1], i) => <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />)}
      </g>

      {continents.map((c) => (
        <g key={c.name} className="wmap-landmass">
          <path d={c.rings.map(ringPath).join(' ')} fill="url(#wmap-land-grad)" />
          <g clipPath={`url(#${clipId(c.name)})`} className="wmap-land-hatch">
            {seaHatch(9).map(([x0, y0, x1, y1], i) => <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />)}
          </g>
          {c.rings.map((r, i) => <path key={i} d={ringPath(r)} className="wmap-coast" />)}
        </g>
      ))}

      {seaLabels && SEAS.map((s) => (
        <text key={s.name} x={s.x} y={s.y} className="wmap-sea-name" textAnchor="middle"
          style={{ fontSize: s.size }}>{s.name}</text>
      ))}
    </g>
  );
}

// A soft, heavy vignette that sinks the edges of the sheet into black. Drawn by
// each map after the chart so the frame always reads as one plate. `x`/`y` are
// the top-left of the region being viewed, so a continent map (whose viewBox is
// offset) darkens its own edges rather than the world origin.
export function Vignette({ x = 0, y = 0, w = WORLD.w, h = WORLD.h }) {
  return (
    <g className="wmap-vignette">
      <defs>
        <radialGradient id="wmap-vig" cx="50%" cy="48%" r="72%">
          <stop offset="52%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill="url(#wmap-vig)" />
    </g>
  );
}
