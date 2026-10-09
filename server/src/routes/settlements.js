import { Router } from 'express';
import {
  listSettlements, getSettlement, getSettlementByLocation, getBuilding,
} from '../services/settlements.js';
import { performBuildingAction } from '../services/building_actions.js';
import { listRecipes, craft } from '../services/crafting.js';

const router = Router();

// Every settlement in the world (no buildings, for the list view).
router.get('/', (req, res) => res.json(listSettlements()));

// The settlement standing on a given location, or 404 if there is none.
router.get('/by-location/:locationId', (req, res) => {
  const settlement = getSettlementByLocation(Number(req.params.locationId));
  if (!settlement) return res.status(404).json({ error: 'Здесь нет поселения' });
  return res.json(settlement);
});

// One settlement with its buildings, actions and stock.
router.get('/:id', (req, res) => {
  const settlement = getSettlement(Number(req.params.id));
  if (!settlement) return res.status(404).json({ error: 'Поселение не найдено' });
  return res.json(settlement);
});

// A single building: what the player can do here, and what is on the shelf.
router.get('/buildings/:buildingId', (req, res) => {
  const building = getBuilding(Number(req.params.buildingId));
  if (!building) return res.status(404).json({ error: 'Здание не найдено' });
  return res.json(building);
});

// Perform one building action (тост, молитва, контракт, ночлег…). The action
// list the building carries is the menu; this is what actually happens.
router.post('/buildings/:buildingId/action', (req, res) => {
  try {
    const characterId = Number(req.body?.characterId);
    const action = String(req.body?.action || '');
    if (!characterId) throw new Error('Требуется characterId');
    res.json(performBuildingAction(characterId, Number(req.params.buildingId), action));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// The smithy's recipe book with live affordability.
router.get('/buildings/:buildingId/recipes', (req, res) => {
  try {
    const characterId = Number(req.query.characterId);
    if (!characterId) throw new Error('Требуется characterId');
    res.json(listRecipes(characterId));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Forge one recipe.
router.post('/buildings/:buildingId/craft', (req, res) => {
  try {
    const characterId = Number(req.body?.characterId);
    const recipe = String(req.body?.recipe || '');
    if (!characterId) throw new Error('Требуется characterId');
    res.json(craft(characterId, recipe));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
