import { Router } from 'express';
import {
  listQuests, getQuestView, acceptQuest, abandonQuest, reportProgress,
  advanceQuest, completeQuest, failQuest,
} from '../services/quests.js';

const router = Router();

// The whole quest log for a hero: available, active, completed, failed, unlocks.
router.get('/:characterId', (req, res) => {
  try { res.json(listQuests(Number(req.params.characterId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// One quest with the hero's progress on it.
router.get('/:characterId/quest/:key', (req, res) => {
  const view = getQuestView(Number(req.params.characterId), req.params.key);
  if (!view) return res.status(404).json({ error: 'Задание не найдено' });
  return res.json(view);
});

// Take a quest from the pool.
router.post('/:characterId/accept', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key задания');
    res.status(201).json(acceptQuest(Number(req.params.characterId), String(key)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Give a quest up; it returns to the pool.
router.post('/:characterId/abandon', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key задания');
    res.json(abandonQuest(Number(req.params.characterId), String(key)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// The player reports a step done (the "I did it" button).
router.post('/:characterId/progress', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен key задания');
    res.json(reportProgress(Number(req.params.characterId), String(key), req.body?.amount));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Another system reports a world event; every matching active quest advances.
router.post('/:characterId/advance', (req, res) => {
  try {
    const { type, target, item, count } = req.body || {};
    res.json({ advanced: advanceQuest(Number(req.params.characterId), { type, target, item, count }) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Force-complete an active quest and pay its reward.
router.post('/:characterId/quest/:key/complete', (req, res) => {
  try { res.json(completeQuest(Number(req.params.characterId), req.params.key)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Fail an active quest. A key story quest returns to the pool; a side quest is
// lost and its giver's opinion drops.
router.post('/:characterId/quest/:key/fail', (req, res) => {
  try { res.json(failQuest(Number(req.params.characterId), req.params.key)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
