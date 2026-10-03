import { getDb } from '../db/index.js';

export function getWorld() {
  const db = getDb();
  const continents = db.prepare('SELECT * FROM continents ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const locations = db.prepare('SELECT * FROM locations ORDER BY sort_order, id').all();
  const connections = db.prepare('SELECT * FROM connections ORDER BY id').all();
  return continents.map((c) => ({
    ...c,
    regions: regions.filter((r) => r.continent_id === c.id).map((r) => ({
      ...r,
      locations: locations.filter((l) => l.region_id === r.id).map((l) => ({ ...l, is_safe: !!l.is_safe })),
    })),
  }));
}

// Flat location list with map coordinates, for the interactive map.
export function getMap() {
  const db = getDb();
  const continents = db.prepare('SELECT * FROM continents ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const locations = db.prepare('SELECT * FROM locations ORDER BY sort_order, id').all();
  const connections = db.prepare('SELECT * FROM connections ORDER BY id').all();
  const monsters = db.prepare('SELECT location_id, COUNT(*) AS n FROM location_monsters GROUP BY location_id').all();
  const counts = new Map(monsters.map((m) => [m.location_id, m.n]));
  return {
    continents: continents.map((c) => ({ ...c, regions: regions.filter((r) => r.continent_id === c.id).map((r) => ({ ...r })) })),
    locations: locations.map((l) => {
      const region = regions.find((r) => r.id === l.region_id);
      const continent = region ? continents.find((c) => c.id === region.continent_id) : null;
      return {
        id: l.id, name: l.name, description: l.description, danger: l.danger,
        isSafe: !!l.is_safe, x: l.map_x, y: l.map_y, scene: l.scene, biome: l.biome,
        regionId: l.region_id, regionName: region?.name, continentName: continent?.name,
        monsterCount: counts.get(l.id) || 0,
      };
    }),
    // Undirected edges: draw each road once.
    connections: connections
      .filter((c) => c.from_id < c.to_id)
      .map((c) => ({ from: c.from_id, to: c.to_id, label: c.label })),
  };
}

export function getLocation(id) {
  const db = getDb();
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  if (!location) return null;
  const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(location.region_id);
  const continent = region ? db.prepare('SELECT * FROM continents WHERE id = ?').get(region.continent_id) : null;
  const connections = db.prepare(
    `SELECT c.id, c.label, c.to_id AS toId, l.name AS toName, l.is_safe AS toSafe, l.danger AS toDanger
     FROM connections c JOIN locations l ON l.id = c.to_id WHERE c.from_id = ?`,
  ).all(id);
  const monsters = db.prepare(
    `SELECT m.* FROM location_monsters lm JOIN monsters m ON m.id = lm.monster_id WHERE lm.location_id = ? ORDER BY m.level`,
  ).all(id);
  return { ...location, is_safe: !!location.is_safe, region, continent, connections, monsters };
}

export function listMonsters() {
  return getDb().prepare('SELECT * FROM monsters ORDER BY level, name').all();
}

export function getMonster(id) {
  return getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(id);
}
