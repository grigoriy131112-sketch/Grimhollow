import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents } from '../src/db/seed_continents.js';
import {
  seedClan, DOCTRINES, BUILDINGS, buildingCost, clanKeyFromName,
  CLAN_MAX_LEVEL, MAX_RANK, GOLD_PER_NAME, tierGateForLevel,
} from '../src/db/seed_clan.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { addUnlock, hasUnlock } from '../src/services/quests.js';
import { grantItem, hasItem } from '../src/services/items.js';
import { RITUAL_ITEM, itemInfo } from '../src/game/items.js';
import { RITUAL_SITE } from '../src/game/revival.js';
import {
  getClan, foundingRequirements, foundClan, chooseDoctrine, levelUpClan,
  buildStructure, grantNames, buyNames, listHireable, hireMercenary,
  markMercenaryDead, reviveMercenary, reviveCost,
} from '../src/services/clan.js';

test.after(() => closeDb());

let counter = 0;
function seedAll() {
  seedWorld();
  seedSettlements();
  seedContinents();
  seedClan();
}

// A hero who satisfies the founding conditions: chapters 1-6 done, an ally, a
// fleet (the seeded harbours) and a purse.
function founder(gold = 5000) {
  seedAll();
  counter += 1;
  const hero = createCharacter({ name: `Основатель ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  for (let n = 1; n <= 6; n += 1) addUnlock(hero.id, `chapter_${n}`, 'test');
  addUnlock(hero.id, 'war_truth', 'test');
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, hero.id);
  return hero;
}

// --- the seed ---------------------------------------------------------------

test('the clan catalogue seeds four doctrines and six buildings, once', () => {
  seedAll();
  const rows = getDb().prepare('SELECT kind, key, name FROM clan_catalog ORDER BY kind, sort_order, id').all();
  const doctrines = rows.filter((r) => r.kind === 'doctrine');
  const buildings = rows.filter((r) => r.kind === 'building');

  assert.equal(doctrines.length, 4, 'the four doctrines of docs/lore/clan.md');
  assert.deepEqual(doctrines.map((d) => d.key).sort(), ['chroniclers', 'shepherds', 'silent', 'thaw']);
  assert.deepEqual(doctrines.map((d) => d.name), ['Летописцы', 'Оттепель', 'Молчальники', 'Пастухи']);

  assert.equal(buildings.length, 6, 'the six building types of docs/lore/clan.md');
  assert.deepEqual(buildings.map((b) => b.name), [
    'Дом летописей', 'Казарма', 'Склад', 'Кузня', 'Алтарь уклона', 'Причал',
  ]);

  // Every entry has a Latin key and Russian text.
  for (const def of [...DOCTRINES, ...BUILDINGS]) {
    assert.match(def.key, /^[a-z_]+$/, `${def.key} stays Latin`);
    assert.ok(/[А-Яа-яЁё]/.test(def.name), `${def.key} name is Russian`);
  }

  // Re-seeding never duplicates.
  assert.equal(seedClan().skipped, true);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM clan_catalog').get().n, 10);
});

test('a clan key is a latin slug and a building costs gold + names that scale by rank', () => {
  assert.match(clanKeyFromName('Дом Тихих Имён'), /^[a-z_]+$/);
  assert.equal(clanKeyFromName('Дом Тихих Имён'), 'dom_tihih_imen');

  const rank1 = buildingCost('forge', 1);
  const rank2 = buildingCost('forge', 2);
  assert.deepEqual(rank1, { gold: 140, names: 3 });
  assert.deepEqual(rank2, { gold: 280, names: 6 }, 'each further rank costs more');
  assert.equal(buildingCost('nope', 1), null);
});

// --- founding ---------------------------------------------------------------

test('founding is refused until the conditions hold', () => {
  seedAll();
  const hero = createCharacter({ name: `Недород ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = 5000 WHERE id = ?').run(hero.id);

  const reqs = foundingRequirements(hero.id);
  assert.equal(reqs.met, false);
  assert.equal(reqs.requirements.find((r) => r.key === 'chapters').met, false);
  assert.equal(reqs.requirements.find((r) => r.key === 'ally').met, false);
  assert.equal(reqs.requirements.find((r) => r.key === 'fleet').met, true, 'the seeded harbours are a fleet');

  assert.throws(() => foundClan(hero.id, { name: 'Рано', doctrine: 'chroniclers' }), /не основать/);
  assert.equal(getClan(hero.id).clan, null);

  // Satisfy the conditions one by one; the last one flips the gate.
  for (let n = 1; n <= 6; n += 1) addUnlock(hero.id, `chapter_${n}`, 'test');
  assert.equal(foundingRequirements(hero.id).met, false, 'still no ally');
  addUnlock(hero.id, 'world_woken', 'test');
  assert.equal(foundingRequirements(hero.id).met, true);

  const view = foundClan(hero.id, { name: 'Тихие Имена', doctrine: 'chroniclers', base: 'Гримхольд' });
  assert.equal(view.clan.level, 1);
  assert.equal(view.clan.doctrine, 'chroniclers');
  assert.equal(view.clan.names, 0);
  assert.equal(view.clan.base.name, 'Гримхольд');
  assert.equal(hasUnlock(hero.id, 'clan_founded'), true);
  assert.throws(() => foundClan(hero.id, { name: 'Ещё раз', doctrine: 'thaw' }), /уже есть клан/);
});

test('the doctrine is irreversible', () => {
  const hero = founder();
  const view = foundClan(hero.id, { name: 'Оттепель-клан', doctrine: 'thaw', base: 'Сумеречная гавань' });
  assert.equal(view.clan.doctrine, 'thaw');
  assert.equal(hasUnlock(hero.id, 'thaw_unlocked'), true, 'Оттепель unlocks its capability flag');

  assert.throws(() => chooseDoctrine(hero.id, 'chroniclers'), /Уклон уже выбран/);
  // The stored doctrine did not move.
  assert.equal(getClan(hero.id).clan.doctrine, 'thaw');
});

test('a Пастухи clan unlocks the dark ending flag', () => {
  const hero = founder();
  assert.equal(hasUnlock(hero.id, 'dark_ending'), false);
  const view = foundClan(hero.id, { name: 'Стадо Шпиля', doctrine: 'shepherds', base: 'Порт Свободных Капитанов' });
  assert.equal(view.clan.doctrine, 'shepherds');
  assert.equal(hasUnlock(hero.id, 'dark_ending'), true, 'only the shepherds open the dark ending');

  // The doctrine's effects reach the view so the UI can show the price.
  assert.equal(view.clan.effects.spirePower, true);
  assert.equal(view.clan.effects.forestOpinion, -15);
});

// --- resources --------------------------------------------------------------

test('building a structure spends gold and names', () => {
  const hero = founder(5000);
  foundClan(hero.id, { name: 'Кузнечный дом', doctrine: 'silent', base: 'Гримхольд' });
  grantNames(hero.id, 20);

  const before = getCharacter(hero.id).gold;
  const built = buildStructure(hero.id, 'forge');

  assert.equal(built.holdings.length, 1);
  assert.equal(built.holdings[0].type, 'forge');
  assert.equal(built.holdings[0].tier, 1);
  assert.equal(built.clan.gold, before - 140, 'rank 1 of the forge costs 140 gold');
  assert.equal(built.clan.names, 17, 'rank 1 of the forge costs 3 names');

  // Without enough names the build is refused.
  const poor = founder(5000);
  foundClan(poor.id, { name: 'Бедный дом', doctrine: 'silent', base: 'Гримхольд' });
  assert.throws(() => buildStructure(poor.id, 'forge'), /имён/);
});

test('gold can be traded for names, the memory currency', () => {
  const hero = founder(5000);
  foundClan(hero.id, { name: 'Меновый дом', doctrine: 'chroniclers', base: 'Гримхольд' });
  const view = buyNames(hero.id, 4);
  assert.equal(view.clan.names, 4);
  assert.equal(view.clan.gold, 5000 - 4 * GOLD_PER_NAME);
  assert.throws(() => buyNames(hero.id, 100000), /золота/);
});

// --- levels and tiers -------------------------------------------------------

test('clan levels gate the building tiers', () => {
  assert.equal(CLAN_MAX_LEVEL, 5);
  assert.equal(MAX_RANK, 3);
  assert.equal(tierGateForLevel(1), 1);
  assert.equal(tierGateForLevel(3), 2);
  assert.equal(tierGateForLevel(5), 3);

  const hero = founder(5000);
  foundClan(hero.id, { name: 'Ярусный дом', doctrine: 'silent', base: 'Гримхольд' });
  grantNames(hero.id, 80);

  // At level 1 a building may only reach tier 1.
  buildStructure(hero.id, 'forge');
  assert.throws(() => buildStructure(hero.id, 'forge'), /ярус/);

  // Level 1 also caps the number of distinct holdings (1).
  assert.throws(() => buildStructure(hero.id, 'barracks'), /столько зданий/);

  // Level 2 still allows only tier 1 — the second tier waits for level 3.
  levelUpClan(hero.id);
  assert.equal(getClan(hero.id).clan.level, 2);
  assert.throws(() => buildStructure(hero.id, 'forge'), /ярус/);

  // At level 3 the second tier opens and a second building is allowed.
  levelUpClan(hero.id);
  const upgraded = buildStructure(hero.id, 'forge');
  assert.equal(upgraded.holdings[0].tier, 2);
  const second = buildStructure(hero.id, 'barracks');
  assert.equal(second.holdings.length, 2);

  // The third tier waits for level 5.
  assert.throws(() => buildStructure(hero.id, 'forge'), /ярус/);

  // The fleet level (5) needs a Причал.
  levelUpClan(hero.id); // 4
  assert.throws(() => levelUpClan(hero.id), /Причал/);
});

// --- mercenaries ------------------------------------------------------------

test('a clan hires mercenaries for gold and revives a fallen one for names', () => {
  const hero = founder(5000);
  foundClan(hero.id, { name: 'Наёмный дом', doctrine: 'chroniclers', base: 'Гримхольд' });

  const candidates = listHireable(hero.id);
  assert.ok(candidates.length > 0, 'companion templates are hireable');
  const pick = candidates[0];

  const hired = hireMercenary(hero.id, pick.key);
  assert.equal(hired.mercenaries.length, 1);
  assert.equal(hired.mercenaries[0].name, pick.name);
  assert.equal(hired.clan.gold, 5000 - pick.cost);
  assert.throws(() => hireMercenary(hero.id, pick.key), /уже служит/);

  // A fallen mercenary is revived with a ritual paid in names: the leader must
  // stand in the chapel with the key.
  const mercId = hired.mercenaries[0].id;
  markMercenaryDead(mercId);
  grantNames(hero.id, 10);

  const chapel = getDb().prepare('SELECT id FROM locations WHERE name = ?').get(RITUAL_SITE);
  getDb().prepare('UPDATE characters SET location_id = ? WHERE id = ?').run(chapel.id, hero.id);
  grantItem(hero.id, RITUAL_ITEM, 1);

  const clanRow = getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(hero.id);
  const cost = reviveCost(clanRow);
  const revived = reviveMercenary(hero.id, mercId);
  assert.equal(revived.mercenary.status, 'active');
  assert.equal(revived.namesCost, cost);
  assert.equal(getClan(hero.id).clan.names, 10 - cost);
  assert.equal(hasItem(hero.id, RITUAL_ITEM), false, 'the key is spent opening the gate');

  // Reviving a living mercenary is refused.
  assert.throws(() => reviveMercenary(hero.id, mercId), /ещё жив/);
});
