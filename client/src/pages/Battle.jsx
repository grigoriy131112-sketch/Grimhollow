import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { abilityIcon, monsterIcon, classColor, Icon } from '../icons.jsx';
import SceneBackdrop from '../scenes.jsx';
import { mapSfx, playSfx } from '../audio.js';

const STAT_RU = { attack: 'атака', defense: 'защита', accuracy: 'точность', evasion: 'уклонение', speed: 'скорость' };

function Bar({ value, max, kind }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return <div className="bar"><div className={`fill ${kind}`} style={{ width: `${pct}%` }} /></div>;
}

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

function Portrait({ c, size = 74 }) {
  const color = c.side === 'enemy' ? '#8a3a3a' : classColor(c.classKey);
  const src = c.portrait || (c.side === 'enemy' ? monsterIcon(c.name) : null);
  return (
    <div className="unit-frame" style={{ '--accent': color }}>
      {src ? <Icon src={src} alt={c.name} size={size - 20} />
        : <span className="portrait-initial" style={{ fontSize: size * 0.36 }}>{c.name?.[0] || '?'}</span>}
    </div>
  );
}

// A single fighter on the arena stage: sprite, bars, and transient hit/heal
// feedback driven by the events of the last action.
function Unit({ c, active, selected, feedback, onSelect }) {
  const enemy = c.side === 'enemy';
  const clickable = enemy && c.hp > 0 && !!onSelect;
  const role = c.kind === 'leader' ? 'лидер' : c.kind === 'ally' ? 'спутник' : 'враг';
  const fb = feedback[c.key];
  const cls = ['unit', c.side, active ? 'active' : '', c.hp <= 0 ? 'down' : '', selected ? 'targeted' : '',
    clickable ? 'clickable' : '', fb?.kind || ''].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={clickable ? () => onSelect(c.key) : undefined}
      role={clickable ? 'button' : undefined} title={clickable ? 'Выбрать целью' : undefined}>
      {fb?.amount != null && <span className={`float-num ${fb.kind}`}>{fb.kind === 'heal' ? '+' : '−'}{fb.amount}</span>}
      {fb?.kind === 'miss' && <span className="float-num miss">мимо</span>}
      <div className="unit-badges">
        {active && <span className="badge">ход</span>}
        {selected && <span className="badge target-badge">цель</span>}
      </div>
      <Portrait c={c} />
      <span className="unit-name"><b>{c.name}</b></span>
      <span className="unit-sub muted">{role} · ур. {c.level}</span>
      <Stat label="HP" value={c.hp} max={c.maxHp} />
      <Bar value={c.hp} max={c.maxHp} kind="hp" />
      <div className="res-bars">
        {c.maxMana > 0 && <div className="res"><Bar value={c.mana} max={c.maxMana} kind="mana" /></div>}
        {c.maxStamina > 0 && <div className="res"><Bar value={c.stamina} max={c.maxStamina} kind="stamina" /></div>}
      </div>
      {c.buffs.length > 0 && <div className="unit-sub muted">{c.buffs.map((b) => `${STAT_RU[b.stat] || b.stat} ${b.amount > 0 ? '+' : ''}${b.amount}`).join(', ')}</div>}
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
  const [feedback, setFeedback] = useState({});
  const [flash, setFlash] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { api.getOptions().then(setOptions).catch(() => {}); }, []);

  useEffect(() => {
    api.getBattle(id).then((b) => {
      setBattle(b);
      if (b.result) setResults(b.result);
    }).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [battle]);

  const allies = battle?.combatants.filter((c) => c.side === 'player') || [];
  const enemies = battle?.combatants.filter((c) => c.side === 'enemy') || [];
  const livingEnemies = enemies.filter((c) => c.hp > 0);
  const actor = battle?.combatants.find((c) => c.key === battle.activeKey);
  const isLeaderTurn = actor?.kind === 'leader';
  const enemyKeys = livingEnemies.map((c) => c.key).join(',');

  useEffect(() => { setSelected('basic'); }, [battle?.activeKey]);

  useEffect(() => {
    if (!livingEnemies.length) { setTargetKey(null); return; }
    setTargetKey((k) => (k && livingEnemies.some((c) => c.key === k) ? k : livingEnemies[0].key));
  }, [battle?.activeKey, enemyKeys]);

  const myAbilities = useMemo(() => {
    if (!actor || !options || !actor.classKey) return [];
    const klass = options.classes.find((k) => k.key === actor.classKey);
    return (klass?.abilities || []).filter((a) => !a.passive && a.unlockLevel <= actor.level);
  }, [actor, options]);

  useEffect(() => {
    if (!battle?.isPlayerTurn || !targetKey) { setPreview(null); return; }
    let alive = true;
    api.preview(id, selected, targetKey).then((p) => { if (alive) setPreview(p); }).catch(() => {});
    return () => { alive = false; };
  }, [battle?.isPlayerTurn, battle?.activeKey, selected, targetKey, id]);

  // Turn the engine's event stream into per-unit feedback and an impact flash.
  const showFeedback = (events) => {
    const map = {};
    let impact = false;
    for (const e of events) {
      if (e.type === 'hit' && e.target) { map[e.target] = { kind: 'dmg', amount: e.damage }; impact = true; }
      else if (e.type === 'heal') { const k = e.actor || e.target; if (k) map[k] = { kind: 'heal', amount: null }; }
      else if (e.type === 'miss' && e.target) { map[e.target] = { kind: 'miss' }; }
      else if (e.type === 'down' && e.target) { map[e.target] = { kind: 'dmg', amount: null }; impact = true; }
    }
    setFeedback(map);
    mapSfx(events).forEach((s) => playSfx(s));
    if (impact) { setFlash(true); setTimeout(() => setFlash(false), 360); }
    setTimeout(() => setFeedback({}), 1100);
  };

  const act = async (action) => {
    setBusy(true); setError('');
    try {
      const view = await api.battleAction(id, action);
      if (view.events) showFeedback(view.events);
      setBattle(view);
      if (view.rewards) {
        setResults(view.rewards);
        if (view.rewards.status === 'won') {
          playSfx('level_up');
          if (view.rewards.goldGained) playSfx('coin');
          if (view.rewards.revived) playSfx('loot');
        } else if (view.rewards.status === 'lost') {
          playSfx('death');
        }
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const attack = () => act({ type: 'attack', abilityId: selected === 'basic' ? undefined : selected, targetKey });

  const backTo = battle?.locationId ? `/world/locations/${battle.locationId}` : battle?.characterId ? `/characters/${battle.characterId}` : '/characters';
  const backLabel = battle?.locationId ? '← Назад' : '← Назад к герою';
  const selectedAbility = selected === 'basic' ? null : myAbilities.find((a) => a.id === selected);

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
        <h1>{battle.kind === 'death_realm' ? '🕯 Царство мёртвых' : 'Бой отрядом'}</h1>
        <span className="badge">Раунд {battle.round}</span>
        <span className="badge">{allies.filter((c) => c.hp > 0).length} из {allies.length} в строю</span>
      </div>
      {battle.kind === 'death_realm' && (
        <p className="muted small">Победите пастуха — и он отпустит павшего спутника обратно к свету.</p>
      )}
      {error && <div className="error">{error}</div>}

      {!over && actor && (
        <div className={`turn-banner ${actor.side}`}>
          {actor.side === 'player'
            ? <span>Ваш ход: <b>{actor.name}</b>{actor.kind === 'ally' ? ' (спутник)' : ' (лидер)'} — выберите способность и цель</span>
            : <span>Ход противника…</span>}
        </div>
      )}

      <div className="arena-stage">
        {battle.location && <SceneBackdrop scene={battle.location.scene} biome={battle.location.biome} danger={battle.location.danger} name={battle.location.name} />}
        <div className={`arena-flash ${flash ? 'on' : ''}`} />
        <div className="arena-stage-inner">
          <span className="squad-label left">Отряд</span>
          <div className="squad">
            {allies.map((c) => (
              <Unit key={c.key} c={c} active={c.key === battle.activeKey && !over} feedback={feedback} />
            ))}
          </div>
          <span className="vs-mark">⚔</span>
          <div className="squad enemy">
            {enemies.map((c) => (
              <Unit key={c.key} c={c} active={c.key === battle.activeKey && !over}
                selected={c.key === targetKey && c.hp > 0 && !over} feedback={feedback} onSelect={setTargetKey} />
            ))}
          </div>
          <span className="squad-label right">Противники</span>
        </div>
      </div>

      {over && (
        <div className="card reward">
          <h2>{results?.leaderDead ? '🪦 Герой пал' : won ? '🏆 Победа!' : lost ? '💀 Поражение' : '🏃 Отступление'}</h2>
          <p>
            {won && `Получено ${battle.rewardXp} опыта и ${battle.rewardGold} золота.`}
            {results?.leaderDead
              ? 'Отряд полёг целиком. Некому было вытащить героя — он остался в этом бою навсегда.'
              : lost && `Вы уходите с единственным очком здоровья${results?.goldLost ? ` и теряете ${results.goldLost} золота` : ''}.`}
            {fled && 'Вы покинули поле боя.'}
          </p>
          {results?.leveledUp && <p className="good-tag">Лидер поднял уровень!</p>}
          {results?.pointsGained > 0 && (
            <p className="good-tag">Получено ✦ {results.pointsGained} Очко(в) отряда.</p>
          )}
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
          {results?.revived && (
            <>
              <p className="good-tag">✨ {results.revived.name} вырван(а) из царства мёртвых и снова в строю!</p>
              {results.revival?.witnesses?.length > 0 && (
                <p className="muted small">
                  Видели, как вы шли в смерть за своим: {results.revival.witnesses.map((w) => w.name).join(', ')} — их отношение к вам выросло.
                </p>
              )}
            </>
          )}
          {results?.loot && (results.loot.gold > 0 || results.loot.items?.length > 0) && (
            <p className="good-tag">
              🎁 Добыча: {results.loot.gold > 0 ? `${results.loot.gold} золота` : ''}
              {results.loot.items?.length > 0
                ? `${results.loot.gold > 0 ? ' · ' : ''}${results.loot.items.map((it) => `${it.name || it.key}${it.qty > 1 ? ` ×${it.qty}` : ''}`).join(', ')}`
                : ''}
            </p>
          )}
          {results?.fallen?.length > 0 && (
            <p className="dead-tag">Павшие навсегда: {results.fallen.map((f) => f.name).join(', ')}. Их можно вернуть лишь ритуалом воскрешения.</p>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={() => navigate(backTo)}>{backLabel}</button>
            {results?.leaderDead && (
              <button type="button" className="btn" onClick={() => navigate('/characters')}>Выбрать другого героя</button>
            )}
          </div>
        </div>
      )}

      {!over && (
        <>
          <div className="abilities-bar">
            <button type="button" className={`ability-btn ${selected === 'basic' ? 'selected' : ''}`} onClick={() => setSelected('basic')}>
              ⚔️ Атака<span className="cost">Без затрат</span>
            </button>
            {myAbilities.map((a) => {
              const cd = actor?.cooldowns?.[a.id];
              const lacks = (a.resource === 'mana' && actor.mana < a.cost) || (a.resource === 'stamina' && actor.stamina < a.cost);
              return (
                <button key={a.id} type="button" disabled={!!cd}
                  className={`ability-btn ${selected === a.id ? 'selected' : ''}`}
                  onClick={() => setSelected(a.id)} title={a.description}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Icon src={abilityIcon(a)} alt={a.name} size={20} /> {a.name}
                  </span>
                  <span className="ability-desc">{a.description}</span>
                  <span className="cost">{a.cost > 0 ? `${a.cost} ${a.resource === 'mana' ? 'маны' : 'выносливости'}${lacks ? ' (мало)' : ''}` : 'без затрат'}{cd ? ` · перезарядка ${cd}` : ''}</span>
                </button>
              );
            })}
          </div>

          <div className="ability-detail">
            {selectedAbility ? (
              <>
                <div className="ability-detail-head">
                  <Icon src={abilityIcon(selectedAbility)} alt={selectedAbility.name} size={22} />
                  <b>{selectedAbility.name}</b>
                  <span className="muted small">
                    {selectedAbility.cost > 0
                      ? `${selectedAbility.cost} ${selectedAbility.resource === 'mana' ? 'маны' : 'выносливости'}`
                      : 'без затрат'}
                    {selectedAbility.cooldown > 0 ? ` · перезарядка ${selectedAbility.cooldown}` : ''}
                  </span>
                </div>
                <p className="small">{selectedAbility.description}</p>
                {preview?.kind === 'attack' && (
                  <p className="small">
                    Шанс попадания <b>{preview.chance}%</b> · урон ~<b>{preview.damage}</b>
                  </p>
                )}
              </>
            ) : (
              <p className="muted small">Обычная атака без затрат ресурсов.</p>
            )}
          </div>

          <div className="actions">
            <button type="button" disabled={busy || !battle.isPlayerTurn || !targetKey} onClick={attack}>
              {preview?.kind === 'attack' ? `Ударить ${target?.name} (${preview.chance}% · ~${preview.damage})` : 'Применить способность'}
            </button>
            {isLeaderTurn && (
              <button type="button" className="danger" disabled={busy || !battle.isPlayerTurn} onClick={() => act({ type: 'flee' })}>🏃 Бежать</button>
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
