import { getDb, transaction } from './index.js';
import { travelMinutes, hashString } from '../game/travel.js';
import { ISLANDS, ISLAND_CONTINENT } from '../game/islands.js';

// The sea's scattered islands (Wave W-ISLES). Each island is a little country of
// its own: a hidden region on a hidden continent holding a shore, an interior, a
// heart and one landmark -- joined by ordinary roads, so the party walks the
// island exactly as it crosses a continent, and the landmark is the far end of
// the walk. A landmark that is a native village also carries a settlement (a
// tavern, a shop, a market, a temple), so an island the party chooses to explore
// is somewhere it can actually trade and rest.
//
// Every location carries `hidden = 1`, so no atlas, list, count or spawn pool
// ever shows one. Additive and idempotent: safe on every boot and on databases
// that predate the wave. Existing rows are matched by name and left alone.

function rngFrom(seed) {
  let a = hashString(String(seed)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A cluster of open-water coordinates for one island's four places. The spot
// drifts across the sheet by the key's hash; the points sit close together so the
// island reads as one little landmass. Never drawn (hidden), but real enough for
// the travel engine to time the island's own roads.
function islandCluster(key, count) {
  const rng = rngFrom(`isle-spot:${key}`);
  const bx = 140 + rng() * 720;
  const by = 100 + rng() * 380;
  const locals = [[0, 0], [22, -14], [38, 4], [12, 18]];
  return Array.from({ length: count }, (_, i) => {
    const [dx, dy] = locals[i % locals.length];
    return {
      x: Math.round(Math.min(960, Math.max(40, bx + dx))),
      y: Math.round(Math.min(600, Math.max(40, by + dy))),
    };
  });
}

// The stock a native village trades on: humble island goods, priced for the
// coast. Keys are shelf keys the trade service already reconciles to the item
// catalogue, so the villagers' shelf sells real items.
const NATIVE_STOCK = [
  { itemKey: 'ration', price: 4, quantity: -1 },
  { itemKey: 'waterskin', price: 7, quantity: -1 },
  { itemKey: 'dried_fish', price: 5, quantity: -1 },
  { itemKey: 'bandage', price: 9, quantity: 10 },
  { itemKey: 'torch', price: 3, quantity: 20 },
];
const NATIVE_MARKET = [
  { itemKey: 'turnip', price: 2, quantity: 40 },
  { itemKey: 'clay_jug', price: 5, quantity: 12 },
  { itemKey: 'leather_strap', price: 4, quantity: -1 },
  { itemKey: 'healing_herb', price: 11, quantity: 14 },
];

// The village buildings: enough to be a real place (tavern, temple, shop,
// market, inn) without the city's guild, library or smithy.
function nativeBuildings(isle) {
  const n = isle.landmark.name;
  return [
    { key: 'tavern', name: `Таверна племени «${n}»`, type: 'tavern', description: 'Очаг, вокруг которого племя делит добычу и слушает чужие рассказы.' },
    { key: 'temple', name: `Святилище племени «${n}»`, type: 'temple', description: 'Храм, где молятся тому, чего боятся и что задабривают.' },
    { key: 'shop', name: `Лавка племени «${n}»`, type: 'shop', description: 'Прилавок из плавника: соль, сушёная рыба и всякая мелочь моря.', stock: NATIVE_STOCK },
    { key: 'market', name: `Торг племени «${n}»`, type: 'market', description: 'Пара циновок под навесом из шкур: что собрали, тем и торгуют.', stock: NATIVE_MARKET },
    { key: 'inn', name: `Общий дом племени «${n}»`, type: 'inn', description: 'Земляной пол, охапка сена и место у огня для чужака, что не поднял руку.' },
  ];
}

export function seedIslands() {
  const db = getDb();
  // The base world must exist first, so every monster name an island links can
  // be found. If it is not seeded yet there is nothing to hang the isles on.
  const hub = db.prepare("SELECT id FROM continents WHERE name = 'Мордрат'").get();
  if (!hub) return { skipped: true, reason: 'нет Мордрата' };

  return transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order, hidden) VALUES (?, ?, ?, 1)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare(
      'INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
    );
    const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label, minutes) VALUES (?, ?, ?, ?)');
    const insSettlement = d.prepare('INSERT INTO settlements (location_id, key, name, kind, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    const insBuilding = d.prepare('INSERT INTO settlement_buildings (settlement_id, key, name, type, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    const insStock = d.prepare('INSERT OR IGNORE INTO settlement_stock (building_id, item_key, price, quantity, sort_order) VALUES (?, ?, ?, ?, ?)');

    const continentId = d.prepare('SELECT id FROM continents WHERE name = ?').get(ISLAND_CONTINENT.name)?.id
      || insContinent.run(ISLAND_CONTINENT.name, ISLAND_CONTINENT.description, 999).lastInsertRowid;

    const byName = new Map(d.prepare('SELECT name, id FROM monsters').all().map((m) => [m.name, m.id]));
    const locRow = (name) => d.prepare('SELECT * FROM locations WHERE name = ?').get(name);

    // An earlier cut of this wave held one location per island (or three), named
    // after the island itself. Those rows are still in a live database; clear them
    // (and their roads, spawns, settlements and now-empty regions) so the
    // four-place islands are the only shape. Targeted and idempotent.
    const expected = new Set(ISLANDS.flatMap((i) => i.locations.map((l) => l.name)));
    const stale = d.prepare(
      'SELECT l.id, l.name FROM locations l JOIN regions r ON r.id = l.region_id WHERE r.continent_id = ? AND l.hidden = 1',
    ).all(continentId).filter((l) => !expected.has(l.name));
    let staleRemoved = 0;
    for (const s of stale) {
      d.prepare('DELETE FROM connections WHERE from_id = ? OR to_id = ?').run(s.id, s.id);
      d.prepare('DELETE FROM location_monsters WHERE location_id = ?').run(s.id);
      d.prepare('DELETE FROM settlements WHERE location_id = ?').run(s.id);
      d.prepare('DELETE FROM locations WHERE id = ?').run(s.id);
      staleRemoved += 1;
    }
    if (staleRemoved) {
      d.prepare(
        'DELETE FROM regions WHERE continent_id = ? AND id NOT IN (SELECT DISTINCT region_id FROM locations WHERE region_id IS NOT NULL)',
      ).run(continentId);
    }

    let regionsAdded = 0;
    let locationsAdded = 0;
    let roadsAdded = 0;
    let settlementsAdded = 0;

    ISLANDS.forEach((isle, i) => {
      let regionId = d.prepare('SELECT id FROM regions WHERE continent_id = ? AND name = ?').get(continentId, isle.name)?.id;
      if (!regionId) {
        regionId = insRegion.run(continentId, isle.name, `Остров ${isle.name}: берег, чаща, сердце и одно место, ради которого сюда идут.`, i).lastInsertRowid;
        regionsAdded += 1;
      }

      const coords = islandCluster(isle.key, isle.locations.length);
      isle.locations.forEach((loc, li) => {
        if (locRow(loc.name)) return;
        const c = coords[li];
        const isSafe = loc.kind === 'landmark' && loc.landmarkKind === 'village' ? 1 : 0;
        const lid = insLocation.run(
          regionId, loc.name, loc.description, loc.danger, isSafe, li,
          c.x, c.y, loc.scene, loc.biome,
        ).lastInsertRowid;
        locationsAdded += 1;
        (loc.monsters || []).forEach((name, idx) => {
          const mid = byName.get(name);
          if (mid) insSpawn.run(lid, mid, Math.max(1, 4 - idx));
        });
        // A native village carries a settlement: a tavern, a shop, a market.
        if (loc.settlementKind === 'native_village') {
          const sid = insSettlement.run(lid, `isle_${isle.key}_village`, `${loc.name}`, loc.settlementKind, loc.description, 0).lastInsertRowid;
          nativeBuildings(isle).forEach((b, bi) => {
            const bid = insBuilding.run(sid, b.key, b.name, b.type, b.description ?? '', bi).lastInsertRowid;
            (b.stock || []).forEach((offer, oi) => insStock.run(bid, offer.itemKey, offer.price, offer.quantity ?? -1, oi));
          });
          settlementsAdded += 1;
        }
      });

      // Roads inside the island: shore -> interior -> heart -> landmark, plus a
      // shortcut from the shore straight to the heart. Minutes are derived from
      // the drawn distance, exactly like a continent's roads.
      const ids = isle.locations.map((loc) => locRow(loc.name)?.id).filter(Boolean);
      const link = (a, b) => {
        const rowA = d.prepare('SELECT map_x, map_y, biome, danger FROM locations WHERE id = ?').get(a);
        const rowB = d.prepare('SELECT map_x, map_y, biome, danger FROM locations WHERE id = ?').get(b);
        const minutes = travelMinutes({
          from: { x: rowA.map_x, y: rowA.map_y, biome: rowA.biome, danger: rowA.danger },
          to: { x: rowB.map_x, y: rowB.map_y, biome: rowB.biome, danger: rowB.danger },
        });
        const nameA = d.prepare('SELECT name FROM locations WHERE id = ?').get(a).name;
        const nameB = d.prepare('SELECT name FROM locations WHERE id = ?').get(b).name;
        roadsAdded += insConn.run(a, b, `Тропа к ${nameB}`, minutes).changes;
        roadsAdded += insConn.run(b, a, `Тропа к ${nameA}`, minutes).changes;
      };
      if (ids.length >= 2) link(ids[0], ids[1]);
      if (ids.length >= 3) { link(ids[1], ids[2]); link(ids[0], ids[2]); }
      if (ids.length >= 4) { link(ids[2], ids[3]); link(ids[0], ids[3]); }
    });

    return { islands: ISLANDS.length, regionsAdded, locationsAdded, roadsAdded, settlementsAdded, staleRemoved };
  });
}

export { ISLANDS };
