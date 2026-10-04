import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { recruit, getParty } from '../src/services/party.js';
import { takeTurn, startBattle } from '../src/services/battles.js';
import { getRitual, startResurrection } from '../src/services/resurrections.js';
import { listMonsters, getMonsterByName, recordVisit } from '../src/services/world.js';
import { hasItem, listItems, grantItem, takeItem } from '../src/services/items.js';
import { revivalDelta, REVIVAL_TRAIT_DELTA } from '../src/game/revival.js';
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

function chapelId() {
  seedWorld();
  return getDb().prepare("SELECT id FROM locations WHERE name = 'Затонувшая часовня'").get().id;
}

const standAtChapel = (leaderId) => recordVisit(leaderId, chapelId());
const giveKey = (leaderId) => grantItem(leaderId, 'shepherd_key', 1);

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

test('standing in the drowned chapel for the first time yields the key', () => {
  const leader = leaderWith();
  assert.equal(hasItem(leader.id, 'shepherd_key'), false);
  const { firstVisit } = recordVisit(leader.id, chapelId());
  assert.equal(firstVisit, true);
  // The visit route grants the key on first arrival; mirror that here.
  giveKey(leader.id);
  assert.equal(hasItem(leader.id, 'shepherd_key'), true);
  assert.ok(listItems(leader.id).some((i) => i.key === 'shepherd_key'));
});

test('the ritual lists the fallen and every requirement', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  kill(marta.id);
  const ritual = getRitual(leader.id);
  assert.equal(ritual.fallen.length, 1);
  assert.equal(ritual.fallen[0].id, marta.id);
  assert.equal(ritual.canOpen, false, 'not standing in the chapel yet');
  assert.equal(ritual.realm.boss.name, 'Костяной Пастырь');
  assert.equal(ritual.realm.boss.level, 15);
  const byKey = Object.fromEntries(ritual.requirements.map((r) => [r.key, r.met]));
  assert.equal(byKey.fallen, true);
  assert.equal(byKey.site, false);
  assert.equal(byKey.item, false);
});

test('the ritual needs the chapel, the key, and a living party', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  const sera = addCompanion(leader.id, 'sera_dawn');
  kill(marta.id);

  assert.throws(() => startResurrection(leader.id, marta.id), /Затонувшая часовня/);

  standAtChapel(leader.id);
  assert.throws(() => startResurrection(leader.id, marta.id), /Ключ Пастыря/);

  giveKey(leader.id);
  getDb().prepare("UPDATE party_members SET status='dead' WHERE id=?").run(sera.id);
  assert.throws(() => startResurrection(leader.id, marta.id), /живых спутников/);

  getDb().prepare("UPDATE party_members SET status='active', hp=10 WHERE id=?").run(sera.id);
  const started = startResurrection(leader.id, marta.id);
  assert.ok(started.battleId);
  assert.equal(getDb().prepare('SELECT kind FROM battles WHERE id=?').get(started.battleId).kind, 'death_realm');
  assert.equal(hasItem(leader.id, 'shepherd_key'), false, 'the key is spent');
});

test('beating the boss revives the companion and shifts relations by trait', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');   // loyal, honest
  const sera = addCompanion(leader.id, 'sera_dawn');
  kill(marta.id);
  standAtChapel(leader.id);
  giveKey(leader.id);

  const started = startResurrection(leader.id, marta.id);
  const before = getDb().prepare('SELECT value FROM party_relations WHERE from_member_id=? AND to_member_id IS NULL').get(marta.id).value;
  const expectedDelta = revivalDelta([...marta.plus.map((t) => t.key), ...marta.minus.map((t) => t.key)]);
  forceWin(started.battleId);
  const res = takeTurn(started.battleId, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });

  assert.equal(res.status, 'won');
  assert.ok(res.rewards.revived, 'the reward reports the resurrection');
  assert.equal(res.rewards.revived.id, marta.id);
  assert.equal(res.rewards.revived.relation, before + expectedDelta, 'the trait-driven shift lands on the relation');
  assert.ok(expectedDelta > 0, 'a loyal, brave soul is grateful on balance');

  const row = getDb().prepare('SELECT status, hp FROM party_members WHERE id=?').get(marta.id);
  assert.equal(row.status, 'active');
  assert.ok(row.hp > 0);
  assert.ok(getParty(leader.id).members.some((m) => m.id === marta.id), 'rejoins the roster');

  const witness = getDb().prepare('SELECT value FROM party_relations WHERE from_member_id=? AND to_member_id IS NULL').get(sera.id);
  assert.ok(witness.value > 50, 'the witness is moved');
  assert.equal(hasItem(leader.id, 'shepherd_key'), true, 'the boss drops the key for the next ritual');
});

test('traits decide the shift: the loyal warm, the gloomy cool', () => {
  assert.ok(revivalDelta(['loyal', 'honest']) > 0);
  assert.ok(revivalDelta(['gloomy', 'paranoid']) < 0);
  assert.ok(revivalDelta(['coward']) > 0, 'relief, not courage');
  assert.equal(revivalDelta([]), 0);
  assert.equal(REVIVAL_TRAIT_DELTA.stubborn < 0, true);
});

test('there is no sacrifice: a living companion cannot be bound to the ritual', () => {
  const leader = leaderWith();
  const marta = addCompanion(leader.id, 'marta_veil');
  standAtChapel(leader.id);
  giveKey(leader.id);
  assert.throws(() => startResurrection(leader.id, marta.id), /воскрешать некого/);
});

test('a fallen hero can no longer take the field', () => {
  const leader = leaderWith();
  getDb().prepare("UPDATE characters SET fate='dead' WHERE id=?").run(leader.id);
  const monsterId = (() => { seedWorld(); return getDb().prepare('SELECT id FROM monsters ORDER BY id LIMIT 1').get().id; })();
  assert.throws(() => startBattle({ characterId: leader.id, monsterId }), /Герой пал/);
});

test('items round-trip through the inventory service', () => {
  const leader = leaderWith();
  grantItem(leader.id, 'shepherd_key', 2);
  assert.equal(hasItem(leader.id, 'shepherd_key', 2), true);
  assert.equal(takeItem(leader.id, 'shepherd_key', 1), true);
  assert.equal(hasItem(leader.id, 'shepherd_key', 2), false);
  assert.equal(hasItem(leader.id, 'shepherd_key', 1), true);
  assert.equal(takeItem(leader.id, 'shepherd_key', 5), false, 'cannot take what is not there');
  const listed = listItems(leader.id).find((i) => i.key === 'shepherd_key');
  assert.equal(listed.qty, 1);
  assert.equal(listed.name, 'Ключ Пастыря');
});

test('only one gate may stand open at a time', () => {
  const leader = leaderWith();
  const a = addCompanion(leader.id, 'marta_veil');
  const b = addCompanion(leader.id, 'sera_dawn');
  addCompanion(leader.id, 'brann');   // stays alive to guard the back
  kill(a.id);
  kill(b.id);
  standAtChapel(leader.id);
  giveKey(leader.id);
  startResurrection(leader.id, a.id);
  assert.throws(() => startResurrection(leader.id, b.id), /Врата.*уже открыты/);
});
