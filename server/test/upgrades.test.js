import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter, getCharacterSheet } from '../src/services/characters.js';
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
  awardPartyPoints(leader.id, 20);
  assert.equal(getPoints(leader.id), 20);

  const tree = spendUpgrade(leader.id, 'command_hp');
  assert.equal(tree.points, 20 - NODES.command_hp.cost, 'rank 1 costs the base');
  assert.equal(tree.spentPoints, NODES.command_hp.cost);
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

test('each further rank of a node costs more than the last', () => {
  const leader = freshLeader();
  awardPartyPoints(leader.id, 100);
  const base = NODES.command_hp.cost;

  const after1 = getTree(leader.id).nodes.find((n) => n.key === 'command_hp');
  assert.equal(after1.nextCost, base, 'rank 1 costs base');
  const spent1 = spendUpgrade(leader.id, 'command_hp').spentPoints;

  const after2 = getTree(leader.id).nodes.find((n) => n.key === 'command_hp');
  assert.equal(after2.nextCost, base * 2, 'rank 2 costs twice base');
  const spent2 = spendUpgrade(leader.id, 'command_hp').spentPoints;

  const after3 = getTree(leader.id).nodes.find((n) => n.key === 'command_hp');
  assert.equal(after3.nextCost, base * 3, 'rank 3 costs three times base');
  const spent3 = spendUpgrade(leader.id, 'command_hp').spentPoints;

  assert.ok(after2.nextCost > after1.nextCost && after3.nextCost > after2.nextCost);
  assert.equal(spent1, base);
  assert.equal(spent2, base * 3);
  assert.equal(spent3, base * 6, 'a maxed node costs 6x base');
  assert.equal(getTree(leader.id).nodes.find((n) => n.key === 'command_hp').nextCost, 0, 'no price once maxed');
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

  // Forge Мuster twice: rank 1 costs 4, rank 2 costs 8. The cap becomes
  // BASE_ROSTER + 2, and the sixth companion joins.
  awardPartyPoints(leader.id, 20);
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

test('the character sheet and party show base plus tree, and battle boosts exactly once', () => {
  const leader = freshLeader();
  const baseMaxHp = getCharacterSheet(leader.id).stats.maxHp; // no tree yet
  awardPartyPoints(leader.id, 12);
  for (let i = 0; i < MAX_RANK; i += 1) spendUpgrade(leader.id, 'command_hp');

  const sheet = getCharacterSheet(leader.id);
  assert.ok(sheet.stats.maxHp > baseMaxHp, 'the sheet folds the tree in');
  assert.ok(sheet.bonuses.percents.maxHp > 0, 'the sheet reports the bonus');
  assert.equal(sheet.stats.maxHp, Math.round(baseMaxHp * 1.18), '+18% at max rank');

  // The party view shows the same boosted stats for leader and companions.
  getDb().prepare('UPDATE characters SET gold = 9999 WHERE id = ?').run(leader.id);
  recruit(leader.id, 'marta_veil', { source: 'road', goldOffered: 9999 }, () => 0);
  const party = getParty(leader.id);
  assert.equal(party.leader.stats.maxHp, sheet.stats.maxHp, 'leader strip matches the sheet');
  const ally = party.members[0];
  assert.ok(party.bonuses.percents.maxHp > 0);
  assert.ok(ally.stats.maxHp > 0);

  // A battle boosts from the raw sheet, so the combatant must equal the sheet
  // value — not the sheet value boosted a second time.
  const battle = startBattle({ characterId: leader.id, monsterId: firstMonster() });
  const p1 = battle.combatants.find((c) => c.key === 'p1');
  assert.equal(p1.maxHp, sheet.stats.maxHp, 'bonuses applied exactly once');
});

test('canSpend enforces the parent chain and the rank cap', () => {
  assert.equal(canSpend({}, 'command_attack').ok, false);
  assert.equal(canSpend({ command_hp: MAX_RANK }, 'command_attack').ok, true);
  assert.equal(canSpend({ command_hp: MAX_RANK }, 'command_hp').ok, false);
  const { spent, points } = spendPoint({ command_hp: MAX_RANK }, 5, 'command_attack');
  assert.equal(spent.command_attack, 1);
  assert.equal(points, 5 - NODES.command_attack.cost);
});
