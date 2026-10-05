// Character inventory, equipment and active buffs/debuffs (Wave G2). The item
// catalogue is pure (game/items.js); the effective-stat math is pure
// (game/modifiers.js). This service is only the I/O layer:
//   character_items      — what is carried (a key and a quantity)
//   character_equipment  — which item fills each slot
//   character_buffs      — active temporary modifiers (buffs and debuffs)

import { getDb, transaction } from '../db/index.js';
import { itemInfo, isEquipment, isConsumable, EQUIP_SLOTS, SLOT_ORDER } from '../game/items.js';
import {
  equipmentModifiers, addModifier, removeModifiers, tickModifiers,
  applyModifiersToSource, effectiveStats, modifierSummary, RESOURCE_MAX, RESOURCE_KEYS,
} from '../game/modifiers.js';
import { getCharacter } from './characters.js';

export function grantItem(characterId, itemKey, qty = 1) {
  getDb().prepare(
    `INSERT INTO character_items (character_id, item_key, qty) VALUES (?, ?, ?)
     ON CONFLICT(character_id, item_key) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime('now')`,
  ).run(characterId, itemKey, qty);
  return listItems(characterId);
}

export function takeItem(characterId, itemKey, qty = 1) {
  const db = getDb();
  const row = db.prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(characterId, itemKey);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM character_items WHERE character_id = ? AND item_key = ?').run(characterId, itemKey);
  } else {
    db.prepare("UPDATE character_items SET qty = qty - ?, updated_at = datetime('now') WHERE character_id = ? AND item_key = ?")
      .run(qty, characterId, itemKey);
  }
  return true;
}

export function hasItem(characterId, itemKey, qty = 1) {
  const row = getDb().prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(characterId, itemKey);
  return !!row && row.qty >= qty;
}

export function listItems(characterId) {
  return getDb().prepare('SELECT item_key, qty FROM character_items WHERE character_id = ? ORDER BY item_key')
    .all(characterId)
    .map((r) => ({ key: r.item_key, qty: r.qty, ...itemInfo(r.item_key) }));
}

// --- equipment --------------------------------------------------------------

function requireCharacter(characterId) {
  const row = getDb().prepare('SELECT id FROM characters WHERE id = ?').get(characterId);
  if (!row) throw new Error('Персонаж не найден');
  return row;
}

// slot -> item key for everything the hero currently wears.
export function getEquipment(characterId) {
  const rows = getDb().prepare('SELECT slot, item_key FROM character_equipment WHERE character_id = ?').all(characterId);
  const equipped = {};
  for (const r of rows) equipped[r.slot] = r.item_key;
  return equipped;
}

// slot -> item, with catalogue info folded in, ordered for the UI.
export function getEquipmentView(characterId) {
  const equipped = getEquipment(characterId);
  return SLOT_ORDER.map((slot) => ({
    slot,
    label: EQUIP_SLOTS[slot],
    key: equipped[slot] || null,
    item: equipped[slot] ? { key: equipped[slot], ...itemInfo(equipped[slot]) } : null,
  }));
}

// Equip an item the hero actually carries. Returns the fresh equipment map.
export function equipItem(characterId, itemKey) {
  requireCharacter(characterId);
  const item = itemInfo(itemKey);
  if (!isEquipment(item)) throw new Error('Это не снаряжение');
  if (!item.slot || !EQUIP_SLOTS[item.slot]) throw new Error('У предмета нет ячейки');
  if (!hasItem(characterId, itemKey, 1)) throw new Error('Предмета нет в сумке');

  getDb().prepare(
    `INSERT INTO character_equipment (character_id, slot, item_key) VALUES (?, ?, ?)
     ON CONFLICT(character_id, slot) DO UPDATE SET item_key = excluded.item_key, updated_at = datetime('now')`,
  ).run(characterId, item.slot, itemKey);
  return getEquipment(characterId);
}

// Take off whatever fills a slot.
export function unequipItem(characterId, slot) {
  requireCharacter(characterId);
  getDb().prepare('DELETE FROM character_equipment WHERE character_id = ? AND slot = ?').run(characterId, slot);
  return getEquipment(characterId);
}

// --- buffs and debuffs ------------------------------------------------------

function rowToModifier(r) {
  return {
    key: r.buff_key,
    source: r.source,
    sourceType: r.source_type,
    stat: r.stat,
    amount: r.amount,
    turns: r.turns,
    kind: r.kind,
    stack: r.stack,
    label: r.label,
    maxStacks: r.max_stacks ?? null,
  };
}

// Every active temporary modifier for a character.
export function listBuffs(characterId) {
  return getDb()
    .prepare('SELECT * FROM character_buffs WHERE character_id = ? ORDER BY id')
    .all(characterId)
    .map(rowToModifier);
}

// Apply a modifier to a character. `input` is a modifier-shaped object (see
// game/modifiers.js); it is normalised and stored. The stack rule may refresh,
// replace or append, so the whole list is rewritten. Returns the active buffs.
export function applyBuff(characterId, input = {}) {
  requireCharacter(characterId);
  return writeBuffList(characterId, addModifier(listBuffs(characterId), input));
}

// Persist a whole modifier list, replacing the stored rows (used after stacking
// and after a tick).
function writeBuffList(characterId, list) {
  transaction((d) => {
    d.prepare('DELETE FROM character_buffs WHERE character_id = ?').run(characterId);
    const insert = d.prepare(
      `INSERT INTO character_buffs
         (character_id, buff_key, source, source_type, stat, amount, turns, kind, stack, label, max_stacks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of list) {
      insert.run(
        characterId, m.key, m.source, m.sourceType, m.stat, m.amount,
        m.turns, m.kind, m.stack, m.label, m.maxStacks ?? null,
      );
    }
  });
  return listBuffs(characterId);
}

// Remove every modifier from one source (and optionally one key).
export function removeBuff(characterId, { source, key } = {}) {
  const next = removeModifiers(listBuffs(characterId), { source, key });
  return writeBuffList(characterId, next);
}

// Advance every finite buff by `turns`, expiring the ones that run out.
export function tickBuffs(characterId, turns = 1) {
  return writeBuffList(characterId, tickModifiers(listBuffs(characterId), turns));
}

// --- using consumables ------------------------------------------------------

// Use a carried consumable: apply its buff and/or restore its resource, then
// spend one from the bag. Returns the new buffs, the fresh character and what
// was restored.
export function useConsumable(characterId, itemKey) {
  const item = itemInfo(itemKey);
  if (!isConsumable(item)) throw new Error('Это нельзя использовать');
  if (!hasItem(characterId, itemKey, 1)) throw new Error('Предмета нет в сумке');

  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');

  let buffs = listBuffs(characterId);
  if (item.buff) {
    buffs = addModifier(buffs, {
      ...item.buff,
      key: item.buff.key || itemKey,
      source: `consumable:${itemKey}`,
      sourceType: item.buff.kind === 'debuff' ? 'debuff' : 'buff',
      label: item.name,
    });
  }

  // Resource restores are immediate, not modifiers, so they top the pools up now.
  // The cap includes equipment as well as the just-applied buff.
  const restored = {};
  const source = applyModifiersToSource(character, [
    ...equipmentModifiers(getEquipment(characterId)), ...buffs,
  ]);
  const nextResources = { hp: character.hp, mana: character.mana, stamina: character.stamina };
  const restore = (res, amount) => {
    if (!RESOURCE_KEYS.includes(res) || !amount) return;
    const max = source.stats[RESOURCE_MAX[res]];
    const before = nextResources[res];
    nextResources[res] = Math.max(0, Math.min(max, before + amount));
    restored[res] = nextResources[res] - before;
  };
  if (item.resource) {
    restore(item.resource.resource, item.resource.amount);
    if (item.resource.also) restore(item.resource.also.resource, item.resource.also.amount);
  }

  takeItem(characterId, itemKey, 1);
  writeBuffList(characterId, buffs);
  getDb().prepare(
    "UPDATE characters SET hp = ?, mana = ?, stamina = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(nextResources.hp, nextResources.mana, nextResources.stamina, characterId);

  return { buffs: listBuffs(characterId), character: getCharacter(characterId), restored };
}

// --- effective stats --------------------------------------------------------

// All modifiers currently acting on a character: equipment plus active buffs.
export function activeModifiers(characterId) {
  return [...equipmentModifiers(getEquipment(characterId)), ...listBuffs(characterId)];
}

// The character sheet with equipment and buffs folded in. Battles still use the
// raw sheet (services/characters.js#getCharacter), so a combatant is boosted
// exactly once by the battle layer; this view is for the inventory screen.
export function getInventory(characterId) {
  const character = getCharacter(characterId);
  if (!character) return null;
  const equipment = getEquipmentView(characterId);
  const buffs = listBuffs(characterId);
  const modifiers = activeModifiers(characterId);
  const boosted = applyModifiersToSource(character, modifiers);
  return {
    character: {
      id: character.id,
      name: character.name,
      className: character.className,
      level: character.level,
      gold: character.gold,
    },
    baseStats: character.stats,
    effectiveStats: effectiveStats(character.stats, modifiers),
    stats: boosted.stats,
    hp: boosted.hp,
    mana: boosted.mana,
    stamina: boosted.stamina,
    modifiers,
    summary: modifierSummary(modifiers),
    equipment,
    equipped: getEquipment(characterId),
    buffs,
    items: listItems(characterId),
  };
}

export { isEquipment, isConsumable, EQUIP_SLOTS, SLOT_ORDER };
