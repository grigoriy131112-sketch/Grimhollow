import { getDb } from '../db/index.js';
import { MS_PER_MINUTE, elapsedWalkMs, hasArrived } from '../game/travel.js';

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

// Flat location list with map coordinates, for the interactive map. When a
// character is given, the map also carries where they stand, which places they
// have seen, and any road they are currently walking.
export function getMap(characterId) {
  const db = getDb();
  const continents = db.prepare('SELECT * FROM continents ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const locations = db.prepare('SELECT * FROM locations ORDER BY sort_order, id').all();
  const connections = db.prepare('SELECT * FROM connections ORDER BY id').all();
  const monsters = db.prepare('SELECT location_id, COUNT(*) AS n FROM location_monsters GROUP BY location_id').all();
  const counts = new Map(monsters.map((m) => [m.location_id, m.n]));
  const map = {
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
      .map((c) => ({ from: c.from_id, to: c.to_id, label: c.label, minutes: c.minutes })),
  };
  if (characterId) map.character = characterExploration(characterId);
  return map;
}

// Where a character stands, what they have seen, and the road under their feet.
// The starting place is assigned lazily the first time it is needed.
export function characterExploration(characterId) {
  const db = getDb();
  const row = db.prepare('SELECT id, location_id FROM characters WHERE id = ?').get(characterId);
  if (!row) return null;

  if (row.location_id == null) {
    const start = db.prepare('SELECT id FROM locations ORDER BY is_safe DESC, sort_order, id LIMIT 1').get();
    if (start) recordVisit(characterId, start.id);
  }

  const visited = db.prepare('SELECT location_id FROM character_visits WHERE character_id = ?')
    .all(characterId).map((r) => r.location_id);
  const travel = db.prepare('SELECT * FROM travels WHERE character_id = ? AND arrived = 0 ORDER BY id DESC LIMIT 1').get(characterId);
  const current = db.prepare('SELECT location_id FROM characters WHERE id = ?').get(characterId).location_id;

  // While a road is being walked, the party is between places: report how far
  // along they are so the map can show the marker on the road itself.
  let onRoad = null;
  if (travel) {
    const state = JSON.parse(travel.state);
    const now = Date.now();
    const arrived = hasArrived(state, travel.minutes, now);
    onRoad = {
      id: travel.id, from: travel.from_id, to: travel.to_id, minutes: travel.minutes,
      minute: arrived ? travel.minutes : Math.min(travel.minutes, Math.floor(elapsedWalkMs(state, now) / MS_PER_MINUTE)),
      progress: travel.minutes ? Math.min(1, elapsedWalkMs(state, now) / (travel.minutes * MS_PER_MINUTE)) : 1,
      paused: !!state.pending,
    };
  }

  return { locationId: current, visited, travel: onRoad };
}

// The party has stood here: remember it for the fog of war and mark the spot.
// Returns whether this was the first time, so callers can hand out a discovery.
export function recordVisit(characterId, locationId) {
  const db = getDb();
  db.prepare('UPDATE characters SET location_id = ? WHERE id = ?').run(locationId, characterId);
  const info = db.prepare('INSERT OR IGNORE INTO character_visits (character_id, location_id) VALUES (?, ?)')
    .run(characterId, locationId);
  return { firstVisit: info.changes > 0 };
}

export function getLocation(id) {
  const db = getDb();
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  if (!location) return null;
  const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(location.region_id);
  const continent = region ? db.prepare('SELECT * FROM continents WHERE id = ?').get(region.continent_id) : null;
  const connections = db.prepare(
    `SELECT c.id, c.label, c.minutes, c.to_id AS toId, l.name AS toName, l.is_safe AS toSafe, l.danger AS toDanger
     FROM connections c JOIN locations l ON l.id = c.to_id WHERE c.from_id = ?`,
  ).all(id);
  const monsters = db.prepare(
    `SELECT m.* FROM location_monsters lm JOIN monsters m ON m.id = lm.monster_id WHERE lm.location_id = ? ORDER BY m.level`,
  ).all(id);
  return { ...location, is_safe: !!location.is_safe, region, continent, connections, monsters };
}

// A monster that belongs to no location: reachable only through a special
// encounter (the death-realm boss), so it must not appear in normal hunts.
const OFF_MAP_BOSS = 'Костяной Пастырь';

export function listMonsters() {
  const rows = getDb().prepare('SELECT * FROM monsters ORDER BY level, name').all();
  return rows.filter((m) => m.name !== OFF_MAP_BOSS);
}

export function getMonsterByName(name) {
  return getDb().prepare('SELECT * FROM monsters WHERE name = ?').get(name);
}

export { OFF_MAP_BOSS };

export function getMonster(id) {
  return getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(id);
}
