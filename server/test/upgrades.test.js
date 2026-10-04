import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { recruit, getParty } from '../src/services/party.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import {
  getTree, spendUpgrade, awardPartyPoints, getPoints, getBonuses,
} from '../src/services/upgrades.js';
import {
  NODES, MAX_RANK, BASE_ROSTER, POINTS_PER_WIN, POINTS_PER_LEVEL,
  canSpend, spendPoint, bonusesFrom, applyBonusesToSource,
} from '../src/game/party_upgrades.js';

function freshLeader() {
  return createCharacter({ name: `Лидер ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
}

function firstMonster() {
  seedWorld();
  return getDb().prepare('SELECT id FROM monsters ORDER BY id LIMIT 1').get().id;
}

test.after(() => closeDb());

test('a fresh leader has no points and cannot take a child node first', () => {
  const leader = freshLeader();
  const tree = getTree(leader.id);
  assert.equal(tree.points, 0);
  assert.equal(tree.spentPoints, 0);
  assert.ok(tree.nodes.every((n) => n.rank === 0));

  const child = tree.nodes.find((n) => n.key === 'command_attack');
  assert.equal(child.canTake, false);
  assert.match(child.reason, /Стойкость знамени/);

  const root = tree.nodes.find((n) => n.key === 'command_hp');
  assert.equal(root.canTake, false, 'no points yet');
  assert.match(root.reason, /Не хватает/);
});

test('spending a point forges a rank and deducts the cost', () => {
  const leader = freshLeader();
  awardPartyPoints(leader.id, 5);
  assert.equal(getPoints(leader.id), 5);

  const tree = spendUpgrade(leader.id, 'command_hp');
  assert.equal(tree.points, 4, 'cost 1 spent');
  assert.equal(tree.spentPoints, 1);
  const node = tree.nodes.find((n) => n.key === 'command_hp');
  assert.equal(node.rank, 1);
  assert.equal(node.maxed, false);

  // The parent must be maxed before the child unlocks.
  const child = tree.nodes.find((n) => n.key === 'command_attack');
  assert.equal(child.canTake, false);

  spendUpgrade(leader.id, 'command_hp');
  spendUpgrade(leader.id, 'command_hp');
  const maxed = getTree(leader.id).nodes.find((n) => n.key === 'command_hp');
  assert.equal(maxed.rank, MAX_RANK);
  assert.equal(maxed.maxed, true);
  assert.equal(getTree(leader.id).nodes.find((n) => n.key === 'command_attack').canTake, true);
});

test('a node cannot be over-forged, and points cannot go negative', () => {
  const leader = freshLeader();
  awardPartyPoints(leader.id, 100);
  for (let i = 0; i < MAX_RANK; i += 1) spendUpgrade(leader.id, 'command_hp');
  assert.throws(() => spendUpgrade(leader.id, 'command_hp'), /до конца/);

  const poor = freshLeader();
  assert.throws(() => spendUpgrade(poor.id, 'command_hp'), /Не хватает/);
  assert.equal(getPoints(poor.id), 0);
});

test('the muster branch raises the roster cap and blocks over-recruiting', () => {
  const leader = createCharacter({ name: `Сборщик ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(9999, leader.id);
  const keys = ['marta_veil', 'rayven', 'kael_vane', 'gorr', 'lute'];
  for (const k of keys.slice(0, BASE_ROSTER)) {
    recruit(leader.id, k, { source: 'road', goldOffered: 9999 }, () => 0);
  }
  assert.equal(getParty(leader.id).size, BASE_ROSTER);
  assert.throws(
    () => recruit(leader.id, keys[BASE_ROSTER], { source: 'road', goldOffered: 9999 }, () => 0),
    /Отряд уже полон/,
  );

  // Forge Мuster twice: the cap becomes BASE_ROSTER + 2, and the sixth joins.
  awardPartyPoints(leader.id, 10);
  spendUpgrade(leader.id, 'muster_roster');
  assert.equal(getBonuses(leader.id).roster, BASE_ROSTER + 1);
  spendUpgrade(leader.id, 'muster_roster');
  assert.equal(getBonuses(leader.id).roster, BASE_ROSTER + 2);
  const joined = recruit(leader.id, keys[BASE_ROSTER], { source: 'road', goldOffered: 9999 }, () => 0);
  assert.equal(joined.accepted, true);
  assert.equal(getParty(leader.id).size, BASE_ROSTER + 1);
});

test('winning a battle pays a party point', () => {
  const leader = freshLeader();
  const before = getPoints(leader.id);
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battle.id).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battle.id);

  const res = takeTurn(battle.id, { type: 'flee' });
  assert.equal(res.status, 'won');
  assert.ok(res.rewards.pointsGained >= POINTS_PER_WIN);
  assert.equal(getPoints(leader.id), before + res.rewards.pointsGained);
});

test('the tree bonuses reach the combatants: stats scale and regeneration deepens', () => {
  const leader = freshLeader();
  awardPartyPoints(leader.id, 20);
  spendUpgrade(leader.id, 'sorcery_mana');
  spendUpgrade(leader.id, 'sorcery_mana');
  spendUpgrade(leader.id, 'sorcery_mana');
  spendUpgrade(leader.id, 'sorcery_regen');

  const bonuses = getBonuses(leader.id);
  assert.ok(bonuses.mult.maxMana > 0);
  assert.equal(bonuses.regenMana, 1);
  assert.equal(bonuses.regenStamina, 1);

  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const p1 = battle.combatants.find((c) => c.key === 'p1');
  assert.equal(p1.regenMana, 1);
  assert.equal(p1.regenStamina, 1);
  assert.ok(p1.maxMana > 0);
});

test('bonusesFrom folds a spent map, and applyBonusesToSource refills a grown pool', () => {
  const spent = { command_hp: MAX_RANK, sorcery_mana: 1, muster_roster: 2 };
  const bonuses = bonusesFrom(spent);
  assert.equal(bonuses.roster, BASE_ROSTER + 2);
  assert.ok(bonuses.mult.maxHp > 0);

  const source = {
    hp: 10, mana: 5, stamina: 5,
    stats: { maxHp: 100, maxMana: 50, maxStamina: 50, attack: 10 },
  };
  const boosted = applyBonusesToSource(source, bonuses);
  assert.ok(boosted.stats.maxHp > 100);
  assert.equal(boosted.hp, 10 + (boosted.stats.maxHp - 100), 'a grown max tops the pool up by the same amount');
});

test('canSpend enforces the parent chain and the rank cap', () => {
  assert.equal(canSpend({}, 'command_attack').ok, false);
  assert.equal(canSpend({ command_hp: MAX_RANK }, 'command_attack').ok, true);
  assert.equal(canSpend({ command_hp: MAX_RANK }, 'command_hp').ok, false);
  const { spent, points } = spendPoint({ command_hp: MAX_RANK }, 5, 'command_attack');
  assert.equal(spent.command_attack, 1);
  assert.equal(points, 5 - NODES.command_attack.cost);
});
