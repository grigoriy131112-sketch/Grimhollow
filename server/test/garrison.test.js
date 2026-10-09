import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { seedClan } from '../src/db/seed_clan.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { addUnlock } from '../src/services/quests.js';
import { foundClan, getClan, grantNames } from '../src/services/clan.js';
import { recruit, stationMember, recallMember, activeMembers, getMember } from '../src/services/party.js';
import {
  tickGarrison, getGarrison, garrisonMembers, simulateRaids,
  listPetitions, acceptPetition, declinePetition,
  MS_PER_TICK, MAX_TICKS, GOLD_PER_TICK, petitionTickOpens,
} from '../src/services/garrison.js';
import { companionTemplate } from '../src/game/companions.js';
import { seedQuests } from '../src/db/seed_quests.js';

test.after(() => closeDb());

let counter = 0;
function seedAll() {
  seedWorld();
  seedSettlements();
  seedContinents();
  seedClan();
  seedQuests();
}

// A clan founder with a doctrine and enough names to build with.
function clanHero(names = 200) {
  seedAll();
  counter += 1;
  const hero = createCharacter({ name: `Вождь роты ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  for (let n = 1; n <= 6; n += 1) addUnlock(hero.id, `chapter_${n}`, 'test');
  addUnlock(hero.id, 'war_truth', 'test');
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(8000, hero.id);
  foundClan(hero.id, { name: `Рота ${counter}`, doctrine: 'chroniclers', base: 'Гримхольд' });
  grantNames(hero.id, names);
  return hero;
}

function addCompanion(leaderId, key) {
  const t = companionTemplate(key);
  return recruit(leaderId, key, { source: t.sources[0], goldOffered: 9999 }, () => 0).member;
}

// --- station and recall -----------------------------------------------------

test('a companion can be stationed in the clan and recalled at any moment', () => {
  const leader = clanHero();
  const marta = addCompanion(leader.id, 'marta_veil');
  assert.equal(activeMembers(leader.id).length, 1, 'she starts in the marching party');

  stationMember(leader.id, marta.id);
  assert.equal(activeMembers(leader.id).length, 0, 'stationing takes her out of the party');
  assert.equal(garrisonMembers(leader.id).length, 1, 'and puts her on the clan books');
  assert.equal(getMember(marta.id).assignment, 'clan', 'her sheet survives the move');

  recallMember(leader.id, marta.id);
  assert.equal(activeMembers(leader.id).length, 1, 'recall brings her back');
  assert.equal(getMember(marta.id).assignment, 'party');
});

test('recall respects the party cap — the clan is a reserve, not a bypass', () => {
  const leader = clanHero();
  const a = addCompanion(leader.id, 'marta_veil');
  const b = addCompanion(leader.id, 'sera_dawn');
  const c = addCompanion(leader.id, 'brann');       // 3 active so far
  stationMember(leader.id, c.id);                    // 2 active, 1 in the clan
  const d = addCompanion(leader.id, 'ash');          // 3 active
  const e = addCompanion(leader.id, 'old_pell');     // 4 active — the cap
  assert.equal(activeMembers(leader.id).length, 4, 'party is at the cap (4)');
  assert.throws(() => recallMember(leader.id, c.id), /Отряд уже полон/);
  assert.ok(a.id && b.id && d.id && e.id);
});

// --- passive income (deterministic, real-clock) -----------------------------

test('the same garrison and tick always pay the same raid — a reload cannot reroll', () => {
  const members = [{ id: 1, name: 'Марта' }, { id: 2, name: 'Сэра' }];
  const mods = { goldRate: 0, clash: 1, namesBonus: 1 };
  const a = simulateRaids({ clanId: 7, baseTick: 0, ticks: 12, members, mods });
  const b = simulateRaids({ clanId: 7, baseTick: 0, ticks: 12, members, mods });
  assert.deepEqual(a, b, 'identical inputs give an identical report');
});

test('a ticking garrison pays gold into the leader purse and names into the clan', () => {
  const leader = clanHero(0);
  // Three in the garrison, so a single bad event cannot zero the raid.
  for (const key of ['marta_veil', 'sera_dawn', 'brann']) {
    stationMember(leader.id, addCompanion(leader.id, key).id);
  }
  assert.equal(garrisonMembers(leader.id).length, 3);

  const goldBefore = getCharacter(leader.id).gold;
  const namesBefore = getClan(leader.id).clan.names;

  // Advance from the service's own watermark, not a Date.now() taken before it:
  // garrisonRow() stamps `last_tick_ms` lazily a few ms later, so measuring from
  // the earlier instant can floor one tick short.
  const now = getGarrison(leader.id).lastTickMs + 12 * MS_PER_TICK;
  const report = tickGarrison(leader.id, now);

  assert.equal(report.ticks, 12, 'twelve ticks elapsed');
  assert.ok(report.gold > 0, 'the raid brought gold');
  assert.equal(getCharacter(leader.id).gold, goldBefore + report.gold, 'the purse grew by the raid');
  assert.ok(report.names >= 1, 'the clan forged at least one name');
  assert.equal(getClan(leader.id).clan.names, namesBefore + report.names, 'the clan holds the names');
});

test('idle time is capped, so a long absence cannot be farmed', () => {
  const leader = clanHero(0);
  const marta = addCompanion(leader.id, 'marta_veil');
  stationMember(leader.id, marta.id);
  const goldBefore = getCharacter(leader.id).gold;
  const report = tickGarrison(leader.id, Date.now() + 1000 * MS_PER_TICK);
  assert.equal(report.ticks, MAX_TICKS, 'only the idle cap is paid, not the whole absence');
  assert.ok(getCharacter(leader.id).gold < goldBefore + GOLD_PER_TICK * 1000, 'far less than the raw elapsed ticks');
});

test('a second read after the time is spent pays nothing more', () => {
  const leader = clanHero(0);
  const marta = addCompanion(leader.id, 'marta_veil');
  stationMember(leader.id, marta.id);
  const now = Date.now() + 12 * MS_PER_TICK;
  tickGarrison(leader.id, now);
  const goldAfterFirst = getCharacter(leader.id).gold;
  const second = tickGarrison(leader.id, now);
  assert.equal(second.ticks, 0, 'the same moment is already paid');
  assert.equal(getCharacter(leader.id).gold, goldAfterFirst, 'no double pay');
});

test('a garrison with nobody in it pays nothing', () => {
  const leader = clanHero(0);
  const goldBefore = getCharacter(leader.id).gold;
  const report = tickGarrison(leader.id, Date.now() + 6 * MS_PER_TICK);
  assert.equal(report.gold, 0);
  assert.equal(report.names, 0);
  assert.equal(getCharacter(leader.id).gold, goldBefore, 'no companion, no income');
});

// --- petitions --------------------------------------------------------------

// Advance the clan's clock to the first tick that opens a petition, so the test
// is deterministic rather than waiting on a random draw.
function advanceToPetition(leader) {
  getGarrison(leader.id);   // ensures the garrison clock row exists
  const clan = getClan(leader.id).clan;
  const g = getDb().prepare('SELECT * FROM clan_garrison WHERE clan_id = ?').get(clan.id);
  const base = Math.floor(g.last_tick_ms / MS_PER_TICK);
  const offset = firstOpeningTick(clan.id, base, MAX_TICKS);
  assert.ok(offset > 0, 'a petition tick exists in the window');
  tickGarrison(leader.id, g.last_tick_ms + offset * MS_PER_TICK);
}

function firstOpeningTick(clanId, baseTick, limit) {
  for (let i = 1; i <= limit; i += 1) if (petitionTickOpens(clanId, baseTick + i)) return i;
  return 0;
}

test('people ask to join on their own, and accepting stations them in the clan', () => {
  const leader = clanHero(0);
  advanceToPetition(leader);
  const { petitions } = listPetitions(leader.id);
  assert.ok(petitions.length >= 1, 'someone applied on their own');
  const p = petitions[0];
  assert.ok(p.name && p.class, 'the petition names a real companion');

  const res = acceptPetition(leader.id, p.id);
  assert.equal(res.accepted, true);
  const inClan = garrisonMembers(leader.id).find((r) => r.template_key === p.key);
  assert.ok(inClan, 'the asker is now on the clan books');
  assert.equal(inClan.assignment, 'clan');
});

test('turning a petition away removes it for good', () => {
  const leader = clanHero(0);
  advanceToPetition(leader);
  const { petitions } = listPetitions(leader.id);
  assert.ok(petitions.length >= 1);
  declinePetition(leader.id, petitions[0].id);
  const after = listPetitions(leader.id);
  assert.ok(!after.petitions.some((p) => p.id === petitions[0].id), 'a declined petition never returns');
});

test('reading the petitions twice does not roll again', () => {
  const leader = clanHero(0);
  advanceToPetition(leader);
  const first = listPetitions(leader.id).petitions.length;
  const again = listPetitions(leader.id).petitions.length;
  assert.equal(first, again, 'reading never re-rolls');
});
