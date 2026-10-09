// Trade API (Wave G7). Buy and sell on a settlement building's shelf, and read
// the offers. Prices are the shelf price (buy) and half of it, rounded down
// (sell); the rule lives in services/trade.js.

import { Router } from 'express';
import {
  listOffers, getOffer, listSettlementOffers, buy, sell,
} from '../services/trade.js';

const router = Router();

// Every trading building in a settlement and what each one sells.
router.get('/settlement/:settlementId', (req, res) => {
  const characterId = req.query.characterId ? Number(req.query.characterId) : null;
  const view = listSettlementOffers(Number(req.params.settlementId), characterId);
  if (!view) return res.status(404).json({ error: 'Поселение не найдено' });
  return res.json(view);
});

// A building's shelf: what it sells and at what price.
router.get('/offers/:buildingId', (req, res) => {
  const characterId = req.query.characterId ? Number(req.query.characterId) : null;
  const view = listOffers(Number(req.params.buildingId), characterId);
  if (!view) return res.status(404).json({ error: 'Здание не найдено' });
  return res.json(view);
});

// One offer on a shelf, addressed by its shelf key.
router.get('/offers/:buildingId/:itemKey', (req, res) => {
  const characterId = req.query.characterId ? Number(req.query.characterId) : null;
  const view = getOffer(Number(req.params.buildingId), req.params.itemKey, characterId);
  if (!view) return res.status(404).json({ error: 'Такого товара нет на прилавке' });
  return res.json(view);
});

// Buy `qty` units of an offer.
router.post('/:buildingId/buy', (req, res) => {
  try {
    const { characterId, itemKey, qty } = req.body || {};
    if (!characterId) throw new Error('Нужен characterId');
    if (!itemKey) throw new Error('Нужен itemKey');
    res.json(buy(Number(req.params.buildingId), Number(characterId), String(itemKey), qty ?? 1));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Sell `qty` carried units back to an offer.
router.post('/:buildingId/sell', (req, res) => {
  try {
    const { characterId, itemKey, qty } = req.body || {};
    if (!characterId) throw new Error('Нужен characterId');
    if (!itemKey) throw new Error('Нужен itemKey');
    res.json(sell(Number(req.params.buildingId), Number(characterId), String(itemKey), qty ?? 1));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
