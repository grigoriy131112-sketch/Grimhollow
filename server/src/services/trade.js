// Trade (Wave G7): buying and selling on a settlement building's shelf.
//
// The shelf shape is owned by G6 (db/seed_settlements.js): one
// `settlement_stock` row per offer — (building_id, item_key, price, quantity),
// where quantity -1 means an endless supply. This service is the I/O layer that
// moves gold and items on top of that shape; the item catalogue is G2
// (game/items.js) and the inventory is G2's services/items.js.

import { getDb, transaction } from '../db/index.js';
import { itemInfo } from '../game/items.js';
import { grantItem, takeItem, hasItem, listItems } from './items.js';
import { getCharacter } from './characters.js';
import { clanTradeRate } from './clan.js';

// --- the price rule ---------------------------------------------------------
//
// Buying pays the shelf price (gold per unit, as G6 set it). Selling pays a
// documented fraction of that same shelf price, rounded DOWN: SELL_RATE = 0.5,
// so `floor(price * 0.5)` and a merchant never pays more than half. A single
// unit whose half rounds to zero still sells for zero — the rule is the rule.
export const SELL_RATE = 0.5;
export const sellPrice = (price) => Math.max(0, Math.floor((Number(price) || 0) * SELL_RATE));

// A clan's «торговля» bonus (Склад, Молчальники) sweetens both sides: buying
// costs less, selling pays more, by the same rate. `trade` is 0.08 per Склад
// tier, 0.1 for Молчальники. 0 (no clan) leaves the base prices untouched.
export const buyPrice = (price, tradeRate = 0) =>
  Math.max(1, Math.round((Number(price) || 0) * (1 - (Number(tradeRate) || 0))));
export const sellPriceFor = (price, tradeRate = 0) =>
  Math.max(0, Math.floor((Number(price) || 0) * (SELL_RATE + (Number(tradeRate) || 0))));

// --- reconciling G6's provisional keys with the G2 catalogue -----------------
//
// G6 seeded shop/market stock before the G2 catalogue existed, so a few offers
// carry provisional keys. G7 reconciles them here, at read time — no data
// migration and the seed's geography/keys stay untouched. The stock row keeps
// its original key; trade resolves it to the real G2 item. Keys that already
// match a G2 key (torch, oil_flask, iron_ore, bone_charm, dried_fish) need no
// alias — they simply have no catalogue entry and trade as themselves.
export const ITEM_ALIASES = {
  ration: 'bread_loaf',        // food -> stamina
  turnip: 'bread_loaf',
  waterskin: 'clean_water',    // drink -> stamina
  clay_jug: 'clean_water',
  bandage: 'bitter_herb',      // dressing -> hp
  healing_herb: 'glowcap',     // the stronger heal
  leather_strap: 'worn_leathers',
  grave_dust: 'mana_lichen',   // grave dust -> mana
};

// The real G2 item key an offer's shelf key trades as.
export function resolveItemKey(itemKey) {
  return ITEM_ALIASES[itemKey] || itemKey;
}

// Russian names for shelf keys with no G2 entry, so the trade screen never
// shows a Latin key. Everything the catalogue knows uses its own name instead.
const SHELF_NAMES = {
  torch: 'Факел',
  oil_flask: 'Фляга масла',
  iron_ore: 'Кусок руды',
  bone_charm: 'Костяной оберег',
  dried_fish: 'Сушёная рыба',
};

const TRADING_TYPES = new Set(['shop', 'market']);
const isTradingType = (type) => TRADING_TYPES.has(type);

function shelfName(itemKey) {
  const info = itemInfo(resolveItemKey(itemKey));
  if (info.name !== resolveItemKey(itemKey)) return info.name;
  return SHELF_NAMES[itemKey] || itemKey;
}

function offerView(row, tradeRate = 0) {
  const itemId = resolveItemKey(row.item_key);
  const info = itemInfo(itemId);
  const known = info.name !== itemId;
  return {
    itemKey: row.item_key,       // shelf key: the stable identity of the offer
    itemId,                      // the real G2 item it trades as
    name: known ? info.name : (SHELF_NAMES[row.item_key] || row.item_key),
    description: known ? (info.description || '') : '',
    type: info.type,
    rarity: info.rarity,
    listPrice: row.price,        // the shelf price before a clan's discount
    price: buyPrice(row.price, tradeRate),
    sellPrice: sellPriceFor(row.price, tradeRate),
    quantity: row.quantity,
    endless: row.quantity < 0,
    known,
  };
}

function stockRows(buildingId) {
  return getDb().prepare('SELECT * FROM settlement_stock WHERE building_id = ? ORDER BY sort_order, id').all(buildingId);
}

function buildingRow(buildingId) {
  return getDb().prepare('SELECT * FROM settlement_buildings WHERE id = ?').get(buildingId);
}

function requireTradingBuilding(building) {
  if (!building) throw new Error('Здание не найдено');
  if (!isTradingType(building.type)) throw new Error('Здесь не торгуют');
  return building;
}

function normalizeQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 1) throw new Error('Нужно положительное количество');
  return n;
}

// --- read side --------------------------------------------------------------

// A building's shelf: what it sells and at what price. Returns null when the
// building does not exist (the route turns that into a 404).
export function listOffers(buildingId, characterId = null) {
  const building = buildingRow(buildingId);
  if (!building) return null;
  const tradeRate = characterId ? clanTradeRate(characterId) : 0;
  return {
    building: {
      id: building.id,
      key: building.key,
      name: building.name,
      type: building.type,
      settlementId: building.settlement_id,
    },
    canTrade: isTradingType(building.type),
    sellRate: SELL_RATE,
    clanTradeRate: tradeRate,
    offers: stockRows(buildingId).map((r) => offerView(r, tradeRate)),
  };
}

// One offer on a shelf, addressed by its shelf key.
export function getOffer(buildingId, itemKey, characterId = null) {
  const building = buildingRow(buildingId);
  if (!building) return null;
  const row = getDb()
    .prepare('SELECT * FROM settlement_stock WHERE building_id = ? AND item_key = ?')
    .get(buildingId, String(itemKey));
  if (!row) return null;
  const tradeRate = characterId ? clanTradeRate(characterId) : 0;
  return { building: { id: building.id, name: building.name, type: building.type }, offer: offerView(row, tradeRate) };
}

// Every trading building in a settlement and what each one sells. Returns null
// when the settlement does not exist.
export function listSettlementOffers(settlementId, characterId = null) {
  const settlement = getDb().prepare('SELECT * FROM settlements WHERE id = ?').get(settlementId);
  if (!settlement) return null;
  const tradeRate = characterId ? clanTradeRate(characterId) : 0;
  const buildings = getDb().prepare(
    "SELECT * FROM settlement_buildings WHERE settlement_id = ? AND type IN ('shop', 'market') ORDER BY sort_order, id",
  ).all(settlementId);
  return {
    settlement: { id: settlement.id, key: settlement.key, name: settlement.name, kind: settlement.kind },
    sellRate: SELL_RATE,
    clanTradeRate: tradeRate,
    buildings: buildings.map((b) => ({
      id: b.id,
      key: b.key,
      name: b.name,
      type: b.type,
      offers: stockRows(b.id).map((r) => offerView(r, tradeRate)),
    })),
  };
}

// The first offer in a building that would accept this item. A seller may name
// either the shelf key or the real item key, so match both.
function findOfferForItem(buildingId, itemKey) {
  const key = String(itemKey);
  return stockRows(buildingId).find((r) => r.item_key === key || resolveItemKey(r.item_key) === key) || null;
}

// --- buy --------------------------------------------------------------------

// Buy `qty` units of a shelf offer: check the gold and the shelf, decrement the
// stock (endless supply is never touched), move the item into the bag and pay.
export function buy(buildingId, characterId, itemKey, qty = 1) {
  const amount = normalizeQty(qty);
  return transaction((d) => {
    const building = requireTradingBuilding(buildingRow(buildingId));
    const offer = d.prepare('SELECT * FROM settlement_stock WHERE building_id = ? AND item_key = ?')
      .get(buildingId, String(itemKey));
    if (!offer) throw new Error('Такого товара нет на прилавке');

    const character = d.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!character) throw new Error('Персонаж не найден');

    const tradeRate = clanTradeRate(characterId);
    const unit = buyPrice(offer.price, tradeRate);
    const total = unit * amount;
    if (character.gold < total) throw new Error('Не хватает золота');
    if (offer.quantity >= 0 && offer.quantity < amount) throw new Error('Столько нет на прилавке');

    if (offer.quantity >= 0) {
      d.prepare('UPDATE settlement_stock SET quantity = quantity - ? WHERE id = ?').run(amount, offer.id);
    }
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(total, characterId);
    grantItem(characterId, resolveItemKey(offer.item_key), amount);

    return {
      kind: 'buy',
      buildingId,
      itemKey: offer.item_key,
      itemId: resolveItemKey(offer.item_key),
      name: shelfName(offer.item_key),
      qty: amount,
      unitPrice: unit,
      total,
      gold: getCharacter(characterId).gold,
      quantity: offer.quantity >= 0 ? offer.quantity - amount : -1,
      endless: offer.quantity < 0,
      bagQty: bagQty(characterId, resolveItemKey(offer.item_key)),
    };
  });
}

// --- sell -------------------------------------------------------------------

// Sell `qty` carried units: check the bag, take the item, pay `sellPrice` per
// unit (half the shelf price, rounded down) and put the units back on the shelf
// (an endless shelf stays endless). The building must actually buy the item.
export function sell(buildingId, characterId, itemKey, qty = 1) {
  const amount = normalizeQty(qty);
  return transaction((d) => {
    requireTradingBuilding(buildingRow(buildingId));
    const offer = findOfferForItem(buildingId, itemKey);
    if (!offer) throw new Error('Этот товар здесь не принимают');

    const realKey = resolveItemKey(offer.item_key);
    if (!hasItem(characterId, realKey, amount)) throw new Error('Предмета нет в сумке');

    const unit = sellPriceFor(offer.price, clanTradeRate(characterId));
    const total = unit * amount;
    if (!takeItem(characterId, realKey, amount)) throw new Error('Предмета нет в сумке');

    if (offer.quantity >= 0) {
      d.prepare('UPDATE settlement_stock SET quantity = quantity + ? WHERE id = ?').run(amount, offer.id);
    }
    d.prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?").run(total, characterId);

    return {
      kind: 'sell',
      buildingId,
      itemKey: offer.item_key,
      itemId: realKey,
      name: shelfName(offer.item_key),
      qty: amount,
      unitPrice: unit,
      total,
      gold: getCharacter(characterId).gold,
      quantity: offer.quantity >= 0 ? offer.quantity + amount : -1,
      endless: offer.quantity < 0,
      bagQty: bagQty(characterId, realKey),
    };
  });
}

function bagQty(characterId, itemKey) {
  const row = listItems(characterId).find((i) => i.key === itemKey);
  return row ? row.qty : 0;
}
