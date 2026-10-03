import { Router } from 'express';
import { getWorld, getMap, getLocation, listMonsters } from '../services/world.js';

const router = Router();

router.get('/', (req, res) => res.json(getWorld()));
router.get('/map', (req, res) => res.json(getMap()));
router.get('/monsters', (req, res) => res.json(listMonsters()));
router.get('/locations/:id', (req, res) => {
  const loc = getLocation(Number(req.params.id));
  if (!loc) return res.status(404).json({ error: 'Локация не найдена' });
  res.json(loc);
});

export default router;
