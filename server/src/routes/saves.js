import { Router } from 'express';
import {
  listSaves, getSave, createSave, loadSave, deleteSave, exportSave, importSave,
} from '../services/saves.js';

const router = Router();

// Import an exported snapshot: into an existing hero when characterId is given,
// otherwise as a brand-new one. Defined before /:characterId so it is not read
// as an id.
router.post('/import', (req, res) => {
  try {
    const { snapshot, characterId } = req.body || {};
    if (!snapshot) throw new Error('Требуется snapshot');
    res.status(201).json(importSave(snapshot, { characterId }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Named slots for one character.
router.get('/:characterId', (req, res) => {
  try { res.json(listSaves(Number(req.params.characterId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.post('/:characterId', (req, res) => {
  try { res.status(201).json(createSave(Number(req.params.characterId), req.body?.name)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// One slot: metadata, export (full snapshot) and load.
router.get('/slot/:saveId', (req, res) => {
  const save = getSave(Number(req.params.saveId));
  if (!save) return res.status(404).json({ error: 'Сохранение не найдено' });
  return res.json(save);
});

router.get('/slot/:saveId/export', (req, res) => {
  try { res.json(exportSave(Number(req.params.saveId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.post('/slot/:saveId/load', (req, res) => {
  try { res.json(loadSave(Number(req.params.saveId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.delete('/slot/:saveId', (req, res) => {
  const ok = deleteSave(Number(req.params.saveId));
  if (!ok) return res.status(404).json({ error: 'Сохранение не найдено' });
  return res.status(204).end();
});

export default router;
