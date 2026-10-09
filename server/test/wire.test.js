import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedNpcs } from '../src/services/npcs.js';
import { seedQuests } from '../src/db/seed_quests.js';
import { createCharacter } from '../src/services/characters.js';
import { acceptQuest, completeQuest, hasUnlock, listQuests } from '../src/services/quests.js';
import { deriveProgress, getProgress } from '../src/services/campaign.js';
import { chapterUnlocksFor, derivedFlags, CLAN_CHAPTER_FLAGS } from '../src/game/campaign.js';
import { foundingRequirements, foundClan } from '../src/services/clan.js';
import { say } from '../src/services/dialogue.js';
import { recruit } from '../src/services/party.js';
import { startBattle, takeTurn } from '../src/services/battles.js';
import { companionTemplate } from '../src/game/companions.js';
import { getMonsterByName, getMap, recordVisit } from '../src/services/world.js';
import { startTravel, getTravelView, chooseTravel } from '../src/services/travel.js';
import { MS_PER_MINUTE } from '../src/game/travel.js';

test.after(() => closeDb());

function seedAll() {
  seedWorld();
  seedSettlements();
  seedNpcs();
  seedQuests();
}

function leader(name) {
  const c = createCharacter({ name: `${name} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = 99999 WHERE id = ?').run(c.id);
  return c;
}

// Mark quests completed without the whole accept/advance flow.
function completeQuests(characterId, ...keys) {
  const ins = getDb().prepare(
    "INSERT OR REPLACE INTO character_quests (character_id, quest_key, status, progress) VALUES (?, ?, 'completed', 1)",
  );
  for (const key of keys) ins.run(characterId, key);
}

function forceWin(battleId) {
  const state = JSON.parse(getDb().prepare('SELECT state FROM battles WHERE id=?').get(battleId).state);
  state.combatants.find((c) => c.side === 'enemy').hp = 0;
  state.over = true; state.winner = 'player';
  getDb().prepare('UPDATE battles SET state=? WHERE id=?').run(JSON.stringify(state), battleId);
}

// --- pure: milestones -> the clan's ordinal chapters -------------------------

test('the clan chapter unlocks are the ordinals of the campaign milestones', () => {
  assert.deepEqual(CLAN_CHAPTER_FLAGS, [
    'prologue_done', 'chapel_opened', 'war_truth', 'north_frozen', 'memory_bought', 'world_woken',
  ]);
  // The prologue alone opens the FIRST clan chapter. Before the fix the mapping
  // used the campaign numbers (0,2,3,...), so chapter_1 was never granted and
  // the clan could never be founded.
  const first = chapterUnlocksFor(['prologue_name', 'prologue_water', 'prologue_first_ally']);
  assert.deepEqual(first, ['chapter_1']);
  const war = chapterUnlocksFor(['prologue_name', 'prologue_water', 'prologue_first_ally', 'bone_records']);
  assert.deepEqual(war, ['chapter_1', 'chapter_3']);
  // Every milestone passed -> all six plus the clan gate.
  const all = chapterUnlocksFor([
    'prologue_name', 'prologue_water', 'prologue_first_ally',
    'chapel_song', 'first_revival', 'plague_answer', 'bone_records',
    'frozen_cradle', 'bought_memory', 'forest_ally',
  ]);
  assert.deepEqual(all, ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5', 'chapter_6', 'chapter_7']);
});

test('the branch continent quests derive their campaign flag', () => {
  assert.equal(derivedFlags(['frozen_cradle']).north_frozen, true);
  assert.equal(derivedFlags(['bought_memory']).memory_bought, true);
  assert.equal(derivedFlags(['forest_ally']).world_woken, true);
});

// --- service: completing quests unlocks the endgame --------------------------

test('completing the story quests grants the clan chapters and opens founding', () => {
  seedAll();
  const hero = leader('Тест Проводки');
  assert.equal(foundingRequirements(hero.id).met, false, 'locked before any chapter');

  // The full story in dependency order. Completing each quest must grant the
  // chapter unlock its milestone earns (via completeQuest's own hook).
  const chain = [
    'prologue_name', 'prologue_water', 'prologue_first_ally',
    'ferry_debt', 'hermit_bones', 'tide_relic',
    'chapel_song', 'first_revival', 'plague_answer',
    'bone_records', 'spire_permission',
    'frozen_cradle', 'bought_memory', 'forest_ally',
  ];
  for (const key of chain) {
    acceptQuest(hero.id, key);
    completeQuest(hero.id, key);
  }

  for (let n = 1; n <= 6; n += 1) assert.ok(hasUnlock(hero.id, `chapter_${n}`), `chapter_${n} is granted`);
  assert.ok(hasUnlock(hero.id, 'chapter_7'), 'the clan gate opens once all six milestones pass');

  // A fleet/harbour base and an allied power are always present in the seed, so
  // the clan is now foundable — the endgame is reachable by play.
  const req = foundingRequirements(hero.id);
  assert.equal(req.met, true, 'founding is now possible');
  const clan = foundClan(hero.id, { name: 'Проводной дом', doctrine: 'chroniclers', base: 'Гримхольд' });
  assert.ok(clan.clan, 'the clan is founded');
});

test('deriveProgress also grants the chapters (not only the campaign screen)', () => {
  seedAll();
  const hero = leader('Тест Деривации');
  completeQuests(hero.id, 'prologue_name', 'prologue_water', 'prologue_first_ally');
  assert.equal(hasUnlock(hero.id, 'chapter_1'), false, 'nothing until something reads it');
  deriveProgress(hero.id);
  assert.ok(hasUnlock(hero.id, 'chapter_1'), 'deriveProgress grants what the completions earn');
  // The progress view carries the flash recap.
  const progress = getProgress(hero.id);
  assert.ok(Array.isArray(progress.flash.chapters), 'the flash is reported');
  assert.equal(progress.flash.chapters.find((c) => c.flag === 'prologue_done').met, true);
});

// --- the event hooks (kill / talk / visit / collect) -------------------------

test('a won battle reports the kill to an active quest', async () => {
  seedAll();
  const hero = leader('Тест Убийства');
  const monster = getMonsterByName('Костяной рыцарь');
  assert.ok(monster, 'the quest target exists');
  // Drive the quest active; satisfy its prerequisite directly.
  completeQuests(hero.id, 'ferry_debt');
  acceptQuest(hero.id, 'hermit_bones');   // kill 2x Костяной рыцарь
  const started = startBattle({ characterId: hero.id, monsterId: monster.id });
  forceWin(started.id);
  const res = takeTurn(started.id, { type: 'attack', abilityId: 'basic', targetKey: 'e1' });
  assert.equal(res.status, 'won');
  assert.ok(res.rewards.quests.some((q) => q.key === 'hermit_bones' && q.progress === 1), 'the kill counted');
});

test('talking to an NPC reports the talk event by its key', async () => {
  seedAll();
  const hero = leader('Тест Разговора');
  const npc = getDb().prepare("SELECT id FROM npcs WHERE key = 'hangman_keeper'").get();
  acceptQuest(hero.id, 'prologue_name');   // talk hangman_keeper
  await say(hero.id, 'npc', npc.id, 'привет');
  const view = listQuests(hero.id).active.find((q) => q.key === 'prologue_name')
    || listQuests(hero.id).completed.find((q) => q.key === 'prologue_name');
  assert.equal(view.progress, 1, 'the conversation advanced the objective');
});

test('recruiting a companion reports the collect event', () => {
  seedAll();
  const hero = leader('Тест Отряда');
  acceptQuest(hero.id, 'prologue_first_ally');   // collect companion
  const t = companionTemplate('marta_veil');
  recruit(hero.id, 'marta_veil', { source: t.sources[0], goldOffered: 9999 }, () => 0);
  const done = listQuests(hero.id).completed.find((q) => q.key === 'prologue_first_ally');
  assert.ok(done, 'the first-ally quest completed on recruit');
});

test('arriving at a place reports the visit event', () => {
  seedAll();
  const hero = leader('Тест Дороги');
  const map = getMap();
  const target = map.locations.find((l) => l.name === 'Сумеречная гавань');
  assert.ok(target, 'the quest destination exists');
  const neighbour = map.locations.find((l) => map.connections.some(
    (c) => (c.from === target.id && c.to === l.id) || (c.to === target.id && c.from === l.id),
  ));
  recordVisit(hero.id, neighbour.id);
  acceptQuest(hero.id, 'prologue_water');   // visit Сумеречная гавань
  const t0 = 5_000;
  const trip = startTravel({ characterId: hero.id, fromId: neighbour.id, toId: target.id, now: t0 });
  let now = t0;
  for (let guard = 0; guard < 30; guard += 1) {
    const view = getTravelView(trip.id, now);
    if (!view || view.arrived) break;
    if (view.encounter) {
      const res = chooseTravel(trip.id, 'ignore', now);
      now = res.travel.arrived ? now : now + 1;
      continue;
    }
    now += trip.minutes * MS_PER_MINUTE;
  }
  const done = listQuests(hero.id).completed.find((q) => q.key === 'prologue_water');
  assert.ok(done, 'arriving completed the visit quest');
});

// --- content: the tide-shard sink now exists --------------------------------

test('the broker quest hands back the tide shards it asked for', () => {
  seedAll();
  const hero = leader('Тест Обломков');
  completeQuests(hero.id, 'prologue_water');
  acceptQuest(hero.id, 'broker_ledger');
  const before = getDb().prepare(
    "SELECT qty FROM character_items WHERE character_id = ? AND item_key = 'tide_shard'",
  ).get(hero.id)?.qty || 0;
  completeQuest(hero.id, 'broker_ledger');
  const after = getDb().prepare(
    "SELECT qty FROM character_items WHERE character_id = ? AND item_key = 'tide_shard'",
  ).get(hero.id)?.qty || 0;
  assert.equal(after, before + 3, 'the reward returns three shards to carry');
});
