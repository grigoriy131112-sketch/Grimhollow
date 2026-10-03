import { Router } from 'express';
import { getConversation, say, dialogueOptions } from '../services/dialogue.js';
import { npcsAtLocation, listNpcs } from '../services/npcs.js';
import { llmStatus } from '../services/llm.js';

const router = Router();

// What the client can talk to: quick topics and everyone who lives somewhere.
router.get('/options', (req, res) => {
  try { res.json({ topics: dialogueOptions(), npcs: listNpcs() }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/status', async (req, res) => {
  try { res.json(await llmStatus()); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/npc/:locationId', (req, res) => {
  try { res.json(npcsAtLocation(Number(req.params.locationId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// A whole conversation with an NPC or a companion.
router.get('/:leaderId/:kind/:refId', (req, res) => {
  try { res.json(getConversation(Number(req.params.leaderId), req.params.kind, Number(req.params.refId))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:leaderId/:kind/:refId', async (req, res) => {
  try {
    const text = req.body?.text;
    res.json(await say(Number(req.params.leaderId), req.params.kind, Number(req.params.refId), text));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
