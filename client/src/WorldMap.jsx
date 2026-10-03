import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Interactive atlas of Grimhollow. Locations carry map coordinates from the
// seed; roads come from the connections table. Everything is SVG so it scales
// cleanly and stays crisp on any display.

const W = 1000;
const H = 620;

const DANGER_COLORS = ['#6fae5a', '#c9a227', '#d98a4a', '#c0553a', '#a83232', '#7a1f3a'];
const dangerColor = (d) => DANGER_COLORS[Math.min(Math.max(d, 1), 5)] || '#9b8f9f';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function WorldMap({ data }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const byId = useMemo(() => new Map(data.locations.map((l) => [l.id, l])), [data]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // A stable, hand-made-looking landmass plus scattered detail, seeded by name.
  const terrain = useMemo(() => {
    const rng = rngFrom(hash('mordrat'));
    const blobs = [];
    for (let i = 0; i < 9; i += 1) {
      const cx = 120 + rng() * (W - 240);
      const cy = 110 + rng() * (H - 220);
      const rx = 70 + rng() * 130;
      const ry = 50 + rng() * 90;
      blobs.push(<ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="#2a2130" opacity={0.35 + rng() * 0.2} />);
    }
    const speck = [];
    for (let i = 0; i < 120; i += 1) {
      speck.push(<circle key={i} cx={rng() * W} cy={rng() * H} r={rng() * 1.6} fill="#c9a227" opacity={0.05 + rng() * 0.1} />);
    }
    return { blobs, speck };
  }, []);

  return (
    <div className="atlas">
      <div className="map-wrap">
        <svg className="world-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта Мордрата">
          <defs>
            <radialGradient id="mapGlow" cx="50%" cy="35%">
              <stop offset="0%" stopColor="#241a2c" />
              <stop offset="70%" stopColor="#120d16" />
              <stop offset="100%" stopColor="#08070a" />
            </radialGradient>
            <filter id="mapGrain">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer><feFuncA type="linear" slope="0.05" /></feComponentTransfer>
            </filter>
          </defs>
          <rect width={W} height={H} fill="url(#mapGlow)" />
          {terrain.blobs}
          {terrain.speck}

          {/* roads */}
          {data.connections.map((c, i) => {
            const a = byId.get(c.from); const b = byId.get(c.to);
            if (!a || !b || a.x == null || b.x == null) return null;
            const hot = selectedId === c.from || selectedId === c.to;
            return (
              <path
                key={i}
                className={`road ${hot ? 'hot' : ''}`}
                d={`M${a.x},${a.y} Q${(a.x + b.x) / 2},${(a.y + b.y) / 2 - 34} ${b.x},${b.y}`}
                fill="none"
              />
            );
          })}

          {/* locations */}
          {data.locations.map((l) => {
            if (l.x == null) return null;
            const active = selectedId === l.id;
            const hot = active || hoverId === l.id;
            const color = l.isSafe ? '#6fae5a' : dangerColor(l.danger);
            return (
              <g
                key={l.id}
                className={`map-node ${active ? 'active' : ''}`}
                transform={`translate(${l.x},${l.y})`}
                onClick={() => setSelectedId(l.id)}
                onDoubleClick={() => navigate(`/world/locations/${l.id}`)}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/world/locations/${l.id}`); }}
              >
                {hot && <circle r={22} className="node-ring" />}
                <circle r={l.isSafe ? 9 : 6 + l.danger} fill={color} stroke="#0d0b10" strokeWidth={2} />
                {l.isSafe && <path d="M-3,-1 l3,3 l4,-5" stroke="#0d0b10" strokeWidth={2} fill="none" />}
                <text y={l.isSafe ? 26 : 22 + l.danger} className="node-label">{l.name}</text>
              </g>
            );
          })}

          <rect width={W} height={H} filter="url(#mapGrain)" opacity={0.7} pointerEvents="none" />
        </svg>

        <div className="map-legend">
          <div className="legend-title">Легенда</div>
          <div className="legend-row"><span className="dot" style={{ background: '#6fae5a' }} /> Безопасно</div>
          {[1, 2, 3, 4, 5].map((d) => (
            <div className="legend-row" key={d}>
              <span className="dot" style={{ background: dangerColor(d), width: 6 + d, height: 6 + d }} />
              {'★'.repeat(d)}
            </div>
          ))}
        </div>
      </div>

      <div className="map-detail card">
        {!selected && (
          <p className="muted">Кликните по метке, чтобы увидеть место. Двойной клик или кнопка — отправиться туда.</p>
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
              <button type="button" onClick={() => navigate(`/world/locations/${selected.id}`)}>Отправиться</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { dangerColor };
