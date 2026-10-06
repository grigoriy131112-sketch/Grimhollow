import { useMemo } from 'react';
import { WORLD, SEAS, makeProjector, blobPath, hatchLines } from './mapProjection.js';

// The global chart, drawn in the same antique-engraving style as the atlas:
// a parchment sheet, ink-drawn landmasses with an engraver's hatch, the names
// of the continents and the seas between them. Only the ports are marked — the
// places inside a land live on its own continent chart. Clicking a land opens
// it.

export default function GlobalMap({ map, onOpen }) {
  const { project, anchors } = useMemo(() => makeProjector(map), [map]);

  const lands = useMemo(() => map.continents.map((c) => {
    const pts = map.locations
      .filter((l) => l.continentName === c.name)
      .map((l) => project(l))
      .filter((p) => p.x != null);
    const [rx, ry, rw, rh] = anchors.get(c.name).rect;
    const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
    return {
      continent: c,
      d: blobPath(pts, Math.max(26, rh * 0.22), c.name),
      hatch: hatchLines(rx - 30, ry - 30, rx + rw + 30, ry + rh + 30, 9),
      clipId: `gmap-clip-${c.id}`,
      label: { x: cx, y: cy },
    };
  }), [map, project, anchors]);

  const ports = useMemo(() => map.locations.filter((l) => l.isPort), [map]);

  return (
    <div className="global-map-wrap">
      <svg className="global-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} role="img" aria-label="Карта мира Гримхоллоу">
        <defs>
          {/* the same parchment the atlas lies on (CC0, see CREDITS.txt) */}
          <pattern id="gmap-parch" width={WORLD.w} height={WORLD.h} patternUnits="userSpaceOnUse">
            <image href="/art/textures/parchment.jpg" x={0} y={0} width={WORLD.w} height={WORLD.h}
              preserveAspectRatio="xMidYMid slice" />
          </pattern>
          <radialGradient id="gmap-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2f1c" stopOpacity="0.5" />
          </radialGradient>
          {lands.map(({ clipId, d }) => (
            <clipPath key={clipId} id={clipId}><path d={d} /></clipPath>
          ))}
        </defs>

        <rect width={WORLD.w} height={WORLD.h} fill="url(#gmap-parch)" />
        <rect width={WORLD.w} height={WORLD.h} fill="url(#gmap-vignette)" />

        {/* graticule, lightly ruled in ink */}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={`h${f}`} x1={0} y1={WORLD.h * f} x2={WORLD.w} y2={WORLD.h * f} className="gmap-grid" />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={`v${f}`} x1={WORLD.w * f} y1={0} x2={WORLD.w * f} y2={WORLD.h} className="gmap-grid" />
        ))}

        {/* seas: italic ink names on the open water */}
        {SEAS.map((s) => (
          <text key={s.name} x={s.x} y={s.y} className="gmap-sea-label" fontSize={s.size} letterSpacing={3} textAnchor="middle">
            {s.name}
          </text>
        ))}

        {/* landmasses: ink outline, hatched fill, name and its own tallies */}
        {lands.map(({ continent, d, hatch, clipId, label }) => (
          <g
            key={continent.id}
            className="gmap-land"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(continent.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(continent.name); }}
          >
            <path d={d} className="gmap-land-shape" />
            <g clipPath={`url(#${clipId})`} className="gmap-land-hatch">
              {hatch.map(([x0, y0, x1, y1], i) => <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />)}
            </g>
            <path d={d} className="gmap-land-edge" />
            <text x={label.x} y={label.y - 8} className="gmap-land-name" textAnchor="middle">{continent.name}</text>
            <text x={label.x} y={label.y + 12} className="gmap-land-sub" textAnchor="middle">
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

        {/* compass rose */}
        <g className="gmap-compass" transform={`translate(${WORLD.w - 74},${74})`}>
          <circle r={30} className="gmap-compass-ring" />
          <circle r={22} className="gmap-compass-ring thin" />
          <path d="M0,-22 L5,0 L0,22 L-5,0 Z" className="gmap-compass-needle" />
          <text y={-36} textAnchor="middle" className="gmap-compass-n">С</text>
        </g>

        {/* cartouche: the chart's title, inked on a paper panel */}
        <g className="gmap-cartouche" transform={`translate(${WORLD.w / 2},${WORLD.h - 38})`}>
          <rect x={-190} y={-26} width={380} height={50} rx={6} className="cartouche-frame" />
          <rect x={-184} y={-20} width={368} height={38} rx={4} className="cartouche-inner" />
          <text y={6} className="cartouche-title" style={{ fontSize: 18, letterSpacing: 6 }}>ГРИМХОЛЛОУ</text>
        </g>
      </svg>

      <div className="map-legend">
        <div className="legend-row"><span className="dot land" /> земля</div>
        <div className="legend-row"><span className="dot port" /> порт</div>
        <div className="legend-sep" />
        <div className="legend-row legend-credit">
          Пергамент: «Pergament.1», CC0 · контуры и подписи — наши.
          Клик по земле открывает её карту.
        </div>
      </div>
    </div>
  );
}
