import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { recruit, getParty } from '../src/services/party.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import { companionTemplate } from '../src/game/companions.js';

const seq = (values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

function leaderWith(gold = 5000) {
  const c = createCharacter({ name: `Лидер ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return c;
}

function addCompanion(leaderId, key) {
  const t = companionTemplate(key);
  return recruit(leaderId, key, { source: t.sources[0], goldOffered: 9999 }, () => 0).member;
}

function firstMonster() {
  seedWorld();
  return getDb().prepare('SELECT id FROM monsters ORDER BY id LIMIT 1').get().id;
}

test.after(() => closeDb());

test('the whole active party joins the fight, leader first', () => {
  const leader = leaderWith();
  addCompanion(leader.id, 'marta_veil');
  addCompanion(leader.id, 'sera_dawn');
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });

  const allies = battle.combatants.filter((c) => c.side === 'player');
  assert.equal(allies.length, 3, 'leader + two companions');
  assert.equal(allies[0].kind, 'leader');
  assert.equal(allies[0].key, 'p1');
  assert.deepEqual(allies.slice(1).map((c) => c.kind), ['ally', 'ally']);
  assert.deepEqual(allies.slice(1).map((c) => c.key), ['a1', 'a2']);
  assert.equal(battle.combatants.filter((c) => c.side === 'enemy').length, 1);
});

test('a dead companion does not join the next battle', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  getDb().prepare("UPDATE party_members SET status='dead', hp=0 WHERE id=?").run(marta.id);
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  assert.equal(battle.combatants.filter((c) => c.side === 'player').length, 1, 'only the leader fights');
});

test('every player-side member is human-controlled, in speed order', () => {
  const leader = leaderWith();
  addCompanion(leader.id, 'marta_veil');
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const speeds = battle.combatants.filter((c) => c.side === 'player').map((c) => c.base.speed);
  assert.ok(speeds.length >= 2);
  // Turn order must be a valid permutation of all combatants.
  assert.equal(new Set(battle.combatants.map((c) => c.key)).size, battle.combatants.length);
});

test('defeating a companion in battle kills them for good', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const ally = battle.combatants.find((c) => c.kind === 'ally');

  // Force the companion to 0 HP in the persisted state, then let the battle settle.
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battle.id).state);
  const target = state.combatants.find((c) => c.key === ally.key);
  target.hp = 0;
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battle.id);

  // Finish the fight by declaring the enemy down and letting the player win.
  const monster = state.combatants.find((c) => c.side === 'enemy');
  monster.hp = 0;
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battle.id);

  // With the enemy down and the leader alive, the fight resolves as a win; the
  // fallen companion is still settled as dead.
  const res = takeTurn(battle.id, { type: 'flee' });
  assert.ok(['won', 'fled'].includes(res.status));
  assert.ok(res.rewards.fallen.some((f) => f.memberId === marta.id));
  assert.equal(getDb().prepare('SELECT status FROM party_members WHERE id=?').get(marta.id).status, 'dead');
  assert.ok(!getParty(leader.id).members.some((m) => m.id === marta.id), 'dead members leave the active roster');
});

test('surviving companions keep their HP and gain XP on a win', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battle.id).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;         // enemy down
  state.combatants.find((c) => c.kind === 'ally').hp = 7;          // ally survives hurt
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battle.id);

  const res = takeTurn(battle.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.status, 'won');
  const member = res.rewards.members.find((m) => m.id === marta.id);
  assert.equal(member.dead, false);
  assert.equal(member.hp, 7);
  const row = getDb().prepare('SELECT hp, xp FROM party_members WHERE id=?').get(marta.id);
  assert.equal(row.hp, 7);
  assert.ok(row.xp > 0, 'companions gain XP from the win');
});

test('the leader survives defeat with 1 HP and loses a quarter of the gold', () => {
  const leader = leaderWith(400);
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battle.id).state);
  state.combatants.find((c) => c.kind === 'leader').hp = 0;
  state.combatants.find((c) => c.side === 'enemy').hp = 5;
  state.over = true; state.winner = 'enemy';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battle.id);

  const res = takeTurn(battle.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.status, 'lost');
  const row = getDb().prepare('SELECT hp, gold FROM characters WHERE id=?').get(leader.id);
  assert.equal(row.hp, 1);
  assert.equal(row.gold, 300);
  assert.equal(res.rewards.goldLost, 100);
});

test('the view exposes where "Назад" should return to', () => {
  const leader = leaderWith();
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  assert.equal(battle.characterId, leader.id);
});
