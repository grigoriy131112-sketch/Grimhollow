// Settlements (Wave G6): load a city or village with its buildings and resolve
// "what can I do here" for each building type. Design data (which buildings
// exist, what a type offers, the G7 stock shape) lives in db/seed_settlements.js.

import { getDb } from '../db/index.js';
import { BUILDING_TYPES } from '../db/seed_settlements.js';
import { itemInfo } from '../game/items.js';

// Provisional Russian names for the item keys G6 seeds into shop/market stock.
// Wave G2 owns the real ITEMS catalog; once it lands, `itemInfo` wins and these
// fall away. They exist only so the settlement UI never shows a Latin key.
const PROVISIONAL_ITEM_NAMES = {
  ration: 'Пайок',
  waterskin: 'Бурдюк с водой',
  torch: 'Факел',
  bandage: 'Перевязка',
  oil_flask: 'Фляга масла',
  iron_ore: 'Кусок руды',
  healing_herb: 'Целебная трава',
  leather_strap: 'Кожаный ремень',
  bone_charm: 'Костяной оберег',
  grave_dust: 'Могильная пыль',
  dried_fish: 'Сушёная рыба',
  turnip: 'Репа',
  clay_jug: 'Глиняный кувшин',
};

function describeItem(itemKey) {
  const known = itemInfo(itemKey);
  if (known && known.name !== itemKey) return known;
  return { name: PROVISIONAL_ITEM_NAMES[itemKey] || itemKey, description: '' };
}

// The actions a building of this type offers. Unknown types resolve to nothing,
// so a stray row never breaks the screen.
export function actionsFor(type) {
  const spec = BUILDING_TYPES[type];
  if (!spec) return { type, label: type, actions: [] };
  return { type, label: spec.label, actions: spec.actions.map((a) => ({ ...a })) };
}

// The offers on a building's shelf, in the G7 shape (itemKey/price/quantity).
// G6 only reads this; buying and selling belong to Wave G7.
function stockFor(buildingId) {
  return getDb().prepare('SELECT * FROM settlement_stock WHERE building_id = ? ORDER BY sort_order, id')
    .all(buildingId)
    .map((r) => {
      const info = describeItem(r.item_key);
      return {
        itemKey: r.item_key,
        price: r.price,
        quantity: r.quantity,
        name: info.name,
        description: info.description,
      };
    });
}

function deriveBuilding(row) {
  const resolved = actionsFor(row.type);
  const stock = stockFor(row.id);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    typeLabel: resolved.label,
    description: row.description,
    actions: resolved.actions,
    stock,
    canTrade: row.type === 'shop' || row.type === 'market',
  };
}

function locationInfo(locationId) {
  const loc = getDb().prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
  if (!loc) return null;
  const region = getDb().prepare('SELECT * FROM regions WHERE id = ?').get(loc.region_id);
  const continent = region ? getDb().prepare('SELECT * FROM continents WHERE id = ?').get(region.continent_id) : null;
  return {
    id: loc.id, name: loc.name, description: loc.description, danger: loc.danger,
    isSafe: !!loc.is_safe, scene: loc.scene, biome: loc.biome, x: loc.map_x, y: loc.map_y,
    regionName: region?.name, continentName: continent?.name,
  };
}

function deriveSettlement(row, { withBuildings = true } = {}) {
  const buildings = getDb().prepare(
    'SELECT * FROM settlement_buildings WHERE settlement_id = ? ORDER BY sort_order, id',
  ).all(row.id).map(deriveBuilding);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    description: row.description,
    locationId: row.location_id,
    location: locationInfo(row.location_id),
    buildingCount: buildings.length,
    ...(withBuildings ? { buildings } : {}),
  };
}

// Every settlement in the world, without their buildings (the list view).
export function listSettlements() {
  return getDb().prepare('SELECT * FROM settlements ORDER BY sort_order, id')
    .all()
    .map((r) => deriveSettlement(r, { withBuildings: false }));
}

// One settlement with all of its buildings and their resolved actions/stock.
export function getSettlement(id) {
  const row = getDb().prepare('SELECT * FROM settlements WHERE id = ?').get(id);
  return row ? deriveSettlement(row) : null;
}

// The settlement that stands on a location, if any. Used to link a location
// screen into its settlement without a second query.
export function getSettlementByLocation(locationId) {
  const row = getDb().prepare('SELECT * FROM settlements WHERE location_id = ?').get(locationId);
  return row ? deriveSettlement(row) : null;
}

// A single building with its actions and stock.
export function getBuilding(id) {
  const row = getDb().prepare('SELECT * FROM settlement_buildings WHERE id = ?').get(id);
  return row ? deriveBuilding(row) : null;
}
