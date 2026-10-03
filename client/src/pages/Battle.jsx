import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { abilityIcon, monsterIcon, classColor, Icon } from '../icons.jsx';

const STAT_RU = { attack: 'атака', defense: 'защита', accuracy: 'точность', evasion: 'уклонение', speed: 'скорость' };

function Bar({ value, max, kind }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return <div className="bar"><div className={`fill ${kind}`} style={{ width: `${pct}%` }} /></div>;
}

// Number readout that flashes when its value changes, so damage/healing and
// resource spend are obvious even when the delta is small.
function Stat({ label, value, max }) {
  const [flash, setFlash] = useState('');
  const [delta, setDelta] = useState(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const d = value - prev.current;
    setFlash(d < 0 ? 'drop' : 'gain');
    setDelta(d);
    prev.current = value;
    const t = setTimeout(() => { setFlash(''); setDelta(null); }, 900);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className={`small stat ${flash}`}>
      {label} {value}/{max}
      {delta != null && <span className={`delta ${delta < 0 ? 'drop' : 'gain'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
    </div>
  );
}

// Portrait with the class accent colour, matching the party page.
function Portrait({ c, size = 40 }) {
  const color = c.side === 'enemy' ? '#8a3a3a' : classColor(c.classKey);
  const src = c.portrait;
  const icon = !src && c.side === 'enemy' ? monsterIcon(c.name) : null;
  return (
    <div className="portrait" style={{ width: size, height: size, borderColor: color, background: `${color}1a` }}>
      {src ? <Icon src={src} alt={c.name} size={size - 12} />
        : icon ? <Icon src={icon} alt={c.name} size={size - 12} />
          : <span className="portrait-initial" style={{ fontSize: size * 0.42 }}>{c.name?.[0] || '?'}</span>}
    </div>
  );
}

function CombatantCard({ c, active, selected, onSelect }) {
  const enemy = c.side === 'enemy';
  const clickable = enemy && c.hp > 0 && !!onSelect;
  const role = c.kind === 'leader' ? 'лидер' : c.kind === 'ally' ? 'спутник' : 'враг';
  return (
    <div
      className={`combatant ${c.side} ${active ? 'active' : ''} ${c.hp <= 0 ? 'down' : ''} ${selected ? 'targeted' : ''} ${clickable ? 'clickable' : ''}`}
      onClick={clickable ? () => onSelect(c.key) : undefined}
      role={clickable ? 'button' : undefined}
      title={clickable ? 'Выбрать целью' : undefined}
    >
      <div className="hero-top">
        <Portrait c={c} />
        <div className="combatant-name">
          <b>{c.name}</b>
          <span className="small muted">{role} · ур. {c.level}</span>
        </div>
        {active && <span className="badge">ход</span>}
        {selected && <span className="badge target-badge">цель</span>}
      </div>
      <Stat label="Здоровье" value={c.hp} max={c.maxHp} />
      <Bar value={c.hp} max={c.maxHp} kind="hp" />
      <div className="res-bars">
        {c.maxMana > 0 && <div className="res"><Stat label="Мана" value={c.mana} max={c.maxMana} /><Bar value={c.mana} max={c.maxMana} kind="mana" /></div>}
        {c.maxStamina > 0 && <div className="res"><Stat label="Вын." value={c.stamina} max={c.maxStamina} /><Bar value={c.stamina} max={c.maxStamina} kind="stamina" /></div>}
      </div>
      <div className="small muted">атака {c.base.attack} · защита {c.base.defense} · скор. {c.base.speed}</div>
      {c.buffs.length > 0 && <div className="small muted">{c.buffs.map((b) => `${STAT_RU[b.stat] || b.stat} ${b.amount > 0 ? '+' : ''}${b.amount}`).join(', ')}</div>}
      {c.dots.length > 0 && <div className="small" style={{ color: '#d98a8a' }}>{c.dots.map((d) => d.name).join(', ')}</div>}
    </div>
  );
}

export default function BattlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [battle, setBattle] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('basic');
  const [preview, setPreview] = useState(null);
  const [options, setOptions] = useState(null);
  const [targetKey, setTargetKey] = useState(null);
  const [results, setResults] = useState(null);
  const logRef = useRef(null);

  useEffect(() => { api.getOptions().then(setOptions).catch(() => {}); }, []);

  useEffect(() => {
    api.getBattle(id).then((b) => {
      setBattle(b);
      if (b.result) setResults(b.result);   // keep the report after a reload
    }).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle]);

  const allies = battle?.combatants.filter((c) => c.side === 'player') || [];
  const enemies = battle?.combatants.filter((c) => c.side === 'enemy') || [];
  const livingEnemies = enemies.filter((c) => c.hp > 0);
  const actor = battle?.combatants.find((c) => c.key === battle.activeKey);
  const isLeaderTurn = actor?.kind === 'leader';
  const enemyKeys = livingEnemies.map((c) => c.key).join(',');

  // Reset the chosen ability when a different party member becomes active.
  useEffect(() => { setSelected('basic'); }, [battle?.activeKey]);

  // Default target: first living enemy; keep an explicit pick while it lives.
  useEffect(() => {
    if (!livingEnemies.length) { setTargetKey(null); return; }
    setTargetKey((k) => (k && livingEnemies.some((c) => c.key === k) ? k : livingEnemies[0].key));
  }, [battle?.activeKey, enemyKeys]);

  const myAbilities = useMemo(() => {
    if (!actor || !options || !actor.classKey) return [];
    const klass = options.classes.find((k) => k.key === actor.classKey);
    return (klass?.abilities || []).filter((a) => !a.passive && a.unlockLevel <= actor.level);
  }, [actor, options]);

  // Ask the server for the honest hit chance/damage of the selected ability.
  useEffect(() => {
    if (!battle?.isPlayerTurn || !targetKey) { setPreview(null); return; }
    let alive = true;
    api.preview(id, selected, targetKey)
      .then((p) => { if (alive) setPreview(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [battle?.isPlayerTurn, battle?.activeKey, selected, targetKey, id]);

  const act = async (action) => {
    setBusy(true); setError('');
    try {
      const view = await api.battleAction(id, action);
      setBattle(view);
      if (view.rewards) setResults(view.rewards);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const attack = () => act({ type: 'attack', abilityId: selected === 'basic' ? undefined : selected, targetKey });

  // Where "Назад" leads: back to the location we fought in, else the hero sheet.
  const backTo = battle?.locationId ? `/world/locations/${battle.locationId}` : battle?.characterId ? `/characters/${battle.characterId}` : '/characters';
  const backLabel = battle?.locationId ? '← Назад' : '← Назад к герою';

  if (error && !battle) return <div className="error">{error}</div>;
  if (!battle) return <div className="muted center">Загрузка…</div>;

  const over = !battle.active;
  const won = battle.status === 'won';
  const lost = battle.status === 'lost';
  const fled = battle.status === 'fled';
  const target = enemies.find((e) => e.key === targetKey);

  return (
    <div>
      <Link to={backTo} className="muted">{backLabel}</Link>
      <div className="page-head">
        <h1>Бой отрядом</h1>
        <span className="badge">Раунд {battle.round}</span>
        <span className="badge">{allies.filter((c) => c.hp > 0).length} из {allies.length} в строю</span>
      </div>
      {error && <div className="error">{error}</div>}

      {!over && actor && (
        <div className={`turn-banner ${actor.side}`}>
          {actor.side === 'player'
            ? <span>Ваш ход: <b>{actor.name}</b>{actor.kind === 'ally' ? ' (спутник)' : ' (лидер)'} — выберите способность и цель</span>
            : <span>Ход противника…</span>}
        </div>
      )}

      <h2 className="side-title">Отряд</h2>
      <div className="arena">
        {allies.map((c) => <CombatantCard key={c.key} c={c} active={c.key === battle.activeKey && !over} />)}
      </div>

      <h2 className="side-title">Противники</h2>
      <div className="arena">
        {enemies.map((c) => (
          <CombatantCard key={c.key} c={c} active={c.key === battle.activeKey && !over}
            selected={c.key === targetKey && c.hp > 0 && !over} onSelect={setTargetKey} />
        ))}
      </div>

      {over && (
        <div className="card reward">
          <h2>{won ? '🏆 Победа!' : lost ? '💀 Поражение' : '🏃 Отступление'}</h2>
          <p>
            {won && `Получено ${battle.rewardXp} опыта и ${battle.rewardGold} золота.`}
            {lost && `Вы уходите с единственным очком здоровья${results?.goldLost ? ` и теряете ${results.goldLost} золота` : ''}.`}
            {fled && 'Вы покинули поле боя.'}
          </p>

          {results?.leveledUp && <p className="good-tag">Лидер поднял уровень!</p>}

          {results?.members?.length > 0 && (
            <div className="results-block">
              <div className="small muted">Спутники</div>
              <ul className="stats">
                {results.members.map((m) => (
                  <li key={m.id}>
                    <span>{m.name}</span>
                    <b className={m.dead ? 'dead-tag' : ''}>{m.dead ? 'погиб' : `${m.hp} HP${m.leveledUp ? ' · новый уровень!' : ''}`}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results?.fallen?.length > 0 && (
            <p className="dead-tag">Павшие навсегда: {results.fallen.map((f) => f.name).join(', ')}. Их можно вернуть лишь ритуалом воскрешения.</p>
          )}

          <div className="actions">
            <button type="button" className="btn" onClick={() => navigate(backTo)}>{backLabel}</button>
          </div>
        </div>
      )}

      {!over && (
        <>
          <div className="abilities-bar">
            <button type="button" className={`ability-btn ${selected === 'basic' ? 'selected' : ''}`}
              onClick={() => setSelected('basic')}>
              ⚔️ Атака<span className="cost">Без затрат</span>
            </button>
            {myAbilities.map((a) => {
              const cd = actor?.cooldowns?.[a.id];
              const blocked = !!cd;
              const lacks = (a.resource === 'mana' && actor.mana < a.cost) || (a.resource === 'stamina' && actor.stamina < a.cost);
              return (
                <button key={a.id} type="button" disabled={blocked}
                  className={`ability-btn ${selected === a.id ? 'selected' : ''}`}
                  onClick={() => setSelected(a.id)} title={a.description}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Icon src={abilityIcon(a)} alt={a.name} size={20} /> {a.name}
                  </span>
                  <span className="cost">{a.cost > 0 ? `${a.cost} ${a.resource === 'mana' ? 'маны' : 'выносливости'}${lacks ? ' (мало)' : ''}` : 'без затрат'}{cd ? ` · перезарядка ${cd}` : ''}</span>
                </button>
              );
            })}
          </div>

          <div className="actions">
            <button type="button" disabled={busy || !battle.isPlayerTurn || !targetKey} onClick={attack}>
              {preview?.kind === 'attack' ? `Ударить ${target?.name} (${preview.chance}% · ~${preview.damage})` : 'Применить способность'}
            </button>
            {isLeaderTurn && (
              <button type="button" className="danger" disabled={busy || !battle.isPlayerTurn}
                onClick={() => act({ type: 'flee' })}>🏃 Бежать</button>
            )}
            {!battle.isPlayerTurn && <span className="muted">Ход противника…</span>}
          </div>
        </>
      )}

      <div className="card">
        <h2>Хроника</h2>
        <div className="log" ref={logRef}>
          {battle.log.map((e, i) => <div key={i} className={`logline ${e.type}`}>{e.text}</div>)}
        </div>
      </div>
    </div>
  );
}
