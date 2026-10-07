import { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import GlobalMap from '../GlobalMap.jsx';
import ContinentMap from '../ContinentMap.jsx';
import WorldMap from '../WorldMap.jsx';
import { useMapData } from '../useMapData.js';
import { api } from '../api.js';

// The atlas, in three charts, all in the same generated dark-fantasy style. The
// global chart shows the whole world — the five lands, the seas and the ports.
// Opening a land shows that continent's own chart and every place inside it.
// The chart is the original survey sheet with every place already inked on it.
// The hero picker decides whose eyes we look through.

const TABS = [
  { to: '/world', label: 'Весь мир' },
  { to: '/world/atlas', label: 'Атлас' },
];

export default function WorldPage() {
  const { continentName } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { map, characters, heroId, pickHero, error } = useMapData();
  const [travelError, setTravelError] = useState('');

  // Setting out is a real journey: the party may only leave the place it stands
  // in, for a place a road connects to it. The server enforces the same rule.
  const setOut = async (toId) => {
    if (!heroId) { setTravelError('Сначала создайте героя.'); return; }
    setTravelError('');
    try {
      const trip = await api.startTravel({ characterId: Number(heroId), fromId: map.character.locationId, toId: Number(toId) });
      if (trip.arrived) navigate(`/world/locations/${trip.to.id}`);
      else navigate(`/travel/${trip.id}`);
    } catch (err) { setTravelError(err.message); }
  };

  const continent = useMemo(
    () => (map && continentName ? map.continents.find((c) => c.name === continentName) : null),
    [map, continentName],
  );

  if (error) return <div className="error">{error}</div>;
  if (!map) return <div className="muted center">Загрузка карты…</div>;

  const atlasView = pathname === '/world/atlas';
  const stats = continent ? continent.stats : map.stats;
  const histMax = Math.max(1, ...(stats.byDanger || [0]));

  return (
    <div>
      <div className="page-head">
        <h1>{continent ? continent.name : atlasView ? 'Атлас Гримхоула' : 'Весь мир'}</h1>
        {characters.length > 0 && (
          <select value={heroId} onChange={(e) => pickHero(e.target.value)} title="Чьими глазами смотреть на карту">
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {continent && <button type="button" onClick={() => navigate('/world')}>← Весь мир</button>}
      </div>

      {!continent && (
        <nav className="map-tabs">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={`map-tab ${pathname === t.to ? 'active' : ''}`}>{t.label}</Link>
          ))}
        </nav>
      )}

      {!atlasView && (
        <div className="atlas-stats">
          <div className="card stat-card"><span className="stat-num">{stats.locations}</span><span className="muted small">локаций</span></div>
          <div className="card stat-card"><span className="stat-num">{stats.regions}</span><span className="muted small">региона</span></div>
          <div className="card stat-card"><span className="stat-num">{stats.safe}</span><span className="muted small">безопасных</span></div>
          <div className="card stat-card"><span className="stat-num">{stats.ports}</span><span className="muted small">портов</span></div>
          <div className="card stat-card"><span className="stat-num">{stats.monsters}</span><span className="muted small">столкновений</span></div>
        </div>
      )}

      {!atlasView && (
        <div className="danger-hist card">
          <div className="legend-title">Распределение опасности{continent ? ` — ${continent.name}` : ' — весь мир'}</div>
          <div className="hist">
            {(stats.byDanger || []).map((n, i) => (
              <div className="hist-col" key={i}>
                <div className="hist-track">
                  <div className="hist-bar" style={{ height: `${Math.round((n / histMax) * 90)}px` }} title={`${n} локаций`} />
                </div>
                <span className="small muted">{'★'.repeat(i + 1)}</span>
                <span className="small">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {travelError && <div className="error">{travelError}</div>}

      {atlasView ? (
        <WorldMap data={map} />
      ) : continent ? (
        <ContinentMap
          map={map}
          continent={continent}
          onBack={() => navigate('/world')}
          onOpenLocation={(id) => navigate(`/world/locations/${id}`)}
          onTravel={setOut}
        />
      ) : (
        <GlobalMap map={map} onOpen={(name) => navigate(`/world/continents/${encodeURIComponent(name)}`)} />
      )}

      {!continent && !atlasView && (
        <section className="continent-list">
          {map.continents.map((c) => (
            <Link key={c.id} className="card continent-card" to={`/world/continents/${encodeURIComponent(c.name)}`}>
              <div className="hero-top"><b>{c.name}</b><span className="badge">{c.stats.locations} мест</span></div>
              <p className="muted small">{c.description}</p>
              <div className="continent-meta">
                <span className="muted small">обл.: {c.stats.regions}</span>
                <span className="muted small">безопасно: {c.stats.safe}</span>
                <span className="muted small">портов: {c.stats.ports}</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
