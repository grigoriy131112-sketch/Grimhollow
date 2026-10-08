import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents, CONTINENTS } from '../src/db/seed_continents.js';
import {
  listContinents, getContinent, listGates, crossingsFor, startCrossing, resolveCrossing,
} from '../src/services/continents.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { getMap, getLocation, recordVisit, characterExploration } from '../src/services/world.js';
import { grantItem, hasItem } from '../src/services/items.js';
import {
  CROSSINGS, CROSSING_GATES, MINUTES_PER_DAY, MIN_DAYS, MAX_DAYS,
  routeFor, crossingMinutes, crossingView, canAfford, resolveCrossing as resolveRules,
} from '../src/game/continent_travel.js';
import { LAND_MASK, LAND_MASK_COLS, LAND_MASK_ROWS } from '../test-support/land-mask.js';

test.after(() => closeDb());

function seed() {
  seedWorld();
  seedSettlements();
  seedContinents();
}

const cell = (x, y) => {
  const col = Math.min(LAND_MASK_COLS - 1, Math.floor((x / 1000) * LAND_MASK_COLS));
  const row = Math.min(LAND_MASK_ROWS - 1, Math.floor((y / 640) * LAND_MASK_ROWS));
  return LAND_MASK[row][col];
};

const NEW_CONTINENTS = ['Морозная Колыбель', 'Кор-Ашан', 'Вольные Гавани', 'Зелёный Предел'];

// --- seed shape ---------------------------------------------------------------

test('the four new continents are seeded beside Мордрат, each with regions and locations', () => {
  seed();
  const all = listContinents();
  assert.equal(all.length, 5, 'Мордрат plus the four canon continents');
  assert.equal(all[0].name, 'Мордрат', 'the starting continent keeps its order');

  for (const name of NEW_CONTINENTS) {
    const c = getContinent(name);
    assert.ok(c, `${name} is seeded`);
    assert.ok(/[А-Яа-яЁё]/.test(c.name), `${name} has a Russian name`);
    assert.ok(/[А-Яа-яЁё]/.test(c.description), `${name} has a Russian description`);
    assert.ok(c.regions.length >= 2, `${name} has at least two regions`);
    const locations = c.regions.flatMap((r) => r.locations);
    assert.ok(locations.length >= 4, `${name} has several locations spread across it`);
    for (const l of locations) {
      assert.ok(/[А-Яа-яЁё]/.test(l.name), `${l.name} has a Russian name`);
      assert.ok(/[А-Яа-яЁё]/.test(l.description), `${l.name} has a Russian description`);
      assert.ok(Number.isInteger(l.danger) && l.danger >= 1, `${l.name} has a danger rating`);
      assert.ok(l.biome, `${l.name} has a biome key`);
      assert.ok(l.scene, `${l.name} has a scene key`);
      assert.equal(typeof l.map_x, 'number', `${l.name} has an x coordinate`);
      assert.equal(typeof l.map_y, 'number', `${l.name} has a y coordinate`);
    }
    // Each region is populated, so the continent reads as a real place.
    for (const r of c.regions) {
      assert.ok(r.locations.length >= 1, `${name} / ${r.name} has a location`);
    }
  }
});

test('every new location sits on the drawn land, not out at sea', () => {
  seed();
  const map = getMap();
  const newNames = new Set(CONTINENTS.flatMap((c) => c.regions).flatMap((r) => r.locations).map((l) => l.name));
  const checked = map.locations.filter((l) => newNames.has(l.name));
  assert.equal(checked.length, newNames.size, 'all new locations are on the map');
  for (const l of checked) {
    assert.equal(cell(l.x, l.y), '1', `${l.name} (${l.x},${l.y}) sits on land`);
  }
});

test('every continent\'s places are spread across its land, not clustered', () => {
  seed();
  const map = getMap();
  for (const continent of listContinents()) {
    const own = map.locations.filter((l) => l.continentName === continent.name);
    assert.ok(own.length >= 6, `${continent.name} has enough places to spread out`);
    const xs = own.map((l) => l.x);
    const ys = own.map((l) => l.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const [long, short] = w >= h ? [w, h] : [h, w];
    assert.ok(long >= 40, `${continent.name} places reach across the land (span ${long})`);
    assert.ok(short >= 15, `${continent.name} places are not strung on one line (span ${short})`);
  }
});

test('existing Мордрат locations keep their authored coordinates', () => {
  seed();
  const map = getMap();
  // The world is drawn from the generated plate now
  // (client/public/art/maps/world-chart.svg), so these are the canonical points
  // cut onto that plate by tools/place_map_locations.mjs; the land test below
  // checks them against the same mask, and this guards that re-seeding never
  // drifts them.
  const anchors = {
    'Перекрёсток висельников': [500, 278],
    'Сумеречная гавань': [528, 300],
    'Затонувшая часовня': [484, 348],
    'Чёрный шпиль': [584, 218],
    'Гримхольд': [552, 203],
    'Соляной Брод': [434, 344],
  };
  for (const [name, [x, y]] of Object.entries(anchors)) {
    const l = map.locations.find((m) => m.name === name);
    assert.ok(l, `${name} still exists`);
    assert.equal(l.x, x, `${name} keeps its x`);
    assert.equal(l.y, y, `${name} keeps its y`);
  }
});

test('each new continent reaches Мордрат through its port gate, and only by crossing', () => {
  seed();
  const hub = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  assert.ok(hub, 'the port gate exists');

  // Every non-hub gate is the far end of a crossing route from the hub.
  for (const route of CROSSINGS) {
    assert.equal(route.from, 'Сумеречная гавань', `${route.key} sails from the Мордрат hub`);
  }

  // There must be no ordinary road between the hub and a new continent: a free
  // road would bypass the crossing's fare, toll and danger.
  for (const gateName of CROSSING_GATES.filter((n) => n !== 'Сумеречная гавань')) {
    const gate = getDb().prepare('SELECT id FROM locations WHERE name = ?').get(gateName);
    assert.ok(gate, `${gateName} is seeded`);
    const road = getDb().prepare(
      'SELECT 1 FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
    ).get(gate.id, hub.id, hub.id, gate.id);
    assert.equal(road, undefined, `${gateName} has no free walk to the hub`);

    // The port is still a real place with an internal road into its continent.
    const out = getDb().prepare('SELECT COUNT(*) AS n FROM connections WHERE from_id = ?').get(gate.id).n;
    assert.ok(out >= 1, `${gateName} has a road into its continent`);
  }
});

test('re-seeding continents never duplicates them', () => {
  seed();
  const count = () => getDb().prepare('SELECT COUNT(*) AS n FROM continents').get().n;
  const before = count();
  const again = seedContinents();
  assert.equal(again.skipped, true);
  assert.equal(count(), before, 'no duplicate continents');
});

// --- crossing rules -----------------------------------------------------------

test('every crossing joins two gates on different continents', () => {
  seed();
  const gates = new Set(CROSSING_GATES);
  assert.equal(CROSSINGS.length, 4, 'one crossing to each new continent');
  for (const route of CROSSINGS) {
    assert.ok(gates.has(route.from), `${route.key} starts at a gate`);
    assert.ok(gates.has(route.to), `${route.key} ends at a gate`);
    assert.equal(getContinent(route.from), null, 'gate names are locations, not continents');
    assert.ok(route.days >= MIN_DAYS && route.days <= MAX_DAYS, `${route.key} is a multi-day voyage`);
    assert.ok(Number.isInteger(route.gold) && route.gold > 0, `${route.key} costs gold`);
    assert.ok(route.danger > 0 && route.danger < 1, `${route.key} has an honest danger chance`);
    assert.ok(route.item && route.item.key && route.item.qty > 0, `${route.key} asks for a toll`);
    assert.ok(/[А-Яа-яЁё]/.test(route.text), `${route.key} has Russian flavour text`);
  }
});

test('a crossing is a long voyage, not a short road', () => {
  for (const route of CROSSINGS) {
    const minutes = crossingMinutes(route);
    assert.equal(minutes, route.days * MINUTES_PER_DAY);
    assert.ok(minutes >= MIN_DAYS * MINUTES_PER_DAY, 'a crossing is at least the minimum days');
  }
});

test('routeFor is symmetric and unknown pairs resolve to null', () => {
  const r = CROSSINGS[0];
  assert.equal(routeFor(r.from, r.to)?.key, r.key);
  assert.equal(routeFor(r.to, r.from)?.key, r.key);
  assert.equal(routeFor('Сумеречная гавань', 'Ниоткуда'), null);
});

test('crossingView exposes everything the screen needs, in Russian', () => {
  const r = CROSSINGS[0];
  const view = crossingView(r, { from: 'A', to: 'B' });
  assert.equal(view.key, r.key);
  assert.equal(view.from, 'A');
  assert.equal(view.to, 'B');
  assert.equal(view.gold, r.gold);
  assert.equal(view.days, r.days);
  assert.equal(view.minutes, crossingMinutes(r));
  assert.deepEqual(view.item, r.item);
  assert.match(view.dangerLabel, /[А-Яа-яЁё]/, 'the danger label is Russian');
});

test('canAfford reports exactly what the party is missing', () => {
  const route = CROSSINGS[0];
  const rich = { gold: route.gold, hasItem: () => true };
  assert.equal(canAfford(route, rich).ok, true);
  const poor = canAfford(route, { gold: 0, hasItem: () => false });
  assert.equal(poor.ok, false);
  assert.deepEqual(poor.missing.map((m) => m.kind).sort(), ['gold', 'item']);
  const shortGold = canAfford(route, { gold: route.gold - 1, hasItem: () => true });
  assert.equal(shortGold.ok, false);
  assert.equal(shortGold.missing[0].kind, 'gold');
});

test('the sea resolves deterministically from the route seed', () => {
  const route = CROSSINGS[0];
  const a = resolveRules(route, { seed: 'same', day: 3 });
  const b = resolveRules(route, { seed: 'same', day: 3 });
  assert.deepEqual(a, b, 'the same seed always yields the same crossing');
  // A calm route never fights: danger 0 forces a safe outcome.
  assert.equal(resolveRules({ ...route, danger: 0 }, { seed: 'x', day: 1 }).kind, 'safe');
  // A lethal route never comes back safe: danger 1 always does something.
  assert.notEqual(resolveRules({ ...route, danger: 1 }, { seed: 'x', day: 1 }).kind, 'safe');
  assert.equal(resolveRules(null, {}).kind, 'nothing');
});

// --- service ------------------------------------------------------------------

test('the hub offers all four crossings, each far gate a real location', () => {
  seed();
  const hub = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const list = crossingsFor(hub.id);
  assert.equal(list.length, 4, 'every new continent is reachable from the hub');
  for (const c of list) {
    const far = getLocation(c.toId);
    assert.ok(far, `${c.to} resolves to a location`);
    assert.notEqual(far.region_id, null);
    assert.ok(c.minutes > 50, `${c.key} is longer than any road`);
    assert.equal(c.affordable, null, 'no character means no affordability check');
  }
  // A place with no gate offers nothing.
  const inland = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Перекрёсток висельников');
  assert.deepEqual(crossingsFor(inland.id), []);
});

test('crossingsFor reports affordability for a character', () => {
  seed();
  const hub = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const hero = createCharacter({ name: `Бедняк ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  const poor = crossingsFor(hub.id, hero.id);
  assert.ok(poor.every((c) => c.affordable && c.affordable.ok === false), 'a pauper cannot sail');

  getDb().prepare('UPDATE characters SET gold = 500 WHERE id = ?').run(hero.id);
  grantItem(hero.id, 'pale_lantern', 1);
  grantItem(hero.id, 'clean_water', 5);
  grantItem(hero.id, 'bread_loaf', 5);
  grantItem(hero.id, 'bitter_herb', 5);
  const rich = crossingsFor(hub.id, hero.id);
  assert.ok(rich.every((c) => c.affordable.ok === true), 'a provisioned party can sail anywhere');
});

test('sailing charges the fare and spends the toll', () => {
  seed();
  const from = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const to = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Ледяной причал');
  const route = routeFor('Сумеречная гавань', 'Ледяной причал');
  const hero = createCharacter({ name: `Моряк ${Math.floor(Math.random() * 1e6)}`, class: 'rogue' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(route.gold + 30, hero.id);
  grantItem(hero.id, route.item.key, route.item.qty);

  const res = startCrossing({ characterId: hero.id, fromId: from.id, toId: to.id });
  assert.equal(res.crossing.key, route.key);
  assert.ok(res.outcome.kind, 'the sea did something');
  const after = getCharacter(hero.id);
  // The fare is charged whatever happens; a gold-loss outcome can only take more.
  assert.ok(after.gold <= 30, `the fare of ${route.gold} was paid`);
  assert.equal(hasItem(hero.id, route.item.key, 1), false, 'the toll was spent');
});

test('a party without the fare cannot sail', () => {
  seed();
  const from = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const to = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Ледяной причал');
  const hero = createCharacter({ name: `Нищий ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  assert.throws(
    () => startCrossing({ characterId: hero.id, fromId: from.id, toId: to.id }),
    /Не хватает/,
  );
  assert.equal(getCharacter(hero.id).gold, 0, 'no gold is taken from a failed attempt');
});


test('sailing lands the party at the far port', () => {
  seed();
  const from = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const to = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Порт Солёного Стекла');
  const route = routeFor('Сумеречная гавань', 'Порт Солёного Стекла');
  const hero = createCharacter({ name: `Пассажир ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(route.gold + 10, hero.id);
  grantItem(hero.id, route.item.key, route.item.qty);

  // Stand at the gate so the map agrees with the crossing.
  recordVisit(hero.id, from.id);

  const res = startCrossing({ characterId: hero.id, fromId: from.id, toId: to.id });
  assert.equal(res.arrivedAt, to.id, 'the crossing reports where it landed');
  // Whether the sea was calm or threw a fight, the hero now stands at the far
  // port; a battle is seeded there, so the map and the fight both point at it.
  assert.equal(characterExploration(hero.id).locationId, to.id, 'the party moved to the far port');
  const map = getMap(hero.id);
  assert.equal(map.character.locationId, to.id, 'the map places the party at the port');
});

test('a crossing can only be started from the port the party stands in', () => {
  seed();
  const hub = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const other = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Ледяной причал');
  const route = routeFor('Сумеречная гавань', 'Ледяной причал');
  const hero = createCharacter({ name: `Скиталец ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(route.gold + 10, hero.id);
  grantItem(hero.id, route.item.key, route.item.qty);

  // The hero stands at the far port, so sailing *from* the hub is refused.
  recordVisit(hero.id, other.id);
  assert.throws(
    () => startCrossing({ characterId: hero.id, fromId: hub.id, toId: other.id }),
    /не находится здесь/,
  );

  // Standing at the hub, the voyage is allowed.
  recordVisit(hero.id, hub.id);
  const res = startCrossing({ characterId: hero.id, fromId: hub.id, toId: other.id });
  assert.equal(res.arrivedAt, other.id);
});

test('a crossing only runs between two gates', () => {
  seed();
  const hub = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const inland = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Перекрёсток висельников');
  const hero = createCharacter({ name: `Домосед ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  assert.throws(
    () => startCrossing({ characterId: hero.id, fromId: inland.id, toId: hub.id }),
    /перехода/,
  );
});

test('the service resolves a crossing by route key', () => {
  const { route, outcome } = resolveCrossing({ routeKey: CROSSINGS[0].key, seed: 'svc', day: 2 });
  assert.equal(route.key, CROSSINGS[0].key);
  assert.ok(outcome.kind, 'an outcome is returned');
  const missing = resolveCrossing({ routeKey: 'no_such_route' });
  assert.equal(missing.route, null);
  assert.equal(missing.outcome.kind, 'nothing');
});

test('listGates maps every gate to its continent', () => {
  seed();
  const gates = listGates();
  assert.equal(gates.length, CROSSING_GATES.length);
  const hub = gates.find((g) => g.name === 'Сумеречная гавань');
  assert.equal(hub.continent, 'Мордрат', 'the hub belongs to Мордрат');
  for (const g of gates) {
    assert.ok(g.continent, `${g.name} names its continent`);
    assert.ok(g.scene && g.biome, `${g.name} carries map data`);
  }
});
