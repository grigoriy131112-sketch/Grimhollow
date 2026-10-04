import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { landmarkIcon } from './icons.jsx';

// Interactive atlas of Grimhollow, drawn like an old ink-and-parchment chart:
// aged paper, hachured relief for hills and woods, thin sepia roads and inked
// place seals. The paper is one CC0 raster texture (see CREDITS.txt); everything
// else is vector, and the place icons are CC BY 3.0 SVGs from game-icons.net.

const W = 1000;
const H = 640;

const DANGER_COLORS = ['#5f7a3f', '#a8862a', '#b5672f', '#a13f2a', '#8a2020', '#5f1830'];
const dangerColor = (d) => DANGER_COLORS[Math.min(Math.max(d, 1), 5)] || '#6b5335';

// One ink family for the whole chart; saturated colour is reserved for danger.
const INK = '#4a3826';
const PARCH = '#f2e7cd';

const BIOME_TINT = {
  waste: { wash: '#cdb289' },
  marsh: { wash: '#a9b596' },
  forest: { wash: '#9ba87e' },
  coast: { wash: '#aab9c3' },
  bonefield: { wash: '#c6bfab' },
};
const BIOME_LABEL = {
  waste: 'пустошь', marsh: 'топь', forest: 'лес', coast: 'побережье', bonefield: 'костяные поля',
};
const BIOME_WASH = (b) => (BIOME_TINT[b] || BIOME_TINT.waste).wash;

// How many relief clusters to scatter around each biome, and how far they stray.
const BRUSHES = {
  waste: { clusters: [1, 2], jitter: 82, scale: 1.0 },
  marsh: { clusters: [1, 2], jitter: 74, scale: 0.9 },
  forest: { clusters: [2, 3], jitter: 78, scale: 0.95 },
  coast: { clusters: [1, 2], jitter: 80, scale: 1.0 },
  bonefield: { clusters: [1, 2], jitter: 74, scale: 1.0 },
};

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

// Build a closed, hand-drawn-looking coastline from a ring of wobbled points.
function coastline(cx, cy, rx, ry, seed, wobble = 0.22) {
  const rng = rngFrom(hash(seed));
  const n = 26;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + (rng() - 0.5) * wobble;
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= n; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i % n];
    const mx = (x0 + x1) / 2 + (rng() - 0.5) * 26;
    const my = (y0 + y1) / 2 + (rng() - 0.5) * 26;
    d += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return `${d} Z`;
}

// --- Relief brushes ----------------------------------------------------------
// Cartographic hachure: short parallel ink ticks that shade a slope. Each brush
// returns SVG elements around the origin; the map places them with a transform.

function hachure(rng, halfW, baseY, count, len, color, slope) {
  const out = [];
  const step = count > 1 ? (halfW * 2) / (count - 1) : 0;
  for (let i = 0; i < count; i += 1) {
    const x = -halfW + i * step;
    const l = len * (0.55 + rng() * 0.75);
    out.push(
      <line
        key={`hc${i}`} x1={x} y1={baseY} x2={x + slope} y2={baseY - l}
        stroke={color} strokeWidth={0.9} opacity={0.7} strokeLinecap="round"
      />,
    );
  }
  return out;
}

// A rounded hill outline with shaded ticks beneath it.
function hill(rng, x, y, w, h, color) {
  const ticks = Math.max(3, Math.round(w / 6));
  return (
    <g key={`hl${x}-${y}`} transform={`translate(${x},${y})`}>
      <path d={`M${-w},0 Q0,${-h} ${w},0`} fill="none" stroke={color} strokeWidth={1.1} opacity={0.9} />
      {hachure(rng, w * 0.92, -1, ticks, h * 0.7, color, 3)}
    </g>
  );
}

function drawHills(rng, s) {
  const out = [];
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * 34 * s + (rng() - 0.5) * 8;
    out.push(hill(rng, x, (rng() - 0.5) * 6, (16 + rng() * 12) * s, (14 + rng() * 12) * s, '#8a6a44'));
  }
  return out;
}

// Little ink wood: a clump of small triangles, classic chart shorthand.
function drawTrees(rng, s) {
  const out = [];
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i += 1) {
    const x = (rng() - 0.5) * 62 * s;
    const y = (rng() - 0.5) * 26 * s;
    const h = (9 + rng() * 8) * s;
    const w = h * 0.55;
    out.push(<path key={`tr${i}`} d={`M${x},${y} L${x - w},${y} L${x},${y - h} L${x + w},${y} Z`} fill="#4f6238" opacity={0.55} />);
  }
  return out;
}

// Marsh: short standing-water dashes with reed tufts.
function drawMarsh(rng, s) {
  const out = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i += 1) {
    const x = (rng() - 0.5) * 56 * s;
    const y = (rng() - 0.5) * 24 * s;
    const w = (14 + rng() * 12) * s;
    out.push(<line key={`wa${i}`} x1={x - w / 2} y1={y} x2={x + w / 2} y2={y} stroke="#54707f" strokeWidth={1.1} opacity={0.7} strokeLinecap="round" />);
    for (let r = 0; r < 3; r += 1) {
      const rx = x + (r - 1) * 5 * s;
      out.push(<path key={`re${i}-${r}`} d={`M${rx},${y} q1,${-5 * s} 2,${-9 * s}`} stroke="#5f7a52" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.8} />);
    }
  }
  return out;
}

// Coast: a couple of short wave marks near the shore.
function drawWaves(rng, s) {
  const out = [];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i += 1) {
    const y = (i - (n - 1) / 2) * 10 * s;
    const x = (rng() - 0.5) * 16 * s;
    const w = (18 + rng() * 14) * s;
    out.push(<path key={`wv${i}`} d={`M${x - w / 2},${y} q${w / 4},${-3 * s} ${w / 2},0 t${w / 2},0`} stroke="#54707f" strokeWidth={1.1} fill="none" opacity={0.7} strokeLinecap="round" />);
  }
  return out;
}

// Bonefield: small crossed-bone marks.
function drawBones(rng, s) {
  const out = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i += 1) {
    const x = (rng() - 0.5) * 58 * s;
    const y = (rng() - 0.5) * 26 * s;
    const a = (rng() - 0.5) * 60;
    const l = (7 + rng() * 6) * s;
    out.push(
      <g key={`bn${i}`} transform={`translate(${x},${y}) rotate(${a})`} opacity={0.7}>
        <line x1={-l} y1={0} x2={l} y2={0} stroke="#7d7460" strokeWidth={1.6} strokeLinecap="round" />
        <circle cx={-l} cy={0} r={1.5 * s} fill="#7d7460" />
        <circle cx={l} cy={0} r={1.5 * s} fill="#7d7460" />
      </g>,
    );
  }
  return out;
}

const BRUSH_FN = {
  waste: drawHills, marsh: drawMarsh, forest: drawTrees,
  coast: drawWaves, bonefield: drawBones,
};

// Scatter each biome's relief over the land. Seeded, so the chart is stable.
function terrainBrushes(locations) {
  const rng = rngFrom(hash('grimhollow-brushes'));
  const out = [];
  locations.forEach((l) => {
    if (l.x == null) return;
    const spec = BRUSHES[l.biome] || BRUSHES.waste;
    const fn = BRUSH_FN[l.biome] || drawHills;
    const [lo, hi] = spec.clusters;
    const clusters = lo + Math.floor(rng() * (hi - lo + 1));
    for (let c = 0; c < clusters; c += 1) {
      const cx = l.x + (rng() - 0.5) * spec.jitter * 2;
      const cy = l.y + (rng() - 0.5) * spec.jitter * 1.5;
      const s = spec.scale * (0.9 + rng() * 0.4);
      out.push(<g key={`${l.id}-${c}`} transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)})`}>{fn(rng, s)}</g>);
    }
  });
  return out;
}

export default function WorldMap({ data }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const byId = useMemo(() => new Map(data.locations.map((l) => [l.id, l])), [data]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // Fog of war, in three tiers. Visited places are fully known; their direct
  // neighbours are known only by rumour; everything past that is unmapped.
  const character = data.character || null;
  const { visitedIds, rumourIds } = useMemo(() => {
    if (!character) return { visitedIds: null, rumourIds: null };
    const visited = new Set(character.visited || []);
    const rumour = new Set();
    data.connections.forEach((c) => {
      if (visited.has(c.from) && !visited.has(c.to)) rumour.add(c.to);
      if (visited.has(c.to) && !visited.has(c.from)) rumour.add(c.from);
    });
    return { visitedIds: visited, rumourIds: rumour };
  }, [character, data]);
  const isVisited = (id) => !visitedIds || visitedIds.has(id);
  const isRumoured = (id) => !rumourIds || rumourIds.has(id);
  const isReachable = (id) => isVisited(id) || isRumoured(id);

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

  // Landmass: one big island with a couple of neighbours, plus sea speckle.
  const terrain = useMemo(() => {
    const land = [
      coastline(500, 340, 530, 320, 'grimhollow-main', 0.14),
      coastline(110, 585, 80, 45, 'grimhollow-sw', 0.3),
      coastline(935, 95, 60, 45, 'grimhollow-ne', 0.3),
    ];
    const rng = rngFrom(hash('grimhollow-seaspeck'));
    const speck = [];
    for (let i = 0; i < 120; i += 1) {
      speck.push([rng() * W, rng() * H, rng() * 1.1, 0.05 + rng() * 0.06]);
    }
    return { land, speck };
  }, []);

  // Biome washes: a soft tint per place so regions read at a glance.
  const washes = useMemo(() => {
    const rng = rngFrom(hash('grimhollow-tints'));
    return data.locations.map((l) => {
      if (l.x == null) return null;
      const r = 74 + rng() * 52;
      const tint = BIOME_TINT[l.biome] || BIOME_TINT.waste;
      return { id: l.id, cx: l.x + (rng() - 0.5) * 26, cy: l.y + (rng() - 0.5) * 26, r, wash: tint.wash };
    }).filter(Boolean);
  }, [data]);

  const brushes = useMemo(() => terrainBrushes(data.locations), [data]);

  const biomeLegend = useMemo(() => {
    const seen = new Map();
    data.locations.forEach((l) => {
      if (l.biome && !seen.has(l.biome)) seen.set(l.biome, BIOME_WASH(l.biome));
    });
    return [...seen.entries()].filter(([, c]) => c);
  }, [data]);

  return (
    <div className="atlas">
      <div className="map-wrap">
        <svg className="world-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта Мордрата">
          <defs>
            {/* aged parchment: a CC0 texture (see CREDITS) tiled as the paper */}
            <pattern id="parch" width={W} height={H} patternUnits="userSpaceOnUse">
              <image
                href="/art/textures/parchment.jpg" x={0} y={0} width={W} height={H}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
            {/* sea and land are the same paper, tinted cool and warm respectively */}
            <radialGradient id="seaTint" cx="50%" cy="40%">
              <stop offset="0%" stopColor="#c3d2d6" stopOpacity="0.5" />
              <stop offset="65%" stopColor="#a7b9be" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#8ea3aa" stopOpacity="0.66" />
            </radialGradient>
            <linearGradient id="landTint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ecd9b0" stopOpacity="0.45" />
              <stop offset="55%" stopColor="#e0c795" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#cdae76" stopOpacity="0.62" />
            </linearGradient>
            <radialGradient id="vignette" cx="50%" cy="45%">
              <stop offset="58%" stopColor="#3a2c1a" stopOpacity="0" />
              <stop offset="100%" stopColor="#2a1f10" stopOpacity="0.45" />
            </radialGradient>
            <filter id="mapGrain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer><feFuncA type="linear" slope="0.05" /></feComponentTransfer>
            </filter>
            <filter id="landShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#4a3826" floodOpacity="0.4" />
            </filter>
            {/* keep washes and relief on dry land so they do not bleed into the sea */}
            <clipPath id="landClip"><path d={terrain.land[0]} /></clipPath>
            <pattern id="chartGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M50 0 L0 0 0 50" fill="none" stroke="#6b5335" strokeWidth="0.5" opacity="0.1" />
            </pattern>
          </defs>

          <rect width={W} height={H} fill="url(#parch)" />
          <rect width={W} height={H} fill="url(#seaTint)" />
          <rect width={W} height={H} fill="url(#chartGrid)" pointerEvents="none" />
          {terrain.speck.map(([x, y, r, o], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#6f8fa0" opacity={o} />
          ))}

          {/* landmass: fresh paper, a warm tint, an ink coast and a gold edge */}
          {terrain.land.map((d, i) => (
            <path key={`land${i}`} d={d} fill="url(#parch)" filter="url(#landShadow)" />
          ))}
          {terrain.land.map((d, i) => (
            <path key={`landtint${i}`} d={d} fill="url(#landTint)" />
          ))}
          {terrain.land.map((d, i) => (
            <path key={`coast${i}`} d={d} fill="none" stroke={INK} strokeWidth={2.2} opacity={0.75} />
          ))}
          {terrain.land.map((d, i) => (
            <path key={`coast2${i}`} d={d} fill="none" stroke="#a8862a" strokeWidth={0.8} opacity={0.5} />
          ))}

          {/* biome washes + hachured relief, clipped to the land */}
          <g clipPath="url(#landClip)">
            {washes.map((t) => (
              <circle key={t.id} cx={t.cx} cy={t.cy} r={t.r} fill={t.wash} opacity={0.35} />
            ))}
            {brushes}
          </g>

          {/* roads: sepia dashes between visited places, fainter while rumoured */}
          {data.connections.map((c, i) => {
            const a = byId.get(c.from); const b = byId.get(c.to);
            if (!a || !b || a.x == null || b.x == null) return null;
            const hot = selectedId === c.from || selectedId === c.to;
            const known = isReachable(c.from) && isReachable(c.to);
            const solid = isVisited(c.from) && isVisited(c.to);
            if (!known) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 30;
            return (
              <g key={i} opacity={solid ? 1 : 0.5}>
                <path
                  className={`road ${hot ? 'hot' : ''} ${solid ? '' : 'rumour'}`}
                  d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                  fill="none"
                />
                {solid && c.minutes != null && (
                  <text x={mx} y={my - 4} className="road-time">{c.minutes} мин</text>
                )}
              </g>
            );
          })}

          {/* places: an inked seal with the landmark drawn inside */}
          {data.locations.map((l) => {
            if (l.x == null) return null;
            const visited = isVisited(l.id);
            const rumoured = isRumoured(l.id);
            const known = visited || rumoured;
            const active = selectedId === l.id;
            const hot = active || hoverId === l.id;
            const color = l.isSafe ? '#5f7a3f' : dangerColor(l.danger);
            const icon = visited ? landmarkIcon(l) : null;
            return (
              <g
                key={l.id}
                className={`map-node ${active ? 'active' : ''} ${known ? '' : 'fogged'} ${rumoured && !visited ? 'rumoured' : ''}`}
                transform={`translate(${l.x},${l.y})`}
                onClick={() => { if (known) setSelectedId(l.id); }}
                onDoubleClick={() => { if (known) navigate(`/world/locations/${l.id}`); }}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (known && e.key === 'Enter') navigate(`/world/locations/${l.id}`); }}
              >
                {hot && known && <circle r={29} className="node-ring" />}
                <circle r={17} className={`seal ${known ? '' : 'fogged'} ${rumoured && !visited ? 'rumour' : ''}`} />
                {icon && (
                  <image
                    href={icon} x={-12} y={-12} width={24} height={24} className="landmark"
                    style={{ filter: 'invert(0.78) sepia(0.5) saturate(1.6) hue-rotate(330deg) brightness(0.9)' }}
                  />
                )}
                {!known && <text y={5} className="node-unknown">?</text>}
                {known && !visited && <text y={5} className="node-unknown">~</text>}
                {visited && <circle cx={13} cy={-13} r={l.isSafe ? 4 : 2.5 + l.danger} fill={color} stroke={PARCH} strokeWidth={1.2} />}
                <text y={33} className="node-label">
                  {visited ? l.name : rumoured ? `${l.name}?` : '· · ·'}
                </text>
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

          {/* chart furniture: compass rose, then paper finish and frame */}
          <g className="compass" transform={`translate(${W - 72},${84})`} pointerEvents="none">
            <circle r={30} className="compass-ring" />
            <circle r={21} className="compass-ring thin" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <path key={a} d="M0,-30 L4,-7 L0,-10 L-4,-7 Z" className="compass-needle" transform={`rotate(${a})`} />
            ))}
            <path d="M0,-24 L3,0 L0,3 L-3,0 Z" className="compass-north" />
            <text y={-35} className="compass-label">N</text>
          </g>

          <rect width={W} height={H} filter="url(#mapGrain)" opacity={0.65} pointerEvents="none" />
          <rect width={W} height={H} fill="url(#vignette)" pointerEvents="none" />
          <rect x={5} y={5} width={W - 10} height={H - 10} rx={10} className="map-frame" pointerEvents="none" />
        </svg>

        <div className="map-legend">
          <div className="legend-title">Легенда</div>
          <div className="legend-row"><span className="dot party" /> Отряд</div>
          <div className="legend-row"><span className="dot" style={{ background: '#5f7a3f' }} /> Безопасно</div>
          <div className="legend-row"><span className="dot rumour" /> Молва</div>
          {[1, 2, 3, 4, 5].map((d) => (
            <div className="legend-row" key={d}>
              <span className="dot" style={{ background: dangerColor(d), width: 6 + d, height: 6 + d }} />
              {'★'.repeat(d)}
            </div>
          ))}
          <div className="legend-sep" />
          {biomeLegend.map(([biome, color]) => (
            <div className="legend-row" key={biome}>
              <span className="dot" style={{ background: color }} /> {BIOME_LABEL[biome] || biome}
            </div>
          ))}
        </div>

        <div className="map-scale">
          <span className="scale-bar" /> <span className="muted small">путь указывается в минутах</span>
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
            {character && ' Незнакомые места скрыты туманом — они проявятся, когда отряд до них дойдёт.'}
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
              <button type="button" onClick={() => navigate(`/world/locations/${selected.id}`)}>Отправиться</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { dangerColor };
