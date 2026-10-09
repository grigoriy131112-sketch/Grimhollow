// Continents and inter-continent crossings (Wave G5). This is the I/O layer:
// it loads the seeded continents/regions, finds the port gates, and executes a
// crossing (charge the fare, spend the toll, resolve what the sea does). The
// rules themselves are pure and live in game/continent_travel.js; the design
// data is seeded by db/seed_continents.js.

import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { takeItem, hasItem } from './items.js';
import { startBattle } from './battles.js';
import { recordVisit } from './world.js';
import {
  CROSSINGS, CROSSING_GATES, routeFor, crossingView, canAfford, resolveCrossing as resolveRules,
} from '../game/continent_travel.js';

function locationRowByName(name) {
  return getDb().prepare('SELECT * FROM locations WHERE name = ?').get(name);
}

function continentOf(locationId) {
  const row = getDb().prepare(
    `SELECT c.id, c.name FROM locations l
     JOIN regions r ON r.id = l.region_id
     JOIN continents c ON c.id = r.continent_id
     WHERE l.id = ?`,
  ).get(locationId);
  return row || null;
}

// Every continent with its regions and a location count. The list view and the
// crossing screen both read this.
export function listContinents() {
  const db = getDb();
  const continents = db.prepare('SELECT * FROM continents ORDER BY sort_order, id').all();
  const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order, id').all();
  const counts = db.prepare(
    'SELECT region_id, COUNT(*) AS n FROM locations GROUP BY region_id',
  ).all();
  const countOf = new Map(counts.map((r) => [r.region_id, r.n]));
  return continents.map((c) => {
    const rs = regions.filter((r) => r.continent_id === c.id);
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      locationCount: rs.reduce((sum, r) => sum + (countOf.get(r.id) || 0), 0),
      regions: rs.map((r) => ({
        id: r.id, name: r.name, description: r.description,
        locationCount: countOf.get(r.id) || 0,
      })),
    };
  });
}

// One continent by id or by name, with its regions and locations.
export function getContinent(idOrName) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM continents WHERE id = ? OR name = ?').get(idOrName, idOrName);
  if (!c) return null;
  const regions = db.prepare('SELECT * FROM regions WHERE continent_id = ? ORDER BY sort_order, id').all(c.id);
  const locations = db.prepare(
    `SELECT l.* FROM locations l JOIN regions r ON r.id = l.region_id
     WHERE r.continent_id = ? ORDER BY l.sort_order, l.id`,
  ).all(c.id).map((l) => ({ ...l, is_safe: !!l.is_safe }));
  return {
    id: c.id, name: c.name, description: c.description,
    regions: regions.map((r) => ({
      ...r,
      locations: locations.filter((l) => l.region_id === r.id),
    })),
  };
}

// The port gates that open a crossing, each with the continent it belongs to.
export function listGates() {
  return CROSSING_GATES
    .map((name) => {
      const loc = locationRowByName(name);
      if (!loc) return null;
      const continent = continentOf(loc.id);
      return {
        name, id: loc.id, scene: loc.scene, biome: loc.biome, x: loc.map_x, y: loc.map_y,
        continent: continent?.name || null, continentId: continent?.id || null,
      };
    })
    .filter(Boolean);
}

// Every crossing that leaves a given place. Each entry carries the far gate as a
// real location, so the client can start the voyage without a second lookup.
// When a characterId is given the view also says whether the party can pay.
export function crossingsFor(locationId, characterId = null) {
  const here = getDb().prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
  if (!here || !CROSSING_GATES.includes(here.name)) return [];
  const character = characterId ? getCharacter(characterId) : null;
  const out = [];
  for (const route of CROSSINGS) {
    const farName = route.from === here.name ? route.to : route.to === here.name ? route.from : null;
    if (!farName) continue;
    const far = locationRowByName(farName);
    if (!far) continue;
    const view = crossingView(route, { from: here.name, to: far.name });
    out.push({
      ...view,
      fromId: here.id,
      toId: far.id,
      toScene: far.scene,
      toBiome: far.biome,
      toContinent: continentOf(far.id)?.name || null,
      affordable: character ? canAfford(route, { gold: character.gold, hasItem: (k, q) => hasItem(character.id, k, q) }) : null,
    });
  }
  return out;
}

// Resolve what happens on the water, without touching the world. Pure rules with
// a deterministic seed, exposed here so callers do not import the rules module.
export function resolveCrossing({ routeKey, seed = '', day = 1 }) {
  const route = CROSSINGS.find((r) => r.key === routeKey);
  return { route: route || null, outcome: resolveRules(route, { seed, day }) };
}

// The route between two gate locations, if there is one.
export function routeBetween(fromId, toId) {
  const from = getDb().prepare('SELECT name FROM locations WHERE id = ?').get(fromId);
  const to = getDb().prepare('SELECT name FROM locations WHERE id = ?').get(toId);
  if (!from || !to) return null;
  return routeFor(from.name, to.name);
}

// Execute a crossing: check the party can pay, charge the fare, spend the toll,
// then resolve the sea and apply whatever it did. A fight is started at the far
// gate; it degrades to a quiet outcome if nothing waits there.
export function startCrossing({ characterId, fromId, toId, now = Date.now() }) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  if (character.fate === 'dead') throw new Error('Герой пал');

  const from = getDb().prepare('SELECT * FROM locations WHERE id = ?').get(fromId);
  const to = getDb().prepare('SELECT * FROM locations WHERE id = ?').get(toId);
  if (!from || !to) throw new Error('Локация не найдена');
  if (!CROSSING_GATES.includes(from.name) || !CROSSING_GATES.includes(to.name)) {
    throw new Error('Отсюда нет перехода на другой континент');
  }

  const route = routeFor(from.name, to.name);
  if (!route) throw new Error('Между этими берегами нет пути');

  // The party can only sail from the port it actually stands in, exactly as a
  // road can only be walked from where the party is. A never-placed hero begins
  // its voyage at the origin port.
  const here = getDb().prepare('SELECT location_id FROM characters WHERE id = ?').get(characterId)?.location_id;
  if (here == null) {
    recordVisit(characterId, fromId);
  } else if (here !== fromId) {
    throw new Error('Отряд не находится здесь');
  }

  const afford = canAfford(route, { gold: character.gold, hasItem: (k, q) => hasItem(characterId, k, q) });
  if (!afford.ok) {
    const short = afford.missing.map((m) => (m.kind === 'gold' ? `${m.need - m.have} золота` : m.label)).join(', ');
    throw new Error(`Не хватает: ${short}`);
  }

  // Pay first: the fare and the toll are gone whatever the sea decides.
  getDb().prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?")
    .run(route.gold, characterId);
  if (route.item) takeItem(characterId, route.item.key, route.item.qty);

  const outcome = resolveRules(route, { seed: `${fromId}->${toId}`, day: Math.floor(now / 86_400_000) });

  let battle = null;
  let finalOutcome = outcome;
  if (outcome.kind === 'battle') {
    try {
      battle = startBattle({ characterId, locationId: toId });
    } catch {
      finalOutcome = { kind: 'safe', text: 'Море оказалось пустым — бой не состоялся.' };
    }
  } else {
    applyOutcome(characterId, outcome);
  }

  // The voyage lands the party at the far port, whether or not trouble was met;
  // a battle fought on the water is seeded at the destination, so the hero is
  // already standing there. Without this the crossing charged the fare and
  // resolved the sea but left the party on the old shore.
  recordVisit(characterId, toId);

  return {
    crossing: crossingView(route, { from: from.name, to: to.name }),
    outcome: finalOutcome,
    battleId: battle?.id ?? null,
    arrivedAt: toId,
    character: getCharacter(characterId),
  };
}

// Apply a non-battle crossing outcome to the leader.
function applyOutcome(characterId, outcome) {
  const character = getCharacter(characterId);
  if (!character) return;
  if (outcome.kind === 'gold') {
    const delta = Math.round(Number(outcome.delta) || 0);
    const gold = Math.max(0, character.gold + delta);
    getDb().prepare("UPDATE characters SET gold = ?, updated_at = datetime('now') WHERE id = ?").run(gold, characterId);
    return;
  }
  if (outcome.kind === 'heal') {
    // The ceilings are maxHp/maxMana/maxStamina; reading `stats[field]` by the
    // bare resource name produced NaN — which the DB stored as NULL, i.e. a full
    // heal. Clamp against the real maxima.
    const clamp = (value, delta, max) => Math.min(max, (value || 0) + (Number(delta) || 0));
    getDb().prepare("UPDATE characters SET hp = ?, mana = ?, stamina = ?, updated_at = datetime('now') WHERE id = ?")
      .run(
        clamp(character.hp, outcome.hp, character.stats.maxHp),
        clamp(character.mana, outcome.mana, character.stats.maxMana),
        clamp(character.stamina, outcome.stamina, character.stats.maxStamina),
        characterId,
      );
  }
}

export { CROSSINGS, CROSSING_GATES, crossingView, routeFor };
