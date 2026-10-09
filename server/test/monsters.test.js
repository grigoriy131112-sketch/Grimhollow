import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedMonstersExtra, BESTIARY } from '../src/db/seed_monsters_extra.js';
import {
  bandForDanger, poolFor, rollEncounter, rollLoot, goldForLevel,
  encounterWeight, isTitled, monsterStats, monsterRewards,
  TITLED_LEVEL, MAX_TITLED, DANGER_BANDS, MEMORY_FRAGMENT, EQUIPMENT_LOOT,
} from '../src/game/randomizer.js';
import { CLASS_KEYS } from '../src/game/classes.js';
import { getLocation } from '../src/services/world.js';
import { resolveEncounter, encounterPool, startEncounter, applyLoot } from '../src/services/encounters.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { ITEMS } from '../src/game/items.js';
import { hasItem } from '../src/services/items.js';

test.after(() => closeDb());

function seed() {
  seedWorld();
  seedSettlements();
  seedContinents();
  seedMonstersExtra();
}

const RU = /[А-Яа-яЁё]/;
const locationByName = (name) => getDb().prepare('SELECT id FROM locations WHERE name = ?').get(name);

// --- seed shape ---------------------------------------------------------------

test('the expanded bestiary is seeded without touching the existing monsters', () => {
  seed();
  const names = new Set(getDb().prepare('SELECT name FROM monsters').all().map((r) => r.name));
  for (const m of BESTIARY) assert.ok(names.has(m.name), `${m.name} was seeded`);

  // The original seed's monsters are still there, unchanged in name.
  assert.ok(names.has('Могильная крыса'), 'the base bestiary survives');
  assert.ok(names.has('Костяной рыцарь'), 'the base bestiary survives');
  // And the expanded set is 21 monsters across levels 2..15.
  assert.equal(BESTIARY.length, 21);
  assert.ok(BESTIARY.some((m) => m.level === 15), 'the bestiary reaches level 15');
});

test('re-seeding the expanded bestiary never duplicates it', () => {
  seed();
  const count = () => getDb().prepare('SELECT COUNT(*) AS n FROM monsters').get().n;
  const before = count();
  const again = seedMonstersExtra();
  assert.equal(again.added, 0, 'nothing new the second time');
  assert.equal(count(), before, 'no duplicate monsters');
});

test('the ritual boss still never spawns on the map', () => {
  seed();
  const spawned = getDb().prepare(
    'SELECT COUNT(*) AS n FROM location_monsters lm JOIN monsters m ON m.id = lm.monster_id WHERE m.name = ?',
  ).get('Костяной Пастырь').n;
  assert.equal(spawned, 0, 'the death-realm boss is off-map');
  assert.ok(!BESTIARY.some((m) => m.name === 'Костяной Пастырь'), 'and it is not in the new bestiary');
});

test('every new monster has a Russian epitaph, a valid class and a sane level', () => {
  for (const m of BESTIARY) {
    assert.ok(RU.test(m.name), `${m.name} has a Russian name`);
    assert.ok(RU.test(m.description), `${m.name} has a Russian epitaph`);
    assert.ok(Number.isInteger(m.level) && m.level >= 1 && m.level <= 15, `${m.name} is level 1-15`);
    assert.ok(CLASS_KEYS.includes(m.classKey), `${m.name} uses a real class profile (${m.classKey})`);
    assert.ok(m.biomes.length >= 1, `${m.name} haunts at least one biome`);
    assert.ok(m.weight >= 1, `${m.name} has a spawn weight`);
  }
});

test('the new monster rows scale with level and reward more as they grow', () => {
  seed();
  const low = monsterStats(2, 'fighter');
  const high = monsterStats(15, 'fighter');
  assert.ok(high.max_hp > low.max_hp, 'a level 15 monster is tougher');
  assert.ok(high.attack > low.attack, 'a level 15 monster hits harder');
  assert.ok(monsterRewards(15).xp_reward > monsterRewards(2).xp_reward, 'xp scales');
  assert.ok(monsterRewards(15).gold_reward > monsterRewards(2).gold_reward, 'gold scales');

  // The stored rows agree with the pure curve.
  const row = getDb().prepare('SELECT * FROM monsters WHERE name = ?').get('Пустой король (молодой)');
  assert.equal(row.level, 15);
  assert.equal(row.class_key, 'fighter');
  assert.deepEqual(
    { max_hp: row.max_hp, attack: row.attack },
    { max_hp: monsterStats(15, 'fighter').max_hp, attack: monsterStats(15, 'fighter').attack },
  );
});

// --- danger bands -------------------------------------------------------------

test('danger bands map to the right level ranges', () => {
  // Straight from docs/lore/bestiary.md: 1-2 -> 1-3, 3-4 -> 4-8, 5+ -> 9-15.
  for (const danger of [1, 2]) {
    const b = bandForDanger(danger);
    assert.equal(b.levelMin, 1);
    assert.equal(b.levelMax, 3);
  }
  for (const danger of [3, 4]) {
    const b = bandForDanger(danger);
    assert.equal(b.levelMin, 4);
    assert.equal(b.levelMax, 8);
  }
  for (const danger of [5, 6, 12]) {
    const b = bandForDanger(danger);
    assert.equal(b.levelMin, 9);
    assert.equal(b.levelMax, 15);
  }
  assert.equal(DANGER_BANDS.length, 3);
});

test('every location only ever draws monsters from its danger band', () => {
  seed();
  const locations = getDb().prepare('SELECT id, name, danger, biome FROM locations').all();
  for (const l of locations) {
    const { pool, band } = encounterPool(l.id);
    assert.ok(pool.length > 0, `${l.name} has something to meet`);
    for (const m of pool) {
      assert.ok(
        m.level >= band.levelMin && m.level <= band.levelMax,
        `${l.name} (danger ${l.danger}) draws ${m.name} (level ${m.level}) inside ${band.levelMin}-${band.levelMax}`,
      );
    }
  }
});

test('a titled monster is level 9+ and made rarer than the retinue', () => {
  assert.equal(TITLED_LEVEL, 9);
  assert.equal(MAX_TITLED, 1);
  assert.equal(isTitled({ level: 8 }), false);
  assert.equal(isTitled({ level: 9 }), true);
  // A titled horror is weighted below an equally-weighted member of the retinue.
  assert.ok(encounterWeight({ level: 12, weight: 4 }) < encounterWeight({ level: 5, weight: 4 }));

  // The low-danger bands never produce a titled monster; only danger 5+ does.
  for (const danger of [1, 2, 3, 4]) {
    assert.ok(poolFor({ danger, biome: null }).every((m) => !isTitled(m)), `danger ${danger} has no gods`);
  }
  assert.ok(poolFor({ danger: 5, biome: null }).some((m) => isTitled(m)), 'danger 5 can summon one');
});

// --- safe places --------------------------------------------------------------

test('no encounter fires in a safe location', () => {
  seed();
  const safe = getDb().prepare('SELECT id, name FROM locations WHERE is_safe = 1').all();
  assert.ok(safe.length >= 2, 'there are safe places to check');
  for (const l of safe) {
    const res = resolveEncounter({ locationId: l.id, seed: 'any' });
    assert.equal(res.safe, true, `${l.name} is safe`);
    assert.equal(res.encounter, null, `${l.name} spawns nothing`);
    assert.equal(res.loot, null);
    assert.ok(RU.test(res.reason), 'the reason is in Russian');
  }
  // A dangerous place does produce one.
  const dangerous = locationByName('Костяные поля');
  const res = resolveEncounter({ locationId: dangerous.id, seed: 'any' });
  assert.equal(res.safe, false);
  assert.ok(res.encounter, 'a dangerous place has an encounter');
});

// --- loot ---------------------------------------------------------------------

test('loot scales with the monster level', () => {
  assert.ok(goldForLevel(15) > goldForLevel(1), 'the base gold grows with level');
  assert.ok(goldForLevel(10) > goldForLevel(4));

  // Across many seeds, the weakest level-15 roll still beats the richest level-1.
  let max1 = 0;
  let min15 = Infinity;
  for (let i = 0; i < 60; i += 1) {
    max1 = Math.max(max1, rollLoot({ level: 1, seed: `s${i}` }).gold);
    min15 = Math.min(min15, rollLoot({ level: 15, seed: `s${i}` }).gold);
  }
  assert.ok(min15 > max1, `level 15 (min ${min15}) always pays more than level 1 (max ${max1})`);
});

test('a titled monster can leave a fragment of memory', () => {
  let fragments = 0;
  for (let i = 0; i < 200; i += 1) {
    const loot = rollLoot({ level: 12, titled: true, classKey: 'wizard', seed: `m${i}` });
    if (loot.memoryFragment) {
      fragments += 1;
      assert.ok(loot.items.some((it) => it.key === MEMORY_FRAGMENT), 'the fragment is in the spoils');
    }
  }
  assert.ok(fragments > 0, 'a titled monster sometimes guards a memory fragment');
  assert.ok(fragments < 200, 'but not every time — it is a chance, not a guarantee');
});

test('every equipment drop is a real catalogue item with a level gate', () => {
  for (const drop of EQUIPMENT_LOOT) {
    assert.ok(ITEMS[drop.key], `${drop.key} exists in the catalogue`);
    assert.equal(ITEMS[drop.key].name, drop.name, `${drop.key} name matches the catalogue`);
    assert.ok(drop.minLevel >= 1 && drop.minLevel <= 15, `${drop.key} has a sane level gate`);
    assert.ok(drop.weight > 0, `${drop.key} has a weight`);
  }
});

test('a hunt sometimes leaves a piece of gear, and never above-level gear', () => {
  let gear = 0;
  const keys = new Set();
  for (let i = 0; i < 400; i += 1) {
    const loot = rollLoot({ level: 3, seed: `gear${i}` });
    for (const it of loot.items) {
      const drop = EQUIPMENT_LOOT.find((e) => e.key === it.key);
      if (drop) {
        gear += 1;
        keys.add(it.key);
        assert.ok(drop.minLevel <= 3, `level-3 monster dropped ${it.key} (min level ${drop.minLevel})`);
      }
    }
  }
  assert.ok(gear > 0, 'gear drops sometimes');
  assert.ok(gear < 400, 'but not on every kill');

  // A high-level hunt can draw from the whole pool, including the rare epics.
  const highKeys = new Set();
  for (let i = 0; i < 400; i += 1) {
    const loot = rollLoot({ level: 15, titled: true, seed: `high${i}` });
    for (const it of loot.items) if (EQUIPMENT_LOOT.some((e) => e.key === it.key)) highKeys.add(it.key);
  }
  assert.ok(highKeys.size > keys.size, 'a titled high-level hunt reaches deeper into the pool');
});

// --- determinism --------------------------------------------------------------

test('the randomizer is reproducible with a fixed seed', () => {
  seed();
  const id = locationByName('Чёрный шпиль').id;
  const a = resolveEncounter({ locationId: id, seed: 'same-seed' });
  const b = resolveEncounter({ locationId: id, seed: 'same-seed' });
  assert.deepEqual(a.encounter, b.encounter, 'the same seed meets the same monster');
  assert.deepEqual(a.loot, b.loot, 'and the same spoils');

  // The pure pieces agree too.
  assert.deepEqual(rollEncounter({ danger: 5, biome: 'waste', seed: 'k' }), rollEncounter({ danger: 5, biome: 'waste', seed: 'k' }));
  assert.deepEqual(rollLoot({ level: 9, seed: 'k' }), rollLoot({ level: 9, seed: 'k' }));

  // Different seeds do eventually diverge, or the seed would mean nothing.
  const seen = new Set();
  for (let i = 0; i < 25; i += 1) seen.add(resolveEncounter({ locationId: id, seed: `seed-${i}` }).encounter.name);
  assert.ok(seen.size > 1, 'different seeds meet different monsters');
});

// --- the encounter service ----------------------------------------------------

test('an encounter opens a real battle and pays loot on a win', () => {
  seed();
  const location = locationByName('Костяные поля');
  const hero = createCharacter({ name: `Охотник ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });

  const run = startEncounter({ characterId: hero.id, locationId: location.id, seed: 'svc' });
  assert.ok(run.encounter, 'something was met');
  assert.ok(run.battle, 'a battle was opened');
  assert.equal(run.battle.kind, 'encounter');
  assert.equal(run.battle.locationId, location.id);
  const enemy = run.battle.combatants.find((c) => c.side === 'enemy');
  assert.equal(enemy.name, run.encounter.name, 'the battle fights the rolled monster');

  // The spoils are granted through the inventory service, so they land in the bag.
  const before = getCharacter(hero.id).gold;
  const paid = applyLoot(hero.id, run.loot);
  assert.equal(getCharacter(hero.id).gold, before + run.loot.gold, 'the gold is paid');
  for (const it of paid.items) assert.ok(hasItem(hero.id, it.key, it.qty), `${it.name} is in the bag`);
});

test('an encounter cannot be started in a safe place', () => {
  seed();
  const hero = createCharacter({ name: `Домосед ${Math.floor(Math.random() * 1e6)}`, class: 'rogue' });
  const safe = getDb().prepare('SELECT id FROM locations WHERE is_safe = 1 LIMIT 1').get();
  const run = startEncounter({ characterId: hero.id, locationId: safe.id, seed: 'x' });
  assert.equal(run.safe, true);
  assert.equal(run.battle, null, 'no fight in a safe place');
});

test('resolveEncounter rejects an unknown location', () => {
  seed();
  assert.throws(() => resolveEncounter({ locationId: 999999, seed: 'x' }), /Локация не найдена/);
});
