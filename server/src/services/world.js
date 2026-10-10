import { getDb } from '../db/index.js';
import { MS_PER_MINUTE, elapsedWalkMs, hasArrived } from '../game/travel.js';
import { CROSSING_GATES, CROSSINGS } from '../game/continent_travel.js';
import { seaRoute } from '../game/world_geo.js';
import { DANGER_BANDS, TITLED_LEVEL } from '../game/randomizer.js';
import { CLASSES } from '../game/classes.js';

// Per-continent tallies, so the atlas shows each land's own numbers instead of
// one global total. Ports are the places that open a crossing to another land.
// Reads the camelCase shape of map.locations, not the raw DB rows.
function statsOf(locs) {
  const byDanger = [1, 2, 3, 4, 5].map((d) => locs.filter((l) => l.danger === d).length);
  return {
    locations: locs.length,
    regions: new Set(locs.map((l) => l.regionId)).size,
    safe: locs.filter((l) => l.isSafe).length,
    ports: locs.filter((l) => l.isPort).length,
    monsters: locs.reduce((sum, l) => sum + (l.monsterCount || 0), 0),
    byDanger,
  };
}

export function getWorld() {
  const db = getDb();
  // Hidden continents/locations (the sea's islands, W-ISLES) are never listed.
  const continents = db.prepare('SELECT * FROM continents WHERE hidden = 0 ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const locations = db.prepare('SELECT * FROM locations WHERE hidden = 0 ORDER BY sort_order, id').all();
  const connections = db.prepare('SELECT * FROM connections ORDER BY id').all();
  return continents.map((c) => ({
    ...c,
    regions: regions.filter((r) => r.continent_id === c.id).map((r) => ({
      ...r,
      locations: locations.filter((l) => l.region_id === r.id).map((l) => ({ ...l, is_safe: !!l.is_safe })),
    })),
  }));
}

// The sea lanes the player can sail: each crossing as an edge between two gates
// with its voyage length in days. Kept here (not in the client) so the world
// chart and the crossing screen read the same routes.
function seaLanes(locations) {
  const byName = new Map(locations.map((l) => [l.name, l]));
  return CROSSINGS.map((route) => {
    const from = byName.get(route.from);
    const to = byName.get(route.to);
    if (!from || !to) return null;
    return {
      key: route.key, from: from.id, to: to.id,
      fromName: route.from, toName: route.to,
      days: route.days, gold: route.gold, danger: route.danger,
      fromX: from.map_x, fromY: from.map_y, toX: to.map_x, toY: to.map_y,
      // The sailing line, following open water so it never crosses the land.
      path: seaRoute([from.map_x, from.map_y], [to.map_x, to.map_y]),
    };
  }).filter(Boolean);
}

// Flat location list with map coordinates, for the interactive map. When a
// character is given, the map also carries where they stand, which places they
// have seen, and any road they are currently walking.
export function getMap(characterId) {
  const db = getDb();
  const continents = db.prepare('SELECT * FROM continents WHERE hidden = 0 ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const locations = db.prepare('SELECT * FROM locations WHERE hidden = 0 ORDER BY sort_order, id').all();
  const connections = db.prepare('SELECT * FROM connections ORDER BY id').all();
  const monsters = db.prepare(
    `SELECT lm.location_id, COUNT(*) AS n FROM location_monsters lm
       JOIN locations l ON l.id = lm.location_id
      WHERE l.hidden = 0 GROUP BY lm.location_id`,
  ).all();
  const counts = new Map(monsters.map((m) => [m.location_id, m.n]));
  const map = {
    continents: continents.map((c) => ({ ...c, regions: regions.filter((r) => r.continent_id === c.id).map((r) => ({ ...r })) })),
    locations: locations.map((l) => {
      const region = regions.find((r) => r.id === l.region_id);
      const continent = region ? continents.find((c) => c.id === region.continent_id) : null;
      return {
        id: l.id, name: l.name, description: l.description, danger: l.danger,
        isSafe: !!l.is_safe, isPort: CROSSING_GATES.includes(l.name),
        x: l.map_x, y: l.map_y, scene: l.scene, biome: l.biome,
        regionId: l.region_id, regionName: region?.name, continentName: continent?.name,
        monsterCount: counts.get(l.id) || 0,
      };
    }),
    // Undirected edges: draw each road once.
    connections: connections
      .filter((c) => c.from_id < c.to_id)
      .map((c) => ({ from: c.from_id, to: c.to_id, label: c.label, minutes: c.minutes })),
    // Sea lanes between the port gates. A road is a walk; a lane is a voyage,
    // so its time is in days, not minutes. Both endpoints are real gates, so
    // the client can draw them and start a crossing without another lookup.
    voyages: seaLanes(locations),
  };
  // Each continent carries its own tallies; the atlas shows one land at a time.
  map.continents = map.continents.map((c) => {
    const own = map.locations.filter((l) => l.continentName === c.name);
    return { ...c, stats: statsOf(own) };
  });
  // The global totals use the same shape, so the atlas can swap scopes freely.
  map.stats = { continents: continents.length, ...statsOf(map.locations) };
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
    const start = db.prepare('SELECT id FROM locations WHERE hidden = 0 ORDER BY is_safe DESC, sort_order, id LIMIT 1').get();
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
// This also moves the party: use it when the party really arrives somewhere.
export function recordVisit(characterId, locationId) {
  const db = getDb();
  db.prepare('UPDATE characters SET location_id = ? WHERE id = ?').run(locationId, characterId);
  return recordVisited(characterId, locationId);
}

// Remember a place the party has seen without moving it there. Opening a place
// to read about it must never teleport the party, so the client's visit route
// uses this and only walking a road calls recordVisit.
export function recordVisited(characterId, locationId) {
  const info = getDb().prepare('INSERT OR IGNORE INTO character_visits (character_id, location_id) VALUES (?, ?)')
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

// The bestiary for the Codex: every seeded monster except the off-map ritual
// boss, grouped into the lore's three tiers (levels 1-3 household horror, 4-8
// trades and titles, 9-15 abstractions and gods) and carrying the places it is
// known to haunt. Pure read of the seeded rows, so the page and the seed can
// never disagree about a stat.
export function getBestiary() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM monsters ORDER BY level, name').all()
    .filter((m) => m.name !== OFF_MAP_BOSS);

  // Which named places each monster is linked to (location_monsters), resolved
  // to names so the page can say where it hunts.
  const haunts = new Map();
  const links = db.prepare(
    `SELECT lm.monster_id AS id, l.name AS name
       FROM location_monsters lm JOIN locations l ON l.id = lm.location_id
      WHERE l.hidden = 0
      ORDER BY l.name`,
  ).all();
  for (const link of links) {
    if (!haunts.has(link.id)) haunts.set(link.id, []);
    haunts.get(link.id).push(link.name);
  }

  const tiers = DANGER_BANDS.map((b) => ({ label: b.label, levelMin: b.levelMin, levelMax: b.levelMax, monsters: [] }));
  const slot = (level) => tiers.find((t) => level >= t.levelMin && level <= t.levelMax) || tiers[tiers.length - 1];

  for (const m of rows) {
    slot(m.level).monsters.push({
      id: m.id,
      name: m.name,
      description: m.description,
      level: m.level,
      classKey: m.class_key,
      className: CLASSES[m.class_key]?.label || m.class_key,
      maxHp: m.max_hp,
      attack: m.attack,
      defense: m.defense,
      accuracy: m.accuracy,
      evasion: m.evasion,
      speed: m.speed,
      xpReward: m.xp_reward,
      goldReward: m.gold_reward,
      portrait: m.portrait,
      titled: m.level >= TITLED_LEVEL,
      haunts: haunts.get(m.id) || [],
    });
  }
  return { tiers: tiers.filter((t) => t.monsters.length > 0), count: rows.length };
}

export function getMonsterByName(name) {
  return getDb().prepare('SELECT * FROM monsters WHERE name = ?').get(name);
}

export { OFF_MAP_BOSS };

export function getMonster(id) {
  return getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(id);
}
