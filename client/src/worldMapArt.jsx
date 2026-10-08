// The dark chart of Grimhollow.
//
// The whole world is ONE generated fantasy plate: a fictional world made with
// Azgaar's Fantasy Map Generator (see client/public/art/CREDITS.txt), reduced to
// its coastlines and recoloured to the near-black house style by
// tools/gen_world_map.mjs. The global map and a continent map show the same
// drawing — a continent map only points its viewBox at that continent's
// rectangle. So the continents are literally part of one picture, in one style,
// rather than images pasted onto it.
//
// The land/sea mask the server tests against is generated from the very same
// file, so a marker can never drift out to sea without the picture moving too.

import geo from './world-geo.json';

export const WORLD = geo.world;
export const CONTINENTS = geo.continents;
export const SEAS = geo.seas;

// The plate, served from client/public.
export const MAP_IMAGE = '/art/maps/world-chart.svg';

// The chart itself, in world coordinates. `seaLabels` adds the names of the
// waters, which belong on the global sheet; a continent map shows only its own
// window and leaves them off.
export function WorldChart({ seaLabels = false }) {
  return (
    <g className="wmap">
      <image
        href={MAP_IMAGE}
        x={0} y={0} width={WORLD.w} height={WORLD.h}
        preserveAspectRatio="none"
      />
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
