import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SceneBackdrop from '../scenes.jsx';
import { Icon, itemIcon } from '../icons.jsx';
import { api } from '../api.js';

// The settlements API lives under /api/settlements (routes/settlements.js).
// Actions and the smithy's forge go through api.js now that they exist.

// Building type -> existing CC BY 3.0 landmark icon. No rasters, no new art.
const BUILDING_ICONS = {
  tavern: 'campfire',
  temple: 'church',
  library: 'ancient_columns',
  guild: 'guarded_tower',
  smithy: 'volcano',
  shop: 'caravan',
  market: 'camp',
  inn: 'well',
  house: 'village',
};
const buildingIcon = (type) => (BUILDING_ICONS[type] ? `/art/landmarks/${BUILDING_ICONS[type]}.svg` : null);

const KIND_LABELS = { city: 'Город', village: 'Деревня' };
const RARITY_COLORS = { common: '#a08a6a', uncommon: '#6fae5a', rare: '#5a8fd8', epic: '#9a5ad8', legendary: '#d9b44a' };

// The forge (smithy): the recipe book with its materials and costs, resolved
// against the active hero's bag and purse.
function Forge({ buildingId, heroId }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    if (!heroId) { setBook(null); return; }
    api.getRecipes(buildingId, heroId).then(setBook).catch((e) => setError(e.message));
  };
  useEffect(load, [buildingId, heroId]);

  if (!heroId) return <p className="muted small">Выберите героя, чтобы ковать.</p>;

  const forge = async (recipe) => {
    setBusy(recipe.key); setError(''); setNotice('');
    try {
      const res = await api.craft(buildingId, heroId, recipe.key);
      setNotice(`Выковано: «${res.forged.name}»${res.forged.qty > 1 ? ` ×${res.forged.qty}` : ''}.`);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  if (error && !book) return <div className="error">{error}</div>;
  if (!book) return <p className="muted small">Загрузка рецептов…</p>;

  return (
    <div className="craft-forge">
      <h3>Кузнечное дело <span className="muted small">· {book.gold} зол.</span></h3>
      {error && <div className="error">{error}</div>}
      {notice && <p className="muted small">✓ {notice}</p>}
      <ul className="craft-recipes">
        {book.recipes.map((r) => (
          <li key={r.key} className={r.canCraft ? '' : 'craft-locked'}>
            <div className="craft-recipe-head">
              <Icon src={itemIcon(r.output.key)} alt={r.output.name} size={26} />
              <span>
                <b style={{ color: RARITY_COLORS[r.output.rarity] || undefined }}>{r.output.name}</b>
                {r.qty > 1 && <span className="muted small"> ×{r.qty}</span>}
                <div className="muted small">{r.output.description}</div>
              </span>
            </div>
            <div className="craft-materials">
              {r.materials.map((m) => (
                <span key={m.itemKey} className={m.have >= m.need ? 'craft-have' : 'craft-need'}>
                  <Icon src={itemIcon(m.itemKey)} alt={m.name} size={16} /> {m.name} {m.have}/{m.need}
                </span>
              ))}
              {r.gold > 0 && <span className={book.gold >= r.gold ? 'craft-have' : 'craft-need'}>🪙 {r.gold}</span>}
            </div>
            <button
              type="button"
              className="btn small"
              disabled={!r.canCraft || busy === r.key}
              onClick={() => forge(r)}
            >
              {busy === r.key ? 'Куём…' : 'Выковать'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One building: icon, name, what can be done here, and (for shops and markets)
// the shelf G7 will trade on.
function Building({ building, heroId }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const act = async (actionKey) => {
    if (!heroId) { setError('Сначала создайте героя.'); return; }
    setBusy(actionKey); setError(''); setResult(null);
    try {
      setResult(await api.buildingAction(building.id, Number(heroId), actionKey));
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="card settlement-building">
      <div className="settlement-building-head">
        <span className="settlement-building-icon">
          <Icon src={buildingIcon(building.type)} alt={building.typeLabel} size={34} />
        </span>
        <span>
          <b>{building.name}</b>
          <div className="muted small">{building.typeLabel} · {building.description}</div>
        </span>
        <button type="button" className="btn small" onClick={() => setOpen((v) => !v)}>
          {open ? 'Выйти' : 'Войти'}
        </button>
      </div>

      {open && (
        <div className="settlement-building-body">
          <h3>Что здесь можно сделать</h3>
          <ul className="settlement-actions">
            {building.actions.map((a) => (
              <li key={a.key}>
                <div>
                  <b>{a.label}</b>
                  <span className="muted small"> — {a.blurb}</span>
                </div>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy === a.key}
                  onClick={() => act(a.key)}
                >
                  {busy === a.key ? '…' : 'Сделать'}
                </button>
              </li>
            ))}
            {building.actions.length === 0 && <li className="muted">Здесь нечего делать.</li>}
          </ul>

          {error && <div className="error">{error}</div>}
          {result && (
            <div className="building-result">
              <p>{result.text}</p>
              {result.healed > 0 && <p className="muted small">Здоровье: {result.character?.hp}/{result.character?.stats?.maxHp}</p>}
              {result.rumors && (
                <ul className="muted small">
                  {result.rumors.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {result.lore && (
                <ul className="muted small">
                  {result.lore.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {result.open && result.open.length > 0 && (
                <ul className="stats">
                  {result.open.map((q) => <li key={q.key}><Link to={`/quests/${heroId}`}>{q.name}</Link></li>)}
                </ul>
              )}
            </div>
          )}

          {building.type === 'smithy' && <Forge buildingId={building.id} heroId={heroId} />}

          {building.canTrade && building.stock.length > 0 && (
            <div className="settlement-stock">
              <h3>Прилавок</h3>
              <ul className="stats">
                {building.stock.map((s) => (
                  <li key={s.itemKey}>
                    <span>
                      <b>{s.name}</b>
                      <span className="muted small"> · {s.price} зол.</span>
                      {s.quantity >= 0
                        ? <span className="muted small"> · осталось {s.quantity}</span>
                        : <span className="muted small"> · в достатке</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to={`/trade/${building.id}`}>
                <button type="button" className="btn small">Торговать</button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettlementPage() {
  const { id } = useParams();
  const [settlement, setSettlement] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSettlement(id).then(setSettlement).catch((e) => setError(e.message));
    api.listCharacters().then((list) => {
      setCharacters(list);
      if (list.length) setHeroId(String(list[0].id));
    }).catch(() => {});
  }, [id]);

  if (error && !settlement) return <div className="error">{error}</div>;
  if (!settlement) return <div className="muted center">Загрузка…</div>;

  const loc = settlement.location || {};
  return (
    <div>
      {/* An island settlement stands on a hidden place that is not on the atlas,
          so "back to the map" would drop the player somewhere the village is not
          drawn. Return to the island place instead. */}
      {loc.hidden && settlement.locationId
        ? <Link to={`/world/locations/${settlement.locationId}`} className="muted">← Назад к острову</Link>
        : <Link to="/world" className="muted">← Карта мира</Link>}
      <div className="scene-hero">
        <SceneBackdrop scene={loc.scene} biome={loc.biome} danger={loc.danger} name={settlement.name} />
        <div className="scene-caption">
          <div className="page-head" style={{ margin: 0 }}>
            <h1>{settlement.name}</h1>
            <span className="badge">{KIND_LABELS[settlement.kind] || settlement.kind}</span>
            {loc.isSafe && <span className="badge safe">Безопасная зона</span>}
          </div>
          <p className="muted">
            {loc.continentName} · {loc.regionName} — {settlement.description}
          </p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <p className="muted small">
        Зданий: {settlement.buildingCount}. Зайдите в любое, чтобы узнать, что здесь можно сделать.
      </p>

      {characters.length > 0 && (
        <label className="muted small">
          Герой:{' '}
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      <div className="cards settlement-buildings">
        {settlement.buildings.map((b) => <Building key={b.id} building={b} heroId={heroId} />)}
      </div>
    </div>
  );
}
