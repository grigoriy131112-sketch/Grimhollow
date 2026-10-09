import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { itemIcon, Icon } from '../icons.jsx';
import { statLabel } from '../statLabels.js';

const RARITY_COLORS = {
  common: '#a08a6a', uncommon: '#6fae5a', rare: '#5a8fd8', epic: '#9a5ad8', legendary: '#d9b44a',
};

const statDelta = (base, value) => {
  const d = value - base;
  if (!d) return null;
  return d > 0 ? `+${d}` : `${d}`;
};

function StatRow({ stat, base, value }) {
  const delta = statDelta(base, value);
  return (
    <li>
      <span>{statLabel(stat)}</span>
      <b>
        {value}
        {delta && (
          <span className="small" style={{ marginLeft: '0.4rem', color: delta.startsWith('+') ? '#9fe0a8' : '#e0a0a0' }}>
            {delta}
          </span>
        )}
      </b>
    </li>
  );
}

export default function InventoryPage() {
  const { id } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.getInventory(id).then(setView).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !view) return <div className="error">{error}</div>;
  if (!view) return <div className="muted center">Загрузка…</div>;

  const { character, equipment, buffs, items, baseStats, effectiveStats } = view;
  const bag = items.filter((it) => it.type !== 'weapon' && it.type !== 'armor');
  const wearable = items.filter((it) => it.type === 'weapon' || it.type === 'armor');

  return (
    <div>
      <Link to={`/characters/${id}`} className="muted">← К герою</Link>
      <div className="page-head">
        <h1>Снаряжение — {character.name}</h1>
        <span className="badge">{character.level} уровень · {character.className}</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card journal-bookmark">
        <h2>Дневник героя</h2>
        <p className="muted small">
          Книга знаний лежит отдельно от ячеек: что герой узнал о мире, где он стоит и как
          настроена игра.
        </p>
        <div className="journal-links">
          <Link className="journal-link" to="/codex?tab=lore">📖 Лор</Link>
          <Link className="journal-link" to="/codex?tab=map">🗺 Карта мира</Link>
          <Link className="journal-link" to="/codex?tab=settings">⚙ Настройки</Link>
          <Link className="journal-link" to="/codex?tab=creators">🛠 Создатели</Link>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Ячейки</h2>
          <ul className="stats">
            {equipment.map((slot) => (
              <li key={slot.slot}>
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Icon src={slot.key ? itemIcon(slot.key) : null} alt={slot.item?.name || ''} size={22} />
                  <span>
                    <span className="muted small">{slot.label}</span>
                    <br />
                    {slot.item ? (
                      <b style={{ color: RARITY_COLORS[slot.item.rarity] || undefined }}>{slot.item.name}</b>
                    ) : (
                      <span className="muted">пусто</span>
                    )}
                  </span>
                </span>
                {slot.item && (
                  <button type="button" className="btn small ghost" disabled={busy}
                    onClick={() => run(() => api.unequipItem(id, slot.slot))}>
                    Снять
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Показатели</h2>
          <p className="muted small">Число слева — базовое, справа — с учётом снаряжения и эффектов.</p>
          <ul className="stats">
            {Object.keys(effectiveStats).map((stat) => (
              <StatRow key={stat} stat={stat} base={baseStats[stat]} value={effectiveStats[stat]} />
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Действующие эффекты</h2>
        {buffs.length === 0 ? (
          <p className="muted small">Ни благословений, ни порчи — герой в обычном состоянии.</p>
        ) : (
          <ul className="stats">
            {buffs.map((b) => (
              <li key={`${b.source}|${b.key}`}>
                <span>
                  <b>{b.label || b.key}</b>{' '}
                  <span className="muted small">
                    {statLabel(b.stat)} {b.amount > 0 ? `+${b.amount}` : b.amount} ·{' '}
                    {b.turns === null ? 'постоянно' : `ещё ${b.turns} ход.`}
                  </span>
                </span>
                <button type="button" className="btn small ghost" disabled={busy}
                  onClick={() => run(() => api.removeBuff(id, { source: b.source, key: b.key }))}>
                  Снять
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Снаряжение в сумке</h2>
        {wearable.length === 0 ? (
          <p className="muted small">Нет ничего, что можно надеть.</p>
        ) : (
          <ul className="stats">
            {wearable.map((it) => (
              <li key={it.key}>
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Icon src={itemIcon(it.key)} alt={it.name} size={24} />
                  <span>
                    <b style={{ color: RARITY_COLORS[it.rarity] || undefined }}>{it.name}</b>
                    <span className="muted small"> ×{it.qty}</span>
                    <div className="small muted">{it.description}</div>
                  </span>
                </span>
                <button type="button" className="btn small" disabled={busy}
                  onClick={() => run(() => api.equipItem(id, it.key))}>
                  Надеть
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Сумка</h2>
        {bag.length === 0 ? (
          <p className="muted small">Пусто. Припасы и снадобья появятся здесь.</p>
        ) : (
          <ul className="stats">
            {bag.map((it) => (
              <li key={it.key}>
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Icon src={itemIcon(it.key)} alt={it.name} size={24} />
                  <span>
                    <b style={{ color: RARITY_COLORS[it.rarity] || undefined }}>{it.name}</b>
                    <span className="muted small"> ×{it.qty}</span>
                    <div className="small muted">{it.description}</div>
                  </span>
                </span>
                {(it.type === 'consumable' || it.resource) && (
                  <button type="button" className="btn small" disabled={busy}
                    onClick={() => run(() => api.useItem(id, it.key))}>
                    Использовать
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
