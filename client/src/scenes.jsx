import { useMemo } from 'react';

// Procedural, hand-authored SVG scene backdrops. Everything is vector, tinted
// per biome and accented per location, so every place gets a distinct mood
// without shipping a single raster image.

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

const BIOMES = {
  waste: { sky: ['#241d2b', '#4a3630', '#7a4a35'], far: '#3a2c33', mid: '#241a22', near: '#120c12', moon: '#d9b48a' },
  marsh: { sky: ['#101719', '#1e2c2c', '#37473f'], far: '#22302c', mid: '#16201d', near: '#0a0f0e', moon: '#9fc0b0' },
  forest: { sky: ['#160f1c', '#2c1e33', '#4a2e33'], far: '#2a1c30', mid: '#1a1020', near: '#0d0710', moon: '#c9a0b0' },
  coast: { sky: ['#0d1622', '#1b2c40', '#33506a'], far: '#22364a', mid: '#152434', near: '#0a121c', moon: '#cfe0f0' },
  bonefield: { sky: ['#171722', '#2a2a38', '#454552'], far: '#2e2e3c', mid: '#1e1e28', near: '#101018', moon: '#e0e0e8' },
};

const W = 800;
const H = 300;

function ridge(rng, base, amp, steps, color, opacity) {
  const pts = [[0, H]];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * W;
    const y = base - Math.sin(i * 0.7 + rng() * 3) * amp - rng() * amp * 0.5;
    pts.push([Math.round(x), Math.round(Math.max(20, y))]);
  }
  pts.push([W, H]);
  return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} opacity={opacity} />;
}

function trees(rng, base, color, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const x = (i + 0.5) * (W / n) + (rng() - 0.5) * 30;
    const h = 40 + rng() * 70;
    out.push(<rect key={`t${i}`} x={x} y={base - h} width={3 + rng() * 3} height={h} fill={color} />);
    for (let b = 0; b < 3; b += 1) {
      const by = base - h + 6 + b * (h / 4);
      const dir = b % 2 ? 1 : -1;
      out.push(<line key={`b${i}-${b}`} x1={x + 2} y1={by} x2={x + 2 + dir * (10 + rng() * 14)} y2={by - 8 - rng() * 10} stroke={color} strokeWidth={2} />);
    }
  }
  return out;
}

function reeds(rng, base, color, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const x = rng() * W;
    const h = 16 + rng() * 34;
    out.push(<path key={i} d={`M${x},${base} q${6 + rng() * 8},${-h / 2} ${2 + rng() * 10},${-h}`} stroke={color} strokeWidth={2} fill="none" />);
  }
  return out;
}

function ribs(rng, base, color, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const x = 40 + i * ((W - 80) / n) + rng() * 20;
    const w = 24 + rng() * 30;
    const h = 14 + rng() * 26;
    out.push(<path key={i} d={`M${x},${base} q${w / 2},${-h} ${w},0`} stroke={color} strokeWidth={3} fill="none" opacity={0.8} />);
  }
  return out;
}

function cliffs(rng, base, color) {
  return [
    <path key="c1" d={`M0,${base} L60,${base - 70} L120,${base - 30} L190,${base - 90} L260,${base} Z`} fill={color} />,
    <path key="c2" d={`M520,${base} L600,${base - 60} L680,${base - 20} L740,${base - 80} L800,${base} Z`} fill={color} />,
  ];
}

// Scene-specific accents drawn near the horizon.
function accent(scene, rng, base, color) {
  switch (scene) {
    case 'crossroads':
      return [
        <rect key="p" x={370} y={base - 90} width={8} height={90} fill={color} />,
        <rect key="b" x={330} y={base - 92} width={90} height={7} fill={color} />,
        <path key="r" d={`M${374},${base - 84} q0,34 0,34`} stroke={color} strokeWidth={2} fill="none" />,
        <circle key="k" cx={374} cy={base - 40} r={6} fill={color} />,
      ];
    case 'black_spire':
      return [<path key="s" d={`M400,${base} L378,${base - 190} L392,${base - 210} L404,${base - 120} L414,${base - 215} L428,${base - 185} L406,${base} Z`} fill={color} />];
    case 'sunken_chapel':
      return [
        <rect key="w" x={360} y={base - 80} width={80} height={80} fill={color} />,
        <path key="r" d={`M352,${base - 80} L400,${base - 120} L448,${base - 80} Z`} fill={color} />,
        <rect key="c" x={392} y={base - 150} width={6} height={34} fill={color} />,
        <rect key="c2" x={382} y={base - 140} width={26} height={6} fill={color} />,
      ];
    case 'harbor':
      return [
        <rect key="m1" x={300} y={base - 110} width={4} height={110} fill={color} />,
        <rect key="m2" x={360} y={base - 130} width={4} height={130} fill={color} />,
        <path key="h" d={`M250,${base - 40} L450,${base - 40} L430,${base - 30} L270,${base - 30} Z`} fill={color} />,
      ];
    case 'tide_caves':
      return [<path key="a" d={`M300,${base} q100,-160 200,0 Z`} fill={color} />];
    case 'bone_field':
      return ribs(rng, base, color, 7);
    case 'ash_forest':
      return trees(rng, base, color, 7);
    default:
      return [];
  }
}

export default function SceneBackdrop({ scene = 'crossroads', biome = 'waste', danger = 1, name = '' }) {
  const b = BIOMES[biome] || BIOMES.waste;
  const uid = useMemo(() => `sc${hash(`${scene}${biome}${name}`).toString(36)}`, [scene, biome, name]);

  const layers = useMemo(() => {
    const rng = rngFrom(hash(name || scene));
    return {
      far: ridge(rng, H - 70, 34, 14, b.far, 0.85),
      mid: ridge(rng, H - 36, 26, 12, b.mid, 0.95),
      near: ridge(rng, H - 8, 20, 10, b.near, 1),
    };
  }, [name, scene, b]);

  const acc = useMemo(() => {
    const rng = rngFrom(hash(`${name}${scene}acc`));
    return accent(scene, rng, H - 10, b.near);
  }, [scene, name, b]);

  return (
    <svg className="scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Вид: ${name}`}>
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={b.sky[0]} />
          <stop offset="55%" stopColor={b.sky[1]} />
          <stop offset="100%" stopColor={b.sky[2]} />
        </linearGradient>
        <radialGradient id={`${uid}moon`}>
          <stop offset="0%" stopColor={b.moon} stopOpacity="0.95" />
          <stop offset="45%" stopColor={b.moon} stopOpacity="0.35" />
          <stop offset="100%" stopColor={b.moon} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b8f9f" stopOpacity="0" />
          <stop offset="60%" stopColor="#9b8f9f" stopOpacity={0.1 + danger * 0.02} />
          <stop offset="100%" stopColor="#9b8f9f" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={hash(name) % 100} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="linear" slope="0.06" /></feComponentTransfer>
        </filter>
      </defs>

      <rect width={W} height={H} fill={`url(#${uid}sky)`} />
      <circle cx={W * 0.74} cy={74} r={110} fill={`url(#${uid}moon)`} />
      <circle cx={W * 0.74} cy={74} r={26} fill={b.moon} opacity={0.85} />

      {layers.far}
      {acc}
      {layers.mid}
      <rect y={H * 0.55} width={W} height={H * 0.45} fill={`url(#${uid}fog)`} />
      {layers.near}
      <rect width={W} height={H} filter={`url(#${uid}grain)`} opacity={0.9} />
    </svg>
  );
}
