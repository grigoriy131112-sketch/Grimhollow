import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { createCharacter } from '../src/services/characters.js';
import {
  getParty, getRecruitBoard, listSourcesWithCounts, recruit,
  adjustRelation, sweepDepartures,
} from '../src/services/party.js';

function freshLeader(gold = 1000) {
  const leader = createCharacter({ name: `Лидер ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, leader.id);
  return leader;
}

test.after(() => closeDb());

test('a fresh leader has an empty party and can see fourteen sources', () => {
  const leader = freshLeader();
  const party = getParty(leader.id);
  assert.equal(party.size, 0);
  assert.equal(party.members.length, 0);
  const sources = listSourcesWithCounts(leader.id);
  assert.equal(sources.length, 14);
  assert.ok(sources.some((s) => s.available > 0));
});

test('the recruit board lists candidates with an honest chance', () => {
  const leader = freshLeader();
  const board = getRecruitBoard(leader.id, 'tavern');
  assert.ok(board.length > 0);
  for (const c of board) {
    assert.ok(c.acceptChance >= 5 && c.acceptChance <= 95);
    assert.ok(c.sources.some((s) => s.key === 'tavern'));
  }
});

test('a deterministic rng can force an acceptance or a refusal', () => {
  const leader = freshLeader();
  const refused = recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 500 }, () => 0.99);
  assert.equal(refused.accepted, false);
  assert.equal(getParty(leader.id).size, 0, 'a refusal changes nothing');

  const accepted = recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 500 }, () => 0);
  assert.equal(accepted.accepted, true);
  assert.equal(getParty(leader.id).size, 1);
  assert.equal(getParty(leader.id).members[0].relationToLeader >= 0, true);
});

test('hiring for gold charges the asking price, once', () => {
  const leader = freshLeader(1000);
  const r = recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 1000 }, () => 0);
  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(leader.id).gold;
  assert.equal(after, 1000 - r.goldPaid);
  assert.throws(() => recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 1000 }, () => 0), /уже в отряде/);
});

test('a free rescue costs no gold', () => {
  const leader = freshLeader(0);
  const r = recruit(leader.id, 'nyla', { source: 'orphan' }, () => 0);
  assert.equal(r.goldPaid, 0);
  assert.equal(getParty(leader.id).size, 1);
});

test('every newcomer seeds a mutual opinion with each existing member', () => {
  const leader = freshLeader(5000);
  recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 500 }, () => 0);
  recruit(leader.id, 'sera_dawn', { source: 'guild', goldOffered: 500 }, () => 0);
  const party = getParty(leader.id);
  assert.equal(party.size, 2);
  for (const m of party.members) {
    assert.equal(m.bonds.length, 1, 'each member feels something about the other');
    assert.ok(m.bonds[0].value >= 0 && m.bonds[0].value <= 100);
    assert.ok(m.relationToLeader >= 0 && m.relationToLeader <= 100);
  }
});

test('dropping a bond below the threshold makes the member walk out', () => {
  const leader = freshLeader(5000);
  recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 500 }, () => 0);
  recruit(leader.id, 'sera_dawn', { source: 'guild', goldOffered: 500 }, () => 0);
  const [marta, sera] = getParty(leader.id).members;
  adjustRelation(marta.id, sera.id, -60);
  const leaving = getParty(leader.id).members.find((m) => m.id === marta.id);
  assert.equal(leaving.leaving.leave, true);
  const left = sweepDepartures(leader.id);
  assert.equal(left.length, 1);
  assert.equal(left[0].id, marta.id);
  const party = getParty(leader.id);
  assert.equal(party.size, 1);
  assert.equal(party.members[0].id, sera.id);
});

test('relationships cannot be pushed past 0 or 100', () => {
  const leader = freshLeader(5000);
  recruit(leader.id, 'marta_veil', { source: 'tavern', goldOffered: 500 }, () => 0);
  const m = getParty(leader.id).members[0];
  assert.equal(adjustRelation(m.id, null, 500), 100);
  assert.equal(adjustRelation(m.id, null, -500), 0);
});
