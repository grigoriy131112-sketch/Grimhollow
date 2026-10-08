import { useMemo } from 'react';
import { WORLD, CONTINENTS, WorldChart, Vignette } from './worldMapArt.jsx';
import { dangerColor, wobbleLine, rngFrom, hash } from './mapInk.js';

// The global chart: the whole world as one drawing. The continents are not
// pasted images — they are the same coastlines the continent maps zoom into
// (world-geo.json), drawn here in the dark style. We lay the land, then only
// the names, the sea lanes, the ports and the click targets on top.

export default function GlobalMap({ map, onOpen }) {
  const ports = useMemo(() => map.locations.filter((l) => l.isPort), [map]);

  // The sea lanes between the ports. The server sends the sailing line itself —
  // a path bent around the land — so the map draws the water route rather than a
  // straight line over the coast, and the crossing screen reads the same route.
  const lanes = useMemo(() => (map.voyages || []).map((v) => {
    const pts = v.path && v.path.length >= 2
      ? v.path
      : [[v.fromX, v.fromY], [v.toX, v.toY]];
    const mid = pts[Math.floor(pts.length / 2)];
    const rng = rngFrom(hash(`sea-${v.key}`));
    return { ...v, midX: mid[0], midY: mid[1], d: wobbleLine(pts, rng, 5) };
  }), [map]);

  // A port label is drawn to the side with room: if another port sits close on
  // the right, flip the label left so it never covers that port's seal.
  const labeled = useMemo(() => ports.map((p) => {
    const right = ports.some((q) => q !== p && q.x > p.x && q.x - p.x < 130 && Math.abs(q.y - p.y) < 40);
    return { ...p, anchor: right ? 'end' : 'start', lx: right ? -10 : 10 };
  }), [ports]);

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
        <WorldChart seaLabels />

        {/* sea lanes: the voyages between ports, drawn over the water with
            their length in days */}
        {lanes.map((l) => (
          <g key={`sea-${l.key}`}>
            <path d={l.d} fill="none" stroke="#0a0a0d" strokeWidth={4} opacity={0.6} strokeLinecap="round" />
            <path className="sea-lane" d={l.d} fill="none" />
            <text x={l.midX} y={l.midY - 6} className="sea-lane-time" textAnchor="middle">{l.days} дн</text>
          </g>
        ))}

        {/* continent names, and the click target is the land itself */}
        {CONTINENTS.map((c) => (
          <g key={c.name} className="wmap-continent"
            role="button" tabIndex={0}
            onClick={() => onOpen(c.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c.name); }}>
            <path d={c.hits} className="wmap-hit" fill="transparent" />
            <text x={c.cx} y={c.cy} className="wmap-continent-name" textAnchor="middle">{c.name}</text>
            <text x={c.cx} y={c.cy + 15} className="wmap-continent-sub" textAnchor="middle">
              {(byName.get(c.name) || []).length} мест
            </text>
          </g>
        ))}

        {/* ports: the gates out to another shore; clicking one opens its continent */}
        {labeled.map((p) => (
          <g key={p.id} className="wmap-port" transform={`translate(${p.x},${p.y})`}
            role="button" tabIndex={0}
            onClick={() => onOpen(p.continentName)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.continentName); }}>
            <circle r={13} className="wmap-port-hit" />
            <circle r={9} className="wmap-port-halo" />
            <circle r={3.6} className="wmap-port-mark" />
            <text x={p.lx} y={4} textAnchor={p.anchor} className="wmap-port-name">{p.name}</text>
          </g>
        ))}

        <Vignette />
      </svg>

      <div className="map-legend">
        <div className="legend-title">Легенда</div>
        <div className="legend-row"><span className="dot" style={{ background: '#8a2020' }} /> порт-переправа</div>
        <div className="legend-row"><span className="sea-lane-swatch" /> морской путь (в днях)</div>
        <div className="legend-sep" />
        <div className="legend-row legend-credit">
          Старинная гравюра Гримхоула; клик по континенту открывает его карту.
        </div>
      </div>
    </div>
  );
}

export { dangerColor };
