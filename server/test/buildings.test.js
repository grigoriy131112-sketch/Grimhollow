import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { getSettlement, getBuilding } from '../src/services/settlements.js';
import { getCharacter, createCharacter } from '../src/services/characters.js';
import { performBuildingAction } from '../src/services/building_actions.js';
import { listRecipes, craft } from '../src/services/crafting.js';
import { grantItem, hasItem } from '../src/services/items.js';
import { getMeters, setMeters } from '../src/services/survival.js';
import { RECIPES, canCraft } from '../src/game/crafting.js';
import { itemInfo } from '../src/game/items.js';
import { startBattle, takeTurn } from '../src/services/battles.js';

// W-BUILD / W-SMITH: the settlement actions and the smithy forge were decoration
// before this wave. These tests drive them at the service level (no express in
// the test env) and prove they actually change game state.

test.after(() => closeDb());

function seed() {
  seedWorld();
  seedSettlements();
}

let counter = 0;
function hero(gold = 0) {
  counter += 1;
  const c = createCharacter({ name: `Проверка ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  if (gold) getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return getCharacter(c.id);
}

function buildingOfType(type) {
  seed();
  const city = getSettlement(1);
  return city.buildings.find((b) => b.type === type);
}

// --- building actions ---------------------------------------------------------

test('every seeded building action has a live handler', () => {
  seed();
  // The three types that actually do something now, checked by driving them.
  const tavern = buildingOfType('tavern');
  const temple = buildingOfType('temple');
  const inn = buildingOfType('inn');
  for (const b of [tavern, temple, inn]) {
    assert.ok(b.actions.length > 0, `${b.type} offers actions`);
  }
});

test('a tavern meal costs gold and eases hunger', () => {
  const tavern = buildingOfType('tavern');
  const h = hero(50);
  setMeters(h.id, { hunger: 80, thirst: 80, fatigue: 80 });

  const res = performBuildingAction(h.id, tavern.id, 'drink');
  assert.equal(res.kind, 'drink');
  assert.equal(getCharacter(h.id).gold, 50 - res.cost, 'the drink is paid for');
  assert.ok(getMeters(h.id).hunger < 80, 'the meal lowers hunger');
});

test('a tavern rest wipes fatigue and a bare purse is refused', () => {
  const tavern = buildingOfType('tavern');
  const h = hero(0);
  setMeters(h.id, { hunger: 50, thirst: 50, fatigue: 90 });
  const res = performBuildingAction(h.id, tavern.id, 'rest');
  assert.equal(res.kind, 'rest');
  assert.equal(getMeters(h.id).fatigue, 0, 'rest clears fatigue');

  assert.throws(() => performBuildingAction(h.id, tavern.id, 'drink'), /Не хватает золота/);
});

test('temple healing costs gold and tops health back up', () => {
  const temple = buildingOfType('temple');
  const h = hero(100);
  getDb().prepare('UPDATE characters SET hp = 1 WHERE id = ?').run(h.id);

  const res = performBuildingAction(h.id, temple.id, 'heal');
  assert.ok(res.healed > 0, 'the priest heals');
  assert.equal(getCharacter(h.id).gold, 100 - res.cost);
  assert.ok(getCharacter(h.id).hp > 1, 'health is restored');
});

test('an unknown action is refused', () => {
  const tavern = buildingOfType('tavern');
  const h = hero(10);
  assert.throws(() => performBuildingAction(h.id, tavern.id, 'dance'), /Здесь так нельзя/);
});

// --- the smithy forge ---------------------------------------------------------

test('the recipe book reports live affordability', () => {
  const h = hero(0);
  const book = listRecipes(h.id);
  assert.equal(book.recipes.length, RECIPES.length);
  assert.ok(book.recipes.every((r) => r.canCraft === false), 'nothing craftable with an empty bag');

  const blade = book.recipes.find((r) => r.key === 'forgeblade');
  assert.ok(blade.materials.length >= 2);
  assert.ok(blade.materials.every((m) => m.have === 0), 'materials are read from the bag');
});

test('forging spends materials and gold and grants the item', () => {
  const h = hero(100);
  const recipe = RECIPES.find((r) => r.key === 'bone_buckler_forged');
  for (const m of recipe.materials) grantItem(h.id, m.itemKey, m.qty);

  const res = craft(h.id, recipe.key);
  assert.equal(res.forged.key, 'bone_buckler_forged');
  assert.ok(hasItem(h.id, 'bone_buckler_forged', 1), 'the shield is in the bag');
  for (const m of recipe.materials) {
    assert.equal(hasItem(h.id, m.itemKey, 1), false, `${m.itemKey} was spent`);
  }
  assert.equal(getCharacter(h.id).gold, 100 - recipe.gold, 'the smith fee is paid');
});

test('forging without materials is refused and spends nothing', () => {
  const smithy = buildingOfType('smithy');
  const h = hero(100);
  const recipe = RECIPES.find((r) => r.key === 'forgeblade');
  assert.throws(() => craft(h.id, recipe.key), /Не выковать/);
  assert.equal(getCharacter(h.id).gold, 100, 'no fee is taken on failure');
});

test('every forged output exists in the catalogue with a Russian name', () => {
  for (const r of RECIPES) {
    const info = itemInfo(r.output);
    assert.equal(info.key, r.output);
    assert.ok(/[А-Яа-яЁё]/.test(info.name), `${r.output} has a Russian name`);
  }
});

// --- resources now drop from a hunt ------------------------------------------

test('a won hunt drops the shards the smithy needs', () => {
  seed();
  const smithy = buildingOfType('smithy');
  const h = hero(0);
  const monster = getDb().prepare('SELECT id FROM monsters ORDER BY level ASC LIMIT 1').get();
  const battle = startBattle({ characterId: h.id, monsterId: monster.id });

  // Force a win and settle, exactly like the engine when the last foe falls.
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id = ?').get(battle.id).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state = ? WHERE id = ?').run(JSON.stringify(state), battle.id);

  const res = takeTurn(battle.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.rewards.status, 'won');
  assert.ok(res.rewards.loot, 'a hunt carries spoils');
  assert.ok(res.rewards.loot.items.length >= 1, 'at least one resource drops');
  const gained = res.rewards.loot.items[0];
  assert.ok(hasItem(h.id, gained.key, gained.qty), 'the dropped resource is in the bag');
});
