import { useMemo, useState } from 'react';
import { WORLD, makeLocalProjector, blobPath, wobbleLine, hatchLines, rngFrom, hash, dangerColor } from './mapProjection.js';
import { landmarkIcon } from './icons.jsx';

// The continent chart, in the same antique-engraving style as the atlas: one
// land's regions and every place inside them, drawn as an ink relief with a
// hatched fill and hand-inked roads on a parchment sheet. Ports keep a harbour
// mark so the crossing is visible from here too. Selecting a place opens a
// detail card with a road button.

const PARCH = '#f2e7cd';
const MARGIN = 40; // breathing room so the land relief is never cut off

export default function ContinentMap({ map, continent, onBack, onOpenLocation }) {
  const [selectedId, setSelectedId] = useState(null);

  const locations = useMemo(
    () => map.locations.filter((l) => l.continentName === continent.name),
    [map, continent],
  );
  const project = useMemo(
    () => makeLocalProjector(locations, WORLD.w, WORLD.h, 0.16, MARGIN),
    [locations],
  );

  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // One relief for the whole land, plus a name for each region. Regions here are
  // interleaved in space, so drawing a filled shape per region would overlap;
  // the outline is the land, the region names are the divisions.
  const land = useMemo(
    () => blobPath(locations.map((l) => project(l)), 90, continent.name),
    [locations, project, continent.name],
  );

  const regions = useMemo(() => continent.regions.map((r) => {
    const own = locations.filter((l) => l.regionId === r.id);
    const pts = own.map((l) => project(l));
    return {
      region: r,
      x: pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1),
      y: pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1),
    };
  }), [continent, locations, project]);

  const roads = useMemo(() => map.connections.map((c) => {
    const a = byId.get(c.from); const b = byId.get(c.to);
    if (!a || !b) return null;
    const pa = project(a); const pb = project(b);
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2 - 24;
    const rng = rngFrom(hash(`road-${c.from}-${c.to}`));
    return { c, mx, my, d: wobbleLine([[pa.x, pa.y], [mx, my], [pb.x, pb.y]], rng, 12) };
  }).filter(Boolean), [map, byId, project]);

  const marker = useMemo(() => {
    const ch = map.character;
    if (!ch) return null;
    const road = ch.travel;
    const a = road && byId.get(road.from);
    const b = road && byId.get(road.to);
    if (a && b) {
      const pa = project(a); const pb = project(b);
      const t = Math.max(0, Math.min(1, road.progress));
      const u = 1 - t;
      return { x: u * u * pa.x + 2 * u * t * ((pa.x + pb.x) / 2) + t * t * pb.x,
        y: u * u * pa.y + 2 * u * t * ((pa.y + pb.y) / 2 - 24) + t * t * pb.y, paused: road.paused };
    }
    const here = byId.get(ch.locationId);
    return here ? { x: project(here).x, y: project(here).y, paused: false } : null;
  }, [map, byId, project]);

  return (
    <div className="atlas">
      <div className="map-col">
        <div className="map-wrap">
          <svg className="world-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} role="img" aria-label={`Карта: ${continent.name}`}>
            <defs>
              <pattern id="cmap-parch" width={WORLD.w} height={WORLD.h} patternUnits="userSpaceOnUse">
                <image href="/art/textures/parchment.jpg" x={0} y={0} width={WORLD.w} height={WORLD.h}
                  preserveAspectRatio="xMidYMid slice" />
              </pattern>
              <radialGradient id="cmap-vignette" cx="50%" cy="46%" r="72%">
                <stop offset="55%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#3a2f1c" stopOpacity="0.5" />
              </radialGradient>
              <clipPath id="cmap-land-clip"><path d={land} /></clipPath>
            </defs>

            <rect width={WORLD.w} height={WORLD.h} fill="url(#cmap-parch)" />
            <rect width={WORLD.w} height={WORLD.h} fill="url(#cmap-vignette)" />
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={`h${f}`} x1={0} y1={WORLD.h * f} x2={WORLD.w} y2={WORLD.h * f} className="gmap-grid" />
            ))}
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={`v${f}`} x1={WORLD.w * f} y1={0} x2={WORLD.w * f} y2={WORLD.h} className="gmap-grid" />
            ))}

            {/* the land: hatched ink relief, then the names of its regions */}
            <path d={land} className="cmap-region-shape" />
            <g clipPath="url(#cmap-land-clip)" className="cmap-land-hatch">
              {hatchLines(0, 0, WORLD.w, WORLD.h, 10).map(([x0, y0, x1, y1], i) => (
                <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />
              ))}
            </g>
            <path d={land} className="cmap-region-edge" />
            {regions.map(({ region, x, y }) => (
              <text key={region.id} x={x} y={y - 78} className="cmap-region-name" textAnchor="middle">{region.name}</text>
            ))}

            {/* roads */}
            {roads.map(({ c, d, mx, my }) => {
              const hot = selectedId === c.from || selectedId === c.to;
              return (
                <g key={`r${c.from}-${c.to}`}>
                  <path d={d} fill="none" stroke={PARCH} strokeWidth={hot ? 4.5 : 3.4} opacity={0.85} strokeLinecap="round" />
                  <path className={`road ${hot ? 'hot' : ''}`} d={d} fill="none" />
                  {c.minutes != null && <text x={mx} y={my - 4} className="road-time">{c.minutes} мин</text>}
                </g>
              );
            })}

            {/* places */}
            {locations.map((l) => {
              const p = project(l);
              const active = selectedId === l.id;
              const icon = landmarkIcon(l);
              const dx = p.x > 860 ? -20 : p.x < 90 ? 20 : 0;
              const dy = p.y < 60 ? 30 : p.y > 580 ? -20 : 32;
              const anchor = p.x > 860 ? 'end' : p.x < 90 ? 'start' : 'middle';
              const color = l.isSafe ? '#5f7a3f' : dangerColor(l.danger);
              return (
                <g
                  key={l.id}
                  className={`map-node ${active ? 'active' : ''}`}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => setSelectedId(l.id)}
                  onDoubleClick={() => onOpenLocation(l.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpenLocation(l.id); }}
                >
                  {active && <circle r={29} className="node-ring" />}
                  <circle r={17} className="seal" />
                  {icon && (
                    <image href={icon} x={-12} y={-12} width={24} height={24} className="landmark"
                      style={{ filter: 'invert(0.78) sepia(0.5) saturate(1.6) hue-rotate(330deg) brightness(0.9)' }} />
                  )}
                  <circle cx={13} cy={-13} r={l.isSafe ? 4 : 2.5 + l.danger} fill={color} stroke={PARCH} strokeWidth={1.2} />
                  {l.isPort && <path d="M0,-25 L5,-17 L-5,-17 Z" className="cmap-port-mark" />}
                  <text x={dx} y={dy} className="node-label" textAnchor={anchor}>{l.name}</text>
                </g>
              );
            })}

            {marker && (
              <g className="party-marker" transform={`translate(${marker.x},${marker.y})`}>
                <circle r={12} className={`party-pulse ${marker.paused ? 'paused' : ''}`} />
                <path d="M-6,-6 L6,6 M6,-6 L-6,6" className="party-x" />
              </g>
            )}
          </svg>
        </div>

        <div className="map-legend">
          <div className="legend-title">Легенда</div>
          <div className="legend-row"><span className="dot party" /> Отряд</div>
          <div className="legend-row"><span className="dot" style={{ background: '#5f7a3f' }} /> Безопасно</div>
          {[1, 2, 3, 4, 5].map((d) => (
            <div className="legend-row" key={d}>
              <span className="dot" style={{ background: dangerColor(d), width: 6 + d, height: 6 + d }} />
              {'★'.repeat(d)}
            </div>
          ))}
          <div className="legend-sep" />
          <div className="legend-row legend-credit">
            {continent.name} · пергамент «Pergament.1», CC0.
            Путь указывается в минутах.
          </div>
        </div>
      </div>

      <div className="map-detail card">
        {marker && (
          <div className="party-road card">
            <span className="muted small">Отряд в пути</span>
            <div className="actions">
              <button type="button" onClick={onBack}>← К глобальной карте</button>
            </div>
          </div>
        )}
        {!selected && (
          <p className="muted">
            Кликните по метке, чтобы увидеть место. Двойной клик — открыть его.
          </p>
        )}
        {selected && (
          <>
            <div className="page-head" style={{ margin: 0 }}>
              <h2 style={{ margin: 0 }}>{selected.name}</h2>
              {selected.isSafe && <span className="badge safe">Безопасно</span>}
            </div>
            <p className="muted small">{selected.continentName} · {selected.regionName}</p>
            <p>{selected.description}</p>
            <div className="map-detail-meta">
              <span className="danger-tag">Опасность {'★'.repeat(Math.min(selected.danger, 5))}</span>
              <span className="muted small">{selected.monsterCount} вид(ов) существ</span>
            </div>
            <div className="actions">
              <button type="button" onClick={() => onOpenLocation(selected.id)}>Открыть место</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
