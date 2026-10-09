import { getDb } from '../db/index.js';
import { deriveCharacter, validateCharacterInput, levelFromXp } from '../game/rules.js';
import { getBonuses } from './upgrades.js';
import { applyBonusesToSource } from '../game/party_upgrades.js';
import { clanPartyBonuses } from './clan.js';
import { derivedFlags, endgameUnlocksFromFlags } from '../game/campaign.js';

export function listCharacters() {
  return getDb().prepare('SELECT * FROM characters ORDER BY created_at DESC').all().map(deriveCharacter);
}

export function getCharacter(id) {
  const row = getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  return row ? deriveCharacter(row) : null;
}

// Readable summary of what the party tree currently grants, for the UI.
export function bonusSummary(bonuses) {
  return {
    roster: bonuses.roster,
    regenMana: bonuses.regenMana,
    regenStamina: bonuses.regenStamina,
    startFull: bonuses.startFull,
    percents: Object.fromEntries(
      Object.entries(bonuses.mult || {}).map(([k, v]) => [k, Math.round(v * 100)]),
    ),
  };
}

// Everything that strengthens the party, folded into one bonus shape: the party
// tree (Очки отряда) plus the clan (doctrine + holdings). Battle, sheet and party
// strip all read this, so the numbers a player reads match the numbers they
// fight with. A hero with no clan contributes nothing extra.
export function getPartyBonuses(leaderId) {
  const tree = getBonuses(leaderId);
  const clan = clanPartyBonuses(leaderId);
  const mult = { ...(tree.mult || {}) };
  for (const [k, v] of Object.entries(clan.mult || {})) mult[k] = (mult[k] || 0) + v;
  return { ...tree, mult };
}

// Grant the `chapter_N` unlocks a hero has earned, derived *live* from their
// quest completions and campaign flags instead of being written by a screen
// visit. Without this the endgame was unreachable: the clan gate (G9) reads
// `chapter_*` unlocks, and nothing in play granted them unless the campaign
// screen happened to be opened first. The clan's six chapters are the ORDINAL of
// the campaign milestones (see game/campaign.js#CLAN_CHAPTER_FLAGS).
export function syncChapterUnlocks(characterId) {
  const db = getDb();
  const completed = db.prepare(
    "SELECT quest_key FROM character_quests WHERE character_id = ? AND status = 'completed'",
  ).all(characterId).map((r) => r.quest_key);
  const flags = {};
  for (const r of db.prepare('SELECT flag FROM campaign_progress WHERE character_id = ?').all(characterId)) {
    flags[r.flag] = true;
  }
  // Derived flags do not override an explicitly-set flag, but an explicit one
  // (a branch or the clan) must count too, so merge derived on top.
  Object.assign(flags, derivedFlags(completed));
  return endgameUnlocksFromFlags(flags).filter((flag) => addUnlockRow(characterId, flag));
}

function addUnlockRow(characterId, flag) {
  const info = getDb().prepare(
    'INSERT OR IGNORE INTO character_unlocks (character_id, flag, quest_key) VALUES (?, ?, ?)',
  ).run(characterId, flag, 'campaign');
  return info.changes > 0 ? flag : null;
}

// A character's sheet with the party tree folded in: base stats plus the
// leader's bonuses, so what the player reads matches what they fight with.
// Battles call getCharacter() and apply the bonuses themselves, so they must
// keep using the raw sheet to avoid applying them twice.
export function getCharacterSheet(id) {
  const character = getCharacter(id);
  if (!character) return null;
  const bonuses = getPartyBonuses(character.id);
  const boosted = applyBonusesToSource(character, bonuses);
  return {
    ...character,
    stats: boosted.stats,
    hp: boosted.hp,
    mana: boosted.mana,
    stamina: boosted.stamina,
    bonuses: bonusSummary(bonuses),
  };
}

export function createCharacter(input) {
  const data = validateCharacterInput(input);
  const db = getDb();
  const info = db
    .prepare('INSERT INTO characters (name, class, level, xp, hp, mana, stamina, gold, portrait) VALUES (?, ?, 1, 0, NULL, NULL, NULL, 0, ?)')
    .run(data.name, data.class, data.portrait);
  return getCharacter(info.lastInsertRowid);
}

export function deleteCharacter(id) {
  return getDb().prepare('DELETE FROM characters WHERE id = ?').run(id).changes > 0;
}

// Persist post-battle results, applying level-ups and refilling the new maxima.
export function applyBattleRewards(characterId, { hp, mana, stamina, xpGained = 0, goldGained = 0 }) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!row) throw new Error('Персонаж не найден');

  const newXp = row.xp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > row.level;

  // Re-derive at the new level so maxima reflect growth, then keep current resources.
  const fresh = deriveCharacter({ ...row, level: newLevel, xp: newXp, hp: null, mana: null, stamina: null });
  const nextHp = healedFor({ value: hp, previousMax: deriveCharacter({ ...row, hp: null }).stats.maxHp, fresh, leveledUp, field: 'maxHp' });
  const nextMana = healedFor({ value: mana, previousMax: deriveCharacter({ ...row, mana: null }).stats.maxMana, fresh, leveledUp, field: 'maxMana' });
  const nextStamina = healedFor({ value: stamina, previousMax: deriveCharacter({ ...row, stamina: null }).stats.maxStamina, fresh, leveledUp, field: 'maxStamina' });

  db.prepare('UPDATE characters SET level=?, xp=?, hp=?, mana=?, stamina=?, gold=gold+?, updated_at=datetime(\'now\') WHERE id=?')
    .run(newLevel, newXp, nextHp, nextMana, nextStamina, goldGained, characterId);

  return { xp: newXp, level: newLevel, leveledUp, hp: nextHp };
}

// On level-up, carry the player to full on the new scale; otherwise clamp.
function healedFor({ value, fresh, leveledUp, field }) {
  if (value === null || value === undefined) return fresh.stats[field];
  if (leveledUp) return fresh.stats[field];
  return Math.max(0, Math.min(value, fresh.stats[field]));
}
