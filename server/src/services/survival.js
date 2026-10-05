// Survival persistence and orchestration (Wave G3). The meters live on the
// character (a `character_survival` row, one per hero) and their debuffs are
// stored in the existing G2 `character_buffs` table through services/items.js.
// There is deliberately no second buff system: this service reads/writes the
// meters, then calls applyBuff / removeBuff so the modifier engine stays the
// single source of truth for effective stats.
//
// The pure rules (thresholds, rates, item values) live in game/survival.js.

import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { applyBuff, removeBuff, listBuffs, activeModifiers } from './items.js';
import {
  NEEDS, normalizeMeters, advanceTravelMeters, advanceTurnMeters, restMeters,
  applyConsumable, needModifiersFromMeters, needSummary, needStatTotals,
  hasNeedDebuff, FOOD_VALUES, DRINK_VALUES,
} from '../game/survival.js';

const SOURCE_PREFIX = 'need:';

function requireCharacter(characterId) {
  const c = getCharacter(characterId);
  if (!c) throw new Error('Персонаж не найден');
  return c;
}

// Read a hero's meters, defaulting to sated when the row does not exist yet.
export function getMeters(characterId) {
  const row = getDb().prepare('SELECT hunger, thirst, fatigue FROM character_survival WHERE character_id = ?')
    .get(characterId);
  if (!row) return normalizeMeters({});
  return normalizeMeters(row);
}

// Write a hero's meters back, clamped. The row is created on first write.
export function setMeters(characterId, meters) {
  requireCharacter(characterId);
  const next = normalizeMeters(meters);
  getDb().prepare(
    `INSERT INTO character_survival (character_id, hunger, thirst, fatigue, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(character_id) DO UPDATE SET
       hunger = excluded.hunger, thirst = excluded.thirst, fatigue = excluded.fatigue,
       updated_at = datetime('now')`,
  ).run(characterId, next.hunger, next.thirst, next.fatigue);
  return next;
}

// Re-derive the need debuffs from the meters and store them in character_buffs.
// Every need is rewritten from scratch so a recovered meter cannot leave a stale
// row behind; the pure engine decides which tiers are active.
export function syncNeedBuffs(characterId, meters = getMeters(characterId)) {
  const norm = normalizeMeters(meters);
  // Drop every need source first, then re-add the tiers that are active now, so
  // a recovered meter cannot leave a stale debuff row behind.
  for (const need of NEEDS) removeBuff(characterId, { source: `${SOURCE_PREFIX}${need}` });
  let buffs = listBuffs(characterId);
  for (const mod of needModifiersFromMeters(norm)) buffs = applyBuff(characterId, mod);
  return buffs;
}

// --- integration hooks ------------------------------------------------------

// A journey of `minutes` game minutes: hunger, thirst and fatigue climb.
export function advanceOnTravel(characterId, minutes) {
  const meters = advanceTravelMeters(getMeters(characterId), minutes);
  setMeters(characterId, meters);
  syncNeedBuffs(characterId, meters);
  return meters;
}

// One of the owner's combat turns: the meters creep up.
export function advanceOnTurn(characterId) {
  const meters = advanceTurnMeters(getMeters(characterId));
  setMeters(characterId, meters);
  syncNeedBuffs(characterId, meters);
  return meters;
}

// A rest (inn, tavern, camp): fatigue is wiped, hunger and thirst ease.
export function rest(characterId) {
  const meters = restMeters(getMeters(characterId));
  setMeters(characterId, meters);
  syncNeedBuffs(characterId, meters);
  return meters;
}

// Eat or drink a catalogue item: lowers the matching meter. The item itself is
// spent by the caller (services/items.js#useConsumable handles resources and
// buffs); this only moves the survival meters. Unknown keys change nothing.
export function consume(characterId, itemKey) {
  const { meters, fed, drank } = applyConsumable(getMeters(characterId), itemKey);
  setMeters(characterId, meters);
  syncNeedBuffs(characterId, meters);
  return { meters, fed, drank };
}

// Is this key food and/or drink? Used by the caller to decide whether to run
// the consumable through the survival path.
export function isSurvivalConsumable(itemKey) {
  return !!(FOOD_VALUES[itemKey] || DRINK_VALUES[itemKey]);
}

// --- views ------------------------------------------------------------------

// The full survival screen: meters, their tiers, the active need debuffs and
// the total stat change they impose.
export function getSurvivalView(characterId) {
  const character = requireCharacter(characterId);
  const meters = getMeters(characterId);
  const needs = needSummary(meters);
  const needBuffs = listBuffs(characterId).filter((b) => b.sourceType === 'need');
  return {
    characterId,
    name: character.name,
    meters,
    needs,
    needBuffs,
    statTotals: needStatTotals(meters),
    modifiers: activeModifiers(characterId),
    hungry: hasNeedDebuff(meters),
    food: Object.keys(FOOD_VALUES),
    drink: Object.keys(DRINK_VALUES),
  };
}
