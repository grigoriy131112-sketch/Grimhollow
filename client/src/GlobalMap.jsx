import { useMemo } from 'react';
import { WORLD, CONTINENTS, WorldArt, Vignette, ringPath } from './worldMapArt.jsx';
import { dangerColor } from './mapInk.js';

// The global chart: the whole world as one drawing. The continents are not
// pasted images — they are the same coastlines the continent maps zoom into
// (world-geo.json), drawn here in the dark style. We lay the land, then only
// the names, the ports and the click targets on top.

export default function GlobalMap({ map, onOpen }) {
  const ports = useMemo(() => map.locations.filter((l) => l.isPort), [map]);

  const byName = useMemo(() => {
    const m = new Map();
    for (const l of map.locations) {
      const list = m.get(l.continentName) || [];
      list.push(l);
      m.set(l.continentName, list);
    }
    return m;
  }, [map]);

  return (
    <div className="global-map-wrap">
      <svg className="world-map global-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} role="img" aria-label="Карта мира Гримхоллоу">
        <WorldArt seaLabels />

        {/* continent names, and the click target is the land itself */}
        {CONTINENTS.map((c) => (
          <g key={c.name} className="wmap-continent"
            role="button" tabIndex={0}
            onClick={() => onOpen(c.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c.name); }}>
            {c.rings.map((r, i) => (
              <path key={i} d={ringPath(r)} className="wmap-hit" fill="transparent" />
            ))}
            <text x={c.label[0]} y={c.label[1]} className="wmap-continent-name" textAnchor="middle">{c.name}</text>
            <text x={c.label[0]} y={c.label[1] + 15} className="wmap-continent-sub" textAnchor="middle">
              {(byName.get(c.name) || []).length} мест
            </text>
          </g>
        ))}

        {/* ports: the gates out to another shore */}
        {ports.map((p) => (
          <g key={p.id} className="wmap-port" transform={`translate(${p.x},${p.y})`}>
            <circle r={9} className="wmap-port-halo" />
            <circle r={3.6} className="wmap-port-mark" />
            <text x={10} y={4} className="wmap-port-name">{p.name}</text>
          </g>
        ))}

        <Vignette />
      </svg>

      <div className="map-legend">
        <div className="legend-title">Легенда</div>
        <div className="legend-row"><span className="dot" style={{ background: '#8a2020' }} /> порт-переправа</div>
        <div className="legend-sep" />
        <div className="legend-row legend-credit">
          Берега Гримхоула начерчены нами; клик по континенту открывает его карту.
        </div>
      </div>
    </div>
  );
}

export { dangerColor };
