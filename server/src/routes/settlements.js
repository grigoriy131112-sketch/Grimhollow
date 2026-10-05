import { Router } from 'express';
import {
  listSettlements, getSettlement, getSettlementByLocation, getBuilding,
} from '../services/settlements.js';

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

export default router;
