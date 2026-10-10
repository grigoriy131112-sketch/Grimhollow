import { getDb, transaction } from './index.js';
import { ISLANDS, ISLAND_CONTINENT, ISLAND_REGION } from '../game/islands.js';

// The sea's scattered islands (Wave W-ISLES). Each island is a real location --
// so the party can walk it, fight on it and search it exactly as it does a
// continent -- but it lives on a hidden continent and carries `hidden = 1`, so
// no atlas, list or count ever shows it. It is reached only by sailing a voyage
// and accepting the sea's offer to put in.
//
// Additive and idempotent: safe on every boot and on databases that predate the
// wave. Existing rows are matched by name and left alone; the ocean only gains
// what is missing.

// Open-water coordinates for each island, kept only so any future view that
// reads x/y gets a number. They are never drawn: `hidden` keeps them off the map.
const ISLE_COORDS = {
  salt_skull: { x: 700, y: 90 },
  drowned_bell: { x: 250, y: 600 },
  pale_reef: { x: 96, y: 96 },
  gnawed_wreck: { x: 900, y: 600 },
  weeping_shoal: { x: 500, y: 588 },
  ash_gull: { x: 905, y: 96 },
};

export function seedIslands() {
  const db = getDb();
  // The base world must exist first, so every monster name an island links can
  // be found. If it is not seeded yet there is nothing to hang the isles on.
  const hub = db.prepare("SELECT id FROM continents WHERE name = 'Мордрат'").get();
  if (!hub) return { skipped: true, reason: 'нет Мордрата' };

  const inserted = transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order, hidden) VALUES (?, ?, ?, 1)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare(
      'INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome, hidden) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1)',
    );
    const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');

    const continentId = d.prepare('SELECT id FROM continents WHERE name = ?').get(ISLAND_CONTINENT.name)?.id
      || insContinent.run(ISLAND_CONTINENT.name, ISLAND_CONTINENT.description, 999).lastInsertRowid;
    const regionId = d.prepare('SELECT id FROM regions WHERE continent_id = ? AND name = ?')
      .get(continentId, ISLAND_REGION.name)?.id
      || insRegion.run(continentId, ISLAND_REGION.name, ISLAND_REGION.description, 0).lastInsertRowid;

    const byName = new Map(d.prepare('SELECT name, id FROM monsters').all().map((m) => [m.name, m.id]));
    const existing = new Set(d.prepare('SELECT name FROM locations WHERE hidden = 1').all().map((r) => r.name));

    let added = 0;
    ISLANDS.forEach((isle, i) => {
      if (existing.has(isle.name)) return;
      const coord = ISLE_COORDS[isle.key] || { x: 500, y: 300 };
      const lid = insLocation.run(
        regionId, isle.name, isle.description, isle.danger, i,
        coord.x, coord.y, isle.scene, 'coast',
      ).lastInsertRowid;
      added += 1;
      (isle.monsters || []).forEach((name, idx) => {
        const mid = byName.get(name);
        if (mid) insSpawn.run(lid, mid, Math.max(1, 4 - idx));
      });
    });
    return added;
  });

  return { islands: ISLANDS.length, added: inserted };
}

export { ISLANDS };
