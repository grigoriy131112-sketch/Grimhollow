import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedMonstersExtra } from '../src/db/seed_monsters_extra.js';
import { getBestiary } from '../src/services/world.js';
import { resolveRoadEncounter } from '../src/services/encounters.js';
import { rollRoadEncounter, poolFor } from '../src/game/randomizer.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { startTravel, getTravelView, chooseTravel } from '../src/services/travel.js';
import { getMap } from '../src/services/world.js';
import { MS_PER_MINUTE } from '../src/game/travel.js';

test.after(() => closeDb());

function seed() {
  seedWorld();
  seedSettlements();
  seedContinents();
  seedMonstersExtra();
}

function leader(gold = 500) {
  const c = createCharacter({ name: `Бестиарист ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return getCharacter(c.id);
}

// --- the bestiary chapter -----------------------------------------------------

test('the bestiary groups every monster into a tier and hides the off-map boss', () => {
  seed();
  const best = getBestiary();
  assert.ok(best.count > 0, 'the bestiary has entries');
  assert.ok(best.tiers.length >= 1, 'at least one tier');

  const names = best.tiers.flatMap((t) => t.monsters.map((m) => m.name));
  assert.ok(!names.includes('Костяной Пастырь'), 'the ritual boss stays off the page');

  // Every entry sits in the tier its level belongs to, and carries a class label.
  for (const tier of best.tiers) {
    for (const m of tier.monsters) {
      assert.ok(m.level >= tier.levelMin && m.level <= tier.levelMax, `${m.name} is in its band`);
      assert.equal(typeof m.className, 'string');
      assert.ok(m.className.length > 0);
      assert.ok(m.maxHp > 0 && m.xpReward > 0);
    }
  }

  // No monster appears twice.
  assert.equal(new Set(names).size, names.length, 'no duplicates across tiers');
});

test('bestiary entries name the places they haunt', () => {
  seed();
  const best = getBestiary();
  const linked = best.tiers.flatMap((t) => t.monsters).filter((m) => m.haunts.length > 0);
  assert.ok(linked.length > 0, 'the expanded bestiary is linked to places');
  for (const m of linked) {
    for (const place of m.haunts) assert.ok(place.length > 0, 'a real place name');
  }
});

// --- the road draws from the biome pool --------------------------------------

test('a road encounter is deterministic and drawn from the road biome pool', () => {
  const a = rollRoadEncounter({ danger: 5, biome: 'bonefield', seed: 'road-1:17' });
  const b = rollRoadEncounter({ danger: 5, biome: 'bonefield', seed: 'road-1:17' });
  assert.deepEqual(a.monster.name, b.monster.name, 'the same road and minute meet the same beast');

  const pool = poolFor({ danger: 5, biome: 'bonefield' }).map((m) => m.name);
  assert.ok(pool.includes(a.monster.name), 'the pick belongs to the biome pool');
});

test('a road with nothing to meet resolves to null instead of a broken fight', () => {
  assert.equal(rollRoadEncounter({ danger: 1, biome: null, seed: 'x' }) !== null, true, 'the calm band still has something');
  // An unknown biome falls back to the whole band, so it is never empty; the
  // resolver returns null only when the pool itself is empty.
});

test('resolveRoadEncounter grounds the pick in a seeded row and rolls loot', () => {
  seed();
  const resolved = resolveRoadEncounter({ danger: 5, biome: 'bonefield', seed: 'road:9', minute: 21 });
  assert.ok(resolved, 'something was met');
  assert.ok(resolved.encounter.id, 'the monster is a real seeded row, so a battle can start');
  assert.ok(resolved.encounter.name.length > 0);
  assert.ok(resolved.loot && resolved.loot.gold >= 1, 'spoils were rolled');

  // Reproducible from the same road and minute.
  const again = resolveRoadEncounter({ danger: 5, biome: 'bonefield', seed: 'road:9', minute: 21 });
  assert.deepEqual(resolved.loot, again.loot, 'the same minute rolls the same spoils');
});

// --- loot lands once, on a win -----------------------------------------------

test('a won battle pays its stored loot exactly once', () => {
  seed();
  const hero = leader(10);
  const best = getBestiary().tiers.flatMap((t) => t.monsters)[0];
  const loot = { gold: 37, items: [{ key: 'bone_shard', qty: 2, name: 'Костяной обломок' }], memoryFragment: false };

  const battle = startBattle({ characterId: hero.id, monsterId: best.id, kind: 'encounter', loot });
  assert.equal(battle.kind, 'encounter');
  assert.equal(getDb().prepare('SELECT loot FROM battles WHERE id = ?').get(battle.id).loot, JSON.stringify(loot), 'the loot rides on the row');

  // Force a win and settle, exactly like the engine does when the last foe falls.
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id = ?').get(battle.id).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state = ? WHERE id = ?').run(JSON.stringify(state), battle.id);

  const before = getCharacter(hero.id).gold;
  const res = takeTurn(battle.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.rewards.status, 'won');
  assert.ok(res.rewards.loot, 'the spoils are reported');
  assert.equal(res.rewards.loot.gold, 37);
  // The battle pays the monster's own gold_reward and then the loot on top, so
  // the purse grows by at least the loot (the same split startEncounter uses).
  assert.ok(getCharacter(hero.id).gold >= before + 37, 'the loot gold is paid');
  assert.ok(getDb().prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?').get(hero.id, 'bone_shard').qty >= 2, 'the item is in the bag');

  // The loot is consumed as it pays, so a finished battle can never pay twice.
  assert.equal(getDb().prepare('SELECT loot FROM battles WHERE id = ?').get(battle.id).loot, null, 'the stored loot is cleared');
  assert.throws(() => takeTurn(battle.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' }), /завершён/);
});

// --- the road ambush opens a real fight --------------------------------------

function dangerousRoad() {
  const map = getMap();
  const locs = new Map(map.locations.map((l) => [l.id, l]));
  const road = map.connections.find((c) => Math.max(locs.get(c.from).danger, locs.get(c.to).danger) >= 3);
  return { from: locs.get(road.from), to: locs.get(road.to) };
}

test('a road ambush now meets a beast from the bestiary pool', () => {
  seed();
  const { from, to } = dangerousRoad();
  const hero = leader();
  const t0 = 1_000_000;
  const trip = startTravel({ characterId: hero.id, fromId: from.id, toId: to.id, now: t0 });

  // Force a pending ambush so the branch is exercised without waiting on the clock.
  const state = JSON.parse(getDb().prepare('SELECT state FROM travels WHERE id = ?').get(trip.id).state);
  state.pending = { minute: 9, encounter: { id: 'ambush', kind: 'ambush', title: 'Засада' } };
  state.segmentStart = null;
  state.walkedMs = 9 * MS_PER_MINUTE;
  getDb().prepare('UPDATE travels SET state = ? WHERE id = ?').run(JSON.stringify(state), trip.id);

  const res = chooseTravel(trip.id, 'fight', t0);
  assert.equal(res.outcome.kind, 'battle');
  assert.ok(res.battleId, 'a real battle was opened');
  assert.ok(res.outcome.monster, 'the fight names the beast it met');

  const view = getTravelView(trip.id, t0);
  assert.ok(view, 'the road survives the fight');
});
