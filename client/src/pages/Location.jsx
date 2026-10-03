import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { monsterIcon, Icon } from '../icons.jsx';
import SceneBackdrop from '../scenes.jsx';

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
    if (!heroId) return setError('Сначала создайте героя.');
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
  if (!location) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to="/world" className="muted">← Карта мира</Link>
      <div className="scene-hero">
        <SceneBackdrop scene={location.scene} biome={location.biome} danger={location.danger} name={location.name} />
        <div className="scene-caption">
          <div className="page-head" style={{ margin: 0 }}>
            <h1>{location.name}</h1>
            {location.is_safe && <span className="badge safe">Безопасная зона</span>}
          </div>
          <p className="muted">{location.continent?.name} · {location.region?.name} — {location.description}</p>
          <p className="danger-tag">Опасность {'★'.repeat(Math.min(location.danger, 5))}</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div className="card">
          <h2>Путешествие</h2>
          {location.connections.length === 0 && <p className="muted">Отсюда не ведут известные дороги.</p>}
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
          <h2>Столкновения</h2>
          {location.monsters.length === 0 ? (
            <p className="muted">Здесь не таится ничего опасного.</p>
          ) : (
            <>
              <label>Отправить
                <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name} (Ур. {c.level} {c.className})</option>)}
                </select>
              </label>
              <ul className="stats">
                {location.monsters.map((m) => (
                  <li key={m.id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icon src={monsterIcon(m.name)} alt={m.name} size={26} />
                      <span><b>{m.name}</b> <span className="muted small">Ур. {m.level} · {m.max_hp} HP · {m.xp_reward} опыта</span></span>
                    </span>
                    <button type="button" onClick={() => startFight(m.id)}>Сражаться</button>
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
