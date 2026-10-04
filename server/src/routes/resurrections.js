import { Router } from 'express';
import { getRitual, startResurrection } from '../services/resurrections.js';

const router = Router();

// The ritual screen: who has fallen and what the death realm holds.
router.get('/:leaderId', (req, res) => {
  try { res.json(getRitual(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Open the gate for one fallen companion and begin the boss fight.
router.post('/:leaderId/start', (req, res) => {
  try {
    const memberId = Number(req.body?.memberId);
    if (!memberId) throw new Error('Нужен memberId');
    res.status(201).json(startResurrection(Number(req.params.leaderId), memberId));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
