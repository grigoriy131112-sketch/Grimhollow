import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { recruit, getParty } from '../src/services/party.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import { getRitual, startResurrection } from '../src/services/resurrections.js';
import { listMonsters, getMonsterByName } from '../src/services/world.js';
import { companionTemplate } from '../src/game/companions.js';

function leaderWith(gold = 5000) {
  const c = createCharacter({ name: `Лидер ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return c;
}

function addCompanion(leaderId, key) {
  const t = companionTemplate(key);
  return recruit(leaderId, key, { source: t.sources[0], goldOffered: 9999 }, () => 0).member;
}

function kill(memberId) {
  getDb().prepare("UPDATE party_members SET status='dead', hp=0 WHERE id=?").run(memberId);
}

// Force an already-decided win so takeTurn settles the battle.
function forceWin(battleId) {
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battleId).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battleId);
}

test.after(() => closeDb());

test('the death-realm boss never appears in the ordinary monster list', () => {
  seedWorld();
  assert.ok(getMonsterByName('Костяной Пастырь'), 'the boss exists in the world data');
  assert.ok(!listMonsters().some((m) => m.name === 'Костяной Пастырь'), 'but it is off the map');
});

test('the ritual lists the fallen and their realm', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  kill(marta.id);
  const ritual = getRitual(leader.id);
  assert.equal(ritual.fallen.length, 1);
  assert.equal(ritual.fallen[0].id, marta.id);
  assert.equal(ritual.canOpen, true);
  assert.equal(ritual.realm.boss.name, 'Костяной Пастырь');
  assert.equal(ritual.realm.boss.level, 15);
});

test('beating the death-realm boss brings the fallen companion back', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  kill(marta.id);

  const started = startResurrection(leader.id, marta.id);
  assert.ok(started.battleId);
  assert.equal(getDb().prepare('SELECT kind FROM battles WHERE id=?').get(started.battleId).kind, 'death_realm');

  forceWin(started.battleId);
  const res = takeTurn(started.battleId, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.status, 'won');
  assert.ok(res.rewards.revived, 'the reward reports the resurrection');
  assert.equal(res.rewards.revived.id, marta.id);

  const row = getDb().prepare('SELECT status, hp FROM party_members WHERE id=?').get(marta.id);
  assert.equal(row.status, 'active', 'the companion is alive again');
  assert.ok(row.hp > 0, 'and restored to strength');
  assert.ok(getParty(leader.id).members.some((m) => m.id === marta.id), 'and rejoins the roster');
});

test('there is no sacrifice: a living companion cannot be bound to the ritual', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  assert.throws(() => startResurrection(leader.id, marta.id), /воскрешать некого/);
});

test('only one gate may stand open at a time', () => {
  const leader = leaderWith();
  const a = addCompanion(leader.id, 'marta_veil');
  const b = addCompanion(leader.id, 'sera_dawn');
  kill(a.id);
  kill(b.id);
  startResurrection(leader.id, a.id);
  assert.throws(() => startResurrection(leader.id, b.id), /Врата.*уже открыты/);
});
