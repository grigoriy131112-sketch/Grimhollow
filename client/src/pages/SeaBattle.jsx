import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import SceneBackdrop from '../scenes.jsx';

// W-SEA: the sea battle. The fight is between ships (hull + guns) and, for
// pirates, the crews aboard them. It reuses the same honest, diceless shape as
// the land arena: each action shows a hit chance and a damage estimate, and an
// event feed drives small floating numbers.
function Bar({ label, hp, maxHp, tone }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="sea-bar">
      <div className="sea-bar-top"><span>{label}</span><span>{hp}/{maxHp}</span></div>
      <div className={`bar ${tone}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function SeaBattlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState(null);
  const [preview, setPreview] = useState(null);
  const [action, setAction] = useState('broadside');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState([]);

  const load = () => api.getNavalBattle(id).then(setView).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!view || view.over) { setPreview(null); return; }
    api.navalPreview(id, action).then(setPreview).catch(() => setPreview(null));
  }, [id, action, view?.round, view?.isPlayerTurn]);

  const act = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.navalAction(id, { type: action });
      setView(res);
      setFeed((res.events || []).map((e) => e.text).filter(Boolean));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const flee = async () => {
    setBusy(true); setError('');
    try { setView(await api.fleeNaval(id)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !view) return <div className="error">{error}</div>;
  if (!view) return <div className="muted center">Загрузка…</div>;

  const { player: p, enemy: e } = view;
  const won = view.winner === 'player';
  const lost = view.winner === 'enemy';

  return (
    <div>
      <Link to={`/papers/${view.characterId}`} className="muted">← Судовой журнал</Link>
      <div className="scene-hero">
        <SceneBackdrop scene="sea" biome="coast" danger={3} name={e.name} />
        <div className="scene-caption">
          <h1>{view.kind === 'pirates' ? 'Абордаж' : 'Морской бой'}</h1>
          <p className="muted">{e.name} · ярус {view.tier} · раунд {view.round}</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="sea-arena two">
        <div className="sea-side">
          <h3>🛞 {p.name}</h3>
          <Bar label="Корпус" hp={p.hull.hp} maxHp={p.hull.maxHp} tone="good" />
          {p.crew && <Bar label={`Команда (${p.crew.count})`} hp={p.crew.hp} maxHp={p.crew.maxHp} tone="mana" />}
          <p className="muted small">
            {p.guns ? `Орудий: ${p.guns.count} · залп ${p.guns.damage}` : ''}
            {p.ram ? ` · таран ${p.ram}` : ''}
          </p>
        </div>
        <div className="sea-side">
          <h3>🏴 {e.name}</h3>
          <Bar label="Корпус" hp={e.hull.hp} maxHp={e.hull.maxHp} tone="bad" />
          {e.crew && <Bar label={`Команда (${e.crew.count})`} hp={e.crew.hp} maxHp={e.crew.maxHp} tone="mana" />}
          <p className="muted small">
            {e.guns && e.guns.count ? `Орудий: ${e.guns.count} · залп ${e.guns.damage}` : `Удар: ${e.attack}`}
          </p>
        </div>
      </div>

      {feed.length > 0 && (
        <ul className="sea-feed">
          {feed.map((t, i) => <li key={i} className="muted small">{t}</li>)}
        </ul>
      )}

      {!view.over && (
        <div className="card">
          <div className="actions">
            {view.actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === action ? 'primary' : ''}
                disabled={busy || !view.isPlayerTurn}
                onClick={() => setAction(a)}
              >
                {a === 'broadside' ? 'Залп' : a === 'board' ? 'Абордаж' : 'Таран'}
              </button>
            ))}
          </div>
          {preview && (
            <p className="ability-detail muted small">
              Шанс попадания: <b>{preview.hitChance}%</b>
              {preview.damage ? <> · урон ≈ <b>{preview.damage}</b></> : null}
              {preview.disabled ? ` · ${preview.reason}` : ''}
            </p>
          )}
          <div className="actions">
            <button type="button" className="danger" disabled={busy || !view.isPlayerTurn} onClick={act}>Ход</button>
            <button type="button" disabled={busy || !view.isPlayerTurn} onClick={flee}>Уйти</button>
          </div>
          {!view.isPlayerTurn && <p className="muted">Ход противника…</p>}
        </div>
      )}

      {view.over && (
        <div className="card">
          <h2>{won ? '🏆 Победа на море' : '💀 Поражение на море'}</h2>
          {view.result?.shipPoints != null && <p className="good-tag">Корабль получает +{view.result.points} очков (всего {view.result.shipPoints}).</p>}
          {view.result?.gold ? <p className="muted">Добыча: {view.result.gold} золота, {view.result.xp} опыта.</p> : null}
          {lost && <p className="muted">Корабль уцелел, но отряд едва отошёл.</p>}
          <div className="actions">
            <button type="button" onClick={() => navigate(`/papers/${view.characterId}`)}>В судовой журнал</button>
          </div>
        </div>
      )}
    </div>
  );
}
