import { getDb, transaction } from './index.js';
import { BESTIARY, monsterRow } from '../game/randomizer.js';

// The expanded bestiary (Wave G10), from docs/lore/bestiary.md. This adds the
// 21 new monsters to the ones already seeded by db/seed.js and links them to
// the locations whose danger band and biome they belong to. Existing monsters
// are never renamed, moved or duplicated, and the final Костяной Пастырь is not
// in this list, so it never spawns on the map (it stays a ritual-only boss).
//
// Combat math is untouched: these rows only feed the same diceless engine as
// every other monster (hit chance from accuracy vs evasion, speed decides turn
// order). The stat curve and loot maths are pure and live in game/randomizer.js.

// A location is eligible for a monster when the location's danger falls in the
// monster's band (from the bestiary) and the location's biome is one the
// monster haunts. Danger 1-2 -> levels 1-3, 3-4 -> 4-8, 5+ -> 9-15.
function bandFor(monster) {
  return monster.level <= 3 ? { min: 1, max: 2 }
    : monster.level <= 8 ? { min: 3, max: 4 }
      : { min: 5, max: 99 };
}

function eligibleLocationIds(db, monster) {
  const band = bandFor(monster);
  const rows = db.prepare('SELECT id, danger, biome FROM locations WHERE hidden = 0').all();
  return rows
    .filter((l) => l.danger >= band.min && l.danger <= band.max)
    .filter((l) => (monster.biomes || []).includes(l.biome))
    .map((l) => l.id);
}

// Add the expanded bestiary and its spawn links. Idempotent: existing monsters
// are left alone (matched by name) and spawn links use INSERT OR IGNORE, so it
// is safe to run on every boot and on databases that predate the wave.
export function seedMonstersExtra() {
  const db = getDb();
  const have = new Set(db.prepare('SELECT name FROM monsters').all().map((r) => r.name));
  const missing = BESTIARY.filter((m) => !have.has(m.name));

  const insMonster = db.prepare(
    `INSERT INTO monsters (name, description, level, max_hp, attack, defense, accuracy, evasion, speed, mana, stamina, class_key, xp_reward, gold_reward)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSpawn = db.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');

  const linked = transaction((d) => {
    for (const m of missing) {
      const row = monsterRow(m);
      insMonster.run(
        row.name, row.description, row.level, row.max_hp, row.attack, row.defense,
        row.accuracy, row.evasion, row.speed, row.mana, row.stamina,
        row.class_key, row.xp_reward, row.gold_reward,
      );
    }

    // Spawn links are keyed by name so they can be rebuilt even when the rows
    // already exist (a database seeded before this wave).
    const ids = new Map(d.prepare('SELECT id, name FROM monsters').all().map((r) => [r.name, r.id]));
    let links = 0;
    for (const m of BESTIARY) {
      const mid = ids.get(m.name);
      if (!mid) continue;
      for (const lid of eligibleLocationIds(d, m)) {
        links += insSpawn.run(lid, mid, Math.max(1, m.weight)).changes;
      }
    }
    return links;
  });

  return { added: missing.length, linked };
}

export { BESTIARY };
