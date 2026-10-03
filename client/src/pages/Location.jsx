import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { monsterIcon, Icon } from '../icons.jsx';

export default function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getLocation(id).then(setLocation).catch((e) => setError(e.message));
    api.listCharacters().then((list) => {
      setCharacters(list);
      if (list.length) setHeroId(String(list[0].id));
    }).catch(() => {});
  }, [id]);

  const startFight = async (monsterId) => {
    if (!heroId) return setError('Forge a hero first.');
    setError('');
    try {
      const battle = await api.startBattle({
        characterId: Number(heroId), locationId: Number(id),
        monsterId: monsterId ? Number(monsterId) : undefined,
      });
      navigate(`/battles/${battle.id}`);
    } catch (err) { setError(err.message); }
  };

  if (error && !location) return <div className="error">{error}</div>;
  if (!location) return <div className="muted center">Loading…</div>;

  return (
    <div>
      <Link to="/world" className="muted">← World map</Link>
      <div className="page-head">
        <h1>{location.name}</h1>
        {location.is_safe && <span className="badge safe">Safe zone</span>}
      </div>
      <p className="muted">{location.continent?.name} · {location.region?.name} — {location.description}</p>
      <p className="danger-tag">Danger {'★'.repeat(Math.min(location.danger, 5))}</p>

      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div className="card">
          <h2>Travel</h2>
          {location.connections.length === 0 && <p className="muted">No known roads from here.</p>}
          <ul className="stats">
            {location.connections.map((c) => (
              <li key={c.id}>
                <Link to={`/world/locations/${c.toId}`}>{c.toName}</Link>
                <span className="muted small">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Encounters</h2>
          {location.monsters.length === 0 ? (
            <p className="muted">Nothing dangerous lurks here.</p>
          ) : (
            <>
              <label>Send forth
                <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name} (Lv {c.level} {c.className})</option>)}
                </select>
              </label>
              <ul className="stats">
                {location.monsters.map((m) => (
                  <li key={m.id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon src={monsterIcon(m.name)} alt={m.name} size={26} />
                      <span><b>{m.name}</b> <span className="muted small">Lv {m.level} · {m.max_hp} HP · {m.xp_reward} XP</span></span>
                    </span>
                    <button type="button" onClick={() => startFight(m.id)}>Fight</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
