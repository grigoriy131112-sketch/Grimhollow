import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { landmarkIcon } from './icons.jsx';
import { WorldChart, Vignette, WORLD } from './worldMapArt.jsx';
import { wobbleLine, rngFrom, hash, dangerColor } from './mapInk.js';

// The interactive atlas: the same dark world chart the other maps draw, with
// every place already inked on it. It shows the whole world — all five lands and
// the named seas — rather than one continent, and adds only roads, seals and
// the party marker on top of the shared drawing.

const W = WORLD.w;
const H = WORLD.h;
const INK = '#0a0a0d';

export default function WorldMap({ data }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const byId = useMemo(() => new Map(data.locations.map((l) => [l.id, l])), [data]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // The whole atlas is open: every place is known and clickable from the start.
  const character = data.character || null;

  // Where the party is right now: at a place, or part-way along a road.
  const marker = useMemo(() => {
    if (!character) return null;
    const road = character.travel;
    const a = road && byId.get(road.from);
    const b = road && byId.get(road.to);
    if (a && b && a.x != null && b.x != null) {
      const t = Math.max(0, Math.min(1, road.progress));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 30;
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
        y: u * u * a.y + 2 * u * t * my + t * t * b.y,
        onRoad: true, paused: road.paused,
      };
    }
    const here = byId.get(character.locationId);
    return here && here.x != null ? { x: here.x, y: here.y, onRoad: false } : null;
  }, [character, byId]);

  // Roads: hand-wobbled ink dashes with a pale underlay, so they read over the
  // engraving.
  const roads = useMemo(() => data.connections.map((c) => {
    const a = byId.get(c.from); const b = byId.get(c.to);
    if (!a || !b || a.x == null || b.x == null) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 30;
    const rng = rngFrom(hash(`road-${c.from}-${c.to}`));
    return { c, a, b, mx, my, d: wobbleLine([[a.x, a.y], [mx, my], [b.x, b.y]], rng, 12) };
  }).filter(Boolean), [data, byId]);

  return (
    <div className="atlas">
      <div className="map-col">
        <div className="map-wrap">
          <svg className="world-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта Гримхоула">
          <WorldChart seaLabels />

          {/* roads: dark underlay then a pale inked dash */}
          {roads.map(({ c, a, b, mx, my, d }) => {
            const hot = selectedId === c.from || selectedId === c.to;
            return (
              <g key={`r${c.from}-${c.to}`} opacity={1}>
                <path d={d} fill="none" stroke={INK} strokeWidth={hot ? 5 : 4} opacity={0.7} strokeLinecap="round" />
                <path className={`road ${hot ? 'hot' : ''}`} d={d} fill="none" />
                {c.minutes != null && (
                  <text x={mx} y={my - 4} className="road-time">{c.minutes} мин</text>
                )}
              </g>
            );
          })}

          {/* places: every location is open — an inked seal with its landmark */}
          {data.locations.map((l) => {
            if (l.x == null) return null;
            const active = selectedId === l.id;
            const hot = active || hoverId === l.id;
            const color = l.isSafe ? '#5f7a3f' : dangerColor(l.danger);
            const icon = landmarkIcon(l);
            // Keep labels inside the chart: near an edge they lean inward.
            const labelDx = l.x > 860 ? -20 : l.x < 90 ? 20 : 0;
            const labelDy = l.y < 70 ? 30 : l.y > 580 ? -20 : 33;
            const labelAnchor = l.x > 860 ? 'end' : l.x < 90 ? 'start' : 'middle';
            return (
              <g
                key={l.id}
                className={`map-node dark ${active ? 'active' : ''}`}
                transform={`translate(${l.x},${l.y})`}
                onClick={() => setSelectedId(l.id)}
                onDoubleClick={() => navigate(`/world/locations/${l.id}`)}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/world/locations/${l.id}`); }}
              >
                {hot && <circle r={29} className="node-ring" />}
                <circle r={17} className="seal" />
                {icon && (
                  <image
                    href={icon} x={-12} y={-12} width={24} height={24} className="landmark"
                    style={{ filter: 'invert(0.78) sepia(0.5) saturate(1.6) hue-rotate(330deg) brightness(0.9)' }}
                  />
                )}
                <circle cx={13} cy={-13} r={l.isSafe ? 4 : 2.5 + l.danger} fill={color} stroke={INK} strokeWidth={1.4} />
                <text x={labelDx} y={labelDy} className="node-label dark" textAnchor={labelAnchor}>{l.name}</text>
              </g>
            );
          })}

          {/* the party: an inked cross marks the spot */}
          {marker && (
            <g className="party-marker" transform={`translate(${marker.x},${marker.y})`}>
              <circle r={12} className={`party-pulse ${marker.paused ? 'paused' : ''}`} />
              <path d="M-6,-6 L6,6 M6,-6 L-6,6" className="party-x" />
            </g>
          )}

          <Vignette />
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
            Старинная гравюра Гримхоула. Путь указывается в минутах.
          </div>
        </div>
      </div>

      <div className="map-detail card">
        {character && character.travel && (
          <div className="party-road card">
            <span className="muted small">Отряд в пути</span>
            <b>
              {(byId.get(character.travel.from)?.name) || '?'} → {(byId.get(character.travel.to)?.name) || '?'}
            </b>
            <div className="road-track mini">
              <div className="road-fill" style={{ width: `${Math.round(character.travel.progress * 100)}%` }} />
            </div>
            <span className="muted small">
              {character.travel.minute} / {character.travel.minutes} мин
              {character.travel.paused ? ' · дорога ждёт решения' : ''}
            </span>
            <div className="actions">
              <button type="button" onClick={() => navigate(`/travel/${character.travel.id}`)}>Смотреть путь</button>
            </div>
          </div>
        )}
        {!selected && (
          <p className="muted">
            Кликните по метке, чтобы увидеть место. Двойной клик или кнопка — отправиться туда.
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
              <button type="button" onClick={() => navigate(`/world/locations/${selected.id}`)}>Открыть место</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { dangerColor };
