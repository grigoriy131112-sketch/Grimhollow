import { getDb } from '../db/index.js';
import { getLocation, getMonsterByName } from './world.js';
import { startBattle } from './battles.js';
import { grantItem } from './items.js';
import { itemInfo } from '../game/items.js';
import { rollEncounter, rollLoot, monsterRow, bandForDanger, poolFor } from '../game/randomizer.js';

// Resolve a random encounter for a place and turn it into a battle plus its
// spoils (Wave G10). The rules are pure (game/randomizer.js); this service is
// only the I/O layer, reusing the existing battle and item services.

function briefLocation(location) {
  return {
    id: location.id, name: location.name, danger: location.danger,
    biome: location.biome, scene: location.scene, safe: !!location.is_safe,
  };
}

// The monsters a location can produce: the danger band's pool narrowed by the
// location's biome (the same pool the randomizer draws from). Exposed so a
// screen or a rumour line can show what waits here.
export function encounterPool(locationId) {
  const location = getLocation(locationId);
  if (!location) return null;
  const band = bandForDanger(location.danger);
  return {
    location: briefLocation(location),
    band,
    pool: poolFor({ danger: location.danger, biome: location.biome }),
  };
}

// Roll one encounter for a location. Safe places never spawn (except scripted
// ones, which do not go through here), and a titled monster is drawn rarely and
// alone. Deterministic from the seed, so the same seed always meets the same
// thing.
export function resolveEncounter({ locationId, seed = 'encounter' } = {}) {
  const location = getLocation(locationId);
  if (!location) throw new Error('Локация не найдена');

  if (location.is_safe) {
    return { location: briefLocation(location), safe: true, encounter: null, loot: null, reason: 'В безопасном месте столкновений нет' };
  }

  const rolled = rollEncounter({ danger: location.danger, biome: location.biome, seed });
  if (!rolled) {
    return { location: briefLocation(location), safe: false, encounter: null, loot: null, reason: 'Здесь нечего встретить' };
  }

  // Ground the pick in the database row when the bestiary is seeded, so the
  // battle uses the same stats the rest of the game sees. The pure row is the
  // fallback for a database that predates this wave.
  const stored = getMonsterByName(rolled.monster.name);
  const monster = stored || { id: null, ...monsterRow(rolled.monster) };
  const loot = rollLoot({
    level: monster.level,
    titled: rolled.titled,
    classKey: monster.class_key || rolled.monster.classKey,
    seed,
  });

  return {
    location: briefLocation(location),
    safe: false,
    encounter: {
      id: monster.id,
      name: monster.name,
      description: monster.description,
      level: monster.level,
      classKey: monster.class_key || rolled.monster.classKey,
      titled: rolled.titled,
    },
    band: rolled.band,
    loot,
  };
}

// Resolve an encounter and open the fight with the existing battle service. The
// loot is planned here but only granted once the party wins (applyLoot), so a
// lost fight does not hand out spoils.
export function startEncounter({ characterId, locationId, seed = 'encounter' } = {}) {
  const resolved = resolveEncounter({ locationId, seed });
  if (!resolved.encounter) return { ...resolved, battle: null };
  if (!resolved.encounter.id) throw new Error('Монстр не засеян — встреча недоступна');

  const battle = startBattle({
    characterId,
    monsterId: resolved.encounter.id,
    locationId,
    kind: 'encounter',
  });
  return { ...resolved, battle };
}

// Hand over the spoils of a won encounter: gold plus any items (a resource or a
// fragment of memory). Uses the inventory service, so loot lands in the bag
// exactly like every other item.
export function applyLoot(characterId, loot) {
  if (!loot) return { gold: 0, items: [] };
  if (loot.gold) {
    getDb().prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?")
      .run(loot.gold, characterId);
  }
  const items = (loot.items || []).map((it) => {
    grantItem(characterId, it.key, it.qty || 1);
    return { key: it.key, qty: it.qty || 1, name: it.name || itemInfo(it.key).name };
  });
  return { gold: loot.gold || 0, items, memoryFragment: !!loot.memoryFragment };
}
