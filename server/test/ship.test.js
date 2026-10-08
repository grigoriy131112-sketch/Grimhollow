import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { recordVisit } from '../src/services/world.js';
import {
  getShipView, buyShip, startWork, awardShipPoints, getShipBonuses,
} from '../src/services/ship.js';
import {
  UPGRADES, UPGRADES_PER_LEVEL, MAX_SHIP_LEVEL, SHIP_PRICE, DOCK_HAND_GOLD,
  upgradesForLevel, upgradesForBranch, componentCap, levelComplete, canLevelUp,
  costForLevel, minutesForLevel, minutesForLevelUp, levelUpCost, mannableGuns, bonusesFrom,
} from '../src/game/ship.js';

let n = 0;
function hero({ gold = 5000, klass = 'fighter' } = {}) {
  n += 1;
  seedWorld();
  const c = createCharacter({ name: `Капитан ${n} ${Math.floor(Math.random() * 1e6)}`, class: klass });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return c;
}

const portId = () => getDb().prepare("SELECT id FROM locations WHERE name = 'Сумеречная гавань'").get().id;
const inlandId = () => getDb().prepare("SELECT id FROM locations WHERE name = 'Костяные поля'").get().id;

// recordVisit sets characters.location_id, like a finished road does.
const putInPort = (id) => recordVisit(id, portId());
const putInland = (id) => recordVisit(id, inlandId());

const shipIdOf = (characterId) =>
  getDb().prepare('SELECT id FROM ships WHERE character_id = ?').get(characterId).id;
const activeJob = (shipId) =>
  getDb().prepare("SELECT * FROM ship_works WHERE ship_id = ? AND status = 'active'").get(shipId);
const runJob = (characterId) => {
  const job = activeJob(shipIdOf(characterId));
  return getShipView(characterId, Date.now() + job.minutes * 10000 + 1000);
};

test.after(() => closeDb());

test('the tree is 10 levels x 3 branches x 2 upgrades = 60', () => {
  assert.equal(UPGRADES.length, 60);
  assert.equal(UPGRADES_PER_LEVEL, 6);
  for (let lvl = 1; lvl <= MAX_SHIP_LEVEL; lvl += 1) {
    assert.equal(upgradesForLevel(lvl).length, 6, `level ${lvl} unlocks six`);
    assert.equal(upgradesForBranch('hull').filter((u) => u.level === lvl).length, 2);
    assert.equal(upgradesForBranch('guns').filter((u) => u.level === lvl).length, 2);
    assert.equal(upgradesForBranch('class_guns').filter((u) => u.level === lvl).length, 2);
  }
  assert.equal(new Set(UPGRADES.map((u) => u.key)).size, 60);
});

test('the cost and time scales grow with the level', () => {
  assert.equal(costForLevel(3, 1), 3);
  assert.equal(costForLevel(3, 2), 6);
  assert.equal(minutesForLevel(1, 1), 60);
  assert.equal(minutesForLevel(2, 1), 120);
  assert.equal(minutesForLevelUp(2), 240, 'the ship level-up is heavy (x2)');
  assert.equal(levelUpCost(1), 10);
  assert.equal(levelUpCost(3), 30);
});

test('component caps follow the ship level and the flagship/battery', () => {
  assert.equal(componentCap(1, {}), 1);
  assert.equal(componentCap(5, {}), 5);
  assert.equal(componentCap(5, { hull_flagship: 1 }), 6);
  assert.equal(componentCap(5, { hull_flagship: 1, gun_battery: 1 }), 7);
  assert.equal(componentCap(10, { hull_flagship: 1, gun_battery: 1 }), 12);
});

test('a level is complete only when all six of its upgrades are forged', () => {
  const forged = {};
  assert.equal(levelComplete(forged, 1), false);
  for (const u of upgradesForLevel(1)) forged[u.key] = 1;
  assert.equal(levelComplete(forged, 1), true);
  assert.equal(canLevelUp(1, forged).ok, true);
  assert.equal(canLevelUp(1, {}).ok, false);
  assert.match(canLevelUp(1, {}).reason, /шесть узлов/);
});

test('a ship can only be bought in a port, and only one per hero', () => {
  const c = hero();
  putInland(c.id);
  assert.throws(() => buyShip(c.id), /только в порту/);

  putInPort(c.id);
  const before = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  const view = buyShip(c.id);
  assert.equal(view.owned, true);
  assert.equal(view.level, 1);
  assert.equal(view.points, 0);
  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.equal(after, before - SHIP_PRICE);
  assert.throws(() => buyShip(c.id), /уже есть корабль/);
});

test('a poor hero cannot buy a ship', () => {
  const c = hero({ gold: 10 });
  putInPort(c.id);
  assert.throws(() => buyShip(c.id), /Не хватает золота/);
});

test('upgrades need the port, points and the unlocked level', () => {
  const c = hero();
  putInPort(c.id);
  buyShip(c.id);

  assert.throws(() => startWork(c.id, { upgradeKey: 'hull_planking' }), /очков корабля/);

  awardShipPoints(c.id, 500);
  assert.throws(() => startWork(c.id, { upgradeKey: 'hull_hold' }), /уровне корабля 3/);

  const view = startWork(c.id, { upgradeKey: 'hull_planking' });
  assert.ok(view.work, 'a job is on the dock');
  assert.equal(view.work.kind, 'component');
  assert.equal(view.work.toLevel, 1);
  assert.equal(view.work.minutes, minutesForLevel(1, 1.5), 'the hull piece is heavy');
  assert.equal(view.points, 500 - 3, 'rank 1 costs base 3');
});

test('a job resolves when its time has come, applying the upgrade', () => {
  const c = hero();
  putInPort(c.id);
  buyShip(c.id);
  awardShipPoints(c.id, 500);
  startWork(c.id, { upgradeKey: 'hull_planking' });
  const job = activeJob(shipIdOf(c.id));

  const view = getShipView(c.id, Date.now() + job.minutes * 10000 + 1000);
  assert.equal(view.work, null, 'the job is finished');
  const node = view.nodes.find((x) => x.key === 'hull_planking');
  assert.equal(node.rank, 1);
  assert.equal(view.bonuses.hullHp, 40);
  assert.equal(getDb().prepare('SELECT status FROM ship_works WHERE id = ?').get(job.id).status, 'done');
});

test('only one job may be on the dock at a time', () => {
  const c = hero();
  putInPort(c.id);
  buyShip(c.id);
  awardShipPoints(c.id, 500);
  startWork(c.id, { upgradeKey: 'hull_planking' });
  assert.throws(() => startWork(c.id, { upgradeKey: 'hull_frame' }), /Версталь уже занята/);
});

test('hiring dock hands costs gold and halves the time', () => {
  const c = hero();
  putInPort(c.id);
  buyShip(c.id);
  awardShipPoints(c.id, 500);
  const goldBefore = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  const view = startWork(c.id, { upgradeKey: 'hull_planking', hired: true });
  assert.equal(view.work.hired, true);
  assert.equal(view.work.minutes, Math.ceil(minutesForLevel(1, 1.5) / 2));
  const goldAfter = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.equal(goldAfter, goldBefore - DOCK_HAND_GOLD);
});

test('the ship level rises only after the whole level is forged', () => {
  const c = hero();
  putInPort(c.id);
  buyShip(c.id);
  awardShipPoints(c.id, 5000);

  assert.throws(() => startWork(c.id, { levelUp: true }), /шесть узлов/);

  for (const u of upgradesForLevel(1)) {
    startWork(c.id, { upgradeKey: u.key });
    runJob(c.id);
  }

  const view = startWork(c.id, { levelUp: true });
  assert.equal(view.work.kind, 'level');
  assert.equal(view.work.toLevel, 2);
  const after = runJob(c.id);
  assert.equal(after.level, 2);
  assert.equal(after.canLevelUp.ok, false, 'level 2 is not forged yet');
});

test('class guns are only mannable by the classes in the party', () => {
  const c = hero({ klass: 'rogue' });
  putInPort(c.id);
  buyShip(c.id);
  awardShipPoints(c.id, 5000);

  const view = getShipView(c.id);
  assert.equal(view.nodes.find((x) => x.key === 'culverin').mannable, true, 'a rogue mans the culverin');
  const carronade = view.nodes.find((x) => x.key === 'carronade');
  assert.equal(carronade.mannable, false, 'no fighter/barbarian in the party');
  assert.equal(carronade.canForge, false);

  getDb().prepare(
    `INSERT INTO party_members (leader_id, template_key, name, class, level, source, status)
     VALUES (?, 'test_fighter', 'Тестовый воин', 'fighter', 1, 'tavern', 'active')`,
  ).run(c.id);
  const after = getShipView(c.id);
  assert.equal(after.nodes.find((x) => x.key === 'carronade').mannable, true);
});

test('bonusesFrom folds ranks and the flagship/battery raise every cap', () => {
  const b = bonusesFrom({ hull_planking: 2, gun_charge: 3, hull_flagship: 1, gun_battery: 1 });
  assert.equal(b.hullHp, 80);
  assert.ok(Math.abs(b.cannonDamage - 0.18) < 1e-9);
  assert.equal(b.capAll, 2);
  assert.equal(b.gunSlots, 2, 'the flagship and battery each add a slot');
});

test('mannableGuns matches the party classes and always includes the flagship guns', () => {
  const guns = mannableGuns(['wizard']).map((g) => g.key);
  assert.ok(guns.includes('mortar'));
  assert.ok(guns.includes('arcane_rod'));
  assert.ok(guns.includes('dragon_lance'), 'the level-10 guns are for any class');
  assert.ok(!guns.includes('carronade'));
});

test('a sea win pays ship points; without a ship it pays nothing', () => {
  const c = hero();
  assert.equal(awardShipPoints(c.id, 5), 0);
  putInPort(c.id);
  buyShip(c.id);
  assert.equal(awardShipPoints(c.id, 5), 5);
  assert.equal(awardShipPoints(c.id, 7), 12);
  assert.equal(getShipBonuses(c.id).level, 1);
});
