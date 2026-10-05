import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import {
  grantItem, listItems, getEquipment, equipItem, unequipItem, getEquipmentView,
  applyBuff, listBuffs, removeBuff, tickBuffs, useConsumable, activeModifiers, getInventory,
} from '../src/services/items.js';
import {
  ITEMS, ITEM_TYPES, RARITIES, EQUIP_SLOTS, SLOT_ORDER, RITUAL_ITEM, itemInfo,
  isEquipment, isConsumable,
} from '../src/game/items.js';
import {
  addModifier, removeModifiers, tickModifiers, equipmentModifiers, effectiveStats,
  sumModifiers, applyModifiersToSource, modifierKey, normalizeModifier,
} from '../src/game/modifiers.js';

let counter = 0;
function freshLeader() {
  counter += 1;
  return createCharacter({ name: `Герой ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
}

test.after(() => closeDb());

// --- catalogue --------------------------------------------------------------

test('every catalogue item carries a type, rarity and Russian text', () => {
  for (const [key, item] of Object.entries(ITEMS)) {
    assert.equal(item.key, key, `${key} keeps its latin key`);
    assert.ok(item.name && /[А-Яа-яЁё]/.test(item.name), `${key} has a Russian name`);
    assert.ok(item.description && /[А-Яа-яЁё]/.test(item.description), `${key} has a Russian description`);
    assert.ok(ITEM_TYPES[item.type], `${key} has a known type`);
    assert.ok(RARITIES[item.rarity], `${key} has a known rarity`);
    if (isEquipment(item)) {
      assert.ok(EQUIP_SLOTS[item.slot], `${key} has a known slot`);
      assert.ok(item.stats && Object.keys(item.stats).length > 0, `${key} grants stats`);
    }
  }
});

test('the ritual item and trophy keep working for the death realm', () => {
  assert.equal(RITUAL_ITEM, 'shepherd_key');
  assert.equal(itemInfo('shepherd_key').ritual, true);
  assert.equal(itemInfo('shepherd_crook').trophy, true);
  // Unknown keys still resolve to a harmless placeholder.
  assert.equal(itemInfo('no_such_item').name, 'no_such_item');
});

test('the catalogue covers weapons, armour, resources, artifacts and consumables', () => {
  const types = new Set(Object.values(ITEMS).map((i) => i.type));
  for (const t of ['weapon', 'armor', 'resource', 'artifact', 'consumable']) {
    assert.ok(types.has(t), `catalogue has a ${t}`);
  }
  assert.ok(SLOT_ORDER.every((s) => EQUIP_SLOTS[s]));
  assert.ok(Object.values(ITEMS).some((i) => isConsumable(i) && i.buff), 'a buffing consumable exists');
  assert.ok(Object.values(ITEMS).some((i) => isConsumable(i) && i.buff?.kind === 'debuff'), 'a debuff consumable exists');
});

// --- modifier engine (pure) -------------------------------------------------

test('effectiveStats adds modifiers to the base and floors resources at 1', () => {
  const base = { maxHp: 60, attack: 12, defense: 8, speed: 8 };
  const mods = [
    normalizeModifier({ source: 'item:a', stat: 'attack', amount: 5 }),
    normalizeModifier({ source: 'item:b', stat: 'attack', amount: -2 }),
    normalizeModifier({ source: 'item:c', stat: 'speed', amount: -100 }),
  ];
  const eff = effectiveStats(base, mods);
  assert.equal(eff.attack, 15);
  assert.equal(eff.defense, 8, 'untouched stats pass through');
  assert.equal(eff.speed, 0, 'non-resource stats never go below 0');
  const effHp = effectiveStats({ maxHp: 10 }, [normalizeModifier({ source: 'x', stat: 'maxHp', amount: -50 })]);
  assert.equal(effHp.maxHp, 1, 'a resource maximum never collapses to zero');
});

test('the refresh stack rule replaces the same source+key instead of stacking', () => {
  const a = { source: 'consumable:iron_brew', key: 'iron_brew', stat: 'defense', amount: 6, turns: 3 };
  const b = { source: 'consumable:iron_brew', key: 'iron_brew', stat: 'defense', amount: 6, turns: 5 };
  const list = addModifier(addModifier([], a), b);
  assert.equal(list.length, 1, 'the potion is refreshed, not doubled');
  assert.equal(list[0].turns, 5, 'duration is refreshed');
  assert.equal(sumModifiers(list).defense, 6);
});

test('the stack rule accumulates identical instances up to maxStacks', () => {
  const mod = { source: 'need:hunger', key: 'hunger', stat: 'attack', amount: -1, turns: null, stack: 'stack', maxStacks: 3 };
  let list = [];
  for (let i = 0; i < 5; i += 1) list = addModifier(list, mod);
  assert.equal(list.length, 3, 'capped at maxStacks');
  assert.equal(sumModifiers(list).attack, -3);
});

test('the replace rule keeps only the latest effect per stat and source type', () => {
  const first = { source: 'consumable:iron_brew', sourceType: 'buff', key: 'iron_brew', stat: 'defense', amount: 6, turns: 3, stack: 'replace' };
  const second = { source: 'consumable:stone_skin', sourceType: 'buff', key: 'stone_skin', stat: 'defense', amount: 9, turns: 3, stack: 'replace' };
  const list = addModifier(addModifier([], first), second);
  assert.equal(list.length, 1);
  assert.equal(sumModifiers(list).defense, 9, 'the stronger potion wins');
});

test('timed modifiers tick down and expire, permanent ones stay', () => {
  const timed = normalizeModifier({ source: 'b', stat: 'attack', amount: 2, turns: 2 });
  const permanent = normalizeModifier({ source: 'equipment:x', stat: 'defense', amount: 3, turns: null });
  const after1 = tickModifiers([timed, permanent], 1);
  assert.equal(after1.find((m) => m.stat === 'attack').turns, 1);
  const after2 = tickModifiers(after1, 1);
  assert.equal(after2.find((m) => m.stat === 'attack'), undefined, 'the timed buff expired');
  assert.ok(after2.find((m) => m.stat === 'defense'), 'the permanent modifier survived');
});

test('equipmentModifiers turns an equipped map into permanent modifiers', () => {
  const mods = equipmentModifiers({ weapon: 'rusty_sword', body: 'worn_leathers', ring: 'shepherd_key' });
  const totals = sumModifiers(mods);
  assert.equal(totals.attack, 3, 'rusty sword grants +3 attack');
  assert.equal(totals.defense, 3, 'worn leathers grant +3 defense');
  assert.equal(totals.evasion, 1);
  assert.ok(mods.every((m) => m.turns === null), 'equipment is permanent');
  assert.ok(mods.every((m) => m.kind === 'equipment'));
  // A non-equipment key in a slot is ignored.
  assert.equal(equipmentModifiers({ ring: 'bread_loaf' }).length, 0);
});

test('applyModifiersToSource tops a grown pool up and clamps a shrunken one', () => {
  const source = { hp: 40, mana: 5, stamina: 5, stats: { maxHp: 100, maxMana: 50, maxStamina: 50, attack: 10 } };
  const grown = applyModifiersToSource(source, [normalizeModifier({ source: 'x', stat: 'maxHp', amount: 30 })]);
  assert.equal(grown.stats.maxHp, 130);
  assert.equal(grown.hp, 70, 'the pool is topped up by the same 30');
  const shrunk = applyModifiersToSource(source, [normalizeModifier({ source: 'y', stat: 'maxHp', amount: -90 })]);
  assert.equal(shrunk.stats.maxHp, 10);
  assert.equal(shrunk.hp, 10, 'a shrunken max clamps the current value');
});

test('removeModifiers and modifierKey select by source and key', () => {
  const list = [
    normalizeModifier({ source: 'consumable:a', key: 'a', stat: 'attack', amount: 2 }),
    normalizeModifier({ source: 'consumable:a', key: 'b', stat: 'speed', amount: 2 }),
    normalizeModifier({ source: 'consumable:c', key: 'c', stat: 'defense', amount: 2 }),
  ];
  assert.equal(removeModifiers(list, { source: 'consumable:a' }).length, 1);
  assert.equal(removeModifiers(list, { source: 'consumable:a', key: 'a' }).length, 2);
  assert.equal(modifierKey(list[0]), 'consumable:a|a');
});

// --- equipment service ------------------------------------------------------

test('a hero can equip a carried item, and the slot holds one item at a time', () => {
  const leader = freshLeader();
  grantItem(leader.id, 'rusty_sword', 1);
  grantItem(leader.id, 'hunter_bow', 1);
  assert.deepEqual(getEquipment(leader.id), {});

  equipItem(leader.id, 'rusty_sword');
  assert.equal(getEquipment(leader.id).weapon, 'rusty_sword');

  // A second weapon replaces the first in the same slot.
  equipItem(leader.id, 'hunter_bow');
  assert.equal(getEquipment(leader.id).weapon, 'hunter_bow');

  unequipItem(leader.id, 'weapon');
  assert.equal(getEquipment(leader.id).weapon, undefined);

  const view = getEquipmentView(leader.id);
  assert.equal(view.length, SLOT_ORDER.length, 'every slot is listed');
  assert.ok(view.every((s) => s.item === null || s.item.key === s.key));
});

test('equipping is refused for items not carried or not equipment', () => {
  const leader = freshLeader();
  assert.throws(() => equipItem(leader.id, 'rusty_sword'), /нет в сумке/);
  grantItem(leader.id, 'bread_loaf', 1);
  assert.throws(() => equipItem(leader.id, 'bread_loaf'), /не снаряжение/);
  assert.throws(() => equipItem(999999, 'rusty_sword'), /не найден/);
});

test('equipment reaches the effective stats through the modifier engine', () => {
  const leader = freshLeader();
  grantItem(leader.id, 'rusty_sword', 1);
  grantItem(leader.id, 'worn_leathers', 1);
  equipItem(leader.id, 'rusty_sword');
  equipItem(leader.id, 'worn_leathers');

  const mods = activeModifiers(leader.id);
  const totals = sumModifiers(mods);
  assert.equal(totals.attack, 3);
  assert.equal(totals.defense, 3);

  const view = getInventory(leader.id);
  assert.equal(view.effectiveStats.attack, view.baseStats.attack + 3);
  assert.equal(view.effectiveStats.defense, view.baseStats.defense + 3);
});

// --- buffs and debuffs ------------------------------------------------------

test('applying, refreshing and removing a buff moves the effective stat', () => {
  const leader = freshLeader();
  const base = getCharacter(leader.id).stats.attack;

  applyBuff(leader.id, { key: 'bless', source: 'ability:bless', sourceType: 'buff', stat: 'attack', amount: 5, turns: 3, label: 'Благословение' });
  assert.equal(sumModifiers(activeModifiers(leader.id)).attack, 5);
  assert.equal(effectiveStats(getCharacter(leader.id).stats, activeModifiers(leader.id)).attack, base + 5);

  // Same source+key refreshes, does not stack.
  applyBuff(leader.id, { key: 'bless', source: 'ability:bless', sourceType: 'buff', stat: 'attack', amount: 5, turns: 1 });
  assert.equal(listBuffs(leader.id).length, 1);
  assert.equal(listBuffs(leader.id)[0].turns, 1);

  removeBuff(leader.id, { source: 'ability:bless' });
  assert.equal(listBuffs(leader.id).length, 0);
  assert.equal(effectiveStats(getCharacter(leader.id).stats, activeModifiers(leader.id)).attack, base);
});

test('a debuff subtracts from the stat and ticks away', () => {
  const leader = freshLeader();
  applyBuff(leader.id, { key: 'weakness', source: 'ability:weakness', sourceType: 'debuff', stat: 'defense', amount: -4, turns: 2, kind: 'debuff' });
  assert.equal(sumModifiers(activeModifiers(leader.id)).defense, -4);
  tickBuffs(leader.id, 1);
  assert.equal(listBuffs(leader.id).length, 1);
  tickBuffs(leader.id, 1);
  assert.equal(listBuffs(leader.id).length, 0, 'the debuff expired');
});

// --- consumables ------------------------------------------------------------

test('using a consumable applies its buff, restores a resource and spends one', () => {
  const leader = freshLeader();
  grantItem(leader.id, 'bitter_herb', 2);
  getDb().prepare('UPDATE characters SET hp = 5 WHERE id = ?').run(leader.id);

  const before = getCharacter(leader.id);
  const res = useConsumable(leader.id, 'bitter_herb');
  assert.ok(res.restored.hp > 0, 'the herb heals');
  assert.ok(res.character.hp > 5);
  assert.equal(listItems(leader.id).find((i) => i.key === 'bitter_herb').qty, 1, 'one was consumed');

  // A buffing draught leaves a timed modifier behind.
  grantItem(leader.id, 'shadow_draught', 1);
  useConsumable(leader.id, 'shadow_draught');
  const buff = listBuffs(leader.id).find((b) => b.key === 'shadow_draught');
  assert.ok(buff, 'the draught left an active buff');
  assert.equal(buff.stat, 'speed');
  assert.equal(buff.amount, 4);
  assert.ok(!listItems(leader.id).some((i) => i.key === 'shadow_draught'), 'the draught was spent');
});

test('using a consumable is refused when it is not carried or not usable', () => {
  const leader = freshLeader();
  assert.throws(() => useConsumable(leader.id, 'shadow_draught'), /нет в сумке/);
  grantItem(leader.id, 'rusty_sword', 1);
  assert.throws(() => useConsumable(leader.id, 'rusty_sword'), /нельзя использовать/);
});

test('the inventory view reports equipment, buffs and the effective sheet', () => {
  const leader = freshLeader();
  grantItem(leader.id, 'hunter_bow', 1);
  grantItem(leader.id, 'pallid_gauntlets', 1);
  equipItem(leader.id, 'hunter_bow');
  equipItem(leader.id, 'pallid_gauntlets');
  applyBuff(leader.id, { key: 'focus', source: 'ability:focus', stat: 'accuracy', amount: 4, turns: 3 });

  const view = getInventory(leader.id);
  assert.equal(view.equipped.weapon, 'hunter_bow');
  assert.equal(view.equipped.hands, 'pallid_gauntlets');
  assert.equal(view.effectiveStats.attack, view.baseStats.attack + 4 + 2, 'bow +4, gauntlets +2');
  assert.equal(view.effectiveStats.accuracy, view.baseStats.accuracy + 3 + 4, 'bow +3, focus +4');
  assert.ok(view.modifiers.length >= 3);
  assert.ok(view.summary.some((s) => s.stat === 'attack'));
  assert.ok(view.equipment.every((s) => typeof s.label === 'string'));
});

test('two different potions that boost the same stat refresh rather than stack', () => {
  const leader = freshLeader();
  grantItem(leader.id, 'iron_brew', 1);
  useConsumable(leader.id, 'iron_brew');
  applyBuff(leader.id, { key: 'iron_brew', source: 'consumable:iron_brew', sourceType: 'buff', stat: 'defense', amount: 6, turns: 2 });
  assert.equal(sumModifiers(activeModifiers(leader.id)).defense, 6, 'defense buff is not doubled');
});
