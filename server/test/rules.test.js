import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCharacter, levelFromXp, xpToNext, validateCharacterInput, CLASSES } from '../src/game/rules.js';

const row = (over = {}) => ({ id: 1, name: 'Test', class: 'fighter', level: 1, xp: 0, hp: null, mana: null, stamina: null, gold: 0, ...over });

test('level 1 fighter derives the class base stats', () => {
  const c = deriveCharacter(row());
  assert.equal(c.stats.maxHp, CLASSES.fighter.base.hp);
  assert.equal(c.stats.maxMana, CLASSES.fighter.base.mana);
  assert.equal(c.hp, c.stats.maxHp, 'unset HP fills to max');
  assert.equal(c.abilities.length, 2, 'level 1 unlocks 2 abilities');
});

test('stats grow per level', () => {
  const c1 = deriveCharacter(row({ level: 1 }));
  const c5 = deriveCharacter(row({ level: 5 }));
  assert.ok(c5.stats.maxHp > c1.stats.maxHp);
  assert.ok(c5.stats.attack > c1.stats.attack);
  assert.equal(c5.abilities.length, 10);
});

test('passive ability boosts the derived stat (fighter Unbreakable = +20% HP)', () => {
  const c1 = deriveCharacter(row({ level: 1, class: 'fighter' }));
  const c5 = deriveCharacter(row({ level: 5, class: 'fighter' }));
  const expectedBase = CLASSES.fighter.base.hp + CLASSES.fighter.growth.hp * 4;
  assert.equal(c1.stats.maxHp, CLASSES.fighter.base.hp);
  assert.equal(c5.stats.maxHp, Math.round(expectedBase * 1.2));
});

test('xp thresholds map to levels, capped at 5', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(119), 1);
  assert.equal(levelFromXp(120), 2);
  assert.equal(levelFromXp(1100), 5);
  assert.equal(levelFromXp(999999), 5);
  assert.equal(xpToNext(0), 120);
  assert.equal(xpToNext(1100), null);
});

test('validateCharacterInput enforces sensible input', () => {
  assert.throws(() => validateCharacterInput({ name: 'x', class: 'fighter' }));
  assert.throws(() => validateCharacterInput({ name: 'Valid', class: 'warlord' }));
  const ok = validateCharacterInput({ name: '  Aria  ', class: 'rogue' });
  assert.equal(ok.name, 'Aria');
  assert.equal(ok.class, 'rogue');
});

test('wizard has more mana and less HP than fighter at the same level', () => {
  const f = deriveCharacter(row({ class: 'fighter' }));
  const w = deriveCharacter(row({ class: 'wizard' }));
  assert.ok(w.stats.maxMana > f.stats.maxMana);
  assert.ok(w.stats.maxHp < f.stats.maxHp);
});

const ALL_CLASSES = ['fighter', 'wizard', 'rogue', 'cleric', 'barbarian', 'bard', 'druid', 'monk', 'paladin', 'ranger', 'sorcerer', 'warlock'];

test('the game ships the 12 D&D classes', () => {
  assert.deepEqual(Object.keys(CLASSES).sort(), [...ALL_CLASSES].sort());
});

test('every class has 5 levels, 2 abilities per level, and one passive', () => {
  const seen = new Set();
  for (const key of ALL_CLASSES) {
    const klass = CLASSES[key];
    for (let lvl = 1; lvl <= 5; lvl += 1) {
      const atLevel = klass.abilities.filter((a) => a.unlockLevel === lvl);
      assert.equal(atLevel.length, 2, `${key} should unlock 2 abilities at level ${lvl}`);
    }
    assert.equal(klass.abilities.length, 10, `${key} should have 10 abilities`);
    assert.equal(klass.abilities.filter((a) => a.passive).length, 1, `${key} should have 1 passive`);
    for (const a of klass.abilities) {
      assert.ok(!seen.has(a.id), `duplicate ability id ${a.id}`);
      seen.add(a.id);
      assert.equal(typeof a.name, 'string');
      assert.ok(a.name.length > 0);
      assert.equal(typeof a.description, 'string');
      assert.ok(a.description.length > 0);
    }
  }
});

test('every class derives valid level-5 stats and 10 abilities', () => {
  for (const key of ALL_CLASSES) {
    const c5 = deriveCharacter(row({ class: key, level: 5 }));
    assert.equal(c5.abilities.length, 10, `${key} level 5 should have 10 abilities`);
    assert.ok(c5.stats.maxHp > 0, `${key} maxHp > 0`);
    assert.ok(c5.stats.attack > 0, `${key} attack > 0`);
    assert.ok(c5.stats.speed > 0, `${key} speed > 0`);
    assert.equal(c5.hp, c5.stats.maxHp);
  }
});
