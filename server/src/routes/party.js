import { Router } from 'express';
import {
  getParty, getRecruitBoard, listSourcesWithCounts,
  recruit, getMember, adjustRelation, sweepDepartures, setMemberStatus,
} from '../services/party.js';

const router = Router();

// Everything the party page needs in one call.
router.get('/:leaderId', (req, res) => {
  try { res.json(getParty(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// The fourteen ways a companion can be found.
router.get('/:leaderId/sources', (req, res) => {
  try { res.json(listSourcesWithCounts(Number(req.params.leaderId))); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// Who can be found from a source (all sources when omitted).
router.get('/:leaderId/recruits', (req, res) => {
  try { res.json(getRecruitBoard(Number(req.params.leaderId), req.query.source)); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.post('/:leaderId/recruit', (req, res) => {
  try {
    const { templateKey, source, goldOffered } = req.body || {};
    if (!templateKey) throw new Error('Требуется templateKey');
    res.status(201).json(recruit(Number(req.params.leaderId), templateKey, {
      source, goldOffered: Number(goldOffered) || 0,
    }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/member/:memberId', (req, res) => {
  const m = getMember(Number(req.params.memberId));
  if (!m) return res.status(404).json({ error: 'Спутник не найден' });
  return res.json(m);
});

// Nudge a relationship (used by dialogue, gifts, battles in later waves).
router.post('/member/:memberId/relation', (req, res) => {
  try {
    const { toMemberId, delta } = req.body || {};
    const value = adjustRelation(Number(req.params.memberId), toMemberId ? Number(toMemberId) : null, Number(delta) || 0);
    res.json({ value });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:leaderId/sweep', (req, res) => {
  try { res.json({ left: sweepDepartures(Number(req.params.leaderId)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/member/:memberId/status', (req, res) => {
  try {
    const ok = setMemberStatus(Number(req.params.memberId), req.body?.status);
    if (!ok) throw new Error('Спутник не найден');
    res.json({ ok: true, member: getMember(Number(req.params.memberId)) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
