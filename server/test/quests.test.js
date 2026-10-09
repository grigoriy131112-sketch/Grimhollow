import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedSettlements } from '../src/db/seed_settlements.js';
import { seedNpcs, getNpcByKey } from '../src/services/npcs.js';
import { seedQuests, QUEST_DEFS, STORY_QUESTS, SIDE_FAIL_OPINION } from '../src/db/seed_quests.js';
import {
  listQuests, getQuestView, acceptQuest, abandonQuest, advanceQuest,
  reportProgress, completeQuest, failQuest, hasUnlock,
  deliverQuest, tryDeliver, reportNoSteel,
} from '../src/services/quests.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { hasItem, grantItem, equipItem, unequipItem } from '../src/services/items.js';
import { recordVisit, getLocation } from '../src/services/world.js';

test.after(() => closeDb());

function seedAll() {
  seedWorld();
  seedSettlements();
  seedNpcs();
  seedQuests();
}

function leader(name) {
  return createCharacter({ name, class: 'fighter' });
}

function opinionOf(leaderId, npcKey) {
  const npc = getNpcByKey(npcKey);
  const row = getDb().prepare('SELECT value FROM npc_relations WHERE leader_id = ? AND npc_id = ?').get(leaderId, npc.id);
  return row ? row.value : npc.baseOpinion;
}

test('the quest catalogue seeds the prologue and chapters 1-3, once', () => {
  seedAll();
  const keys = getDb().prepare('SELECT key FROM quests ORDER BY sort_order, id').all().map((r) => r.key);
  assert.equal(keys.length, 17, 'prologue + chapters 1-6 per docs/lore/campaign.md');
  for (const key of [
    'prologue_name', 'prologue_water', 'prologue_first_ally',
    'ferry_debt', 'broker_ledger', 'hermit_bones', 'tide_relic',
    'chapel_song', 'first_revival', 'plague_answer',
    'fog_medicine', 'ash_forest_oath', 'bone_records', 'spire_permission',
    'frozen_cradle', 'bought_memory', 'forest_ally',
  ]) {
    assert.ok(keys.includes(key), `${key} is seeded`);
  }
  // The content spec names exactly these key quests.
  assert.deepEqual([...STORY_QUESTS].sort(), ['bone_records', 'first_revival', 'prologue_name', 'spire_permission']);

  // Every seeded quest has the shape the spec defines.
  for (const def of QUEST_DEFS) {
    assert.ok(def.key && def.title && def.text, `${def.key} has title and text`);
    assert.match(def.key, /^[a-z_]+$/, 'keys stay Latin');
    assert.ok(/[А-Яа-яЁё]/.test(def.title), `${def.key} title is Russian`);
    assert.ok(def.objective?.type, `${def.key} has an objective type`);
    assert.ok('reward' in def, `${def.key} has a reward`);
    assert.ok(Array.isArray(def.requires), `${def.key} has requires`);
  }

  // Re-seeding never duplicates.
  assert.equal(seedQuests().skipped, true);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM quests').get().n, 17);
});

test('accepting, advancing and completing a quest grants its gold and xp', () => {
  seedAll();
  const hero = leader('Тест Награда');
  const before = getCharacter(hero.id);

  const accepted = acceptQuest(hero.id, 'prologue_name');
  assert.equal(accepted.state, 'active');
  assert.equal(accepted.progress, 0);
  assert.equal(accepted.target, 1);
  assert.match(accepted.objectiveText, /Оден/);
  assert.throws(() => acceptQuest(hero.id, 'prologue_name'), /уже взято/);

  assert.equal(getCharacter(hero.id).gold, before.gold, 'no reward before completion');

  const advanced = advanceQuest(hero.id, { type: 'talk', target: 'hangman_keeper' });
  assert.equal(advanced.length, 1);
  assert.equal(advanced[0].complete, true);

  const after = getCharacter(hero.id);
  assert.equal(after.gold, before.gold + 20);
  assert.equal(after.xp, 50);
  assert.equal(getQuestView(hero.id, 'prologue_name').state, 'completed');

  // Completing again is a no-op and never pays twice.
  const again = completeQuest(hero.id, 'prologue_name');
  assert.equal(again.already, true);
  assert.equal(getCharacter(hero.id).gold, before.gold + 20);
});

test('a quest unlocks only after its requirements, and pays its item', () => {
  seedAll();
  const hero = leader('Тест Предмет');
  assert.throws(() => acceptQuest(hero.id, 'hermit_bones'), /Сначала выполните/);

  // Clear the prerequisite: reach the water, then the ferryman.
  acceptQuest(hero.id, 'prologue_water');
  advanceQuest(hero.id, { type: 'visit', target: 'Сумеречная гавань' });
  acceptQuest(hero.id, 'ferry_debt');
  advanceQuest(hero.id, { type: 'talk', target: 'marsh_ferryman' });
  assert.equal(getQuestView(hero.id, 'ferry_debt').state, 'completed');
  assert.equal(hasUnlock(hero.id, 'drowned_road'), true, 'the reward unlock is recorded');

  acceptQuest(hero.id, 'hermit_bones');
  advanceQuest(hero.id, { type: 'kill', target: 'Костяной рыцарь', count: 1 });
  const half = getQuestView(hero.id, 'hermit_bones');
  assert.equal(half.progress, 1);
  assert.equal(half.state, 'active', 'not done at 1 of 2');
  assert.equal(half.percent, 50);

  advanceQuest(hero.id, { type: 'kill', target: 'Костяной рыцарь', count: 1 });
  assert.equal(getQuestView(hero.id, 'hermit_bones').state, 'completed');
  assert.equal(hasItem(hero.id, 'shepherd_key'), true, 'the ritual key is granted');
});

test('a collect quest advances by item and completes at its target', () => {
  seedAll();
  const hero = leader('Тест Сбор');
  acceptQuest(hero.id, 'prologue_water');
  advanceQuest(hero.id, { type: 'visit', target: 'Сумеречная гавань' });
  assert.equal(getQuestView(hero.id, 'prologue_water').state, 'completed');

  acceptQuest(hero.id, 'broker_ledger');
  assert.equal(advanceQuest(hero.id, { type: 'collect', item: 'tide_shard' })[0].progress, 1);
  assert.equal(advanceQuest(hero.id, { type: 'collect', item: 'tide_shard' })[0].progress, 2);
  const last = advanceQuest(hero.id, { type: 'collect', item: 'tide_shard' });
  assert.equal(last[0].complete, true);
  assert.equal(getQuestView(hero.id, 'broker_ledger').state, 'completed');
});

test('a key story quest returns to the pool when it fails', () => {
  seedAll();
  const hero = leader('Тест Сюжет');
  acceptQuest(hero.id, 'prologue_name');

  const res = failQuest(hero.id, 'prologue_name');
  assert.equal(res.story, true);
  assert.equal(res.returnedToPool, true);
  assert.equal(getQuestView(hero.id, 'prologue_name').state, 'failed');

  // It is listed as failed *and* offered again, and can be re-accepted fresh.
  const log = listQuests(hero.id);
  assert.ok(log.failed.some((q) => q.key === 'prologue_name'));
  assert.ok(log.available.some((q) => q.key === 'prologue_name'));
  const again = acceptQuest(hero.id, 'prologue_name');
  assert.equal(again.state, 'active');
  assert.equal(again.progress, 0);
});

test('a failed side quest lowers the giver opinion and is lost for good', () => {
  seedAll();
  const hero = leader('Тест Провал');
  const base = getNpcByKey('fog_widow').baseOpinion;
  acceptQuest(hero.id, 'fog_medicine');

  const res = failQuest(hero.id, 'fog_medicine');
  assert.equal(res.story, false);
  assert.equal(res.returnedToPool, false);
  assert.ok(res.opinion, 'the giver reacts');
  assert.equal(res.opinion.delta, SIDE_FAIL_OPINION);
  assert.equal(res.opinion.to, base + SIDE_FAIL_OPINION);
  assert.equal(opinionOf(hero.id, 'fog_widow'), base + SIDE_FAIL_OPINION);

  const log = listQuests(hero.id);
  assert.equal(log.available.some((q) => q.key === 'fog_medicine'), false, 'gone from the pool');
  assert.throws(() => acceptQuest(hero.id, 'fog_medicine'), /безвозвратно/);
});

test('an opinion reward moves the giver opinion up', () => {
  seedAll();
  const hero = leader('Тест Мнение');
  const base = getNpcByKey('ash_druid').baseOpinion;
  acceptQuest(hero.id, 'ash_forest_oath');

  advanceQuest(hero.id, { type: 'no_steel', target: 'Пепельный лес' });
  assert.equal(getQuestView(hero.id, 'ash_forest_oath').state, 'completed');
  assert.equal(opinionOf(hero.id, 'ash_druid'), base + 5);
});

test('delivering the goods spends them and closes the quest', () => {
  seedAll();
  const hero = leader('Тест Доставка');
  acceptQuest(hero.id, 'fog_medicine');
  grantItem(hero.id, 'clean_water', 2);

  const view = getQuestView(hero.id, 'fog_medicine');
  assert.equal(view.deliverable, true, 'the UI is told this one is a delivery');
  assert.equal(view.deliverItem, 'clean_water');

  const res = deliverQuest(hero.id, 'fog_medicine');
  assert.equal(getQuestView(hero.id, 'fog_medicine').state, 'completed');
  assert.deepEqual(res.delivered, { item: 'clean_water', qty: 2 });
  assert.equal(hasItem(hero.id, 'clean_water', 1), false, 'both flasks were handed over');
});

test('delivering short of the goods is refused and keeps what is carried', () => {
  seedAll();
  const hero = leader('Тест Недобор');
  acceptQuest(hero.id, 'fog_medicine');
  grantItem(hero.id, 'clean_water', 1);

  assert.throws(() => deliverQuest(hero.id, 'fog_medicine'), /Не хватает/);
  assert.equal(getQuestView(hero.id, 'fog_medicine').state, 'active');
  assert.equal(hasItem(hero.id, 'clean_water', 1), true, 'the one flask is still in the bag');
});

test('talking to the giver with the goods in hand closes the delivery', () => {
  seedAll();
  const hero = leader('Тест Разговор');
  acceptQuest(hero.id, 'fog_medicine');
  assert.deepEqual(tryDeliver(hero.id, 'fog_widow'), [], 'nothing to deliver yet');

  grantItem(hero.id, 'clean_water', 2);
  const out = tryDeliver(hero.id, 'fog_widow');
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'fog_medicine');
  assert.equal(getQuestView(hero.id, 'fog_medicine').state, 'completed');
  assert.equal(hasItem(hero.id, 'clean_water', 1), false);
});

test('the no-steel oath needs the hero present and empty-handed', () => {
  seedAll();
  const hero = leader('Тест Обет');
  acceptQuest(hero.id, 'ash_forest_oath');
  const forest = getLocation(getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Пепельный лес').id);

  // Not there yet: the oath does not fire.
  assert.deepEqual(reportNoSteel(hero.id, forest.name), []);
  assert.equal(getQuestView(hero.id, 'ash_forest_oath').state, 'active');

  // Standing there, but with a weapon drawn: still not kept.
  recordVisit(hero.id, forest.id);
  grantItem(hero.id, 'rusty_sword', 1);
  equipItem(hero.id, 'rusty_sword');
  assert.deepEqual(reportNoSteel(hero.id, forest.name), []);
  assert.equal(getQuestView(hero.id, 'ash_forest_oath').state, 'active');

  // Weapon away in the named place: the oath is kept.
  unequipItem(hero.id, 'weapon');
  const out = reportNoSteel(hero.id, forest.name);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'ash_forest_oath');
  assert.equal(getQuestView(hero.id, 'ash_forest_oath').state, 'completed');
});

test('abandoning an active quest returns it to the pool untouched', () => {
  seedAll();
  const hero = leader('Тест Отказ');
  acceptQuest(hero.id, 'ash_forest_oath');
  const res = abandonQuest(hero.id, 'ash_forest_oath');
  assert.equal(res.returnedToPool, true);
  assert.equal(getQuestView(hero.id, 'ash_forest_oath').state, 'available');
  assert.ok(listQuests(hero.id).available.some((q) => q.key === 'ash_forest_oath'));
});

test('reportProgress advances one quest and completes at the target', () => {
  seedAll();
  const hero = leader('Тест Отчёт');
  acceptQuest(hero.id, 'prologue_first_ally');
  const done = reportProgress(hero.id, 'prologue_first_ally');
  assert.equal(done.status, 'completed');
  assert.equal(getCharacter(hero.id).xp, 40);
});

test('the quest log only offers quests whose requirements are met', () => {
  seedAll();
  const hero = leader('Тест Выдача');
  const log = listQuests(hero.id);
  assert.ok(log.available.some((q) => q.key === 'prologue_name'));
  assert.equal(log.available.some((q) => q.key === 'hermit_bones'), false, 'locked behind ferry_debt');
  assert.equal(log.available.some((q) => q.key === 'tide_relic'), false, 'locked behind hermit_bones');
  assert.equal(log.counts.active, 0);
  assert.equal(getQuestView(hero.id, 'does_not_exist'), null);
});
