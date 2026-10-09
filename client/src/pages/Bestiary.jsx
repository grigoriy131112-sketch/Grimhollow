import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon, monsterIcon } from '../icons.jsx';

// The Bestiary (Wave W-BESTIARY) — the Codex chapter that catalogues everything
// that hunts the roads and wilds. Every monster the party can meet is drawn from
// the same seeded rows the fights use, grouped into the lore's three tiers, with
// the places it is known to haunt. A hero can be picked to hunt one on the spot.

export default function BestiaryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.getBestiary().then(setData).catch((e) => setError(e.message));
    api.listCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length) setHeroId(String(list[0].id));
      })
      .catch(() => {});
  }, []);

  const hunt = async (monster) => {
    if (!heroId) { setError('Сначала создайте героя.'); return; }
    setError(''); setBusyId(monster.id);
    try {
      const battle = await api.startBattle({ characterId: Number(heroId), monsterId: monster.id });
      navigate(`/battles/${battle.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  };

  const total = data?.count ?? 0;
  const tiers = useMemo(() => data?.tiers || [], [data]);

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <div className="muted center">Загрузка бестиария…</div>;

  return (
    <div>
      <div className="page-head">
        <h1>Бестиарий</h1>
        <span className="badge">{total} тварей</span>
      </div>
      <p className="muted">
        Всё, что осталось от стёртых, и всё, что ещё помнит себя. Три яруса ужаса: бытовой,
        ремесленный и божественный. Имя помнит тот, кто держит книгу — здесь записаны все,
        кого отряд может встретить на дорогах и в глуши.
      </p>

      {characters.length > 0 ? (
        <label className="bestiary-hunt">
          Охотиться:
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name} (Ур. {c.level} {c.className})</option>)}
          </select>
        </label>
      ) : (
        <p className="muted small">Создайте героя, чтобы отправиться на охоту прямо из бестиария.</p>
      )}
      {error && <div className="error">{error}</div>}

      {tiers.map((tier) => (
        <section className="bestiary-tier" key={tier.label}>
          <div className="bestiary-tier-head">
            <h2>{tier.label}</h2>
            <span className="muted small">уровни {tier.levelMin}–{tier.levelMax} · {tier.monsters.length} записей</span>
          </div>
          <div className="bestiary-list">
            {tier.monsters.map((m) => (
              <article className={`bestiary-entry${m.titled ? ' titled' : ''}`} key={m.id}>
                <span className="bestiary-face">
                  {m.portrait ? <Icon src={m.portrait} alt={m.name} size={34} />
                    : <Icon src={monsterIcon(m.name)} alt={m.name} size={34} />}
                </span>
                <div className="bestiary-body">
                  <div className="bestiary-name">
                    <b>{m.name}</b>
                    {m.titled && <span className="chip trait minus">титул</span>}
                    <span className="muted small">Ур. {m.level} · {m.className}</span>
                  </div>
                  <p className="muted small">{m.description}</p>
                  <div className="muted small">
                    {m.maxHp} HP · атака {m.attack} · защита {m.defense} · точн. {m.accuracy} · уклон {m.evasion} · скор. {m.speed}
                    {' · '}+{m.xpReward} опыта{m.goldReward ? ` · ${m.goldReward} золота` : ''}
                  </div>
                  {m.haunts.length > 0 && (
                    <div className="muted small">Водится: {m.haunts.join(', ')}</div>
                  )}
                </div>
                {characters.length > 0 && (
                  <button type="button" disabled={busyId === m.id} onClick={() => hunt(m)}>
                    {busyId === m.id ? '…' : 'Сразиться'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
