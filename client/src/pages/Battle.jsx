import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { abilityIcon, monsterIcon, Icon } from '../icons.jsx';

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

function CombatantCard({ c, active }) {
  const icon = c.side === 'enemy' ? monsterIcon(c.name) : null;
  return (
    <div className={`combatant ${c.side} ${active ? 'active' : ''} ${c.hp <= 0 ? 'down' : ''}`}>
      <div className="hero-top">
        <b style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {icon && <Icon src={icon} alt={c.name} size={26} />}
          {c.name}
        </b>
        {active && <span className="badge">ход</span>}
      </div>
      <div className="small muted">Ур. {c.level}</div>
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
  const [battle, setBattle] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('basic');
  const [preview, setPreview] = useState(null);
  const [options, setOptions] = useState(null);
  const logRef = useRef(null);

  useEffect(() => { api.getOptions().then(setOptions).catch(() => {}); }, []);

  const load = () => api.getBattle(id).then(setBattle).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle]);

  const player = battle?.combatants.find((c) => c.side === 'player');
  const enemies = battle?.combatants.filter((c) => c.side === 'enemy') || [];
  const target = enemies.find((c) => c.hp > 0);
  const actor = battle?.combatants.find((c) => c.key === battle.activeKey);

  const myAbilities = useMemo(() => {
    if (!player || !options) return [];
    const klass = options.classes.find((k) => k.key === player.classKey);
    return (klass?.abilities || []).filter((a) => !a.passive && a.unlockLevel <= player.level);
  }, [player, options]);

  // Ask the server for the honest hit chance/damage of the selected ability.
  useEffect(() => {
    if (!battle?.isPlayerTurn || !target) { setPreview(null); return; }
    let alive = true;
    api.preview(id, selected, target.key)
      .then((p) => { if (alive) setPreview(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [battle?.isPlayerTurn, selected, target?.key, id]);

  const act = async (action) => {
    setBusy(true); setError('');
    try { setBattle(await api.battleAction(id, action)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const attack = () => act({ type: 'attack', abilityId: selected === 'basic' ? undefined : selected, targetKey: target?.key });

  if (error && !battle) return <div className="error">{error}</div>;
  if (!battle) return <div className="muted center">Загрузка…</div>;

  const over = !battle.active;
  const won = battle.status === 'won';

  return (
    <div>
      <Link to="/characters" className="muted">← Герои</Link>
      <div className="page-head">
        <h1>Бой</h1>
        <span className="badge">Раунд {battle.round}</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="arena">
        {battle.combatants.map((c) => <CombatantCard key={c.key} c={c} active={c.key === battle.activeKey && !over} />)}
      </div>

      {over && (
        <div className="card reward">
          {won
            ? `🏆 Победа! +${battle.rewardXp} опыта, +${battle.rewardGold} золота.`
            : battle.status === 'lost'
              ? `💀 Поражение… вы уходите с единственным очком здоровья${battle.rewards?.goldLost ? ` и теряете ${battle.rewards.goldLost} золота` : ''}.`
              : 'Вы покинули поле боя.'}
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
              const lacks = (a.resource === 'mana' && player.mana < a.cost) || (a.resource === 'stamina' && player.stamina < a.cost);
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
            <button type="button" disabled={busy || !battle.isPlayerTurn} onClick={attack}>
              {preview?.kind === 'attack' ? `Удар (${preview.chance}% · ~${preview.damage} урона)` : 'Применить способность'}
            </button>
            <button type="button" className="danger" disabled={busy || !battle.isPlayerTurn}
              onClick={() => act({ type: 'flee' })}>🏃 Бежать</button>
            {!battle.isPlayerTurn && <span className="muted">Ход противника…</span>}
          </div>
        </>
      )}

      {over && <div className="actions"><Link className="btn" to="/characters">К героям</Link></div>}

      <div className="card">
        <h2>Хроника</h2>
        <div className="log" ref={logRef}>
          {battle.log.map((e, i) => <div key={i} className={`logline ${e.type}`}>{e.text}</div>)}
        </div>
      </div>
    </div>
  );
}
