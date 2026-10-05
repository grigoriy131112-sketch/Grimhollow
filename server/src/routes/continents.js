import { Router } from 'express';
import {
  listContinents, getContinent, listGates, crossingsFor, startCrossing,
} from '../services/continents.js';

const router = Router();

// The five continents with their regions. `:id` accepts a numeric id or a name.
router.get('/', (req, res) => res.json(listContinents()));

// The port gates that open a crossing. Declared before `/:id` so "gates" is not
// swallowed as an id.
router.get('/gates', (req, res) => res.json(listGates()));

// Every crossing that leaves a given place.
router.get('/locations/:id/crossings', (req, res) => {
  const characterId = Number(req.query.characterId) || null;
  res.json(crossingsFor(Number(req.params.id), characterId));
});

// Sail a crossing: charge the fare and resolve what the sea does.
router.post('/cross', (req, res) => {
  try {
    const { characterId, fromId, toId } = req.body || {};
    if (!characterId || !fromId || !toId) throw new Error('Нужны characterId, fromId и toId');
    res.status(201).json(startCrossing({
      characterId: Number(characterId), fromId: Number(fromId), toId: Number(toId),
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  const raw = /^\d+$/.test(req.params.id) ? Number(req.params.id) : req.params.id;
  const continent = getContinent(raw);
  if (!continent) return res.status(404).json({ error: 'Континент не найден' });
  return res.json(continent);
});

export default router;
