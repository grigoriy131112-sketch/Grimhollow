import { useMemo, useState } from 'react';
import { CONTINENTS, WorldArt, Vignette } from './worldMapArt.jsx';
import { wobbleLine, rngFrom, hash, dangerColor } from './mapInk.js';
import { landmarkIcon } from './icons.jsx';

// A continent's chart is the global chart zoomed onto that continent's
// rectangle — the same drawing, the same coast, the same dark style, so a
// continent is literally a part of the world map rather than a separate image.
// On top of the shared land we ink this continent's regions, roads, seals and
// the party. Selecting a place opens a detail card.

export default function ContinentMap({ map, continent, onBack, onOpenLocation }) {
  const [selectedId, setSelectedId] = useState(null);

  const geo = CONTINENTS.find((c) => c.name === continent.name);
  const [vx, vy, vw, vh] = geo.rect;

  const locations = useMemo(
    () => map.locations.filter((l) => l.continentName === continent.name),
    [map, continent],
  );
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  const regions = useMemo(() => continent.regions.map((r) => {
    const own = locations.filter((l) => l.regionId === r.id);
    return {
      region: r,
      x: own.reduce((s, l) => s + l.x, 0) / (own.length || 1),
      y: own.reduce((s, l) => s + l.y, 0) / (own.length || 1),
    };
  }), [continent, locations]);

  const roads = useMemo(() => map.connections.map((c) => {
    const a = byId.get(c.from); const b = byId.get(c.to);
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 14;
    const rng = rngFrom(hash(`road-${c.from}-${c.to}`));
    return { c, mx, my, d: wobbleLine([[a.x, a.y], [mx, my], [b.x, b.y]], rng, 8) };
  }).filter(Boolean), [map, byId]);

  const marker = useMemo(() => {
    const ch = map.character;
    if (!ch) return null;
    const road = ch.travel;
    const a = road && byId.get(road.from);
    const b = road && byId.get(road.to);
    if (a && b) {
      const t = Math.max(0, Math.min(1, road.progress));
      const u = 1 - t;
      const my = (a.y + b.y) / 2 - 14;
      return { x: u * u * a.x + 2 * u * t * ((a.x + b.x) / 2) + t * t * b.x,
        y: u * u * a.y + 2 * u * t * my + t * t * b.y, paused: road.paused };
    }
    const here = byId.get(ch.locationId);
    return here ? { x: here.x, y: here.y, paused: false } : null;
  }, [map, byId]);

  return (
    <div className="atlas">
      <div className="map-col">
        <div className="map-wrap">
          <svg className="world-map" viewBox={`${vx} ${vy} ${vw} ${vh}`}
            role="img" aria-label={`Карта: ${continent.name}`}>
            <WorldArt only={continent.name} />

            {/* region names, inked onto the land */}
            {regions.map(({ region, x, y }) => (
              <text key={region.id} x={x} y={y - 34} className="cmap-region-name" textAnchor="middle">{region.name}</text>
            ))}

            {/* roads: pale underlay then dark ink */}
            {roads.map(({ c, d, mx, my }) => {
              const hot = selectedId === c.from || selectedId === c.to;
              return (
                <g key={`r${c.from}-${c.to}`}>
                  <path d={d} fill="none" stroke="#0a0a0d" strokeWidth={hot ? 5 : 4} opacity={0.7} strokeLinecap="round" />
                  <path className={`road ${hot ? 'hot' : ''}`} d={d} fill="none" />
                  {c.minutes != null && <text x={mx} y={my - 5} className="road-time">{c.minutes} мин</text>}
                </g>
              );
            })}

            {/* places */}
            {locations.map((l) => {
              const active = selectedId === l.id;
              const icon = landmarkIcon(l);
              const dx = l.x > 900 ? -18 : l.x < 100 ? 18 : 0;
              const dy = l.y < 60 ? 28 : l.y > 590 ? -18 : 30;
              const anchor = l.x > 900 ? 'end' : l.x < 100 ? 'start' : 'middle';
              const color = l.isSafe ? '#6f8f4a' : dangerColor(l.danger);
              return (
                <g
                  key={l.id}
                  className={`map-node dark ${active ? 'active' : ''}`}
                  transform={`translate(${l.x},${l.y})`}
                  onClick={() => setSelectedId(l.id)}
                  onDoubleClick={() => onOpenLocation(l.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpenLocation(l.id); }}
                >
                  {active && <circle r={30} className="node-ring" />}
                  <circle r={17} className="seal" />
                  {icon && (
                    <image href={icon} x={-12} y={-12} width={24} height={24} className="landmark"
                      style={{ filter: 'invert(0.82) sepia(0.35) saturate(0.9) hue-rotate(350deg) brightness(0.95)' }} />
                  )}
                  <circle cx={13} cy={-13} r={l.isSafe ? 4 : 2.5 + l.danger} fill={color} stroke="#0a0a0d" strokeWidth={1.4} />
                  {l.isPort && <path d="M0,-26 L5,-18 L-5,-18 Z" className="cmap-port-mark" />}
                  <text x={dx} y={dy} className="node-label dark" textAnchor={anchor}>{l.name}</text>
                </g>
              );
            })}

            {marker && (
              <g className="party-marker" transform={`translate(${marker.x},${marker.y})`}>
                <circle r={12} className={`party-pulse ${marker.paused ? 'paused' : ''}`} />
                <path d="M-6,-6 L6,6 M6,-6 L-6,6" className="party-x" />
              </g>
            )}

            <Vignette x={vx} y={vy} w={vw} h={vh} />
          </svg>
        </div>

        <div className="map-legend">
          <div className="legend-title">Легенда</div>
          <div className="legend-row"><span className="dot party" /> Отряд</div>
          <div className="legend-row"><span className="dot" style={{ background: '#6f8f4a' }} /> Безопасно</div>
          {[1, 2, 3, 4, 5].map((d) => (
            <div className="legend-row" key={d}>
              <span className="dot" style={{ background: dangerColor(d), width: 6 + d, height: 6 + d }} />
              {'★'.repeat(d)}
            </div>
          ))}
          <div className="legend-sep" />
          <div className="legend-row legend-credit">
            {continent.name} — часть единой карты Гримхоула. Путь указывается в минутах.
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
