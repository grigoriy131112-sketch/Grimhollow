import { Router } from 'express';
import { getTree, spendUpgrade, getPoints } from '../services/upgrades.js';

const router = Router();

// The whole tree as the client draws it: points, every node's rank, cost and
// whether it can be taken right now.
router.get('/:leaderId', (req, res) => {
  try { res.json(getTree(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Just the balance, for the party strip.
router.get('/:leaderId/points', (req, res) => {
  try { res.json({ points: getPoints(Number(req.params.leaderId)) }); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Forge one rank of a node; returns the fresh tree.
router.post('/:leaderId/spend', (req, res) => {
  try {
    const { node } = req.body || {};
    if (!node) throw new Error('Требуется node');
    res.json(spendUpgrade(Number(req.params.leaderId), node));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
