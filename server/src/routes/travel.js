import { Router } from 'express';
import { startTravel, getTravelView, chooseTravel } from '../services/travel.js';

const router = Router();

// Tests may pass an explicit clock (`now`) to drive the road deterministically;
// real players leave it out and the server's own clock is used.
const clockFrom = (body) => (Number.isFinite(body?.now) ? Number(body.now) : undefined);

// Begin a trip between two neighbouring places.
router.post('/', (req, res) => {
  try {
    const { characterId, fromId, toId } = req.body || {};
    if (!characterId || !fromId || !toId) throw new Error('Нужны characterId, fromId и toId');
    res.status(201).json(startTravel({
      characterId: Number(characterId), fromId: Number(fromId), toId: Number(toId), now: clockFrom(req.body),
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// The road as it stands right now — the walk advances with the real clock.
router.get('/:id', (req, res) => {
  const view = getTravelView(Number(req.params.id), clockFrom(req.query));
  if (!view) return res.status(404).json({ error: 'Путь не найден' });
  return res.json(view);
});

// Answer the encounter that has stopped the party.
router.post('/:id/choose', (req, res) => {
  try {
    const choice = req.body?.choice;
    if (!choice) throw new Error('Нужен выбор');
    const result = chooseTravel(Number(req.params.id), choice, clockFrom(req.body));
    if (!result) throw new Error('Путь не найден');
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
