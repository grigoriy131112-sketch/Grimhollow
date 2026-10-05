import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemIcon, Icon } from '../icons.jsx';

// Trade (Wave G7). The trade API lives under /api/trade (routes/trade.js).
// api.js is a shared file owned by other waves, so this screen keeps its own
// tiny request helper rather than editing it — same as pages/Settlement.jsx.
async function getJson(path) {
  const res = await fetch(`/api${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}
async function postJson(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}

const TYPE_LABELS = { shop: 'Лавка', market: 'Рынок' };
const RARITY_COLORS = {
  common: '#a08a6a', uncommon: '#6fae5a', rare: '#5a8fd8', epic: '#9a5ad8', legendary: '#d9b44a',
};

const inBag = (inventory, itemId) => {
  const row = (inventory || []).find((i) => i.key === itemId);
  return row ? row.qty : 0;
};

export default function TradePage() {
  const { buildingId } = useParams();
  const [view, setView] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [inventory, setInventory] = useState([]);
  const [qty, setQty] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getJson(`/trade/offers/${buildingId}`).then(setView).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [buildingId]);

  useEffect(() => {
    getJson('/characters').then((list) => {
      setCharacters(list);
      if (list.length) setHeroId(String(list[0].id));
    }).catch(() => {});
  }, []);

  const loadInventory = (id) => {
    if (!id) { setInventory([]); return; }
    getJson(`/items/${id}`).then((inv) => setInventory(inv.items || [])).catch(() => setInventory([]));
  };
  useEffect(() => { loadInventory(heroId); }, [heroId]);

  const hero = useMemo(() => characters.find((c) => String(c.id) === String(heroId)) || null, [characters, heroId]);
  const gold = hero ? hero.gold : 0;
  const amountFor = (key) => Math.max(1, Math.floor(Number(qty[key])) || 1);

  const run = async (fn, okMsg) => {
    if (!heroId) return setError('Сначала выберите героя.');
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      await load();
      await loadInventory(heroId);
      getJson('/characters').then(setCharacters).catch(() => {});
      if (okMsg) setNotice(okMsg);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const doBuy = (offer) => run(
    () => postJson(`/trade/${buildingId}/buy`, { characterId: Number(heroId), itemKey: offer.itemKey, qty: amountFor(offer.itemKey) }),
    `Куплено: ${offer.name} ×${amountFor(offer.itemKey)}`,
  );

  const doSell = (offer) => run(
    () => postJson(`/trade/${buildingId}/sell`, { characterId: Number(heroId), itemKey: offer.itemKey, qty: amountFor(offer.itemKey) }),
    `Продано: ${offer.name} ×${amountFor(offer.itemKey)}`,
  );

  if (error && !view) return <div className="error">{error}</div>;
  if (!view) return <div className="muted center">Загрузка…</div>;

  const { building, offers, canTrade, sellRate } = view;
  const sellPercent = Math.round((sellRate || 0) * 100);

  return (
    <div>
      <Link to={`/settlements/${building.settlementId}`} className="muted">← К поселению</Link>
      <div className="page-head">
        <h1>Торг — {building.name}</h1>
        <span className="badge">{TYPE_LABELS[building.type] || building.type}</span>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <p className="muted small">✓ {notice}</p>}

      <div className="card">
        <h2>Кошелёк</h2>
        <div className="grid2">
          <div>
            <label className="muted small" htmlFor="trade-hero">Кто торгует</label>
            <select id="trade-hero" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <ul className="stats">
            <li><span>Золото</span><b>{gold} 🪙</b></li>
            <li><span>Выкуп за единицу</span><b>{sellPercent}% цены</b></li>
          </ul>
        </div>
      </div>

      {!canTrade && <p className="muted">Здесь не торгуют — загляните в лавку или на рынок.</p>}

      {canTrade && (
        <div className="card">
          <h2>Прилавок</h2>
          <p className="muted small">Покупка — по цене прилавка. Продажа — за половину цены, с округлением вниз.</p>
          <ul className="stats trade-offers">
            {offers.map((offer) => {
              const owned = inBag(inventory, offer.itemId);
              const canSell = owned > 0;
              return (
                <li key={offer.itemKey}>
                  <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Icon src={itemIcon(offer.itemId)} alt={offer.name} size={26} />
                    <span>
                      <b style={{ color: RARITY_COLORS[offer.rarity] || undefined }}>{offer.name}</b>
                      {!offer.known && <span className="muted small"> (особый товар)</span>}
                      <span className="muted small"> · в сумке: {owned}</span>
                      {offer.description && <div className="small muted">{offer.description}</div>}
                      <div className="small muted">
                        {offer.price} зол. · продать за {offer.sellPrice}
                        {' · '}
                        {offer.endless ? 'в достатке' : `осталось ${offer.quantity}`}
                      </div>
                    </span>
                  </span>
                  <span className="trade-actions">
                    <input
                      type="number"
                      min="1"
                      aria-label={`Количество ${offer.name}`}
                      value={amountFor(offer.itemKey)}
                      onChange={(e) => setQty((q) => ({ ...q, [offer.itemKey]: e.target.value }))}
                    />
                    <button type="button" className="btn small" disabled={busy} onClick={() => doBuy(offer)}>Купить</button>
                    <button type="button" className="btn small ghost" disabled={busy || !canSell} onClick={() => doSell(offer)}>Продать</button>
                  </span>
                </li>
              );
            })}
            {offers.length === 0 && <li className="muted">Прилавок пуст.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
