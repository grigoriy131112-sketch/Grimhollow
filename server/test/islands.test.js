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
import { ISLANDS, islandByKey, islandGold, islandItem } from '../src/game/islands.js';
import { rollVoyage, pickIsland } from '../src/game/naval.js';
import { routeFor } from '../src/game/continent_travel.js';
import { grantItem } from '../src/services/items.js';
import {
  startVoyage, getVoyageView, resolveVoyageStop, putInIsland, sailPastIsland,
  leaveIsland, searchIsland, islandClaims,
} from '../src/services/naval.js';

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

// Force a voyage whose first stop is an island, so the ask path is exercised
// whatever the seed rolls. `plan` is overwritten after the row is created.
function voyageWithIslandStop(characterId, isle = ISLANDS[0]) {
  // Grant the route's toll so the voyage can start, then overwrite the plan so
  // the first (and only) stop is the island under test.
  const route = routeFor(PORT_A, PORT_B);
  if (route.item) grantItem(characterId, route.item.key, route.item.qty);
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(Math.max(5000, (route.gold || 0) + 500), characterId);
  const view = startVoyage({ characterId, fromId: idOf(PORT_A), toId: idOf(PORT_B) });
  const stops = [{ kind: 'island', island: { key: isle.key, name: isle.name, description: isle.description }, title: 'Неизвестный остров' }];
  getDb().prepare('UPDATE voyages SET stops = ?, cursor = 0, resolved = 0, mode = ? WHERE id = ?')
    .run(JSON.stringify(stops), 'voyage', view.id);
  return getVoyageView(characterId);
}

test.after(() => closeDb());

// --- the islands are hidden --------------------------------------------------

test('islands are seeded as hidden locations on a hidden continent', () => {
  seedAll();
  const db = getDb();
  const hidden = db.prepare('SELECT * FROM locations WHERE hidden = 1').all();
  assert.equal(hidden.length, ISLANDS.length, 'one location per island');
  for (const isle of ISLANDS) {
    const row = db.prepare('SELECT * FROM locations WHERE name = ? AND hidden = 1').get(isle.name);
    assert.ok(row, `${isle.name} is seeded hidden`);
    assert.ok(row.scene, `${isle.name} has a scene`);
    assert.ok(row.danger >= 3, `${isle.name} is dangerous`);
  }
  const hiddenContinent = db.prepare('SELECT * FROM continents WHERE hidden = 1').get();
  assert.ok(hiddenContinent, 'the islands live on a hidden continent');
});

test('no island ever appears on the map, in a list or under a continent', () => {
  seedAll();
  const map = getMap();
  const names = new Set(map.locations.map((l) => l.name));
  for (const isle of ISLANDS) assert.ok(!names.has(isle.name), `${isle.name} is not on the map`);
  assert.ok(!map.continents.some((c) => c.name === 'Море Осколков'), 'the island continent is not listed');

  const listed = listContinents().map((c) => c.name);
  assert.ok(!listed.includes('Море Осколков'), 'nor in the continent list');
  assert.equal(getContinent('Море Осколков'), null, 'nor reachable by name');

  // No monster count leaks either: an island's haunts must not inflate a normal
  // place, and the map carries no island entry at all.
  assert.equal(map.locations.filter((l) => ISLANDS.some((i) => i.name === l.name)).length, 0);
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
  assert.ok(view.islandId, 'the view resolves the real seeded island id');
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
  // The party lands at the far port once the voyage is done.
  assert.equal(characterExploration(c.id).locationId, idOf(PORT_B), 'landed at the far port');
  const claims = islandClaims(c.id);
  assert.equal(claims.length, 0, 'sailing past leaves no claim');
});

test('accepting the island puts the party ashore on a real walkable location', () => {
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
  assert.equal(view.ashore, res.locationId, 'ashore points at the island location');

  // The island is a real location the party stands on: it has a scene, monsters
  // and a name, exactly like a continent's place.
  const here = getLocation(res.locationId);
  assert.equal(here.name, isle.name);
  assert.ok(here.scene, 'the island has a scene');
  assert.ok(here.monsters.length > 0, 'the island has monsters to fight');
  assert.equal(characterExploration(c.id).locationId, res.locationId, 'the party really stands there');
  assert.ok(islandClaims(c.id).some((cl) => cl.islandId === res.locationId), 'the landing is recorded');
});

test('searching the hoard pays once, then the island is empty', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Кладоискатель' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const isle = islandByKey('drowned_bell');
  voyageWithIslandStop(c.id, isle);
  resolveVoyageStop(c.id);
  const landed = putInIsland(c.id);

  const before = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  const first = searchIsland(c.id);
  assert.equal(first.alreadySearched, false, 'the first search finds the hoard');
  assert.ok(first.gold >= 0);
  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.equal(after, before + first.gold, 'the gold was added once');

  const second = searchIsland(c.id);
  assert.equal(second.alreadySearched, true, 'nothing is left to find');
  assert.equal(second.gold, 0);
  assert.equal(getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold, after, 'no double payout');
  assert.equal(landed.locationId, getLocation(landed.locationId).id);
});

test('putting back to sea returns the party to the water beside the island', () => {
  seedAll();
  const c = hero();
  buyShip(c.id, { name: 'Возвращенец' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  voyageWithIslandStop(c.id);
  resolveVoyageStop(c.id);
  putInIsland(c.id);

  const res = leaveIsland(c.id);
  assert.ok(res.afloat, 'the ship is back under way');
  const view = res.voyage;
  assert.equal(view.ashore, null, 'the party is no longer ashore');
  assert.ok(view.done, 'the island stop was passed, so the voyage ends');
  assert.equal(characterExploration(c.id).locationId, idOf(PORT_B), 'and the voyage lands at the far port');
  // The party is not stranded: it can sail again.
  const back = routeFor(PORT_B, PORT_A);
  if (back.item) grantItem(c.id, back.item.key, back.item.qty);
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(5000, c.id);
  const next = startVoyage({ characterId: c.id, fromId: idOf(PORT_B), toId: idOf(PORT_A) });
  assert.ok(next, 'a fresh voyage can begin');
});

test('the voyage roll names a seeded island when it draws one', () => {
  seedAll();
  const keys = new Set(ISLANDS.map((i) => i.key));
  let sawIsland = false;
  for (let i = 0; i < 60; i += 1) {
    const v = rollVoyage({ seed: `w${i}`, tier: 2 });
    for (const stop of v.stops) {
      if (stop.kind !== 'island') continue;
      sawIsland = true;
      assert.ok(keys.has(stop.island.key), 'the stop names a real island key');
    }
  }
  assert.ok(sawIsland, 'some voyages do draw an island');
  assert.equal(pickIsland('fixed').key, pickIsland('fixed').key, 'the draw is deterministic');
});

test('the loot helpers stay inside the seeded pool', () => {
  const isle = islandByKey('salt_skull');
  const gold = islandGold(isle, 0.5);
  assert.ok(gold >= 50 && gold <= 110, 'gold stays in the island band');
  const item = islandItem(isle, 0.99);
  assert.ok(item && item.qty > 0, 'an item is always drawn when the hoard has one');
});
