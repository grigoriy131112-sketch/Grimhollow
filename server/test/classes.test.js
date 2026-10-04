import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { CLASSES, CLASS_KEYS, abilitiesForClass, findAbility, BASIC_ATTACK } from '../src/game/classes.js';

test('every class has 15 levels and 2 abilities unlocked per level', () => {
  for (const key of CLASS_KEYS) {
    const abilities = CLASSES[key].abilities;
    assert.equal(abilities.length, 30, `${key} should have 30 abilities`);
    for (let level = 1; level <= 15; level += 1) {
      const atLevel = abilitiesForClass(key, level);
      const justThisLevel = abilities.filter((a) => a.unlockLevel === level);
      assert.equal(justThisLevel.length, 2, `${key} level ${level} should unlock exactly 2 abilities`);
      assert.equal(atLevel.length, level * 2, `${key} at level ${level} should expose ${level * 2} abilities`);
    }
  }
});

test('class growth covers every stat and is positive', () => {
  for (const key of CLASS_KEYS) {
    const klass = CLASSES[key];
    for (const stat of ['hp', 'mana', 'stamina', 'attack', 'defense']) {
      assert.ok(klass.growth[stat] > 0, `${key}.${stat} should grow`);
    }
  }
});

test('ability ids are unique within a class', () => {
  for (const key of CLASS_KEYS) {
    const ids = CLASSES[key].abilities.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, `${key} has duplicate ability ids`);
  }
});

test('basic attack always exists and is free', () => {
  assert.equal(BASIC_ATTACK.id, 'basic');
  assert.equal(BASIC_ATTACK.cost, 0);
  assert.equal(findAbility('wizard', 'does_not_exist'), null);
  assert.equal(findAbility('wizard', 'fire_bolt').name, 'Огненный снаряд');
});
