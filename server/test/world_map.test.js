import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { getMap, getLocation, characterExploration, recordVisit } from '../src/services/world.js';
import { createCharacter } from '../src/services/characters.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { LAND_MASK, LAND_MASK_COLS, LAND_MASK_ROWS } from '../test-support/land-mask.js';

const GEO = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'src', 'world-geo.json'),
  'utf8',
));

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

// The world is drawn from one generated plate (maps/world-chart.svg); the mask
// is thresholded from those same pixels, so a marker cannot float out to sea.
test('every location stands on land, not out at sea', () => {
  seedWorld();
  const cell = (x, y) => {
    const col = Math.min(LAND_MASK_COLS - 1, Math.floor((x / 1000) * LAND_MASK_COLS));
    const row = Math.min(LAND_MASK_ROWS - 1, Math.floor((y / 640) * LAND_MASK_ROWS));
    return LAND_MASK[row][col];
  };
  for (const l of getMap().locations) {
    assert.equal(cell(l.x, l.y), '1', `${l.name} (${l.x},${l.y}) sits on land`);
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
  assert.ok(spire.monsterCount >= 3, 'the spire is thick with the dead');
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

// The atlas shows one continent at a time, so every continent must carry its own
// tallies rather than the whole world's. This seeds the four outer continents,
// so it runs last: later tests re-seed the world and would no longer be alone.
test('each continent carries its own statistics', () => {
  seedWorld();
  seedSettlements();
  seedContinents();
  const map = getMap();
  assert.ok(map.stats, 'the map has world totals');
  assert.equal(map.continents.length, 5, 'all five continents are present');
  assert.ok(map.continents.every((c) => c.stats), 'every continent has its own stats');

  const sum = (key) => map.continents.reduce((n, c) => n + c.stats[key], 0);
  assert.equal(sum('locations'), map.stats.locations, 'continent locations add up to the world total');
  assert.equal(sum('regions'), map.stats.regions, 'continent regions add up to the world total');
  assert.equal(sum('safe'), map.stats.safe, 'continent safe places add up to the world total');
  assert.equal(sum('ports'), map.stats.ports, 'continent ports add up to the world total');
  const dangerTotal = (c) => c.stats.byDanger.reduce((a, b) => a + b, 0);
  assert.equal(
    map.continents.reduce((n, c) => n + dangerTotal(c), 0),
    map.stats.byDanger.reduce((a, b) => a + b, 0),
    'continent danger counts add up to the world histogram',
  );
  assert.deepEqual(
    map.stats.byDanger, [1, 2, 3, 4, 5].map((d) => map.locations.filter((l) => l.danger === d).length),
    'the world histogram matches the world locations',
  );

  for (const c of map.continents) {
    const own = map.locations.filter((l) => l.continentName === c.name);
    assert.equal(c.stats.locations, own.length, `${c.name} counts its own locations`);
    assert.equal(c.stats.regions, c.regions.length, `${c.name} counts its own regions`);
    assert.equal(c.stats.safe, own.filter((l) => l.isSafe).length, `${c.name} counts its own safe places`);
    assert.equal(
      c.stats.byDanger.reduce((a, b) => a + b, 0), own.length,
      `${c.name} danger histogram covers all of its locations`,
    );
  }

  // Мордрат holds its starting places plus the city and the village, and two
  // more added when the continents were spread out; the four outer continents
  // each hold two regions of eight places, spread across the whole landmass.
  const mordrat = map.continents.find((c) => c.name === 'Мордрат');
  assert.equal(mordrat.stats.locations, 13);
  assert.equal(mordrat.stats.regions, 2);
  for (const name of ['Морозная Колыбель', 'Кор-Ашан', 'Вольные Гавани', 'Зелёный Предел']) {
    const c = map.continents.find((x) => x.name === name);
    assert.equal(c.stats.locations, 8, `${name} has eight places`);
    assert.equal(c.stats.regions, 2, `${name} has two regions`);
  }

  // Each of the five continents owns exactly one crossing port, and every port
  // is a safe harbour.
  assert.equal(sum('ports'), 5);
  assert.ok(map.locations.filter((l) => l.isPort).every((l) => l.isSafe), 'ports are safe places');
});


// The global map opens a continent by clicking its land. Rectangles cannot do
// that job: the continents' bounding boxes overlap, so the northern landmass's
// box sits wholly inside the eastern one's and every click there opened the
// wrong continent. Each continent therefore carries a `hits` path traced from
// the plate itself. These tests guard the two properties that fix depends on.
function hitRuns(d) {
  const runs = [];
  const re = /M([\d.-]+) ([\d.-]+)h([\d.-]+)v([\d.-]+)h([\d.-]+)z/g;
  let m;
  while ((m = re.exec(d))) runs.push([+m[1], +m[2], +m[3], +m[4]]);
  return runs;
}

const inside = (runs, x, y) => runs.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h);

test('every continent carries a click shape traced from the land', () => {
  assert.equal(GEO.continents.length, 5, 'the world still has five continents');
  for (const c of GEO.continents) {
    assert.ok(typeof c.hits === 'string' && c.hits.length > 0, `${c.name} has a hits path`);
    assert.ok(hitRuns(c.hits).length > 0, `${c.name} hits path has geometry`);
  }
});

test('continent click shapes never overlap and stay on land', () => {
  const cell = (x, y) => {
    const col = Math.min(LAND_MASK_COLS - 1, Math.max(0, Math.floor((x / 1000) * LAND_MASK_COLS)));
    const row = Math.min(LAND_MASK_ROWS - 1, Math.max(0, Math.floor((y / 640) * LAND_MASK_ROWS)));
    return LAND_MASK[row][col];
  };
  // The mask the tests carry is coarser than the grid the shapes are traced on,
  // so a shape's coastal edge can land one mask cell out. Treat a cell as sea
  // only when neither it nor any neighbour is land.
  const nearLand = (x, y) => {
    for (let dx = -8; dx <= 8; dx += 4) {
      for (let dy = -8; dy <= 8; dy += 4) if (cell(x + dx, y + dy) === '1') return true;
    }
    return false;
  };
  const runs = GEO.continents.map((c) => ({ name: c.name, runs: hitRuns(c.hits) }));
  // Sample the centre of each 5px block and count who owns it.
  const owners = new Map();
  for (let x = 2; x < 1000; x += 5) {
    for (let y = 2; y < 640; y += 5) {
      const hit = runs.filter((c) => inside(c.runs, x, y));
      assert.ok(hit.length <= 1, `only one continent owns (${x},${y})`);
      if (hit.length === 1) {
        owners.set(hit[0].name, (owners.get(hit[0].name) || 0) + 1);
        assert.ok(nearLand(x, y), `${hit[0].name} claims land at (${x},${y}), not open sea`);
      }
    }
  }
  // The north was the continent the old rectangles lost; it must own real land.
  assert.ok((owners.get('Морозная Колыбель') || 0) > 0, 'Морозная Колыбель is clickable');
  for (const c of GEO.continents) {
    assert.ok((owners.get(c.name) || 0) > 0, `${c.name} owns clickable land`);
  }
});

// Travel time is derived from the drawn distance between two places. When the
// world was redrawn as one compact plate the coordinates shrank about fourfold,
// but the pixels-per-minute divisor did not — every road's raw time fell under
// the floor and the whole map read "15 мин". Guard that a real spread survives.
test('roads on the seeded map take a range of times, not all the minimum', () => {
  seedWorld();
  const map = getMap();
  const minutes = map.connections.map((c) => c.minutes);
  assert.ok(map.connections.length > 10, 'the world has a road network');
  assert.ok(minutes.every((m) => m >= 15 && m <= 50), 'every road stays in the 15-50 band');
  assert.ok(new Set(minutes).size >= 4, `road times vary, got ${[...new Set(minutes)].sort((a, b) => a - b)}`);
  assert.ok(minutes.some((m) => m > 15), 'at least one road is longer than the floor');
  assert.ok(minutes.some((m) => m < 50), 'not every road is clamped to the ceiling');
});
