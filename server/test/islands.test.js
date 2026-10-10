import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedMonstersExtra } from '../src/db/seed_monsters_extra.js';
import { seedIslands } from '../src/db/seed_islands.js';
import { createCharacter } from '../src/services/characters.js';
import { getMap, getLocation, recordVisit, characterExploration } from '../src/services/world.js';
import { listContinents, getContinent } from '../src/services/continents.js';
import { buyShip } from '../src/services/ship.js';
import { startTravel } from '../src/services/travel.js';
import { ISLANDS, islandByKey, lootGold, lootItem } from '../src/game/islands.js';
import { rollVoyage, pickIsland } from '../src/game/naval.js';
import { routeFor } from '../src/game/continent_travel.js';
import { grantItem } from '../src/services/items.js';
import {
  startVoyage, getVoyageView, resolveVoyageStop, putInIsland, sailPastIsland,
  leaveIsland, searchIsland, islandClaims, exploreIslandLandmark, raidIslandLandmark,
} from '../src/services/naval.js';
import { getBattleView, recordIslandRaid } from '../src/services/battles.js';
import { getSettlementByLocation } from '../src/services/settlements.js';

let n = 0;
function hero({ gold = 5000 } = {}) {
  n += 1;
  seedWorld();
  const c = createCharacter({ name: `Островитянин ${n} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  const port = getDb().prepare("SELECT id FROM locations WHERE name = 'Сумеречная гавань'").get().id;
  recordVisit(c.id, port);
  return c;
}

function seedAll() {
  seedWorld();
  seedContinents();
  seedMonstersExtra();
  seedIslands();
}

const PORT_A = 'Сумеречная гавань';
const PORT_B = 'Порт Солёного Стекла';
const idOf = (name) => getDb().prepare('SELECT id FROM locations WHERE name = ?').get(name).id;

// Force a voyage whose first (and only) stop is an island, so the ask path is
// exercised whatever the seed rolls.
function voyageWithIslandStop(characterId, isle = ISLANDS[0]) {
  const route = routeFor(PORT_A, PORT_B);
  if (route.item) grantItem(characterId, route.item.key, route.item.qty);
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(Math.max(5000, (route.gold || 0) + 500), characterId);
  const view = startVoyage({ characterId, fromId: idOf(PORT_A), toId: idOf(PORT_B) });
  const stops = [{ kind: 'island', island: { key: isle.key, name: isle.name, description: isle.anchor.description }, title: 'Неизвестный остров' }];
  getDb().prepare('UPDATE voyages SET stops = ?, cursor = 0, resolved = 0, mode = ? WHERE id = ?')
    .run(JSON.stringify(stops), 'voyage', view.id);
  return getVoyageView(characterId);
}

test.after(() => closeDb());

// --- the islands are hidden, and each is a little country --------------------

test('every island is seeded hidden, with several places and the roads between them', () => {
  seedAll();
  const db = getDb();
  for (const isle of ISLANDS) {
    assert.ok(isle.locations.length >= 3, `${isle.name} holds several places`);
    const rows = isle.locations.map((l) => db.prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(l.name));
    for (const [i, row] of rows.entries()) {
      assert.ok(row, `${isle.locations[i].name} is seeded hidden`);
      assert.ok(row.scene && row.biome, `${row.name} has a scene and biome`);
      if (isle.locations[i].kind === 'place') {
        assert.ok(row.danger >= isle.base, `${row.name} is dangerous`);
      } else {
        assert.ok(row.danger >= 1, `${row.name} can bite`);
      }
    }
    for (const row of rows) {
      const degree = db.prepare('SELECT COUNT(*) AS n FROM connections WHERE from_id = ?').get(row.id).n;
      assert.ok(degree >= 1, `${row.name} is reachable on foot`);
    }
  }
  const hidden = db.prepare('SELECT COUNT(*) AS n FROM locations WHERE hidden = 1').get().n;
  assert.equal(hidden, ISLANDS.length * 4, 'four places per island');
});

test('no island place ever appears on the map, in a list or under a continent', () => {
  seedAll();
  const map = getMap();
  const names = new Set(map.locations.map((l) => l.name));
  for (const isle of ISLANDS) {
    for (const loc of isle.locations) assert.ok(!names.has(loc.name), `${loc.name} is not on the map`);
  }
  assert.ok(!map.continents.some((c) => c.name === 'Море Осколков'), 'the island continent is not listed');
  assert.ok(!listContinents().map((c) => c.name).includes('Море Осколков'), 'nor in the continent list');
  assert.equal(getContinent('Море Осколков'), null, 'nor reachable by name');
});

// --- the sea asks ------------------------------------------------------------

test('a voyage that reaches an island asks instead of logging it', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Спросик' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  voyageWithIslandStop(c.id);

  const res = resolveVoyageStop(c.id);
  assert.equal(res.ask, 'island', 'the sea asks whether to put in');
  assert.equal(res.battleId, null, 'no fight is started for an island');
  const view = getVoyageView(c.id);
  assert.equal(view.cursor, 0, 'the cursor does not move until the party answers');
  assert.equal(view.mode, 'voyage', 'still on the water');
  assert.ok(view.islandId, 'the view resolves the island anchor id');
  assert.equal(view.islandPlaces.length, 4, 'and lists the island\u2019s places');
});

test('refusing the island sails past it and moves on', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Строптивый' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  voyageWithIslandStop(c.id);
  resolveVoyageStop(c.id);

  const res = sailPastIsland(c.id);
  assert.ok(res.sailedPast, 'the ship holds its course');
  assert.ok(res.voyage.done, 'the only stop was passed, so the voyage is over');
  assert.equal(res.voyage.ashore, null, 'the party never went ashore');
  assert.equal(characterExploration(c.id).locationId, idOf(PORT_B), 'landed at the far port');
  assert.equal(islandClaims(c.id).length, 0, 'sailing past leaves no claim');
});

// --- docking mirrors continents ----------------------------------------------

test('accepting the island puts the party ashore on its anchor and opens the island', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Гостеприимный' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = ISLANDS[0];
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);

  const res = putInIsland(c.id);
  assert.ok(res.landed, 'the party went ashore');
  const view = getVoyageView(c.id);
  assert.equal(view.mode, 'island', 'the voyage records the party is ashore');
  assert.equal(view.ashore, res.locationId, 'ashore points at the island anchor');
  assert.equal(res.locationId, view.islandPlaces[0].id, 'the anchor is the shore');

  const anchor = getLocation(res.locationId);
  assert.equal(anchor.name, isle.locations[0].name);
  assert.ok(anchor.monsters.length > 0, 'the shore has beasts');
  assert.ok(anchor.connections.length >= 1, 'the shore leads inward');
  assert.equal(characterExploration(c.id).locationId, res.locationId, 'the party really stands there');
  assert.ok(islandClaims(c.id).some((cl) => cl.islandId === res.locationId), 'the landing is recorded');
});

test('the island is walked on foot, shore to heart, like a continent', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Ходок' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = islandByKey('bone_hook');
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);
  const landed = putInIsland(c.id);

  const shore = getLocation(landed.locationId);
  const inwards = shore.connections[0];
  const trip = startTravel({ characterId: c.id, fromId: shore.id, toId: inwards.toId });
  assert.ok(trip, 'the party can set out along the island\u2019s road');
  assert.equal(trip.to.id, inwards.toId, 'the road leads to the next place');
  assert.equal(getLocation(inwards.toId).hidden, 1, 'the interior place is part of the hidden island');
});

test('searching a place pays once; each place hides its own cache', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Кладоискатель' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = islandByKey('drowned_bell');
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);
  putInIsland(c.id);
  const shoreId = getVoyageView(c.id).ashore;

  const before = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  const first = searchIsland(c.id);
  assert.equal(first.alreadySearched, false, 'the shore cache pays');
  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.equal(after, before + first.gold, 'the gold was added once');

  const second = searchIsland(c.id);
  assert.equal(second.alreadySearched, true, 'the same place is empty now');
  assert.equal(getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold, after, 'no double payout');

  const inwardId = getLocation(shoreId).connections[0].toId;
  getDb().prepare('UPDATE voyages SET ashore_id = ? WHERE character_id = ? AND resolved = 0').run(inwardId, c.id);
  recordVisit(c.id, inwardId);
  const third = searchIsland(c.id);
  assert.equal(third.alreadySearched, false, 'a fresh place still hides a cache');
});

test('the party can only put back to sea from the shore', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Возвращенец' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  voyageWithIslandStop(c.id);
  resolveVoyageStop(c.id);
  putInIsland(c.id);
  const shoreId = getVoyageView(c.id).ashore;

  const inwardId = getLocation(shoreId).connections[0].toId;
  getDb().prepare('UPDATE voyages SET ashore_id = ? WHERE character_id = ? AND resolved = 0').run(inwardId, c.id);
  recordVisit(c.id, inwardId);
  assert.throws(() => leaveIsland(c.id), /берег|причал/i, 'the ship waits at the shore');

  getDb().prepare('UPDATE voyages SET ashore_id = ? WHERE character_id = ? AND resolved = 0').run(shoreId, c.id);
  recordVisit(c.id, shoreId);
  const res = leaveIsland(c.id);
  assert.ok(res.afloat, 'the ship is back under way');
  assert.equal(res.voyage.ashore, null, 'the party is no longer ashore');
  assert.ok(res.voyage.done, 'the island stop was passed, so the voyage ends');
  assert.equal(characterExploration(c.id).locationId, idOf(PORT_B), 'and the voyage lands at the far port');
});

// --- the island's landmark: explore it, or raid it ---------------------------

test('every island carries one distinct landmark reachable from the heart', () => {
  seedAll();
  const db = getDb();
  const kinds = new Set();
  for (const isle of ISLANDS) {
    const row = db.prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.landmark.name);
    assert.ok(row, `${isle.landmark.name} is seeded hidden`);
    const degree = db.prepare('SELECT COUNT(*) AS n FROM connections WHERE from_id = ?').get(row.id).n;
    assert.ok(degree >= 1, 'the landmark is reachable on foot');
    kinds.add(isle.landmark.landmarkKind);
  }
  assert.ok(kinds.size >= 3, 'islands differ: villages, temples, shrines and camps all appear');
});

test('a native village landmark carries a settlement with a tavern and a shop', () => {
  seedAll();
  const villages = ISLANDS.filter((i) => i.landmark.landmarkKind === 'village');
  assert.ok(villages.length > 0, 'some islands are peopled');
  for (const isle of villages) {
    const row = getDb().prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.landmark.name);
    assert.equal(row.is_safe, 1, 'a village is a safe haven');
    const settlement = getSettlementByLocation(row.id);
    assert.ok(settlement, `${isle.name} has a settlement at its village`);
    const types = new Set(settlement.buildings.map((b) => b.type));
    for (const t of ['tavern', 'shop', 'market', 'temple']) assert.ok(types.has(t), `the village has a ${t}`);
    assert.equal(settlement.kind, 'native_village');
  }
});

test('exploring a landmark pays a gift, once, and closes it to raiding', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Миротворец' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = islandByKey('salt_skull');
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);
  putInIsland(c.id);
  const lmRow = getDb().prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.landmark.name);
  getDb().prepare('UPDATE voyages SET ashore_id = ? WHERE character_id = ? AND resolved = 0').run(lmRow.id, c.id);
  recordVisit(c.id, lmRow.id);

  const before = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  const res = exploreIslandLandmark(c.id);
  assert.equal(res.explored, true, 'the place is explored');
  assert.ok(res.note, 'the place shares its story');
  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.equal(after, before + res.gold, 'the small gift was paid once');
  assert.equal(getVoyageView(c.id).landmarkState, 'explored', 'the island remembers the peace');

  assert.throws(() => exploreIslandLandmark(c.id), /исследован/i, 'it cannot be explored twice');
  assert.throws(() => raidIslandLandmark(c.id), /грабить/i, 'an explored place cannot be raided');
});

test('raiding a landmark opens a real fight, and a win marks the island raided', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Разоритель' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = islandByKey('frost_maw');
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);
  putInIsland(c.id);
  const lmRow = getDb().prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.landmark.name);
  getDb().prepare('UPDATE voyages SET ashore_id = ? WHERE character_id = ? AND resolved = 0').run(lmRow.id, c.id);
  recordVisit(c.id, lmRow.id);

  const res = raidIslandLandmark(c.id);
  assert.ok(res.battleId, 'a fight is opened');
  assert.ok(res.potentialLoot.gold > 0, 'the raid promises a real haul');
  const battle = getBattleView(res.battleId);
  assert.equal(battle.kind, 'island_raid', 'the fight is a raid');
  assert.equal(battle.locationId, lmRow.id, 'over the landmark itself');

  const stake = recordIslandRaid(c.id, lmRow.id);
  assert.equal(stake.staked, true, 'a won raid is recorded');
  assert.equal(getVoyageView(c.id).landmarkState, 'raided', 'the island closed its peace');
  assert.equal(recordIslandRaid(c.id, lmRow.id).staked, false, 'and is not recorded twice');
});

test('the voyage roll names a seeded island when it draws one', () => {
  seedAll();
  const keys = new Set(ISLANDS.map((i) => i.key));
  let sawIsland = false;
  for (let i = 0; i < 120; i += 1) {
    const v = rollVoyage({ seed: `w${i}`, tier: 2 });
    for (const stop of v.stops) {
      if (stop.kind !== 'island') continue;
      sawIsland = true;
      assert.ok(keys.has(stop.island.key), 'the stop names a real island key');
      assert.equal(islandByKey(stop.island.key).locations.length, 4, 'the island has four places');
    }
  }
  assert.ok(sawIsland, 'some voyages do draw an island');
  assert.equal(pickIsland('fixed').key, pickIsland('fixed').key, 'the draw is deterministic');
});

test('the loot helpers stay inside a place\u2019s band', () => {
  const place = islandByKey('salt_skull').locations[2];
  const gold = lootGold(place, 0.5);
  assert.ok(gold >= place.loot.gold[0] && gold <= place.loot.gold[1], 'gold stays in the place band');
  const item = lootItem(place, 0.99);
  assert.ok(item && item.qty > 0, 'an item is always drawn when the cache has one');
});
