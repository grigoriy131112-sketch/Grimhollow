import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import WorldMap from '../WorldMap.jsx';
import SceneBackdrop from '../scenes.jsx';

export default function WorldPage() {
  const [map, setMap] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('map');

  useEffect(() => { api.getMap().then(setMap).catch((e) => setError(e.message)); }, []);

  const stats = useMemo(() => {
    if (!map) return null;
    const byDanger = [1, 2, 3, 4, 5].map((d) => map.locations.filter((l) => l.danger === d).length);
    const regions = map.continents.flatMap((c) => c.regions.map((r) => r.name));
    const monsters = map.locations.reduce((sum, l) => sum + l.monsterCount, 0);
    return { byDanger, regions, monsters, safe: map.locations.filter((l) => l.isSafe).length };
  }, [map]);

  if (error) return <div className="error">{error}</div>;
  if (!map) return <div className="muted center">Загрузка карты…</div>;

  return (
    <div>
      <div className="page-head">
        <h1>Атлас Гримхоула</h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Карта</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Список</button>
        </div>
      </div>

      <div className="atlas-stats">
        <div className="card stat-card"><span className="stat-num">{map.locations.length}</span><span className="muted small">локаций</span></div>
        <div className="card stat-card"><span className="stat-num">{stats.regions.length}</span><span className="muted small">региона</span></div>
        <div className="card stat-card"><span className="stat-num">{stats.safe}</span><span className="muted small">безопасных</span></div>
        <div className="card stat-card"><span className="stat-num">{stats.monsters}</span><span className="muted small">столкновений</span></div>
      </div>

      <div className="danger-hist card">
        <div className="legend-title">Распределение опасности</div>
        <div className="hist">
          {stats.byDanger.map((n, i) => (
            <div className="hist-col" key={i}>
              <div className="hist-bar" style={{ height: `${Math.max(4, n * 22)}px` }} title={`${n} локаций`} />
              <span className="small muted">{'★'.repeat(i + 1)}</span>
              <span className="small">{n}</span>
            </div>
          ))}
        </div>
      </div>

      {view === 'map' ? (
        <WorldMap data={map} />
      ) : (
        map.continents.map((continent) => (
          <section key={continent.id} className="continent">
            <h2>{continent.name}</h2>
            <p className="muted">{continent.description}</p>
            {continent.regions.map((region) => (
              <div key={region.id} className="region">
                <h3>{region.name}</h3>
                <p className="muted small">{region.description}</p>
                <div className="cards">
                  {map.locations.filter((l) => l.regionId === region.id).map((loc) => (
                    <Link key={loc.id} className="card loc-card" to={`/world/locations/${loc.id}`}>
                      <div className="loc-thumb">
                        <SceneBackdrop scene={loc.scene} biome={loc.biome} danger={loc.danger} name={loc.name} />
                      </div>
                      <div className="hero-top">
                        <b>{loc.name}</b>
                        {loc.isSafe && <span className="badge safe">Безопасно</span>}
                      </div>
                      <p className="muted small">{loc.description}</p>
                      <span className="danger-tag">Опасность {'★'.repeat(Math.min(loc.danger, 5))}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
