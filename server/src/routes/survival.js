import { Router } from 'express';
import {
  getSurvivalView, advanceOnTravel, advanceOnTurn, rest, consume,
} from '../services/survival.js';

const router = Router();

// The survival screen: meters, tiers, active need debuffs and their totals.
router.get('/:characterId', (req, res) => {
  try { res.json(getSurvivalView(Number(req.params.characterId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Advance the meters over a journey of `minutes` game minutes.
router.post('/:characterId/travel', (req, res) => {
  try {
    const minutes = Number(req.body?.minutes) || 0;
    res.json({ meters: advanceOnTravel(Number(req.params.characterId), minutes) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Advance the meters by one of the owner's combat turns.
router.post('/:characterId/turn', (req, res) => {
  try { res.json({ meters: advanceOnTurn(Number(req.params.characterId)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Rest: wipe fatigue, ease hunger and thirst.
router.post('/:characterId/rest', (req, res) => {
  try { res.json({ meters: rest(Number(req.params.characterId)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Eat or drink a catalogue item to lower hunger and/or thirst.
router.post('/:characterId/consume', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key предмета');
    res.json(consume(Number(req.params.characterId), String(key)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
