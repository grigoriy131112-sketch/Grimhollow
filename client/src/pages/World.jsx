import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function WorldPage() {
  const [world, setWorld] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api.getWorld().then(setWorld).catch((e) => setError(e.message)); }, []);

  return (
    <div>
      <div className="page-head"><h1>Мир</h1></div>
      {error && <div className="error">{error}</div>}
      {world.map((continent) => (
        <section key={continent.id} className="continent">
          <h2>{continent.name}</h2>
          <p className="muted">{continent.description}</p>
          {continent.regions.map((region) => (
            <div key={region.id} className="region">
              <h3>{region.name}</h3>
              <p className="muted small">{region.description}</p>
              <div className="cards">
                {region.locations.map((loc) => (
                  <Link key={loc.id} className="card loc-card" to={`/world/locations/${loc.id}`}>
                    <div className="hero-top">
                      <b>{loc.name}</b>
                      {loc.is_safe && <span className="badge safe">Безопасно</span>}
                    </div>
                    <p className="muted small">{loc.description}</p>
                    <span className="danger-tag">Опасность {'★'.repeat(Math.min(loc.danger, 5))}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
