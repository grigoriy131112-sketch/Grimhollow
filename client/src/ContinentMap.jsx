import { useMemo, useState } from 'react';
import { CONTINENTS, WORLD, Vignette } from './worldMapArt.jsx';
import { wobbleLine, rngFrom, hash, dangerColor } from './mapInk.js';
import { landmarkIcon } from './icons.jsx';

// A continent's chart is its own drawing, cut from the world plate by
// tools/gen_continent_maps.mjs: only this continent's island(s), framed to the
// same 1000x640 sheet as the global map but zoomed to fill it. No other land is
// shown, so the continent reads clearly under its seals.
//
// The chart magnifies the continent, so a place drawn at its raw world x/y would
// bunch in the middle instead of following the land. The generator records the
// world->chart frame (scale, tx, ty) on the continent, and every marker is put
// through it here, so seals sit on the same land the coastline draws.
//
// The party may only set out for a place joined to where it stands by a road,
// so only the current place and its neighbours are openable; the rest of the
// continent is read-only until the party walks to them.

export default function ContinentMap({ map, continent, onBack, onOpenLocation, onTravel }) {
  const [selectedId, setSelectedId] = useState(null);

  const geo = CONTINENTS.find((c) => c.name === continent.name);
  const frame = geo?.frame;
  const fx = (x) => (frame ? frame.scale * x + frame.tx : x);
  const fy = (y) => (frame ? frame.scale * y + frame.ty : y);

  const locations = useMemo(
    () => map.locations.filter((l) => l.continentName === continent.name),
    [map, continent],
  );
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // Where the party stands, and every place it may leave for from there.
  const character = map.character || null;
  const hereId = character?.locationId ?? null;
  const reachable = useMemo(() => {
    const s = new Set();
    if (hereId == null) return s;
    s.add(hereId);
    const road = character?.travel;
    if (road) { s.add(road.from); s.add(road.to); }
    for (const c of map.connections) {
      if (c.from === hereId) s.add(c.to);
      if (c.to === hereId) s.add(c.from);
    }
    return s;
  }, [map, character, hereId]);
  // Without a hero to move there is nothing to gate: the chart is just an atlas.
  const canOpen = (id) => !character || reachable.has(id);

  const regions = useMemo(() => continent.regions.map((r) => {
    const own = locations.filter((l) => l.regionId === r.id);
    return {
      region: r,
      x: fx(own.reduce((s, l) => s + l.x, 0) / (own.length || 1)),
      y: fy(own.reduce((s, l) => s + l.y, 0) / (own.length || 1)),
    };
  }), [continent, locations, frame]);

  const roads = useMemo(() => map.connections.map((c) => {
    const a = byId.get(c.from); const b = byId.get(c.to);
    if (!a || !b) return null;
    const ax = fx(a.x), ay = fy(a.y), bx = fx(b.x), by = fy(b.y);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 - 14;
    const rng = rngFrom(hash(`road-${c.from}-${c.to}`));
    return { c, mx, my, d: wobbleLine([[ax, ay], [mx, my], [bx, by]], rng, 8) };
  }).filter(Boolean), [map, byId, frame]);

  const marker = useMemo(() => {
    if (!character) return null;
    const road = character.travel;
    const a = road && byId.get(road.from);
    const b = road && byId.get(road.to);
    if (a && b) {
      const ax = fx(a.x), ay = fy(a.y), bx = fx(b.x), by = fy(b.y);
      const t = Math.max(0, Math.min(1, road.progress));
      const u = 1 - t;
      const my = (ay + by) / 2 - 14;
      return { x: u * u * ax + 2 * u * t * ((ax + bx) / 2) + t * t * bx,
        y: u * u * ay + 2 * u * t * my + t * t * by, paused: road.paused };
    }
    const here = byId.get(hereId);
    return here ? { x: fx(here.x), y: fy(here.y), paused: false } : null;
  }, [character, byId, hereId, frame]);

  return (
    <div className="atlas">
      <div className="map-col">
        <div className="map-wrap">
          <svg className="world-map" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
            role="img" aria-label={`Карта: ${continent.name}`}>
            {geo.map && (
              <image className="wmap" href={geo.map} x={0} y={0} width={WORLD.w} height={WORLD.h} preserveAspectRatio="none" />
            )}

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
              const open = canOpen(l.id);
              const cx = fx(l.x), cy = fy(l.y);
              const icon = landmarkIcon(l);
              const dx = cx > 900 ? -18 : cx < 100 ? 18 : 0;
              const dy = cy < 60 ? 28 : cy > 590 ? -18 : 30;
              const anchor = cx > 900 ? 'end' : cx < 100 ? 'start' : 'middle';
              const color = l.isSafe ? '#6f8f4a' : dangerColor(l.danger);
              return (
                <g
                  key={l.id}
                  className={`map-node dark ${active ? 'active' : ''} ${open ? '' : 'locked'}`}
                  transform={`translate(${cx},${cy})`}
                  onClick={() => setSelectedId(l.id)}
                  onDoubleClick={() => { if (!open) return; if (l.id === hereId) onOpenLocation(l.id); else onTravel(l.id); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' && open) { if (l.id === hereId) onOpenLocation(l.id); else onTravel(l.id); } }}
                >
                  {active && <circle r={30} className="node-ring" />}
                  {l.id === hereId && <circle r={24} className="node-here" />}
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
                <text y={-20} className="party-here-label" textAnchor="middle">Вы здесь</text>
              </g>
            )}

            <Vignette x={0} y={0} w={WORLD.w} h={WORLD.h} />
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
        {character?.travel && (
          <div className="party-road card">
            <span className="muted small">Отряд в пути</span>
            <div className="actions">
              <button type="button" onClick={onBack}>← К глобальной карте</button>
            </div>
          </div>
        )}
        {character && !marker && (
          <p className="muted small">Отряд сейчас на другом континенте — здесь видна только карта этого края.</p>
        )}
        {!selected && (
          <p className="muted">
            Кликните по метке, чтобы увидеть место. Открыть можно только те места, что соединены дорогой с отрядом.
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
            {canOpen(selected.id) ? (
              <div className="actions">
                {selected.id === hereId ? (
                  <button type="button" onClick={() => onOpenLocation(selected.id)}>Открыть место</button>
                ) : (
                  <button type="button" onClick={() => onTravel(selected.id)}>Отправиться сюда</button>
                )}
              </div>
            ) : (
              <p className="muted small">Сюда нет дороги от отряда — сначала дойдите до соседнего места.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
