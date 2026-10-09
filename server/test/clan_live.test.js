import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedClan } from '../src/db/seed_clan.js';
import { seedQuests } from '../src/db/seed_quests.js';
import { createCharacter, getCharacterSheet } from '../src/services/characters.js';
import { addUnlock, acceptQuest, completeQuest } from '../src/services/quests.js';
import { foundClan, buildStructure, getClan, grantNames, levelUpClan } from '../src/services/clan.js';
import { recruit } from '../src/services/party.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import { listOffers } from '../src/services/trade.js';
import { crossingsFor } from '../src/services/continents.js';
import { grantItem } from '../src/services/items.js';
import { getRitual, startResurrection } from '../src/services/resurrections.js';
import { recordVisit, getMonsterByName } from '../src/services/world.js';
import { companionTemplate } from '../src/game/companions.js';
import { CROSSINGS, CROSSING_GATES } from '../src/game/continent_travel.js';

test.after(() => closeDb());

let counter = 0;
function seedAll() {
  seedWorld();
  seedSettlements();
  seedContinents();
  seedClan();
  seedQuests();
}

// A hero who can found a clan (chapters 1-6, an ally, a fleet) with a purse.
function founder(gold = 8000) {
  seedAll();
  counter += 1;
  const hero = createCharacter({ name: `Вождь ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  for (let n = 1; n <= 6; n += 1) addUnlock(hero.id, `chapter_${n}`, 'test');
  addUnlock(hero.id, 'war_truth', 'test');
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, hero.id);
  return hero;
}

// Found a clan with a doctrine and give it plenty of names to build with.
function clanHero(doctrine = 'chroniclers', names = 200) {
  const hero = founder();
  foundClan(hero.id, { name: `Клан ${counter}`, doctrine, base: 'Гримхольд' });
  grantNames(hero.id, names);
  // Level 3 holds two holdings (level 1 holds only one, by BUILDINGS_BY_LEVEL).
  levelUpClan(hero.id);
  levelUpClan(hero.id);
  return hero;
}

function firstMonster() {
  seedWorld();
  return getDb().prepare('SELECT id FROM monsters ORDER BY id LIMIT 1').get().id;
}

function forceWin(battleId) {
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battleId).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battleId);
}

// --- battle -----------------------------------------------------------------

test('the clan strengthens the whole party in a real battle', () => {
  const plain = founder();
  const leader = clanHero();
  buildStructure(leader.id, 'forge');       // +5% party attack
  buildStructure(leader.id, 'barracks');    // +5% party defense
  buildStructure(leader.id, 'barracks');    // tier 2 -> +10%, survives rounding

  const plainBattle = startBattle({ characterId: plain.id, monsterId: firstMonster() });
  const clanBattle = startBattle({ characterId: leader.id, monsterId: firstMonster() });

  const atk = (b) => b.combatants.find((c) => c.kind === 'leader').base.attack;
  const def = (b) => b.combatants.find((c) => c.kind === 'leader').base.defense;
  assert.ok(atk(clanBattle) > atk(plainBattle), 'Кузня raises the party attack');
  assert.ok(def(clanBattle) > def(plainBattle), 'Казарма raises the party defense');
});

test('the hero sheet reads the same clan numbers as the battle', () => {
  const hero = clanHero();
  buildStructure(hero.id, 'forge');
  const sheet = getCharacterSheet(hero.id);
  assert.ok(sheet.bonuses.percents.attack >= 5, 'the sheet summary shows the clan attack bonus');
});

// --- trade ------------------------------------------------------------------

test('a clan that trades pays less and sells for more', () => {
  const hero = clanHero('silent');          // Молчальники: +10% to trade
  const building = getDb().prepare("SELECT id FROM settlement_buildings WHERE type = 'shop' ORDER BY id LIMIT 1").get();
  const withClan = listOffers(building.id, hero.id);
  const withoutClan = listOffers(building.id, null);

  const priced = withClan.offers.find((o) => o.price > 1);
  const base = withoutClan.offers.find((o) => o.itemKey === priced.itemKey);
  assert.ok(priced.price < base.price, 'buying costs less with a clan');
  assert.ok(priced.sellPrice >= base.sellPrice, 'selling pays at least as much');
  assert.equal(priced.listPrice, base.listPrice, 'the shelf price is still reported');
});

// --- crossings --------------------------------------------------------------

test('a clan with a Причал sails for a smaller fare', () => {
  const hero = clanHero();
  buildStructure(hero.id, 'pier');           // +crossingDiscount
  const gateName = CROSSINGS[0].from;
  assert.ok(CROSSING_GATES.includes(gateName));
  const gate = getDb().prepare('SELECT id FROM locations WHERE name = ?').get(gateName);

  const withClan = crossingsFor(gate.id, hero.id);
  const withoutClan = crossingsFor(gate.id, null);
  assert.ok(withClan.length > 0);
  assert.ok(withClan[0].gold < withoutClan[0].gold, 'the clan fare is smaller');
  assert.equal(withClan[0].days, withoutClan[0].days, 'only the gold changes');
});

// --- names from play --------------------------------------------------------

test('a won death-realm ritual pays the clan in names', () => {
  const leader = clanHero();
  const marta = recruit(leader.id, 'marta_veil', { source: companionTemplate('marta_veil').sources[0], goldOffered: 9999 }, () => 0).member;
  // A living ally must guard the back for the ritual to open.
  const sera = recruit(leader.id, 'sera_dawn', { source: companionTemplate('sera_dawn').sources[0], goldOffered: 9999 }, () => 0).member;
  getDb().prepare("UPDATE party_members SET status='dead', hp=0 WHERE id=?").run(marta.id);
  const chapel = getDb().prepare("SELECT id FROM locations WHERE name = 'Затонувшая часовня'").get().id;
  recordVisit(leader.id, chapel);
  grantItem(leader.id, 'shepherd_key', 1);

  const before = getClan(leader.id).clan.names;
  const started = startResurrection(leader.id, marta.id);
  forceWin(started.battleId);
  const res = takeTurn(started.battleId, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });

  assert.equal(res.status, 'won');
  assert.equal(res.rewards.namesGained, 3, 'the ritual reports the names');
  assert.equal(getClan(leader.id).clan.names, before + 3, 'the clan actually gained them');
  assert.ok(sera.id, 'the guard companion exists');
});

test('completing a memory quest pays the clan in names', () => {
  const hero = clanHero();
  const before = getClan(hero.id).clan.names;
  acceptQuest(hero.id, 'prologue_name');
  const done = completeQuest(hero.id, 'prologue_name');
  assert.equal(done.granted.names, 2);
  assert.equal(getClan(hero.id).clan.names, before + 2);
});

test('a hero with no clan simply earns no names (no crash, no clan)', () => {
  const hero = founder();
  acceptQuest(hero.id, 'prologue_name');
  const done = completeQuest(hero.id, 'prologue_name');
  assert.equal(done.granted.names, 2, 'the reward still reports names');
  assert.equal(getClan(hero.id).clan, null, 'but there is no clan to hold them');
});
