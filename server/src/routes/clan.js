// The player's clan API (Wave G9). The service (services/clan.js) owns the
// rules; this layer is only HTTP.

import { Router } from 'express';
import {
  getClan, foundClan, chooseDoctrine, levelUpClan, buildStructure,
  grantNames, buyNames, listHireable, hireMercenary, reviveMercenary,
  foundingRequirements,
} from '../services/clan.js';

const router = Router();

// The whole clan screen for a hero (or the founding conditions when none yet).
router.get('/leader/:leaderId', (req, res) => {
  try { res.json(getClan(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// The founding conditions alone.
router.get('/leader/:leaderId/requirements', (req, res) => {
  try { res.json(foundingRequirements(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Found the clan. Refused until the conditions hold.
router.post('/leader/:leaderId/found', (req, res) => {
  try {
    const { name, doctrine, base } = req.body || {};
    res.status(201).json(foundClan(Number(req.params.leaderId), { name, doctrine, base }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Pick the doctrine — once, and never again.
router.post('/leader/:leaderId/doctrine', (req, res) => {
  try {
    const doctrine = req.body?.doctrine;
    if (!doctrine) throw new Error('Нужен уклон');
    res.json(chooseDoctrine(Number(req.params.leaderId), String(doctrine)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Advance the clan one level.
router.post('/leader/:leaderId/level', (req, res) => {
  try { res.json(levelUpClan(Number(req.params.leaderId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Raise or upgrade a holding.
router.post('/leader/:leaderId/build', (req, res) => {
  try {
    const type = req.body?.type;
    if (!type) throw new Error('Нужен тип здания');
    res.json(buildStructure(Number(req.params.leaderId), String(type)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Earn names (a ritual or memory quest reports them) or trade gold for names.
router.post('/leader/:leaderId/names', (req, res) => {
  try {
    const amount = Math.max(1, Number(req.body?.amount) || 1);
    res.json(grantNames(Number(req.params.leaderId), amount));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/leader/:leaderId/names/buy', (req, res) => {
  try {
    const count = Math.max(1, Number(req.body?.count) || 1);
    res.json(buyNames(Number(req.params.leaderId), count));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Who the clan could hire, and the act of hiring them.
router.get('/leader/:leaderId/hireable', (req, res) => {
  try { res.json({ candidates: listHireable(Number(req.params.leaderId)) }); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.post('/leader/:leaderId/hire', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key) throw new Error('Нужен ключ наёмника');
    res.status(201).json(hireMercenary(Number(req.params.leaderId), String(key)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Revive a fallen mercenary with a ritual paid in names.
router.post('/leader/:leaderId/mercenary/:id/revive', (req, res) => {
  try {
    res.json(reviveMercenary(Number(req.params.leaderId), Number(req.params.id)));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
