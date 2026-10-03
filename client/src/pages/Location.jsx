import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { monsterIcon, Icon } from '../icons.jsx';
import SceneBackdrop from '../scenes.jsx';
import Talk from '../Talk.jsx';

export default function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [npcs, setNpcs] = useState([]);
  const [talking, setTalking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getLocation(id).then(setLocation).catch((e) => setError(e.message));
    api.npcsAtLocation(id).then(setNpcs).catch(() => {});
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

      {npcs.length > 0 && (
        <div className="card">
          <h2>Обитатели</h2>
          <p className="muted small">С ними можно поговорить. Они запоминают ваши слова, и их отношение меняется.</p>
          <ul className="npc-list">
            {npcs.map((n) => (
              <li key={n.id}>
                <div className="npc-line">
                  <span className="portrait small" style={{ borderColor: '#a08a6a' }}>
                    {n.portrait ? <Icon src={n.portrait} alt={n.name} size={28} />
                      : <span className="portrait-initial">{n.name[0]}</span>}
                  </span>
                  <span>
                    <b>{n.name}</b> <span className="muted small">· {n.role}</span>
                    <div className="muted small">{n.description}</div>
                    <div className="traits">
                      {[...n.plus, ...n.minus].map((t) => (
                        <span key={t.name} className={`chip trait ${t.kind}`}>{t.name}</span>
                      ))}
                    </div>
                  </span>
                </div>
                <button type="button" onClick={() => setTalking(talking === n.id ? null : n.id)}>
                  {talking === n.id ? 'Свернуть' : 'Поговорить'}
                </button>
              </li>
            ))}
          </ul>
          {talking && heroId && (
            <Talk leaderId={Number(heroId)} kind="npc" refId={talking} onClose={() => setTalking(null)} />
          )}
          {talking && !heroId && <p className="error">Сначала создайте героя, чтобы говорить.</p>}
        </div>
      )}

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
