import { getDb } from '../db/index.js';
import { deriveCharacter, validateCharacterInput, levelFromXp } from '../game/rules.js';

export function listCharacters() {
  return getDb().prepare('SELECT * FROM characters ORDER BY created_at DESC').all().map(deriveCharacter);
}

export function getCharacter(id) {
  const row = getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  return row ? deriveCharacter(row) : null;
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
