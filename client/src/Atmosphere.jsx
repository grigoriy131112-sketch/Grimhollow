import { useEffect, useMemo, useRef } from 'react';

// Ambient, screen-wide atmosphere (Wave W-ATMOSPHERE). Everything here is pure
// CSS/transform animation on a small number of nodes, driven by one rAF clock, so
// the whole app breathes (drifting embers, a low fog band, an animated film
// grain) without a canvas and without re-rendering React.
//
// Usage: <Atmosphere /> once per screen (or once per app). `tone` picks a colour
// family so a battle can glow red and the table of contents stay cold.

const TONES = {
  ember: { ember: '#c25a3a', ember2: '#e08a4a', motes: 34, glow: 'rgba(168,52,31,0.10)' },
  cold: { ember: '#5f7d6a', ember2: '#7d9a86', motes: 22, glow: 'rgba(74,111,134,0.10)' },
  sea: { ember: '#4a6f86', ember2: '#6f9ab4', motes: 28, glow: 'rgba(74,111,134,0.12)' },
};

export default function Atmosphere({ tone = 'ember', motes, intensity = 1 }) {
  const t = TONES[tone] || TONES.ember;
  const count = motes ?? t.motes;
  const layer = useRef(null);

  // Each motes: a position, size, drift and a duration/delay. Kept stable for the
  // life of the mount so the field does not reshuffle on every React render.
  const parts = useMemo(() => {
    const rand = (a, b) => a + Math.random() * (b - a);
    return Array.from({ length: count }, () => ({
      left: rand(0, 100),
      size: rand(1.5, 4.5),
      dur: rand(9, 22),
      delay: rand(-22, 0),
      drift: rand(-60, 60),
      op: rand(0.25, 0.85) * intensity,
    }));
  }, [count, intensity]);

  // A slow light parallax: the mote field leans a few pixels against the pointer,
  // like a room lit from one side. Cheap (one transform), disabled on touch.
  useEffect(() => {
    const el = layer.current;
    if (!el || typeof window === 'undefined') return undefined;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return undefined;
    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const x = (e.clientX / window.innerWidth - 0.5) * 22;
        const y = (e.clientY / window.innerHeight - 0.5) * 14;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className={`atmos atmos-${tone}`} aria-hidden="true">
      <div className="atmos-glow" style={{ background: t.glow }} />
      <div className="atmos-fog atmos-fog-a" />
      <div className="atmos-fog atmos-fog-b" />
      <div className="atmos-motes" ref={layer}>
        {parts.map((p, i) => (
          <span
            key={i}
            className="atmos-mote"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              '--drift': `${p.drift}px`,
              '--dur': `${p.dur}s`,
              '--delay': `${p.delay}s`,
              '--op': p.op,
              background: i % 3 === 0 ? t.ember2 : t.ember,
            }}
          />
        ))}
      </div>
      <div className="atmos-grain" />
    </div>
  );
}
