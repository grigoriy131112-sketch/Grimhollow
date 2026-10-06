import { useMemo } from 'react';
import { WORLD, makeProjector } from './mapProjection.js';
import { continentArt } from './continentArt.js';

// The global chart: one framed panel per continent, each showing that
// continent's own public-domain antique engraving (see continentArt.js and
// public/art/CREDITS.txt). We draw no terrain of our own — the plates are the
// maps. Clicking a panel opens that continent's chart.

export default function GlobalMap({ map, onOpen }) {
  const { anchors } = useMemo(() => makeProjector(map), [map]);

  const panels = useMemo(() => map.continents.map((c) => {
    const [x, y, w, h] = anchors.get(c.name).rect;
    const art = continentArt(c.name);
    return { continent: c, x, y, w, h, art, clipId: `gmap-panel-${c.id}` };
  }), [map, anchors]);

  return (
    <div className="global-map-wrap">
      <svg className="global-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} role="img" aria-label="Карта мира Гримхоллоу">
        <defs>
          {/* the chart's paper (CC0, see CREDITS.txt) */}
          <pattern id="gmap-parch" width={WORLD.w} height={WORLD.h} patternUnits="userSpaceOnUse">
            <image href="/art/textures/parchment.jpg" x={0} y={0} width={WORLD.w} height={WORLD.h}
              preserveAspectRatio="xMidYMid slice" />
          </pattern>
          <radialGradient id="gmap-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2f1c" stopOpacity="0.5" />
          </radialGradient>
          {panels.map(({ clipId, x, y, w, h }) => (
            <clipPath key={clipId} id={clipId}>
              <rect x={x} y={y} width={w} height={h} rx={6} />
            </clipPath>
          ))}
        </defs>

        <rect width={WORLD.w} height={WORLD.h} fill="url(#gmap-parch)" />
        <rect width={WORLD.w} height={WORLD.h} fill="url(#gmap-vignette)" />

        {/* continent plates: the engraving itself, framed and named */}
        {panels.map(({ continent, x, y, w, h, art, clipId }) => (
          <g
            key={continent.id}
            className="gmap-panel"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(continent.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(continent.name); }}
          >
            <image href={art.src} x={x} y={y} width={w} height={h}
              preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} className="gmap-panel-art" />
            <rect x={x} y={y} width={w} height={h} rx={6} className="gmap-panel-frame" />
            <rect x={x + 3} y={y + h - 31} width={w - 6} height={27} rx={4} className="gmap-panel-plate" />
            <text x={x + w / 2} y={y + h - 17} className="gmap-panel-name" textAnchor="middle">{continent.name}</text>
            <text x={x + w / 2} y={y + h - 6} className="gmap-panel-sub" textAnchor="middle">
              {continent.stats.locations} мест · {continent.stats.regions} обл.
            </text>
          </g>
        ))}

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
        <div className="legend-row"><span className="dot land" /> континент</div>
        <div className="legend-sep" />
        <div className="legend-row legend-credit">
          Пять гравюр, общественное достояние (см. CREDITS.txt); подписи — наши.
          Клик по континенту открывает его карту.
        </div>
      </div>
    </div>
  );
}
