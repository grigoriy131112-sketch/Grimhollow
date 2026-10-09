import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SceneBackdrop from '../scenes.jsx';
import { Icon } from '../icons.jsx';

// The settlements API lives under /api/settlements (routes/settlements.js).
// api.js is a shared file owned by other waves, so this screen keeps its own
// tiny request helper rather than editing it.
async function getJson(path) {
  const res = await fetch(`/api${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}

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

// One building: icon, name, what can be done here, and (for shops and markets)
// the shelf G7 will trade on.
function Building({ building }) {
  const [open, setOpen] = useState(false);
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
                <b>{a.label}</b>
                <span className="muted small"> — {a.blurb}</span>
              </li>
            ))}
            {building.actions.length === 0 && <li className="muted">Здесь нечего делать.</li>}
          </ul>

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
  const [error, setError] = useState('');

  useEffect(() => {
    getJson(`/settlements/${id}`).then(setSettlement).catch((e) => setError(e.message));
  }, [id]);

  if (error && !settlement) return <div className="error">{error}</div>;
  if (!settlement) return <div className="muted center">Загрузка…</div>;

  const loc = settlement.location || {};
  return (
    <div>
      <Link to="/world" className="muted">← Карта мира</Link>
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

      <div className="cards settlement-buildings">
        {settlement.buildings.map((b) => <Building key={b.id} building={b} />)}
      </div>
    </div>
  );
}
