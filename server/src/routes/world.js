import { Router } from 'express';
import { getWorld, getMap, getLocation, listMonsters, getBestiary, recordVisited } from '../services/world.js';
import { listItems } from '../services/items.js';

const router = Router();

router.get('/', (req, res) => res.json(getWorld()));
router.get('/map', (req, res) => {
  const characterId = Number(req.query.characterId) || null;
  res.json(getMap(characterId));
});
router.get('/monsters', (req, res) => res.json(listMonsters()));
router.get('/bestiary', (req, res) => res.json(getBestiary()));
router.get('/locations/:id', (req, res) => {
  const loc = getLocation(Number(req.params.id));
  if (!loc) return res.status(404).json({ error: 'Локация не найдена' });
  res.json(loc);
});
// A place the party has seen is remembered for the fog of war. This must NOT
// move the party: opening a place to read about it is not travel. Walking a
// road (and only that) moves the party, and the drowned chapel yields the key
// when the party actually arrives there (see services/travel.js).
router.post('/locations/:id/visit', (req, res) => {
  const characterId = Number(req.body?.characterId);
  if (!characterId) return res.status(400).json({ error: 'Нужен characterId' });
  const { firstVisit } = recordVisited(characterId, Number(req.params.id));
  res.json({ ok: true, firstVisit });
});
// What the hero carries, for the sheet and the ritual screen.
router.get('/characters/:characterId/items', (req, res) => {
  res.json(listItems(Number(req.params.characterId)));
});

export default router;
