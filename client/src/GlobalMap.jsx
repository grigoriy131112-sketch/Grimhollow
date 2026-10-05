import { useMemo } from 'react';
import { WORLD, SEAS, makeProjector, blobPath } from './mapProjection.js';

// The global chart: the five lands as procedural landmasses on one dark sea,
// each named, with the names of the seas between them. Only the ports are
// marked — the places inside a land live on its own continent chart. Clicking a
// land opens it.

const SEA_FILL = '#0a0c11';

export default function GlobalMap({ map, onOpen }) {
  const { project, anchors } = useMemo(() => makeProjector(map), [map]);

  const lands = useMemo(() => map.continents.map((c) => {
    const pts = map.locations
      .filter((l) => l.continentName === c.name)
      .map((l) => project(l));
    const [, , , rh] = anchors.get(c.name).rect;
    const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
    return {
      continent: c,
      d: blobPath(pts, Math.max(26, rh * 0.22), c.name),
      label: { x: cx, y: cy },
    };
  }), [map, project, anchors]);

  const ports = useMemo(() => map.locations.filter((l) => l.isPort), [map]);

  return (
    <div className="global-map-wrap">
      <svg className="global-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} role="img" aria-label="Карта мира Гримхоллоу">
        <defs>
          <radialGradient id="gmap-sea" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#12161d" />
            <stop offset="100%" stopColor={SEA_FILL} />
          </radialGradient>
          <filter id="gmap-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope="0.05" /></feComponentTransfer>
          </filter>
        </defs>

        <rect width={WORLD.w} height={WORLD.h} fill="url(#gmap-sea)" />
        <rect width={WORLD.w} height={WORLD.h} filter="url(#gmap-grain)" opacity="0.5" />

        {/* graticule */}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={`h${f}`} x1={0} y1={WORLD.h * f} x2={WORLD.w} y2={WORLD.h * f} className="gmap-grid" />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={`v${f}`} x1={WORLD.w * f} y1={0} x2={WORLD.w * f} y2={WORLD.h} className="gmap-grid" />
        ))}

        {/* seas */}
        <path id="gmap-sea-arc" d="M380,120 Q505,74 630,120" fill="none" />
        {SEAS.map((s) => (
          <text key={s.name} className="gmap-sea-label" fontSize={s.size} letterSpacing={s.arc ? 6 : 3} textAnchor="middle">
            {s.arc
              ? <textPath href="#gmap-sea-arc" startOffset="50%" x={s.x} y={s.y}>{s.name}</textPath>
              : <tspan x={s.x} y={s.y}>{s.name}</tspan>}
          </text>
        ))}

        {/* landmasses */}
        {lands.map(({ continent, d, label }) => (
          <g
            key={continent.id}
            className="gmap-land"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(continent.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(continent.name); }}
          >
            <path d={d} className="gmap-land-shape" />
            <path d={d} className="gmap-land-edge" />
            <text x={label.x} y={label.y - 10} className="gmap-land-name" textAnchor="middle">{continent.name}</text>
            <text x={label.x} y={label.y + 8} className="gmap-land-sub" textAnchor="middle">
              {continent.stats.locations} мест · {continent.stats.regions} обл.
            </text>
          </g>
        ))}

        {/* ports: the only marks on the global chart */}
        {ports.map((p) => {
          const { x, y } = project(p);
          if (x == null) return null;
          return (
            <g
              key={p.id}
              className="gmap-port"
              transform={`translate(${x},${y})`}
              onClick={() => onOpen(p.continentName)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.continentName); }}
            >
              <circle r={13} className="gmap-port-halo" />
              <path d="M0,-7 L6,5 L-6,5 Z" className="gmap-port-mark" />
              <text x={0} y={26} className="gmap-port-name" textAnchor="middle">{p.name}</text>
            </g>
          );
        })}

        {/* compass */}
        <g className="gmap-compass" transform={`translate(${WORLD.w - 70},${70})`}>
          <circle r={26} className="gmap-compass-ring" />
          <path d="M0,-20 L5,0 L0,20 L-5,0 Z" className="gmap-compass-needle" />
          <text y={-30} textAnchor="middle" className="gmap-compass-n">С</text>
        </g>
      </svg>

      <div className="gmap-legend">
        <span className="gmap-legend-item"><span className="gmap-dot land" /> земля</span>
        <span className="gmap-legend-item"><span className="gmap-dot port" /> порт</span>
        <span className="muted small">Клик по земле открывает её карту.</span>
      </div>
    </div>
  );
}
