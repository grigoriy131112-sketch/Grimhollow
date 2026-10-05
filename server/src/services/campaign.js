// Campaign progress (Wave G11) — the I/O layer.
//
// The campaign is a set of chapter flags stored per hero in `campaign_progress`.
// This service reads and writes them, derives the ones G8 already knows about
// (it reads the quest completions through services/quests.js rather than
// re-implementing quests), gates the finale, and starts the final battle.
//
// The final boss is the off-map Костяной Пастырь (db/seed.js). He is not on the
// normal map, and the finale is a `campaign_final` battle — a dedicated kind, so
// a plain `kill` on the map can never be the finale. The battle itself reuses the
// existing engine (services/battles.js#startBattle); his Посох Пастыря is the
// final trophy, claimed once the finale is won.

import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, fallenMembers } from './party.js';
import { hasItem, grantItem } from './items.js';
import { getMonsterByName } from './world.js';
import { itemInfo } from '../game/items.js';
import { listQuests, hasUnlock } from './quests.js';
import { startBattle } from './battles.js';
import {
  FLAG_DEFS, FLAG_ORDER, FINAL_BATTLE_KIND, FINAL_BOSS, FINAL_TROPHY, FINAL_LOCATION,
  SPIRE_UNLOCK, derivedFlags, flagStatuses, finalGateStatus, resolveEnding, endingCandidates,
  buildEpilogue, doctrineInfo, EPILOGUE_VOICES, ENDING_ORDER,
} from '../game/campaign.js';

function requireCharacter(id) {
  const character = getCharacter(id);
  if (!character) throw new Error('Персонаж не найден');
  return character;
}

// --- flags ------------------------------------------------------------------

function readFlags(characterId) {
  const rows = getDb().prepare('SELECT flag, source FROM campaign_progress WHERE character_id = ?').all(characterId);
  const flags = {};
  for (const r of rows) flags[r.flag] = true;
  return flags;
}

// The G8 quests a hero has completed. Read through the quests service so the
// campaign never re-implements quest tracking.
function completedQuestKeys(characterId) {
  return listQuests(characterId).completed.map((q) => q.key);
}

// Fold the flags G8 implies into the campaign table. Additive: a flag already
// set by a branch or by hand keeps its own source.
export function deriveProgress(characterId) {
  requireCharacter(characterId);
  const completed = completedQuestKeys(characterId);
  const derived = derivedFlags(completed);
  const db = getDb();
  let added = 0;
  for (const [flag, on] of Object.entries(derived)) {
    if (!on) continue;
    const info = db.prepare(
      'INSERT OR IGNORE INTO campaign_progress (character_id, flag, source) VALUES (?, ?, ?)',
    ).run(characterId, flag, 'quest');
    if (info.changes > 0) added += 1;
  }
  return { completed: completed.length, derived, added };
}

// Set one flag (a branch, the clan, or the player reporting progress). Unknown
// flags are rejected so a typo cannot quietly open the finale.
export function setFlag(characterId, flag, source = 'manual') {
  requireCharacter(characterId);
  const key = String(flag || '');
  if (!FLAG_DEFS[key]) throw new Error('Такого флага кампании нет');
  getDb().prepare(
    'INSERT OR IGNORE INTO campaign_progress (character_id, flag, source) VALUES (?, ?, ?)',
  ).run(characterId, key, String(source || 'manual'));
  return { flag: key, title: FLAG_DEFS[key].title, set: true, source };
}

// --- clan doctrine and faction opinions -------------------------------------

// The clan doctrine lives in G9's table, which does not exist until that wave
// lands. Read it when present, from a fixed set of candidate column names; a
// missing table simply means "no doctrine yet" and the finale still resolves.
function readDoctrine(characterId) {
  const db = getDb();
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clans'").get();
  if (!table) return null;
  const columns = db.prepare('PRAGMA table_info(clans)').all().map((c) => c.name);
  const column = ['doctrine', 'doctrine_key', 'path', 'creed'].find((c) => columns.includes(c));
  if (!column) return null;
  const row = db.prepare(`SELECT ${column} AS doctrine FROM clans WHERE leader_id = ? ORDER BY id DESC LIMIT 1`).get(characterId);
  return row ? row.doctrine : null;
}

// Opinion of the named voices (Оден, Хор, Смотритель, Лес, Архивы...), keyed by
// the epilogue voice key. The opinion is the NPC relation if it was ever moved,
// else the NPC's base opinion.
function readFactionOpinions(characterId) {
  const rows = getDb().prepare(
    `SELECT n.key AS key, COALESCE(r.value, n.opinion) AS value
     FROM npcs n LEFT JOIN npc_relations r ON r.npc_id = n.id AND r.leader_id = ?`,
  ).all(characterId);
  const byNpc = new Map(rows.map((r) => [r.key, r.value]));
  const opinions = {};
  for (const voice of EPILOGUE_VOICES) {
    opinions[voice.key] = byNpc.has(voice.npc) ? byNpc.get(voice.npc) : 50;
  }
  return opinions;
}

// --- views ------------------------------------------------------------------

function endingContext(characterId) {
  const flags = readFlags(characterId);
  const doctrine = readDoctrine(characterId);
  const factionOpinions = readFactionOpinions(characterId);
  return { flags, doctrine, factionOpinions };
}

function partyState(characterId) {
  const living = activeMembers(characterId).map((m) => ({ id: m.id, name: m.name }));
  const fallen = fallenMembers(characterId).map((m) => ({ id: m.id, name: m.name }));
  return { living, fallen };
}

// The gate the service enforces: the chapter flags, the G8 spire unlock, and a
// living party to walk into the Spire. The Посох Пастыря is the boss's trophy,
// claimed on a win, so it is reported but not required to enter.
function finaleRequirements(characterId, flags, livingCount) {
  const gate = finalGateStatus(flags);
  return {
    ready: gate.ready && hasUnlock(characterId, SPIRE_UNLOCK) && livingCount > 0,
    requirements: [
      ...gate.requirements,
      { key: SPIRE_UNLOCK, label: `Открыты подступы к «${FINAL_LOCATION}»`, met: hasUnlock(characterId, SPIRE_UNLOCK) },
      { key: 'party', label: 'Живой отряд за спиной', met: livingCount > 0 },
    ],
  };
}

function bossView() {
  const boss = getMonsterByName(FINAL_BOSS);
  if (!boss) return null;
  return {
    id: boss.id, name: boss.name, description: boss.description, level: boss.level,
    maxHp: boss.max_hp, attack: boss.attack, defense: boss.defense,
  };
}

export function getActiveFinalBattle(characterId) {
  const row = getDb().prepare(
    `SELECT id, status FROM battles WHERE character_id = ? AND kind = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
  ).get(characterId, FINAL_BATTLE_KIND);
  return row || null;
}

// The most recent won finale, if any. The Посох Пастыря is claimed from it.
function wonFinalBattle(characterId) {
  return getDb().prepare(
    `SELECT id FROM battles WHERE character_id = ? AND kind = ? AND status = 'won' ORDER BY id DESC LIMIT 1`,
  ).get(characterId, FINAL_BATTLE_KIND) || null;
}

// The full campaign screen: the chapters and their flags, the finale gate, the
// current ending and its epilogue.
export function getProgress(characterId) {
  const character = requireCharacter(characterId);
  deriveProgress(characterId);
  const { flags, doctrine, factionOpinions } = endingContext(characterId);
  const chapters = flagStatuses(flags);
  const ending = resolveEnding({ flags, doctrine, factionOpinions });
  const party = partyState(characterId);
  const battle = getActiveFinalBattle(characterId);
  const won = wonFinalBattle(characterId);
  const metChapters = chapters.filter((c) => c.met);
  const finale = finaleRequirements(characterId, flags, party.living.length);

  return {
    character: { id: character.id, name: character.name, level: character.level, gold: character.gold, fate: character.fate },
    chapters,
    currentChapter: metChapters.length ? metChapters[metChapters.length - 1].chapter : null,
    metCount: metChapters.length,
    totalCount: FLAG_ORDER.length,
    flags,
    doctrine: doctrineInfo(doctrine),
    finale: {
      ready: finale.ready,
      requirements: finale.requirements,
      missing: finale.requirements.filter((r) => !r.met).map((r) => r.key),
      kind: FINAL_BATTLE_KIND,
      location: FINAL_LOCATION,
      boss: bossView(),
      trophy: { key: FINAL_TROPHY, ...itemInfo(FINAL_TROPHY) },
      haveTrophy: hasItem(characterId, FINAL_TROPHY),
      canClaim: !!won && !hasItem(characterId, FINAL_TROPHY),
      won: !!won,
      partySize: party.living.length,
      battle,
    },
    ending,
    epilogue: buildEpilogue({ heroName: character.name, ...party, factionOpinions }, ending.key),
  };
}

// The ending preview on its own: every path, whether it is open, and the
// strongest one the current state produces.
export function getEndingPreview(characterId) {
  const character = requireCharacter(characterId);
  deriveProgress(characterId);
  const { flags, doctrine, factionOpinions } = endingContext(characterId);
  const candidates = endingCandidates({ flags, doctrine, factionOpinions });
  const ending = resolveEnding({ flags, doctrine, factionOpinions });
  const party = partyState(characterId);
  return {
    character: { id: character.id, name: character.name },
    doctrine: doctrineInfo(doctrine),
    flags,
    order: ENDING_ORDER,
    candidates: ENDING_ORDER.map((k) => candidates[k]),
    ending,
    epilogue: buildEpilogue({ heroName: character.name, ...party, factionOpinions }, ending.key),
  };
}

// --- the final battle -------------------------------------------------------

// Open the finale: the Spire door with the war truth and a founded clan, and a
// living party at the hero's back. The boss is fought as `campaign_final`, never
// spawned on the normal map; his Посох Пастыря is the trophy, claimed on a win.
export function startFinalBattle(characterId) {
  const character = requireCharacter(characterId);
  if (character.fate === 'dead') throw new Error('Герой пал — финал для него закрыт');
  deriveProgress(characterId);
  const flags = readFlags(characterId);
  const living = activeMembers(characterId).length;
  const finale = finaleRequirements(characterId, flags, living);
  if (!finale.ready) {
    throw new Error(`Финал закрыт: ${finale.requirements.filter((r) => !r.met).map((r) => r.label.toLowerCase()).join('; ')}`);
  }
  if (getActiveFinalBattle(characterId)) throw new Error('Финальный бой уже идёт — завершите начатый');
  const boss = getMonsterByName(FINAL_BOSS);
  if (!boss) throw new Error('Костяной Пастырь недоступен');

  const battle = startBattle({ characterId, kind: FINAL_BATTLE_KIND, opponent: boss });
  return {
    battleId: battle.id,
    kind: FINAL_BATTLE_KIND,
    boss: { id: boss.id, name: boss.name, level: boss.level },
    location: FINAL_LOCATION,
  };
}

// Claim the Посох Пастыря from a won finale. Granted by the campaign (not by a
// G8 reward), once, so the trophy is honestly the boss's.
export function claimTrophy(characterId) {
  requireCharacter(characterId);
  const won = wonFinalBattle(characterId);
  if (!won) throw new Error('Сначала одолейте Костяного Пастыря в финале');
  if (hasItem(characterId, FINAL_TROPHY)) throw new Error('Посох Пастыря уже у вас');
  grantItem(characterId, FINAL_TROPHY, 1);
  return { battleId: won.id, item: { key: FINAL_TROPHY, ...itemInfo(FINAL_TROPHY), qty: 1 } };
}
