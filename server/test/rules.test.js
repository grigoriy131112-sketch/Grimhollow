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
  assert.throws(() => validateCharacterInput({ name: 'Valid', class: 'barbarian' }));
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
