import { Router } from 'express';
import { getWorld, getMap, getLocation, listMonsters, recordVisit } from '../services/world.js';

const router = Router();

router.get('/', (req, res) => res.json(getWorld()));
router.get('/map', (req, res) => {
  const characterId = Number(req.query.characterId) || null;
  res.json(getMap(characterId));
});
router.get('/monsters', (req, res) => res.json(listMonsters()));
router.get('/locations/:id', (req, res) => {
  const loc = getLocation(Number(req.params.id));
  if (!loc) return res.status(404).json({ error: 'Локация не найдена' });
  res.json(loc);
});
// The party has arrived somewhere: reveal it on the map.
router.post('/locations/:id/visit', (req, res) => {
  const characterId = Number(req.body?.characterId);
  if (!characterId) return res.status(400).json({ error: 'Нужен characterId' });
  recordVisit(characterId, Number(req.params.id));
  res.json({ ok: true });
});

export default router;
