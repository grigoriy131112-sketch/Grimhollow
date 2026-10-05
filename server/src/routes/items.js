import { Router } from 'express';
import {
  listItems, getInventory, equipItem, unequipItem,
  applyBuff, removeBuff, useConsumable, tickBuffs, listBuffs, activeModifiers,
} from '../services/items.js';
import { ITEM_TYPES, RARITIES, EQUIP_SLOTS, SLOT_ORDER } from '../game/items.js';

const router = Router();

// The whole inventory screen in one call: carried items, worn equipment, active
// buffs/debuffs and the effective stats they produce.
router.get('/:characterId', (req, res) => {
  try {
    const view = getInventory(Number(req.params.characterId));
    if (!view) return res.status(404).json({ error: 'Персонаж не найден' });
    res.json(view);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Just the bag, for other screens (the character sheet already reads this via
// the world router; this keeps the item API self-contained).
router.get('/:characterId/items', (req, res) => {
  try { res.json(listItems(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// The active modifiers on their own.
router.get('/:characterId/modifiers', (req, res) => {
  try {
    res.json({ modifiers: activeModifiers(Number(req.params.characterId)) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:characterId/buffs', (req, res) => {
  try { res.json(listBuffs(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Put on a carried item.
router.post('/:characterId/equip', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key предмета');
    res.json({ equipped: equipItem(Number(req.params.characterId), String(key)) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Take off whatever fills a slot.
router.post('/:characterId/unequip', (req, res) => {
  try {
    const slot = req.body?.slot;
    if (!slot) throw new Error('Нужен slot');
    res.json({ equipped: unequipItem(Number(req.params.characterId), String(slot)) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Apply a buff or debuff (used by abilities and by G3 needs later).
router.post('/:characterId/buffs', (req, res) => {
  try {
    res.status(201).json({ buffs: applyBuff(Number(req.params.characterId), req.body || {}) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Remove a modifier by source (and optionally key).
router.delete('/:characterId/buffs', (req, res) => {
  try {
    const { source, key } = req.body || {};
    if (!source && !key) throw new Error('Нужен source или key');
    res.json({ buffs: removeBuff(Number(req.params.characterId), { source, key }) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Advance every timed buff (called after a battle turn elsewhere).
router.post('/:characterId/buffs/tick', (req, res) => {
  try {
    res.json({ buffs: tickBuffs(Number(req.params.characterId), Number(req.body?.turns) || 1) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Drink/eat a consumable: applies its buff and restores its resource.
router.post('/:characterId/use', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key предмета');
    res.json(useConsumable(Number(req.params.characterId), String(key)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Static catalogue metadata for the client (types, rarities, slots).
router.get('/meta/catalog', (req, res) => {
  res.json({ types: ITEM_TYPES, rarities: RARITIES, slots: EQUIP_SLOTS, slotOrder: SLOT_ORDER });
});

export default router;
