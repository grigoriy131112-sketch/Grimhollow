import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements, SETTLEMENTS } from '../src/db/seed_settlements.js';
import { createCharacter } from '../src/services/characters.js';
import { grantItem, listItems } from '../src/services/items.js';
import { itemInfo } from '../src/game/items.js';
import {
  buy, sell, listOffers, getOffer, listSettlementOffers,
  sellPrice, SELL_RATE, resolveItemKey, ITEM_ALIASES,
} from '../src/services/trade.js';

test.after(() => closeDb());

let counter = 0;
function freshLeader(gold = 0) {
  counter += 1;
  const hero = createCharacter({ name: `Торговец ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  if (gold) getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, hero.id);
  return hero;
}

function seed() {
  seedWorld();
  seedSettlements();
}

// The city shop (Гримхольд) — the shelf these tests trade on.
function cityShop() {
  seed();
  const row = getDb().prepare(
    `SELECT b.* FROM settlement_buildings b
       JOIN settlements s ON s.id = b.settlement_id
      WHERE b.type = 'shop' AND s.kind = 'city'`,
  ).get();
  return row;
}

function stockQty(buildingId, itemKey) {
  const row = getDb().prepare('SELECT quantity FROM settlement_stock WHERE building_id = ? AND item_key = ?')
    .get(buildingId, itemKey);
  return row ? row.quantity : null;
}

function bagQty(characterId, itemKey) {
  const row = listItems(characterId).find((i) => i.key === itemKey);
  return row ? row.qty : 0;
}

// --- the price rule (pure) --------------------------------------------------

test('selling pays half the shelf price, rounded down', () => {
  assert.equal(SELL_RATE, 0.5);
  assert.equal(sellPrice(4), 2);
  assert.equal(sellPrice(5), 2, 'rounds down');
  assert.equal(sellPrice(7), 3);
  assert.equal(sellPrice(1), 0, 'a single coin rounds to nothing');
  assert.equal(sellPrice(0), 0);
});

// --- reading the shelf ------------------------------------------------------

test('listOffers returns the shelf with buy and sell prices', () => {
  const shop = cityShop();
  const view = listOffers(shop.id);
  assert.equal(view.building.id, shop.id);
  assert.equal(view.canTrade, true);
  assert.ok(view.offers.length > 0);
  for (const offer of view.offers) {
    assert.match(offer.itemKey, /^[a-z_]+$/, 'shelf keys stay Latin');
    assert.ok(offer.price > 0);
    assert.equal(offer.sellPrice, Math.floor(offer.price * SELL_RATE));
    assert.ok(offer.name && offer.name !== offer.itemKey, 'a Russian name is shown');
    assert.equal(offer.endless, offer.quantity < 0);
  }
  assert.equal(listOffers(999999), null, 'an unknown building resolves to null');
});

test('G6 provisional keys are reconciled with the real G2 catalogue', () => {
  const shop = cityShop();
  // A provisional key maps to the real item id and takes its Russian name.
  const bandage = getOffer(shop.id, 'bandage').offer;
  assert.equal(bandage.itemId, 'bitter_herb');
  assert.equal(bandage.name, itemInfo('bitter_herb').name);
  assert.equal(bandage.known, true);

  const ration = getOffer(shop.id, 'ration').offer;
  assert.equal(ration.itemId, 'bread_loaf');

  // A key with no catalogue entry trades as itself, with a Russian label.
  const torch = getOffer(shop.id, 'torch').offer;
  assert.equal(torch.itemId, 'torch');
  assert.equal(torch.known, false);
  assert.match(torch.name, /[А-Яа-яЁё]/);
  assert.equal(resolveItemKey('torch'), 'torch', 'unaliased keys pass through');

  // The alias table only points at real catalogue items.
  for (const [from, to] of Object.entries(ITEM_ALIASES)) {
    assert.notEqual(itemInfo(to).name, to, `${from} -> ${to} is a real item`);
  }
});

test('listSettlementOffers gathers every trading building in a settlement', () => {
  seed();
  const city = getDb().prepare("SELECT * FROM settlements WHERE kind = 'city'").get();
  const view = listSettlementOffers(city.id);
  assert.equal(view.settlement.id, city.id);
  assert.ok(view.buildings.length >= 2, 'a shop and a market');
  for (const b of view.buildings) {
    assert.ok(['shop', 'market'].includes(b.type));
    assert.ok(b.offers.length > 0);
  }
  assert.equal(listSettlementOffers(999999), null);
});

// --- buying -----------------------------------------------------------------

test('buy moves the item, pays gold and decrements the shelf', () => {
  const shop = cityShop();
  const before = stockQty(shop.id, 'torch');
  const leader = freshLeader(100);

  const res = buy(shop.id, leader.id, 'torch', 3);
  assert.equal(res.kind, 'buy');
  assert.equal(res.qty, 3);
  assert.equal(res.total, res.unitPrice * 3);
  assert.equal(res.gold, 100 - res.total);
  assert.equal(bagQty(leader.id, 'torch'), 3, 'the item is in the bag');
  assert.equal(stockQty(shop.id, 'torch'), before - 3, 'the shelf is lighter');
});

test('buying a provisional key delivers the real catalogue item', () => {
  const shop = cityShop();
  const leader = freshLeader(500);
  const res = buy(shop.id, leader.id, 'bandage', 2);
  assert.equal(res.itemId, 'bitter_herb');
  assert.equal(bagQty(leader.id, 'bitter_herb'), 2);
  assert.equal(bagQty(leader.id, 'bandage'), 0, 'nothing is filed under the provisional key');
});

test('cannot buy without enough gold', () => {
  const shop = cityShop();
  const leader = freshLeader(0);
  assert.throws(() => buy(shop.id, leader.id, 'torch', 1), /золот/i);
});

test('cannot buy more than the shelf holds', () => {
  const shop = cityShop();
  const leader = freshLeader(1000000);
  const onShelf = stockQty(shop.id, 'torch');
  assert.throws(() => buy(shop.id, leader.id, 'torch', onShelf + 5), /прилавк/i);
});

test('cannot buy a thing the shelf does not sell', () => {
  const shop = cityShop();
  const leader = freshLeader(1000);
  assert.throws(() => buy(shop.id, leader.id, 'rusty_sword', 1), /прилавк/i);
});

// --- selling ----------------------------------------------------------------

test('sell pays the documented fraction and returns the item', () => {
  const shop = cityShop();
  const before = stockQty(shop.id, 'torch');
  const price = getOffer(shop.id, 'torch').offer.price;
  const leader = freshLeader(0);
  grantItem(leader.id, 'torch', 4);

  const res = sell(shop.id, leader.id, 'torch', 2);
  assert.equal(res.kind, 'sell');
  assert.equal(res.qty, 2);
  assert.equal(res.unitPrice, Math.floor(price * SELL_RATE));
  assert.equal(res.total, res.unitPrice * 2);
  assert.equal(res.gold, res.total, 'the seller is paid');
  assert.equal(bagQty(leader.id, 'torch'), 2, 'the sold units leave the bag');
  assert.equal(stockQty(shop.id, 'torch'), before + 2, 'the sold units reach the shelf');
});

test('selling a provisional key pays for the real catalogue item', () => {
  const shop = cityShop();
  const leader = freshLeader(0);
  grantItem(leader.id, 'bitter_herb', 1);
  const res = sell(shop.id, leader.id, 'bandage', 1);
  assert.equal(res.itemId, 'bitter_herb');
  assert.equal(bagQty(leader.id, 'bitter_herb'), 0);
  assert.ok(res.total > 0);
});

test('cannot sell an item the bag does not hold', () => {
  const shop = cityShop();
  const leader = freshLeader(0);
  assert.throws(() => sell(shop.id, leader.id, 'torch', 1), /сумк/i);
});

test('cannot sell a thing the shelf does not accept', () => {
  const shop = cityShop();
  const leader = freshLeader(0);
  grantItem(leader.id, 'rusty_sword', 1);
  assert.throws(() => sell(shop.id, leader.id, 'rusty_sword', 1), /принима/i);
});

// --- endless supply ---------------------------------------------------------

test('an endless shelf never runs out and is never decremented', () => {
  const shop = cityShop();
  assert.equal(stockQty(shop.id, 'ration'), -1, 'the city ration is endless');
  const leader = freshLeader(100);

  const res = buy(shop.id, leader.id, 'ration', 5);
  assert.equal(res.endless, true);
  assert.equal(res.quantity, -1, 'the shelf is still endless');
  assert.equal(stockQty(shop.id, 'ration'), -1);
  assert.equal(res.total, res.unitPrice * 5);
  assert.equal(res.gold, 100 - res.total);
  assert.equal(bagQty(leader.id, 'bread_loaf'), 5, 'ration resolves to bread');

  // Selling back into an endless shelf also leaves it endless.
  const back = sell(shop.id, leader.id, 'ration', 2);
  assert.equal(back.quantity, -1);
  assert.equal(stockQty(shop.id, 'ration'), -1);
});

// --- sanity: the seed keeps its geography -----------------------------------

test('reconciling keys changes no settlement geography', () => {
  seed();
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM settlements').get().n;
  assert.equal(count, SETTLEMENTS.length);
  const stock = getDb().prepare('SELECT COUNT(*) AS n FROM settlement_stock').get().n;
  assert.ok(stock > 0);
});
