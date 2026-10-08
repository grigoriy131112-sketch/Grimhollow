import { Router } from 'express';
import { getShipView, buyShip, startWork, awardShipPoints } from '../services/ship.js';

const router = Router();

// The ship, its tree and any job at the dock. Without a ship, `owned` is false
// and the view still tells the client whether the hero stands in a port.
router.get('/:characterId', (req, res) => {
  try { res.json(getShipView(Number(req.params.characterId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Buy a ship in the port you are standing in.
router.post('/:characterId/buy', (req, res) => {
  try {
    const { name } = req.body || {};
    res.json(buyShip(Number(req.params.characterId), { name }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Forge one component level, or raise the ship's own level. `hired` pays gold to
// halve the dock time.
router.post('/:characterId/upgrade', (req, res) => {
  try {
    const { key, levelUp, hired } = req.body || {};
    res.json(startWork(Number(req.params.characterId), { upgradeKey: key, levelUp: !!levelUp, hired: !!hired }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// W-SEA's hook: a won sea battle pays ship points. Kept here so the payout rule
// lives with the ship, not with the future naval battle.
router.post('/:characterId/points', (req, res) => {
  try {
    const { amount } = req.body || {};
    res.json({ points: awardShipPoints(Number(req.params.characterId), amount) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
