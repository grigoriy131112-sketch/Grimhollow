import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { abilityIcon, monsterIcon, Icon } from '../icons.jsx';

export default function CharacterSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [monsters, setMonsters] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCharacter(id).then(setCharacter).catch((e) => setError(e.message));
    api.listMonsters().then(setMonsters).catch(() => {});
  }, [id]);

  const startFight = async (monsterId) => {
    setError('');
    try {
      const battle = await api.startBattle({ characterId: Number(id), monsterId });
      navigate(`/battles/${battle.id}`);
    } catch (err) { setError(err.message); }
  };

  if (error && !character) return <div className="error">{error}</div>;
  if (!character) return <div className="muted center">Загрузка…</div>;

  const s = character.stats;
  const pct = (v, m) => Math.max(0, Math.round((v / m) * 100));
  const byLevel = character.abilities.reduce((acc, a) => {
    (acc[a.unlockLevel] ||= []).push(a); return acc;
  }, {});

  return (
    <div>
      <Link to="/characters" className="muted">← Все герои</Link>
      <div className="page-head">
        <h1>{character.name}</h1>
        <span className="badge">{character.level} уровень · {character.className}</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div className="card">
          <h2>Состояние</h2>
          <div className="res">
            <div className="small">Здоровье {character.hp}/{s.maxHp}</div>
            <div className="bar"><div className="fill hp" style={{ width: `${pct(character.hp, s.maxHp)}%` }} /></div>
          </div>
          <div className="res-bars">
            <div className="res">
              <div className="small">Мана {character.mana}/{s.maxMana}</div>
              <div className="bar"><div className="fill mana" style={{ width: `${pct(character.mana, s.maxMana)}%` }} /></div>
            </div>
            <div className="res">
              <div className="small">Выносливость {character.stamina}/{s.maxStamina}</div>
              <div className="bar"><div className="fill stamina" style={{ width: `${pct(character.stamina, s.maxStamina)}%` }} /></div>
            </div>
          </div>
          <ul className="stats">
            <li><span>Атака</span><b>{s.attack}</b></li>
            <li><span>Защита</span><b>{s.defense}</b></li>
            <li><span>Точность</span><b>{s.accuracy}</b></li>
            <li><span>Уклонение</span><b>{s.evasion}</b></li>
            <li><span>Скорость</span><b>{s.speed}</b></li>
            <li><span>Опыт</span><b>{character.xp}{character.xpToNext != null ? ` / ${character.xp + character.xpToNext}` : ' (макс.)'}</b></li>
            <li><span>Золото</span><b>{character.gold}</b></li>
          </ul>
        </div>

        <div className="card">
          <h2>Способности</h2>
          {Object.entries(byLevel).map(([lvl, list]) => (
            <div key={lvl} style={{ marginBottom: '0.6rem' }}>
              <div className="small muted">{lvl} уровень</div>
              {list.map((a) => (
                <div key={a.id} style={{ margin: '0.2rem 0', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Icon src={abilityIcon(a)} alt={a.name} size={24} />
                  <div>
                    <b>{a.name}</b>
                    {a.passive && <span className="badge" style={{ marginLeft: '0.4rem' }}>пассивно</span>}
                    <div className="small muted">{a.description}
                      {!a.passive && (a.cost > 0 || a.cooldown > 0) && (
                        <> — {a.cost > 0 ? `${a.cost} ${a.resource === 'mana' ? 'маны' : 'выносливости'}` : 'без затрат'}{a.cooldown > 0 ? `, перезарядка ${a.cooldown} хода` : ''}</>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Охота</h2>
        <p className="muted small">Уровни 1–5 открываются по мере накопления опыта. Сражайтесь с кем угодно — победа даёт опыт и золото.</p>
        <div className="monster-list">
          {monsters.map((m) => (
            <div className="monster-row" key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px dashed var(--line)' }}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <Icon src={monsterIcon(m.name)} alt={m.name} size={34} />
                <div>
                  <b>{m.name}</b> <span className="muted small">Ур. {m.level} · {m.max_hp} HP · атака {m.attack} · +{m.xp_reward} опыта</span>
                  <div className="small muted">{m.description}</div>
                </div>
              </div>
              <button type="button" onClick={() => startFight(m.id)}>Сражаться</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
