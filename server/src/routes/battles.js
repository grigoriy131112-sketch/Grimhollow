import { Router } from 'express';
import { startBattle, getBattleView, takeTurn, getAbilityPreview } from '../services/battles.js';

const router = Router();

router.post('/', (req, res) => {
  try {
    const { characterId, monsterId, locationId } = req.body || {};
    if (!characterId) throw new Error('characterId is required');
    res.status(201).json(startBattle({
      characterId: Number(characterId),
      monsterId: monsterId ? Number(monsterId) : undefined,
      locationId: locationId ? Number(locationId) : undefined,
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  const view = getBattleView(Number(req.params.id));
  if (!view) return res.status(404).json({ error: 'Battle not found' });
  return res.json(view);
});

router.get('/:id/preview', (req, res) => {
  const preview = getAbilityPreview(Number(req.params.id), req.query.abilityId || 'basic', req.query.targetKey);
  if (!preview) return res.status(404).json({ error: 'Battle not found' });
  return res.json(preview);
});

router.post('/:id/action', (req, res) => {
  try { res.json(takeTurn(Number(req.params.id), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
