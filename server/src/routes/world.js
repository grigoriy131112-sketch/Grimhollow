import { Router } from 'express';
import { getWorld, getMap, getLocation, listMonsters, recordVisit } from '../services/world.js';
import { grantItem, listItems } from '../services/items.js';
import { RITUAL_ITEM, itemInfo } from '../game/items.js';
import { RITUAL_SITE } from '../game/revival.js';

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
// The party has arrived somewhere: reveal it on the map. Standing in the
// drowned chapel for the first time yields the key the ritual needs.
router.post('/locations/:id/visit', (req, res) => {
  const characterId = Number(req.body?.characterId);
  if (!characterId) return res.status(400).json({ error: 'Нужен characterId' });
  const { firstVisit } = recordVisit(characterId, Number(req.params.id));
  const loc = getLocation(Number(req.params.id));
  let found = null;
  if (firstVisit && loc && loc.name === RITUAL_SITE) {
    grantItem(characterId, RITUAL_ITEM, 1);
    found = { key: RITUAL_ITEM, ...itemInfo(RITUAL_ITEM) };
  }
  res.json({ ok: true, firstVisit, found });
});
// What the hero carries, for the sheet and the ritual screen.
router.get('/characters/:characterId/items', (req, res) => {
  res.json(listItems(Number(req.params.characterId)));
});

export default router;
