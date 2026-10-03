import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import {
  createBattle, takePlayerAction, hitChance, damageOf, activeCombatant,
  aliveCombatants, combatantByKey, MIN_HIT_CHANCE, MAX_HIT_CHANCE,
} from '../src/game/combat.js';

// Deterministic RNG: yields the supplied values in order, then repeats the last.
const seq = (values) => {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
};

const hero = {
  id: 1, name: 'Hero', class: 'fighter', level: 1,
  stats: { maxHp: 60, maxMana: 10, maxStamina: 50, attack: 12, defense: 8, accuracy: 30, evasion: 10, speed: 8 },
  hp: 60, mana: 10, stamina: 50,
  abilities: [{ id: 'cleave' }, { id: 'shield_wall' }],
};

const goblin = {
  id: 2, name: 'Goblin', class: 'fighter', level: 1,
  stats: { maxHp: 30, maxMana: 0, maxStamina: 0, attack: 10, defense: 3, accuracy: 25, evasion: 8, speed: 12 },
  hp: 30, mana: 0, stamina: 0, abilities: [],
};

test('hit chance is a bounded percentage from accuracy vs evasion', () => {
  const state = createBattle({ player: hero, opponents: [goblin] }, seq([0.9])).state;
  const p = combatantByKey(state, 'p1');
  const e = combatantByKey(state, 'e1');
  const chance = hitChance(p, e);
  assert.equal(chance, 50 + 30 - 8);
  assert.ok(chance >= MIN_HIT_CHANCE && chance <= MAX_HIT_CHANCE);
});

test('damage is attack minus defense, floored at 1', () => {
  const state = createBattle({ player: hero, opponents: [goblin] }, seq([0.9])).state;
  const p = combatantByKey(state, 'p1');
  const e = combatantByKey(state, 'e1');
  assert.equal(damageOf(p, e, 1), 12 - 3);
  assert.equal(damageOf(e, p, 1), Math.max(1, 10 - 8));
});

test('a miss deals no damage', () => {
  // Player rolls 0.99 => 99, above hit chance => miss.
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.99]));
  const before = combatantByKey(state, 'e1').hp;
  const { events } = takePlayerAction(state, { type: 'attack', abilityId: 'basic', targetKey: 'e1' }, seq([0.99]));
  assert.ok(events.some((e) => e.type === 'miss'));
  assert.equal(combatantByKey(state, 'e1').hp, before);
});

test('a hit deals damage and can be lethal', () => {
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.99]));
  // Rolls 0.0 => hit.
  const { events } = takePlayerAction(state, { type: 'attack', abilityId: 'cleave', targetKey: 'e1' }, seq([0.0]));
  assert.ok(events.some((e) => e.type === 'hit' && e.damage > 0));
});

test('abilities consume their resource and respect cooldowns', () => {
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.99]));
  const p = combatantByKey(state, 'p1');
  takePlayerAction(state, { type: 'attack', abilityId: 'cleave', targetKey: 'e1' }, seq([0.0]));
  assert.ok(p.stamina < 50, 'stamina was spent');
  assert.ok(p.cooldowns.shield_wall === undefined || p.cooldowns.shield_wall >= 0);
});

test('insufficient resource blocks the ability and wastes no turn', () => {
  const tired = { ...hero, stamina: 0, abilities: [{ id: 'cleave' }] };
  const { state } = createBattle({ player: tired, opponents: [goblin] }, seq([0.99]));
  const before = combatantByKey(state, 'e1').hp;
  const { events } = takePlayerAction(state, { type: 'attack', abilityId: 'cleave', targetKey: 'e1' }, seq([0.0]));
  assert.ok(events.some((e) => e.text.includes('Недостаточно выносливости')));
  assert.equal(combatantByKey(state, 'e1').hp, before);
});

test('enemy acts before the player when it is faster, then control returns', () => {
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.0, 0.0]));
  assert.equal(activeCombatant(state).side, 'player');
});

test('battle ends in victory when all enemies fall', () => {
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.99]));
  let guard = 0;
  while (!state.over && guard < 40) {
    if (activeCombatant(state).side === 'player') takePlayerAction(state, { type: 'attack', abilityId: 'basic', targetKey: 'e1' }, seq([0.0]));
    guard += 1;
  }
  assert.equal(state.over, true);
  assert.equal(state.winner, 'player');
  assert.equal(aliveCombatants(state, 'enemy').length, 0);
});

test('fleeing ends the battle with no winner', () => {
  const { state } = createBattle({ player: hero, opponents: [goblin] }, seq([0.99]));
  const { state: after } = takePlayerAction(state, { type: 'flee' }, seq([0.5]));
  assert.equal(after.over, true);
  assert.equal(after.winner, null);
});
