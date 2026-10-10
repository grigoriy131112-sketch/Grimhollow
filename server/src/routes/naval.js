import { Router } from 'express';
import {
  startNavalBattle, getNavalView, getNavalPreview, takeNavalTurn, fleeNavalBattle,
  getPapers, setPapersNotes, startVoyage, getVoyageView, resolveVoyageStop,
  putInIsland, sailPastIsland, leaveIsland, searchIsland,
} from '../services/naval.js';

const router = Router();

// --- sea battles -------------------------------------------------------------

// Open a fight. Without a `tier` the enemy scales to the ship's own level.
router.post('/:characterId/battle', (req, res) => {
  try {
    const { kind, tier } = req.body || {};
    res.status(201).json(startNavalBattle(Number(req.params.characterId), {
      kind, tier: tier != null ? Number(tier) : undefined,
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/battle/:id', (req, res) => {
  const view = getNavalView(Number(req.params.id));
  if (!view) return res.status(404).json({ error: 'Морской бой не найден' });
  return res.json(view);
});

router.get('/battle/:id/preview', (req, res) => {
  const action = { type: req.query.action || 'broadside', abilityId: req.query.abilityId };
  const preview = getNavalPreview(Number(req.params.id), action);
  if (!preview) return res.status(404).json({ error: 'Морской бой не найден' });
  return res.json(preview);
});

router.post('/battle/:id/action', (req, res) => {
  try { res.json(takeNavalTurn(Number(req.params.id), (req.body || {}).action || { type: 'broadside' })); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/battle/:id/flee', (req, res) => {
  try { res.json(fleeNavalBattle(Number(req.params.id))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// --- the papers --------------------------------------------------------------

router.get('/:characterId/papers', (req, res) => {
  try { res.json(getPapers(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:characterId/papers', (req, res) => {
  try { res.json(setPapersNotes(Number(req.params.characterId), (req.body || {}).notes)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// --- voyages -----------------------------------------------------------------

router.post('/:characterId/voyage', (req, res) => {
  try {
    const { fromId, toId } = req.body || {};
    res.status(201).json(startVoyage({
      characterId: Number(req.params.characterId),
      fromId: Number(fromId),
      toId: Number(toId),
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:characterId/voyage', (req, res) => {
  try {
    const view = getVoyageView(Number(req.params.characterId));
    if (!view) return res.status(404).json({ error: 'Нет активного плавания' });
    return res.json(view);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:characterId/voyage/resolve', (req, res) => {
  try { res.json(resolveVoyageStop(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// --- islands (W-ISLES) -------------------------------------------------------

// Accept the sea's offer and put in at the stop's island.
router.post('/:characterId/voyage/put-in', (req, res) => {
  try { res.json(putInIsland(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Refuse the island and hold the course.
router.post('/:characterId/voyage/sail-past', (req, res) => {
  try { res.json(sailPastIsland(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Push off the island and put back to sea.
router.post('/:characterId/voyage/leave-island', (req, res) => {
  try { res.json(leaveIsland(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Search the island's hoard (once).
router.post('/:characterId/voyage/search', (req, res) => {
  try { res.json(searchIsland(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
