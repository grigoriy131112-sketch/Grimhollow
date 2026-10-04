import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { getMap, getLocation, characterExploration, recordVisit } from '../src/services/world.js';
import { createCharacter } from '../src/services/characters.js';

test.after(() => closeDb());

test('the map exposes coordinates, scenes and roads for every location', () => {
  seedWorld();
  const map = getMap();
  assert.ok(map.locations.length >= 9);
  for (const l of map.locations) {
    assert.equal(typeof l.x, 'number', `${l.name} has an x coordinate`);
    assert.equal(typeof l.y, 'number', `${l.name} has a y coordinate`);
    assert.ok(l.scene, `${l.name} has a scene key`);
    assert.ok(l.biome, `${l.name} has a biome key`);
    assert.ok(l.x >= 0 && l.x <= 1000 && l.y >= 0 && l.y <= 620, `${l.name} fits the map viewBox`);
  }
  assert.ok(map.connections.length >= 8);
  const ids = new Set(map.locations.map((l) => l.id));
  for (const c of map.connections) {
    assert.ok(ids.has(c.from) && ids.has(c.to), 'roads connect known locations');
    assert.ok(c.from < c.to, 'each road is listed once');
  }
});

test('a location carries its scene and biome through to the detail view', () => {
  seedWorld();
  const map = getMap();
  const target = map.locations.find((l) => l.scene === 'black_spire');
  const detail = getLocation(target.id);
  assert.equal(detail.scene, 'black_spire');
  assert.equal(detail.biome, 'waste');
  assert.equal(detail.danger, 5);
});

test('each location has a distinct scene so no two places look alike', () => {
  seedWorld();
  const scenes = getMap().locations.map((l) => l.scene);
  assert.equal(new Set(scenes).size, scenes.length, 'scene keys are unique');
});

test('the map reports how many monsters haunt each location', () => {
  seedWorld();
  const map = getMap();
  const withMonsters = map.locations.filter((l) => l.monsterCount > 0);
  assert.ok(withMonsters.length >= 7, 'most dangerous locations have encounters');
  const spire = map.locations.find((l) => l.scene === 'black_spire');
  assert.equal(spire.monsterCount, 3);
});

test('a fresh character starts in a safe place, alone in the fog', () => {
  seedWorld();
  const hero = createCharacter({ name: `Соглядатай ${Math.floor(Math.random() * 1e6)}`, class: 'ranger' });
  const seen = characterExploration(hero.id);
  assert.ok(seen.locationId != null, 'the party has a home location');
  const home = getLocation(seen.locationId);
  assert.equal(home.is_safe, true, 'characters begin somewhere safe');
  assert.deepEqual(seen.visited, [seen.locationId], 'only the home place is known');
  assert.equal(seen.travel, null, 'no road under foot');

  // The map carries that same knowledge for the client.
  const map = getMap(hero.id);
  assert.equal(map.character.locationId, seen.locationId);
  assert.deepEqual(map.character.visited, [seen.locationId]);
});

test('standing somewhere new reveals it on the map', () => {
  seedWorld();
  const hero = createCharacter({ name: `Ходок ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  characterExploration(hero.id); // assign the home
  const far = getMap().locations.find((l) => l.id !== getDb().prepare('SELECT location_id FROM characters WHERE id = ?').get(hero.id).location_id);
  recordVisit(hero.id, far.id);
  const seen = characterExploration(hero.id);
  assert.ok(seen.visited.includes(far.id), 'the new place is remembered');
  assert.equal(seen.locationId, far.id, 'the party now stands there');
});

test('re-seeding backfills map data without duplicating the world', () => {
  seedWorld();
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM locations').get().n;
  getDb().prepare('UPDATE locations SET map_x = NULL, map_y = NULL, scene = NULL, biome = NULL').run();
  seedWorld();
  const after = getDb().prepare('SELECT COUNT(*) AS n FROM locations').get().n;
  assert.equal(after, before, 'no duplicate locations were inserted');
  const map = getMap();
  assert.ok(map.locations.every((l) => l.x != null && l.scene), 'map data was restored');
});
