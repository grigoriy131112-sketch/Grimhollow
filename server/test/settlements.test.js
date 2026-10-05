import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import {
  seedSettlements, SETTLEMENTS, BUILDING_TYPES, REQUIRED_BUILDING_TYPES,
} from '../src/db/seed_settlements.js';
import {
  listSettlements, getSettlement, getSettlementByLocation, getBuilding, actionsFor,
} from '../src/services/settlements.js';
import { getLocation } from '../src/services/world.js';
import { LAND_MASK, LAND_MASK_COLS, LAND_MASK_ROWS } from '../test-support/land-mask.js';

test.after(() => closeDb());

function seed() {
  seedWorld();
  seedSettlements();
}

const cell = (x, y) => {
  const col = Math.min(LAND_MASK_COLS - 1, Math.floor((x / 1000) * LAND_MASK_COLS));
  const row = Math.min(LAND_MASK_ROWS - 1, Math.floor((y / 640) * LAND_MASK_ROWS));
  return LAND_MASK[row][col];
};

test('one city and one village are seeded, each with every required building', () => {
  seed();
  const all = listSettlements();
  assert.equal(all.length, 2, 'exactly one city and one village');
  assert.deepEqual(all.map((s) => s.kind).sort(), ['city', 'village']);

  for (const s of all) {
    assert.ok(/[А-Яа-яЁё]/.test(s.name), `${s.key} has a Russian name`);
    const full = getSettlement(s.id);
    assert.ok(full.buildings.length >= 9, `${s.name} is a fully detailed place`);
    const types = new Set(full.buildings.map((b) => b.type));
    for (const t of REQUIRED_BUILDING_TYPES) {
      assert.ok(types.has(t), `${s.name} has a ${t}`);
    }
    for (const b of full.buildings) {
      assert.ok(b.type, `${b.name} has a building type`);
      assert.ok(/[А-Яа-яЁё]/.test(b.name), `${b.key} has a Russian name`);
    }
  }
});

test('settlement locations are safe and stand on the drawn land', () => {
  seed();
  for (const s of listSettlements()) {
    const loc = getLocation(s.locationId);
    assert.equal(loc.is_safe, true, `${s.name} is a safe haven`);
    assert.equal(cell(loc.map_x, loc.map_y), '1', `${s.name} (${loc.map_x},${loc.map_y}) sits on land`);
  }
});

test('each settlement is connected to existing places, both ways, with minutes', () => {
  seed();
  for (const spec of SETTLEMENTS) {
    const s = listSettlements().find((x) => x.key === spec.key);
    const loc = getLocation(s.locationId);
    assert.ok(loc.connections.length >= 2, `${s.name} has roads out`);
    for (const c of loc.connections) {
      assert.ok(c.minutes > 0, `${s.name} -> ${c.toName} takes time`);
      const back = getLocation(c.toId).connections.find((rc) => rc.toId === loc.id);
      assert.ok(back, `road ${s.name} <-> ${c.toName} runs both ways`);
    }
  }
});

test('shops and markets carry stock in the G7 shape', () => {
  seed();
  for (const s of listSettlements()) {
    const full = getSettlement(s.id);
    const traders = full.buildings.filter((b) => b.canTrade);
    assert.ok(traders.length >= 2, `${s.name} has a shop and a market`);
    for (const b of traders) {
      assert.ok(b.stock.length > 0, `${b.name} has something to sell`);
      for (const offer of b.stock) {
        assert.match(offer.itemKey, /^[a-z_]+$/, 'item keys stay Latin');
        assert.ok(Number.isInteger(offer.price) && offer.price > 0, `${offer.itemKey} has a gold price`);
        assert.ok(Number.isInteger(offer.quantity) && offer.quantity >= -1, `${offer.itemKey} has a quantity`);
        assert.ok(offer.name && offer.name !== offer.itemKey, `${offer.itemKey} shows a Russian name`);
      }
    }
  }
});

test('the service resolves what a building type offers', () => {
  seed();
  const tavern = actionsFor('tavern');
  assert.ok(tavern.actions.length >= 1);
  assert.match(tavern.label, /[А-Яа-яЁё]/, 'the type label is Russian');
  for (const type of Object.keys(BUILDING_TYPES)) {
    assert.ok(actionsFor(type).actions.length >= 1, `${type} offers at least one action`);
    assert.match(actionsFor(type).label, /[А-Яа-яЁё]/);
  }
  // An unknown type is harmless: no actions, and the key stands in as the label.
  assert.deepEqual(actionsFor('nonexistent').actions, []);
});

test('getBuilding returns one building with its actions and stock', () => {
  seed();
  const city = listSettlements().find((s) => s.kind === 'city');
  const shop = getSettlement(city.id).buildings.find((b) => b.type === 'shop');
  const one = getBuilding(shop.id);
  assert.equal(one.id, shop.id);
  assert.equal(one.type, 'shop');
  assert.ok(one.actions.length >= 1);
  assert.ok(one.stock.length > 0);
  assert.equal(getBuilding(999999), null);
});

test('a location resolves to the settlement standing on it', () => {
  seed();
  const s = listSettlements()[0];
  const byLoc = getSettlementByLocation(s.locationId);
  assert.equal(byLoc.id, s.id);
  assert.equal(byLoc.buildings.length, getSettlement(s.id).buildings.length);
  assert.equal(getSettlementByLocation(999999), null);
  assert.equal(getSettlement(999999), null);
});

test('re-seeding settlements never duplicates them', () => {
  seed();
  const count = () => getDb().prepare('SELECT COUNT(*) AS n FROM settlements').get().n;
  const before = count();
  const again = seedSettlements();
  assert.equal(again.skipped, true);
  assert.equal(count(), before);
  const buildings = getDb().prepare('SELECT COUNT(*) AS n FROM settlement_buildings').get().n;
  seedSettlements();
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM settlement_buildings').get().n, buildings);
});
