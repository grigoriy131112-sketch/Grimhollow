import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { monsterIcon, Icon } from '../icons.jsx';
import SceneBackdrop from '../scenes.jsx';
import Talk from '../Talk.jsx';
import { hintScene } from '../audio.js';

export default function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [npcs, setNpcs] = useState([]);
  const [talking, setTalking] = useState(null);
  const [crossings, setCrossings] = useState([]);
  const [voyage, setVoyage] = useState(null);
  const [sailing, setSailing] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState(null);

  useEffect(() => { if (location) hintScene({ location }); }, [location]);

  useEffect(() => {
    api.getLocation(id).then(setLocation).catch((e) => setError(e.message));
    api.npcsAtLocation(id).then(setNpcs).catch(() => {});
    api.listCharacters().then((list) => {
      setCharacters(list);
      if (list.length) setHeroId(String(list[0].id));
    }).catch(() => {});
  }, [id]);

  // A port gate also opens sea lanes to another continent; load them once a
  // hero is known, so the fares can say whether the party can pay.
  useEffect(() => {
    setVoyage(null);
    api.getCrossings(Number(id), heroId ? Number(heroId) : undefined)
      .then(setCrossings).catch(() => setCrossings([]));
  }, [id, heroId]);

  // Standing here marks the place on the map; the drowned chapel yields the
  // key the resurrection ritual needs on the first visit.
  useEffect(() => {
    if (!heroId) return;
    api.visitLocation(Number(id), Number(heroId))
      .then((res) => { if (res?.found) setFound(res.found); })
      .catch(() => {});
  }, [id, heroId]);

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

  const travelTo = async (toId) => {
    if (!heroId) return setError('Сначала создайте героя.');
    setError('');
    try {
      const trip = await api.startTravel({ characterId: Number(heroId), fromId: Number(id), toId: Number(toId) });
      // A safe road has no stops, so there is nothing to walk through.
      if (trip.arrived) {
        await api.visitLocation(trip.to.id, Number(heroId)).catch(() => {});
        navigate(`/world/locations/${trip.to.id}`);
      } else navigate(`/travel/${trip.id}`);
    } catch (err) { setError(err.message); }
  };

  // Sail a sea lane to another continent. The voyage is resolved at once (fare,
  // toll, what the water did) and the hero lands at the far port; a battle on
  // the water is seeded there, so the fight screen takes over.
  const sailTo = async (route) => {
    if (!heroId) return setError('Сначала создайте героя.');
    setError(''); setSailing(true);
    try {
      const res = await api.startCrossing({
        characterId: Number(heroId), fromId: Number(id), toId: route.toId,
      });
      setVoyage(res);
      setCrossings((prev) => prev.map((c) => (c.key === route.key ? { ...c, affordable: null } : c)));
      if (res.battleId) navigate(`/battles/${res.battleId}`);
    } catch (err) { setError(err.message); }
    finally { setSailing(false); }
  };

  if (error && !location) return <div className="error">{error}</div>;
  if (!location) return <div className="muted center">Загрузка…</div>;

  // Where the party actually stands. Roads lead out of a place, but the party
  // may only set out from where it is — the server enforces this, and the page
  // says so instead of offering a journey it will refuse.
  const hero = characters.find((c) => String(c.id) === heroId) || null;
  const here = hero ? hero.locationId === Number(id) : false;

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

      {hero && (
        <p className={`muted small ${here ? 'good-tag' : 'warn-tag'}`}>
          {here
            ? `${hero.name}: отряд стоит здесь.`
            : `${hero.name} сейчас в другом месте — из этого места можно только осмотреться, но не выйти.`}
        </p>
      )}

      {found && (
        <div className="card">
          <p className="good-tag">🔑 Найдено: «{found.name}»</p>
          <p className="muted small">{found.description}</p>
        </div>
      )}

      {crossings.length > 0 && (
        <div className="card">
          <h2>Морской путь</h2>
          <p className="muted small">
            Из этого порта уходят корабли на другой континент. Переход длится дни, стоит золота
            и иногда — груза; море решает исход само.
          </p>
          <ul className="stats">
            {crossings.map((c) => (
              <li key={c.key}>
                <span>
                  <b>{c.to}</b>
                  <span className="muted small"> · {c.toContinent} · {c.days} дн · {c.gold} зол.</span>
                  <div className="muted small">
                    {c.dangerLabel}
                    {c.item ? ` · нужен груз: ${c.item.label} ×${c.item.qty}` : ''}
                    {c.affordable && !c.affordable.ok ? ' · не хватает припасов' : ''}
                  </div>
                </span>
                <button
                  type="button"
                  disabled={!here || sailing || (c.affordable ? !c.affordable.ok : false)}
                  title={here ? '' : 'Отряд не здесь'}
                  onClick={() => sailTo(c)}
                >
                  Отплыть
                </button>
              </li>
            ))}
          </ul>
          {!here && <p className="muted small">Отряд не в этом порту — корабли уходят только оттуда, где он стоит.</p>}

          {voyage && (
            <div className="road-arrived">
              <p className="muted small">{voyage.crossing.from} → {voyage.crossing.to} · {voyage.crossing.days} дн</p>
              <p className="road-outcome">{voyage.outcome.text}</p>
              <div className="actions">
                <button type="button" onClick={() => navigate(`/world/locations/${voyage.arrivedAt}`)}>
                  Сойти на берег
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
          {location.connections.length > 0 && (
            <p className="muted small">Дорога занимает время. В пути отряд может встретить попутчиков или беду.</p>
          )}
          <ul className="stats">
            {location.connections.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.toName}</b>
                  {c.minutes != null && <span className="muted small"> · {c.minutes} мин</span>}
                </span>
                <button type="button" disabled={!here} title={here ? '' : 'Отряд не здесь'} onClick={() => travelTo(c.toId)}>В путь</button>
              </li>
            ))}
          </ul>
          {!here && <p className="muted small">Отряд не здесь — «В путь» станет доступно, когда он вернётся.</p>}
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
