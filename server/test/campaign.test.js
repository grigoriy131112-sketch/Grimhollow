import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedNpcs } from '../src/services/npcs.js';
import { seedQuests } from '../src/db/seed_quests.js';
import { createCharacter } from '../src/services/characters.js';
import { recruit } from '../src/services/party.js';
import { hasItem } from '../src/services/items.js';
import { takeTurn } from '../src/services/battles.js';
import { addUnlock } from '../src/services/quests.js';
import { companionTemplate } from '../src/game/companions.js';
import { listMonsters, getMonsterByName, getLocation } from '../src/services/world.js';
import {
  FLAG_ORDER, FLAG_DEFS, derivedFlags, flagStatuses, finalGateStatus,
  resolveEnding, endingCandidates, buildEpilogue, ENDING_ORDER, FINAL_BATTLE_KIND,
} from '../src/game/campaign.js';
import {
  getProgress, getEndingPreview, setFlag, deriveProgress, startFinalBattle, claimTrophy,
} from '../src/services/campaign.js';

test.after(() => closeDb());

function seedAll() {
  seedWorld();
  seedNpcs();
  seedQuests();
}

function leader(name) {
  return createCharacter({ name: `${name} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
}

// Mark G8 quests completed without going through the whole quest flow; the
// campaign only reads completions.
function completeQuests(characterId, ...keys) {
  const ins = getDb().prepare(
    "INSERT OR REPLACE INTO character_quests (character_id, quest_key, status, progress) VALUES (?, ?, 'completed', 1)",
  );
  for (const key of keys) ins.run(characterId, key);
}

function addCompanion(leaderId, key) {
  getDb().prepare('UPDATE characters SET gold = 99999 WHERE id = ?').run(leaderId);
  const t = companionTemplate(key);
  return recruit(leaderId, key, { source: t.sources[0], goldOffered: 9999 }, () => 0).member;
}

// The finale gate: the war truth, a founded clan, and the G8 spire approach.
function unlockFinale(characterId) {
  setFlag(characterId, 'war_truth', 'branch');
  setFlag(characterId, 'clan_founded', 'clan');
  addUnlock(characterId, 'spire_approach', 'spire_permission');
}

// --- pure rules -------------------------------------------------------------

test('the flag table lists the seven chapters in story order', () => {
  assert.deepEqual(FLAG_ORDER, [
    'prologue_done', 'chapel_opened', 'war_truth', 'north_frozen',
    'memory_bought', 'world_woken', 'clan_founded',
  ]);
  for (const flag of FLAG_ORDER) {
    const def = FLAG_DEFS[flag];
    assert.ok(def.title && def.condition && def.unlocks, `${flag} is described`);
    assert.ok(/[А-Яа-яЁё]/.test(def.title), `${flag} title is Russian`);
    assert.match(def.flag, /^[a-z_]+$/, 'flags stay Latin');
  }
  assert.equal(FLAG_DEFS.war_truth.chapter, 3);
  assert.equal(FLAG_DEFS.clan_founded.chapter, 7);
});

test('flags unlock the right chapters from quest completions', () => {
  // prologue_done needs all three prologue quests.
  assert.equal(derivedFlags(['prologue_name']).prologue_done, undefined);
  assert.equal(derivedFlags(['prologue_name', 'prologue_water', 'prologue_first_ally']).prologue_done, true);
  // chapel_opened needs the whole chapter-2 chain.
  assert.equal(derivedFlags(['chapel_song', 'first_revival']).chapel_opened, undefined);
  assert.equal(derivedFlags(['chapel_song', 'first_revival', 'plague_answer']).chapel_opened, true);
  // war_truth comes from the Ash-War record alone.
  assert.equal(derivedFlags(['bone_records']).war_truth, true);
  // A branch flag is never derived from quests.
  assert.equal(derivedFlags(['bone_records']).north_frozen, undefined);
});

test('flagStatuses marks the met chapters and the finale gate stays closed', () => {
  const statuses = flagStatuses({ prologue_done: true, war_truth: true });
  assert.equal(statuses.length, 7);
  assert.equal(statuses.find((s) => s.flag === 'prologue_done').met, true);
  assert.equal(statuses.find((s) => s.flag === 'clan_founded').met, false);
  // The finale needs the war truth AND a founded clan.
  assert.equal(finalGateStatus({ war_truth: true }).ready, false);
  assert.equal(finalGateStatus({ clan_founded: true }).ready, false);
  assert.equal(finalGateStatus({ war_truth: true, clan_founded: true }).ready, true);
});

test('each ending requires its own conditions', () => {
  // Вернуть память: world_woken or north_frozen.
  assert.equal(endingCandidates({ flags: {} }).restore.available, false);
  assert.equal(endingCandidates({ flags: { world_woken: true } }).restore.available, true);
  assert.equal(endingCandidates({ flags: { north_frozen: true } }).restore.available, true);
  // Заморозить: north_frozen only.
  assert.equal(endingCandidates({ flags: { world_woken: true } }).freeze.available, false);
  assert.equal(endingCandidates({ flags: { north_frozen: true } }).freeze.available, true);
  // Стать Полым королём: memory_bought AND the Пастухи doctrine.
  assert.equal(endingCandidates({ flags: { memory_bought: true } }).hollow_king.available, false);
  assert.equal(endingCandidates({ flags: { memory_bought: true }, doctrine: 'chroniclers' }).hollow_king.available, false);
  assert.equal(endingCandidates({ flags: { memory_bought: true }, doctrine: 'shepherds' }).hollow_king.available, true);
});

test('the ending resolver picks the right one', () => {
  assert.equal(resolveEnding({ flags: {} }).key, 'none');
  assert.equal(resolveEnding({ flags: { world_woken: true } }).key, 'restore');
  // Заморозить wins once the Archives back it, even with restore also open.
  assert.equal(resolveEnding({ flags: { north_frozen: true }, factionOpinions: { archives: 75 } }).key, 'freeze');
  assert.equal(resolveEnding({ flags: { north_frozen: true }, doctrine: 'silent' }).key, 'freeze');
  // The dark path is committed: with Пастухи and a bought memory it outranks restore.
  assert.equal(
    resolveEnding({ flags: { memory_bought: true, world_woken: true }, doctrine: 'shepherds' }).key,
    'hollow_king',
  );
  // Летописцы strengthen restore over a bare north_frozen.
  assert.equal(resolveEnding({ flags: { world_woken: true }, doctrine: 'chroniclers' }).key, 'restore');
  assert.deepEqual(ENDING_ORDER, ['restore', 'freeze', 'hollow_king']);
});

test('the epilogue names the hero and keeps one warm line', () => {
  const epilogue = buildEpilogue(
    { heroName: 'Тень', living: [{ name: 'Марта' }], fallen: [], factionOpinions: { maeve: 80, oden: 10 } },
    'restore',
  );
  assert.equal(epilogue.ending, 'restore');
  assert.ok(epilogue.lines.some((l) => l.includes('Тень')));
  assert.ok(epilogue.lines.some((l) => l.includes('Марта')));
  const maeve = epilogue.voices.find((v) => v.key === 'maeve');
  assert.equal(maeve.tone, 'warm');
  assert.equal(epilogue.voices.find((v) => v.key === 'oden').tone, 'cold');
  assert.ok(epilogue.warmLines >= 1, 'at least one warm line');
});

// --- service: flags ---------------------------------------------------------

test('deriveProgress folds G8 completions into the campaign flags', () => {
  seedAll();
  const hero = leader('Тест Флаги');
  // One prologue quest is not enough.
  completeQuests(hero.id, 'prologue_name');
  assert.equal(deriveProgress(hero.id).derived.prologue_done, undefined);
  assert.equal(getProgress(hero.id).flags.prologue_done, undefined);

  // Completing the rest derives prologue_done; re-deriving never double-counts.
  completeQuests(hero.id, 'prologue_water', 'prologue_first_ally');
  const derived = deriveProgress(hero.id);
  assert.equal(derived.derived.prologue_done, true);
  assert.equal(deriveProgress(hero.id).added, 0, 'idempotent');
  assert.equal(getProgress(hero.id).flags.prologue_done, true);
});

test('setFlag records a branch flag and rejects an unknown one', () => {
  seedAll();
  const hero = leader('Тест Ветка');
  assert.throws(() => setFlag(hero.id, 'not_a_flag'), /Такого флага/);
  setFlag(hero.id, 'north_frozen', 'branch');
  setFlag(hero.id, 'memory_bought', 'branch');
  const progress = getProgress(hero.id);
  assert.equal(progress.flags.north_frozen, true);
  assert.equal(progress.flags.memory_bought, true);
  // With no clan doctrine, north_frozen opens both restore and freeze, and
  // restore is the tie-break (ENDING_ORDER). The Archives would tip it to freeze.
  assert.equal(progress.ending.key, 'restore');
});

test('getProgress reports the chapters, the gate and the ending', () => {
  seedAll();
  const hero = leader('Тест Обзор');
  completeQuests(hero.id, 'prologue_name', 'prologue_water', 'prologue_first_ally', 'bone_records');
  unlockFinale(hero.id);
  addCompanion(hero.id, 'marta_veil');
  const progress = getProgress(hero.id);
  assert.equal(progress.metCount, 3);
  assert.equal(progress.currentChapter, 7);
  assert.equal(progress.finale.ready, true);
  assert.equal(progress.finale.boss.name, 'Костяной Пастырь');
  assert.equal(progress.finale.boss.level, 15);
  assert.equal(progress.finale.trophy.key, 'shepherd_crook');
  assert.equal(progress.finale.haveTrophy, false);
});

test('getEndingPreview exposes every path and the chosen one', () => {
  seedAll();
  const hero = leader('Тест Просмотр');
  setFlag(hero.id, 'world_woken', 'branch');
  const preview = getEndingPreview(hero.id);
  assert.deepEqual(preview.order, ENDING_ORDER);
  assert.equal(preview.candidates.length, 3);
  assert.equal(preview.ending.key, 'restore');
  assert.ok(preview.candidates.find((c) => c.key === 'restore').available);
});

// --- the final battle -------------------------------------------------------

test('the final boss never appears on the normal map', () => {
  seedAll();
  assert.ok(getMonsterByName('Костяной Пастырь'), 'the boss exists in the world data');
  assert.ok(!listMonsters().some((m) => m.name === 'Костяной Пастырь'), 'but it is off the map');
  // And no location is stocked with him.
  const rows = getDb().prepare(
    'SELECT COUNT(*) AS n FROM location_monsters lm JOIN monsters m ON m.id = lm.monster_id WHERE m.name = ?',
  ).get('Костяной Пастырь');
  assert.equal(rows.n, 0, 'no location spawns the boss');
});

test('the finale refuses until the gate, the spire road and a living party are in place', () => {
  seedAll();
  const hero = leader('Тест Финал');
  assert.throws(() => startFinalBattle(hero.id), /Финал закрыт/);

  setFlag(hero.id, 'war_truth', 'branch');
  setFlag(hero.id, 'clan_founded', 'clan');
  // The G8 spire unlock is still missing.
  assert.throws(() => startFinalBattle(hero.id), /подступы/);

  addUnlock(hero.id, 'spire_approach', 'spire_permission');
  assert.throws(() => startFinalBattle(hero.id), /живой отряд/);

  addCompanion(hero.id, 'marta_veil');
  const started = startFinalBattle(hero.id);
  assert.equal(started.boss.name, 'Костяной Пастырь');
  assert.throws(() => startFinalBattle(hero.id), /уже идёт/);
});

test('the finale opens the Black Spire as a campaign_final battle', () => {
  seedAll();
  const hero = leader('Тест Шпиль');
  unlockFinale(hero.id);
  addCompanion(hero.id, 'marta_veil');

  const started = startFinalBattle(hero.id);
  assert.equal(started.kind, FINAL_BATTLE_KIND);
  assert.equal(started.boss.name, 'Костяной Пастырь');
  assert.equal(started.location, 'Чёрный шпиль');

  const battle = getDb().prepare('SELECT * FROM battles WHERE id = ?').get(started.battleId);
  assert.equal(battle.kind, 'campaign_final');
  assert.equal(battle.status, 'active');
  assert.equal(battle.location_id, null, 'the boss is not tied to a map location');

  // The gate status is also surfaced by getProgress.
  assert.ok(getProgress(hero.id).finale.battle);
});

test('the Посох Пастыря is claimed from a won finale, never given upfront', () => {
  seedAll();
  const hero = leader('Тест Трофей');
  unlockFinale(hero.id);
  addCompanion(hero.id, 'marta_veil');

  // No trophy before the fight, and claiming it early is refused.
  assert.equal(hasItem(hero.id, 'shepherd_crook'), false);
  assert.throws(() => claimTrophy(hero.id), /Сначала одолейте/);

  const started = startFinalBattle(hero.id);
  // Force a decided win so the settlement runs.
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(started.battleId).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), started.battleId);
  const res = takeTurn(started.battleId, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.status, 'won');

  assert.equal(getProgress(hero.id).finale.canClaim, true);
  const claimed = claimTrophy(hero.id);
  assert.equal(claimed.item.key, 'shepherd_crook');
  assert.equal(hasItem(hero.id, 'shepherd_crook'), true);
  // The trophy is granted once.
  assert.throws(() => claimTrophy(hero.id), /уже у вас/);
});

test('a fallen hero cannot enter the finale', () => {
  seedAll();
  const hero = leader('Тест Павший');
  setFlag(hero.id, 'war_truth', 'branch');
  setFlag(hero.id, 'clan_founded', 'clan');
  addCompanion(hero.id, 'marta_veil');
  getDb().prepare("UPDATE characters SET fate = 'dead' WHERE id = ?").run(hero.id);
  assert.throws(() => startFinalBattle(hero.id), /Герой пал/);
});

// The location lookup is only here so the off-map assertion reads against the
// same world data the finale uses.
test('the Black Spire exists as a normal map location', () => {
  seedAll();
  const spire = getDb().prepare("SELECT id FROM locations WHERE name = 'Чёрный шпиль'").get();
  assert.ok(spire, 'the spire is a real place');
  assert.ok(getLocation(spire.id));
});
