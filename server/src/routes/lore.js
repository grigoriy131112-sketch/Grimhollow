import { Router } from 'express';
import { listLore, getLore } from '../services/lore.js';

const router = Router();

// The canon index for the "Лор" page.
router.get('/', (req, res) => res.json(listLore()));

// One document, parsed into sections/blocks.
router.get('/:key', (req, res) => {
  try { res.json(getLore(req.params.key)); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

export default router;
