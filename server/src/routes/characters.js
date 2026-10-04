import { Router } from 'express';
import { CLASSES } from '../game/classes.js';
import { MAX_LEVEL } from '../game/rules.js';
import { listCharacters, getCharacter, getCharacterSheet, createCharacter, deleteCharacter } from '../services/characters.js';

const router = Router();

router.get('/options', (req, res) => {
  res.json({
    classes: Object.values(CLASSES).map((c) => ({
      key: c.key, label: c.label, blurb: c.blurb, growthText: c.growthText,
      base: c.base, growth: c.growth,
      abilities: c.abilities.map((a) => ({
        id: a.id, name: a.name, icon: a.icon, unlockLevel: a.unlockLevel,
        resource: a.resource, cost: a.cost, cooldown: a.cooldown, kind: a.kind,
        passive: !!a.passive, description: a.description,
      })),
    })),
    maxLevel: MAX_LEVEL,
  });
});

router.get('/', (req, res) => res.json(listCharacters()));

router.post('/', (req, res) => {
  try { res.status(201).json(createCharacter(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  const c = getCharacterSheet(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Персонаж не найден' });
  return res.json(c);
});

router.delete('/:id', (req, res) => {
  const ok = deleteCharacter(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Персонаж не найден' });
  return res.status(204).end();
});

export default router;
