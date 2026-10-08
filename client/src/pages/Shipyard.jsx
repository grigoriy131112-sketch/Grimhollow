import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

// mm:ss from milliseconds.
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ShipNode({ node, points, atPort, busy, onForge }) {
  const affordable = points >= node.nextCost;
  const state = node.maxed ? 'maxed' : node.canForge ? 'ready' : 'locked';
  return (
    <div className={`upg-node ${state}`}>
      <div className="upg-node-top">
        <b>{node.name}</b>
        <span className="upg-rank">ур. {node.rank}/{node.maxRank}</span>
      </div>
      <p className="muted small">{node.blurb}</p>
      {node.classes && (
        <p className="muted small">
          Классы: {node.classes.includes('*') ? 'любой' : node.classes.join(', ')}
          {!node.mannable && ' — нет в отряде'}
        </p>
      )}
      <div className="upg-node-foot">
        <span className="upg-cost" title="Стоимость следующего уровня (растёт)">
          {node.maxed ? 'готово' : `✦ ${node.nextCost} · ${node.nextMinutes} мин`}
        </span>
        {!node.maxed && (
          <button
            type="button"
            className="btn small"
            disabled={!node.canForge || busy}
            title={node.reason || (!affordable ? 'Не хватает очков корабля.' : '')}
            onClick={() => onForge({ key: node.key })}
          >
            Улучшить
          </button>
        )}
      </div>
      {node.reason && !node.maxed && <p className="upg-reason small">{node.reason}</p>}
    </div>
  );
}

export default function ShipyardPage() {
  const { characterId } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hired, setHired] = useState(false);
  const [name, setName] = useState('');
  const [, setNowTick] = useState(0);
  // When the current view was fetched, so the dock countdown is measured from it
  // (not from the page mount, which would undercount after a refetch).
  const fetchedAtRef = useRef(Date.now());

  const load = () => api.getShip(characterId)
    .then((v) => { fetchedAtRef.current = Date.now(); setView(v); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [characterId]);

  // While a job is on the dock, tick every second; when it lands, reload.
  useEffect(() => {
    if (!view?.work) return undefined;
    const startedAt = Date.now();
    const baseRemaining = view.work.remainingMs;
    const timer = setInterval(() => {
      setNowTick((n) => n + 1);
      if (baseRemaining - (Date.now() - startedAt) <= 0) { clearInterval(timer); load(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [view]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { const v = await fn(); fetchedAtRef.current = Date.now(); setView(v); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // `remainingMs` was measured when this view was fetched; count down from it.
  const remaining = () => {
    const w = view?.work;
    if (!w) return 0;
    return Math.max(0, w.remainingMs - (Date.now() - fetchedAtRef.current));
  };

  if (error && !view) return <div className="error">{error}</div>;
  if (!view) return <div className="muted center">Загрузка…</div>;

  const { owned, atPort, inPortName, level, maxLevel, points, gold, gunSlots, cap, work, branches } = view;

  return (
    <div className="shipyard">
      <Link to={`/characters/${characterId}`} className="muted">← К герою</Link>
      <h2>Верфь{inPortName ? ` · ${inPortName}` : ''}</h2>

      {error && <div className="error">{error}</div>}

      <div className="ship-strip">
        <span className="good-tag">Уровень корабля {level}/{maxLevel}</span>
        <span>✦ очки корабля: <b>{points}</b></span>
        <span>🪙 золото: <b>{gold}</b></span>
        {owned && <span>слоты пушек: <b>{gunSlots}</b> · потолок: <b>{cap}</b></span>}
        <span className={atPort ? 'good-tag' : 'warn-tag'}>
          {atPort ? 'Вы в порту' : 'Вы не в порту'}
        </span>
      </div>

      {!owned && (
        <div className="card">
          <h3>Купить корабль</h3>
          <p className="muted">Корабль покупается в порту за золото и ждёт вас здесь.</p>
          {atPort ? (
            <div className="row">
              <input
                className="input"
                placeholder="Название корабля"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || gold < view.price}
                onClick={() => run(() => api.buyShip(characterId, name))}
              >
                Купить за {view.price} золота
              </button>
            </div>
          ) : (
            <p className="warn-tag">Корабль продаётся только в порту — дойдите до гавани.</p>
          )}
        </div>
      )}

      {owned && work && (
        <div className="card">
          <h3>Версталь занята</h3>
          <p>
            {work.kind === 'level'
              ? `Подъём корабля до уровня ${work.toLevel}`
              : `Улучшение «${view.nodes.find((n) => n.key === work.upgradeKey)?.name || work.upgradeKey}» до уровня ${work.toLevel}`}
            {work.hired ? ' (мастеровые)' : ''}
          </p>
          <p className="muted">Осталось: <b>{clock(remaining())}</b></p>
        </div>
      )}

      {owned && !work && (
        <div className="card">
          <h3>Поднять корабль до уровня {level + 1}</h3>
          {level >= maxLevel ? (
            <p className="good-tag">Корабль уже флагман.</p>
          ) : (
            <>
              <p className="muted">
                Сначала укрепите все шесть узлов текущего уровня. Стоимость:{' '}
                ✦ {view.levelUpCost} · время: {view.levelUpMinutes} мин
                {hired ? ' (мастеровые — вдвое быстрее)' : ''}.
              </p>
              {!view.canLevelUp.ok && <p className="upg-reason small">{view.canLevelUp.reason}</p>}
              <div className="row">
                <label className="muted small">
                  <input type="checkbox" checked={hired} onChange={(e) => setHired(e.target.checked)} />{' '}
                  наёмные мастеровые (золото, вдвое быстрее)
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !view.canLevelUp.ok || !atPort || points < view.levelUpCost}
                  title={!atPort ? 'Только в порту.' : ''}
                  onClick={() => run(() => api.shipUpgrade(characterId, { levelUp: true, hired }))}
                >
                  Поднять уровень
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {owned && (
        <div className="row ship-hire">
          <label className="muted small">
            <input type="checkbox" checked={hired} onChange={(e) => setHired(e.target.checked)} />{' '}
            наёмные мастеровые для улучшений ({view.dockHandGold} золота за уровень, вдвое быстрее)
          </label>
        </div>
      )}

      {owned && branches.map((br) => (
        <section key={br.key} className="ship-branch">
          <h3>{br.name}</h3>
          <p className="muted small">{br.blurb}</p>
          <div className="upg-grid">
            {br.nodes.map((node) => (
              <ShipNode
                key={node.key}
                node={node}
                points={points}
                atPort={atPort}
                busy={busy}
                onForge={(payload) => run(() => api.shipUpgrade(characterId, { ...payload, hired }))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
