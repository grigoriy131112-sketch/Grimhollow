import { Router } from 'express';
import {
  getProgress, getEndingPreview, setFlag, deriveProgress, startFinalBattle, claimTrophy,
} from '../services/campaign.js';

const router = Router();

// The campaign screen: chapters and flags, the finale gate and the current ending.
router.get('/:characterId', (req, res) => {
  try { res.json(getProgress(Number(req.params.characterId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// The three endings: which are open and which the current state produces.
router.get('/:characterId/ending', (req, res) => {
  try { res.json(getEndingPreview(Number(req.params.characterId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Set a chapter flag (a branch, the clan, or the player reporting progress).
router.post('/:characterId/flag', (req, res) => {
  try {
    const flag = req.body?.flag;
    if (!flag) throw new Error('Нужен flag');
    res.status(201).json(setFlag(Number(req.params.characterId), flag, req.body?.source));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Re-read the G8 quest completions and fold the implied flags in.
router.post('/:characterId/derive', (req, res) => {
  try { res.json(deriveProgress(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Open the finale: the Black Spire door and the Костяной Пастырь.
router.post('/:characterId/final', (req, res) => {
  try { res.status(201).json(startFinalBattle(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Claim the Посох Пастыря from a won finale.
router.post('/:characterId/trophy', (req, res) => {
  try { res.json(claimTrophy(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
