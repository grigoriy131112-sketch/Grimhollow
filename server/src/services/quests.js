// Quests (Wave G8): accept, track, complete and fail the quests seeded from
// docs/lore/quests.md. The catalogue is db/seed_quests.js; this service is the
// I/O layer. It reuses the existing pieces rather than duplicating them:
//   - items      -> services/items.js#grantItem (G2)
//   - NPC opinion-> npc_relations, the same table services/dialogue.js writes
//   - XP/levels  -> the pure rules in game/rules.js
//
// Progress is event-driven: another system reports what happened (a kill, a
// visit, a collected item, a talk, a revival) and every matching active quest
// advances. A quest whose objective is met is completed and paid in one step.

import { getDb, transaction } from '../db/index.js';
import { getCharacter } from './characters.js';
import { grantItem, hasItem, takeItem, getEquipment } from './items.js';
import { getNpcByKey } from './npcs.js';
import { getLocation } from './world.js';
import { itemInfo } from '../game/items.js';
import { levelFromXp, deriveCharacter } from '../game/rules.js';
import { grantNames } from './clan.js';
import { MEMORY_QUEST_KEYS, NAMES_PER_MEMORY_QUEST } from '../db/seed_clan.js';
import { derivedFlags, endgameUnlocksFromFlags } from '../game/campaign.js';
import {
  QUEST_SOURCES, OBJECTIVE_TYPES, questByKey, isStoryQuest, SIDE_FAIL_OPINION,
} from '../db/seed_quests.js';

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

// Russian labels for the unlock flags a reward can grant.
const UNLOCK_LABELS = {
  drowned_road: 'Утонувшая дорога',
  chapel_gate: 'врата часовни',
  ash_war_truth: 'правда о Пепельной войне',
  spire_approach: 'подступы к Чёрному шпилю',
};

function questRow(key) {
  return getDb().prepare('SELECT * FROM quests WHERE key = ?').get(String(key));
}

function rowToDef(row) {
  return {
    key: row.key,
    source: row.source,
    giver: row.giver,
    chapter: row.chapter,
    title: row.title,
    text: row.text,
    objective: parseJson(row.objective, {}),
    reward: parseJson(row.reward, {}),
    requires: parseJson(row.requires, []),
    story: !!row.story || isStoryQuest(row),
  };
}

// --- labels (everything a player reads is Russian) --------------------------

function giverName(giver) {
  if (!giver) return null;
  if (giver.includes(':')) {
    const [settlementKey, buildingKey] = giver.split(':');
    const s = getDb().prepare('SELECT id FROM settlements WHERE key = ?').get(settlementKey);
    if (s) {
      const b = getDb().prepare('SELECT name FROM settlement_buildings WHERE settlement_id = ? AND key = ?').get(s.id, buildingKey);
      if (b) return b.name;
    }
  }
  const npc = getNpcByKey(giver);
  if (npc) return npc.name;
  const building = getDb().prepare('SELECT name FROM settlement_buildings WHERE key = ? ORDER BY id LIMIT 1').get(giver);
  if (building) return building.name;
  return giver;
}

function itemName(key) {
  const info = itemInfo(key);
  return info.name && info.name !== key ? info.name : key;
}

function objectiveText(objective) {
  const type = objective?.type;
  const count = Number(objective?.count) || 1;
  const target = objective?.target;
  const label = OBJECTIVE_TYPES[type] || 'Задача';
  switch (type) {
    case 'visit': return `Посетить «${target}»`;
    case 'kill': return `Убить ${target}${count > 1 ? ` ×${count}` : ''}`;
    case 'collect':
      if (target === 'companion') return 'Нанять спутника';
      return `Собрать «${itemName(target)}»${count > 1 ? ` ×${count}` : ''}`;
    case 'deliver': return `Отнести «${itemName(objective.item)}»${count > 1 ? ` ×${count}` : ''} — ${giverName(target) || target}`;
    case 'talk': return `Поговорить: ${giverName(target) || target}`;
    case 'survive': return `Выжить ${count} ходов в бою`;
    case 'revive': return 'Воскресить спутника ритуалом';
    case 'no_steel': return `Пройти «${target}» без оружия`;
    default: return `${label}: ${target || ''}`.trim();
  }
}

function rewardText(reward, questKey = null) {
  const parts = [];
  if (reward.gold) parts.push(`${reward.gold} золота`);
  if (reward.xp) parts.push(`${reward.xp} опыта`);
  if (reward.item) parts.push(`«${itemName(reward.item)}»`);
  if (reward.opinion) parts.push(`мнение ${reward.opinion > 0 ? '+' : ''}${reward.opinion}`);
  if (reward.unlock) parts.push(`доступ: ${UNLOCK_LABELS[reward.unlock] || reward.unlock}`);
  if (questKey && MEMORY_QUEST_KEYS.includes(questKey)) parts.push(`${NAMES_PER_MEMORY_QUEST} имён`);
  return parts.join(', ');
}

// --- availability and state -------------------------------------------------

function statusOf(characterId, key) {
  const row = getDb().prepare('SELECT * FROM character_quests WHERE character_id = ? AND quest_key = ?')
    .get(characterId, key);
  return row || null;
}

function completedKeys(characterId) {
  return new Set(
    getDb().prepare("SELECT quest_key FROM character_quests WHERE character_id = ? AND status = 'completed'")
      .all(characterId).map((r) => r.quest_key),
  );
}

// Requirements met? (every `requires` key is completed)
function requiresMet(def, completed) {
  return (def.requires || []).every((r) => completed.has(r));
}

// Whether a quest shows in the "available" pool. A failed side quest is gone
// for good; a failed story quest returns to the pool (docs/lore/quests.md).
export function isAvailable(def, row, completed) {
  if (!requiresMet(def, completed)) return false;
  if (!row) return true;
  if (row.status === 'failed') return isStoryQuest(def);
  return false; // active or completed
}

function objectiveCount(objective) {
  return Math.max(1, Number(objective?.count) || 1);
}

function questView(def, row) {
  const need = objectiveCount(def.objective);
  const progress = row ? row.progress : 0;
  return {
    key: def.key,
    source: def.source,
    sourceLabel: QUEST_SOURCES[def.source]?.label || def.source,
    sourceIcon: QUEST_SOURCES[def.source]?.icon || null,
    giver: def.giver,
    giverName: giverName(def.giver),
    chapter: def.chapter,
    title: def.title,
    text: def.text,
    objective: def.objective,
    objectiveText: objectiveText(def.objective),
    reward: def.reward,
    rewardText: rewardText(def.reward, def.key),
    requires: def.requires,
    story: isStoryQuest(def),
    // `deliver` needs the player to hand goods over, so the UI shows a «Отдать»
    // button instead of the generic "mark a step" one.
    deliverable: def.objective?.type === 'deliver',
    deliverItem: def.objective?.type === 'deliver' ? def.objective.item : null,
    state: row ? row.status : 'available',
    progress,
    target: need,
    percent: Math.min(100, Math.round((progress / need) * 100)),
    acceptedAt: row?.accepted_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

// Everything a hero can see: the open pool, what is under way, and what is done
// or lost.
export function listQuests(characterId) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  const rows = getDb().prepare('SELECT * FROM quests ORDER BY sort_order, id').all().map(rowToDef);
  const completed = completedKeys(characterId);

  const available = [];
  const active = [];
  const done = [];
  const failed = [];
  for (const def of rows) {
    const row = statusOf(characterId, def.key);
    if (row?.status === 'active') active.push(questView(def, row));
    else if (row?.status === 'completed') done.push(questView(def, row));
    else if (row?.status === 'failed') failed.push(questView(def, row));
    if (isAvailable(def, row, completed)) available.push(questView(def, row));
  }
  return {
    character: { id: character.id, name: character.name, level: character.level, gold: character.gold },
    available,
    active,
    completed: done,
    failed,
    unlocks: listUnlocks(characterId),
    counts: { available: available.length, active: active.length, completed: done.length, failed: failed.length },
  };
}

export function getQuestView(characterId, key) {
  const row = questRow(key);
  if (!row) return null;
  return questView(rowToDef(row), statusOf(characterId, row.key));
}

// --- accepting and abandoning ----------------------------------------------

function missingRequirementTitles(def, completed) {
  return (def.requires || [])
    .filter((r) => !completed.has(r))
    .map((r) => questByKey(r)?.title || questRow(r)?.title || r);
}

export function acceptQuest(characterId, key) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  const row = questRow(key);
  if (!row) throw new Error('Такого задания нет');
  const def = rowToDef(row);

  const existing = statusOf(characterId, def.key);
  if (existing) {
    if (existing.status === 'active') throw new Error('Задание уже взято');
    if (existing.status === 'completed') throw new Error('Задание уже выполнено');
    if (!isStoryQuest(def)) throw new Error('Это задание провалено безвозвратно');
  }

  const completed = completedKeys(characterId);
  const missing = missingRequirementTitles(def, completed);
  if (missing.length) throw new Error(`Сначала выполните: ${missing.join(', ')}`);

  if (existing) {
    getDb().prepare(
      "UPDATE character_quests SET status = 'active', progress = 0, accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    ).run(existing.id);
  } else {
    getDb().prepare(
      "INSERT INTO character_quests (character_id, quest_key, status, progress) VALUES (?, ?, 'active', 0)",
    ).run(characterId, def.key);
  }
  return getQuestView(characterId, def.key);
}

// A quest the hero gives up on returns to the pool untouched (no penalty).
export function abandonQuest(characterId, key) {
  const existing = statusOf(characterId, key);
  if (!existing) throw new Error('Задание не взято');
  if (existing.status !== 'active') throw new Error('Задание не в работе');
  getDb().prepare('DELETE FROM character_quests WHERE id = ?').run(existing.id);
  return { key, status: 'abandoned', returnedToPool: true };
}

// --- progress ---------------------------------------------------------------

function matchesObjective(objective, event) {
  if (!objective || !event || !event.type) return false;
  if (objective.type !== event.type) return false;

  const want = objective.target;
  if (want != null) {
    // `collect` names the item as its target; every other type names the thing
    // itself (a monster, a location, an NPC). A collect event may carry either.
    const got = objective.type === 'collect' ? (event.item ?? event.target) : event.target;
    if (String(got) !== String(want)) return false;
  }
  // `deliver` additionally requires the right item.
  if (objective.item && String(event.item) !== String(objective.item)) return false;
  return true;
}

// Advance every active quest whose objective matches the event. Returns the
// quests that moved, and completes the ones that reached their target.
export function advanceQuest(characterId, event) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  const ev = {
    type: event?.type,
    target: event?.target,
    item: event?.item,
    count: Math.max(1, Number(event?.count) || 1),
  };
  if (!ev.type) throw new Error('Нужен тип события');

  const activeRows = getDb().prepare(
    "SELECT * FROM character_quests WHERE character_id = ? AND status = 'active' ORDER BY id",
  ).all(characterId);

  const results = [];
  for (const activeRow of activeRows) {
    const row = questRow(activeRow.quest_key);
    if (!row) continue;
    const def = rowToDef(row);
    if (!matchesObjective(def.objective, ev)) continue;

    const need = objectiveCount(def.objective);
    const next = Math.min(need, activeRow.progress + ev.count);
    getDb().prepare("UPDATE character_quests SET progress = ?, updated_at = datetime('now') WHERE id = ?")
      .run(next, activeRow.id);
    const result = { key: def.key, progress: next, target: need, complete: next >= need };
    if (result.complete) result.rewards = completeQuest(characterId, def.key).granted;
    results.push(result);
  }
  return results;
}

// Hand a carried item to an NPC. This is the one objective the event stream
// cannot auto-run: `deliver` must *spend* the goods, so it only fires on an
// explicit player action (the quest screen) or when the hero talks to the giver
// with the goods in the bag (`tryDeliver`, called from services/dialogue.js).
// The item is taken inside the same step that completes the quest, so a reload
// in between cannot keep the goods and the reward.
export function deliverQuest(characterId, key) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  const active = statusOf(characterId, key);
  if (!active || active.status !== 'active') throw new Error('Задание не в работе');
  const row = questRow(key);
  if (!row) throw new Error('Такого задания нет');
  const def = rowToDef(row);
  if (def.objective?.type !== 'deliver') throw new Error('Это задание не о доставке');

  const need = objectiveCount(def.objective);
  const itemKey = def.objective.item;
  if (!hasItem(characterId, itemKey, need)) throw new Error('Не хватает предмета для доставки');
  takeItem(characterId, itemKey, need);
  const done = completeQuest(characterId, key);
  return { ...done, delivered: { item: itemKey, qty: need } };
}

// Best-effort auto-delivery when the hero speaks to the giver. Returns the
// delivered quests, or [] if none match — safe to call on every conversation.
// This is what stops the one dead objective type: the player brings the goods to
// Измора, says hello, and the quest closes without a hidden button.
export function tryDeliver(characterId, npcKey) {
  const out = [];
  const activeRows = getDb().prepare(
    "SELECT * FROM character_quests WHERE character_id = ? AND status = 'active' ORDER BY id",
  ).all(characterId);
  for (const activeRow of activeRows) {
    const row = questRow(activeRow.quest_key);
    if (!row) continue;
    const def = rowToDef(row);
    const obj = def.objective;
    if (obj?.type !== 'deliver') continue;
    if (String(obj.target) !== String(npcKey)) continue;
    if (!hasItem(characterId, obj.item, objectiveCount(obj))) continue;
    try { out.push(deliverQuest(characterId, def.key)); } catch { /* keep going */ }
  }
  return out;
}

// The `no_steel` oath: an objective to walk a named wild place without a weapon
// drawn. It completes when the hero is standing there with the weapon slot
// empty. Called from conversation, so it is an act of play, not a map glance.
export function reportNoSteel(characterId, locationName) {
  if (!locationName) return [];
  const character = getCharacter(characterId);
  if (!character) return [];
  const here = character.locationId ? getLocation(character.locationId) : null;
  if (!here || here.name !== locationName) return [];
  if (getEquipment(characterId).weapon) return []; // steel in hand: the oath is not kept

  const out = [];
  const activeRows = getDb().prepare(
    "SELECT * FROM character_quests WHERE character_id = ? AND status = 'active' ORDER BY id",
  ).all(characterId);
  for (const activeRow of activeRows) {
    const row = questRow(activeRow.quest_key);
    if (!row) continue;
    const def = rowToDef(row);
    const obj = def.objective;
    if (obj?.type !== 'no_steel') continue;
    if (String(obj.target) !== String(locationName)) continue;
    try { out.push(...advanceQuest(characterId, { type: 'no_steel', target: locationName })); }
    catch { /* keep going */ }
  }
  return out;
}

// The player reports progress by hand (the "I did it" button): advance one
// active quest by `amount` and complete it when the target is reached.
export function reportProgress(characterId, key, amount = 1) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  const active = statusOf(characterId, key);
  if (!active || active.status !== 'active') throw new Error('Задание не в работе');
  const row = questRow(key);
  if (!row) throw new Error('Такого задания нет');
  const def = rowToDef(row);
  const need = objectiveCount(def.objective);
  const step = Math.max(1, Number(amount) || 1);
  const next = Math.min(need, active.progress + step);
  getDb().prepare("UPDATE character_quests SET progress = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next, active.id);
  if (next >= need) {
    const done = completeQuest(characterId, key);
    return { ...done, progress: next, target: need };
  }
  return { key, status: 'active', progress: next, target: need, complete: false };
}

// --- completing, failing, rewards ------------------------------------------

function grantXp(characterId, xp) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  const newXp = (Number(row.xp) || 0) + xp;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > row.level;
  if (leveledUp) {
    const fresh = deriveCharacter({ ...row, level: newLevel, xp: newXp, hp: null, mana: null, stamina: null });
    db.prepare("UPDATE characters SET level=?, xp=?, hp=?, mana=?, stamina=?, updated_at=datetime('now') WHERE id=?")
      .run(newLevel, newXp, fresh.stats.maxHp, fresh.stats.maxMana, fresh.stats.maxStamina, characterId);
  } else {
    db.prepare("UPDATE characters SET xp=?, updated_at=datetime('now') WHERE id=?").run(newXp, characterId);
  }
  return { xp: newXp, level: newLevel, leveledUp };
}

// Move an NPC's opinion of the leader. Stored in npc_relations, the same table
// dialogue uses, seeded from the NPC's base opinion on first change.
export function adjustNpcOpinion(leaderId, giverKey, delta) {
  const npc = giverKey ? getNpcByKey(giverKey) : null;
  if (!npc) return null;
  const db = getDb();
  const existing = db.prepare('SELECT value FROM npc_relations WHERE leader_id = ? AND npc_id = ?').get(leaderId, npc.id);
  const before = existing ? existing.value : npc.baseOpinion;
  const after = clamp(before + delta);
  db.prepare(
    `INSERT INTO npc_relations (leader_id, npc_id, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (leader_id, npc_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(leaderId, npc.id, after);
  return { npcId: npc.id, npc: npc.name, from: before, to: after, delta };
}

export function addUnlock(characterId, flag, questKey = null) {
  getDb().prepare(
    'INSERT OR IGNORE INTO character_unlocks (character_id, flag, quest_key) VALUES (?, ?, ?)',
  ).run(characterId, String(flag), questKey);
  return { flag, label: UNLOCK_LABELS[flag] || flag };
}

export function listUnlocks(characterId) {
  return getDb().prepare('SELECT flag, quest_key FROM character_unlocks WHERE character_id = ? ORDER BY created_at, flag')
    .all(characterId)
    .map((r) => ({ flag: r.flag, label: UNLOCK_LABELS[r.flag] || r.flag, questKey: r.quest_key }));
}

export function hasUnlock(characterId, flag) {
  return !!getDb().prepare('SELECT 1 FROM character_unlocks WHERE character_id = ? AND flag = ?').get(characterId, String(flag));
}

function grantReward(characterId, def) {
  const r = def.reward || {};
  const granted = {};
  if (r.gold) {
    getDb().prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?")
      .run(r.gold, characterId);
    granted.gold = r.gold;
  }
  if (r.xp) {
    granted.xp = r.xp;
    granted.character = grantXp(characterId, r.xp);
  }
  if (r.item) {
    grantItem(characterId, r.item, r.itemQty || 1);
    granted.item = { key: r.item, name: itemName(r.item), qty: r.itemQty || 1 };
  }
  if (r.opinion) {
    const opinion = adjustNpcOpinion(characterId, def.giver, r.opinion);
    if (opinion) granted.opinion = opinion;
  }
  if (r.unlock) granted.unlock = addUnlock(characterId, r.unlock, def.key);
  // A memory quest (Книга с чужим именем, Первое возвращение…) also pays the
  // clan in names, on top of gold/xp/item. A hero with no clan earns none.
  if (MEMORY_QUEST_KEYS.includes(def.key)) {
    grantNames(characterId, NAMES_PER_MEMORY_QUEST);
    granted.names = NAMES_PER_MEMORY_QUEST;
  }
  return granted;
}

// Mark an active quest complete and pay it out once. Completing twice is a
// no-op, so an event storm cannot double-pay.
export function completeQuest(characterId, key) {
  const existing = statusOf(characterId, key);
  if (!existing) throw new Error('Задание не взято');
  if (existing.status !== 'active') return { key, status: existing.status, already: true, granted: {} };
  const row = questRow(key);
  if (!row) throw new Error('Такого задания нет');
  const def = rowToDef(row);
  const granted = transaction(() => grantReward(characterId, def));
  getDb().prepare("UPDATE character_quests SET status = 'completed', updated_at = datetime('now') WHERE id = ?")
    .run(existing.id);
  // Finishing a chapter quest opens the campaign flash: grant the `chapter_N`
  // unlocks the completed set now earns, so the clan (G9) and the finale (G11)
  // become reachable without waiting for the campaign screen to be opened.
  const unlocks = endgameUnlocksFromFlags(derivedFlags(completedQuestKeys(characterId)));
  granted.chapters = unlocks.map((flag) => addUnlock(characterId, flag, key));
  return { key, status: 'completed', granted };
}

// The keys of every completed quest (used to derive the chapter flash).
function completedQuestKeys(characterId) {
  return getDb().prepare("SELECT quest_key FROM character_quests WHERE character_id = ? AND status = 'completed'")
    .all(characterId).map((r) => r.quest_key);
}

// Fail an active quest. A key story quest is never lost for good — it returns
// to the pool. A side quest is gone, and its giver's opinion drops.
export function failQuest(characterId, key) {
  const existing = statusOf(characterId, key);
  if (!existing) throw new Error('Задание не взято');
  if (existing.status !== 'active') throw new Error('Задание не в работе');
  const row = questRow(key);
  if (!row) throw new Error('Такого задания нет');
  const def = rowToDef(row);
  const story = isStoryQuest(def);

  getDb().prepare("UPDATE character_quests SET status = 'failed', updated_at = datetime('now') WHERE id = ?")
    .run(existing.id);

  let opinion = null;
  if (!story) opinion = adjustNpcOpinion(characterId, def.giver, SIDE_FAIL_OPINION);

  return {
    key,
    status: 'failed',
    story,
    returnedToPool: story,
    opinion,
    message: story ? 'Ключевое задание вернулось в выдачу.' : 'Задание провалено безвозвратно.',
  };
}
