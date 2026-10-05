// The modifier engine (Wave G2). Pure rules: no database, no I/O, so the math
// is unit-tested directly and reused by every layer that needs "effective"
// stats. G3 (hunger / thirst / fatigue) plugs its needs into this same engine
// as debuff modifiers.
//
// ---------------------------------------------------------------------------
// SHAPE (documented for reuse)
// ---------------------------------------------------------------------------
// A modifier is a single flat change to ONE stat, with a source and a lifetime:
//
//   {
//     key,        // latin id, unique within a source (e.g. 'iron_brew')
//     source,     // where it came from: 'item:iron_brew', 'trait:greedy', 'need:hunger'
//     sourceType, // 'equipment' | 'buff' | 'debuff' | 'trait' | 'need' | ...
//     stat,       // one of STAT_KEYS: maxHp | maxMana | maxStamina |
//                 //   attack | defense | accuracy | evasion | speed
//     amount,     // flat add; negative = a debuff
//     turns,      // remaining duration in turns; null = permanent until removed
//     kind,       // 'buff' | 'debuff' | 'equipment' (display grouping)
//     stack,      // 'refresh' | 'stack' | 'replace' (see STACK_RULES)
//     label,      // Russian, player-visible ("Железный настой")
//     maxStacks,  // optional cap for the 'stack' rule
//   }
//
// STACK_RULES, applied by addModifier():
//   refresh  (default) — a new modifier with the same source+key replaces the
//                        old one, resetting its duration. Re-drinking a potion
//                        does not stack it, it refreshes it.
//   stack              — the new modifier is appended; identical instances
//                        accumulate (optionally capped by maxStacks).
//   replace            — the new modifier removes every existing modifier of
//                        the same stat from the same sourceType, then is added.
//                        Two different potions that both boost attack do not
//                        stack; the last one wins.
//
// effectiveStats(base, modifiers) = base plus the sum of every active modifier.
// A resource maximum (maxHp / maxMana / maxStamina) is clamped to a floor of 1
// so a debuff can never make a pool collapse to zero.

import { itemInfo, isEquipment } from './items.js';

export const STAT_KEYS = ['maxHp', 'maxMana', 'maxStamina', 'attack', 'defense', 'accuracy', 'evasion', 'speed'];
export const RESOURCE_KEYS = ['hp', 'mana', 'stamina'];

// Which resource maximum a resource key is measured against.
export const RESOURCE_MAX = { hp: 'maxHp', mana: 'maxMana', stamina: 'maxStamina' };

export const STACK_RULES = ['refresh', 'stack', 'replace'];

const statIndex = new Set(STAT_KEYS);

// A stable identity for a modifier: same source + key means "the same effect".
export const modifierKey = (m) => `${m?.source ?? ''}|${m?.key ?? ''}`;

// Fill defaults and reject a stat the engine does not know.
export function normalizeModifier(input = {}) {
  const stat = String(input.stat || '');
  if (!statIndex.has(stat)) throw new Error(`Неизвестный показатель: ${input.stat}`);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Модификатор должен что-то менять');
  const turns = input.turns === null || input.turns === undefined ? null : Math.max(0, Math.floor(Number(input.turns)));
  const stack = STACK_RULES.includes(input.stack) ? input.stack : 'refresh';
  return {
    key: input.key || stat,
    source: input.source || 'unknown',
    sourceType: input.sourceType || 'buff',
    stat,
    amount,
    turns,
    kind: input.kind || (amount < 0 ? 'debuff' : 'buff'),
    stack,
    label: input.label || '',
    maxStacks: Number.isFinite(Number(input.maxStacks)) ? Math.max(1, Math.floor(Number(input.maxStacks))) : null,
  };
}

// Add one modifier to a list, honouring its stack rule. Returns a new list; the
// input is never mutated.
export function addModifier(list = [], input = {}) {
  const mod = normalizeModifier(input);
  const next = [...list];

  if (mod.stack === 'refresh') {
    const id = modifierKey(mod);
    return [...next.filter((m) => modifierKey(m) !== id), mod];
  }

  if (mod.stack === 'replace') {
    const kept = next.filter((m) => !(m.stat === mod.stat && m.sourceType === mod.sourceType));
    return [...kept, mod];
  }

  // stack: append, capped by maxStacks (oldest instances of the same key fall off).
  next.push(mod);
  if (mod.maxStacks) {
    const same = next.filter((m) => modifierKey(m) === modifierKey(mod));
    if (same.length > mod.maxStacks) {
      const drop = same.length - mod.maxStacks;
      let removed = 0;
      const id = modifierKey(mod);
      return next.filter((m) => {
        if (m !== mod && modifierKey(m) === id && removed < drop) { removed += 1; return false; }
        return true;
      });
    }
  }
  return next;
}

export function addModifiers(list = [], inputs = []) {
  return inputs.reduce((acc, m) => addModifier(acc, m), list);
}

// Drop modifiers matching a source (optionally also a key).
export function removeModifiers(list = [], { source, key } = {}) {
  return list.filter((m) => {
    if (source !== undefined && m.source !== source) return true;
    if (key !== undefined && m.key !== key) return true;
    return false;
  });
}

export function removeModifierByKey(list = [], modKey) {
  return list.filter((m) => modifierKey(m) !== modKey);
}

// Advance the clock by `turns`; finite durations count down and expire, while
// permanent (null) modifiers stay. Returns a new list.
export function tickModifiers(list = [], turns = 1) {
  const step = Math.max(0, Math.floor(Number(turns) || 0));
  if (!step) return [...list];
  return list
    .map((m) => (m.turns === null ? m : { ...m, turns: m.turns - step }))
    .filter((m) => m.turns === null || m.turns > 0);
}

// Turn an equipped map (slot -> item key) into permanent equipment modifiers.
// Unknown keys are ignored so a stale row cannot break the math.
export function equipmentModifiers(equipment = {}) {
  const mods = [];
  for (const [slot, key] of Object.entries(equipment)) {
    const item = itemInfo(key);
    if (!isEquipment(item)) continue;
    for (const [stat, amount] of Object.entries(item.stats || {})) {
      if (!amount) continue;
      mods.push(normalizeModifier({
        key: `${slot}:${key}`,
        source: `equipment:${key}`,
        sourceType: 'equipment',
        stat,
        amount,
        turns: null,
        kind: 'equipment',
        label: item.name,
      }));
    }
  }
  return mods;
}

// Sum every modifier into a flat { stat: total } map.
export function sumModifiers(list = []) {
  const totals = {};
  for (const m of list) totals[m.stat] = (totals[m.stat] || 0) + m.amount;
  return totals;
}

// Base stats plus every modifier. Resource maxima never fall below 1; the rest
// never below 0.
export function effectiveStats(base = {}, modifiers = []) {
  const totals = sumModifiers(modifiers);
  const out = { ...base };
  for (const [stat, amount] of Object.entries(totals)) {
    out[stat] = (base[stat] ?? 0) + amount;
  }
  for (const key of STAT_KEYS) {
    if (out[key] === undefined) continue;
    out[key] = Math.max(key.startsWith('max') ? 1 : 0, Math.round(out[key]));
  }
  return out;
}

// Apply modifiers to a whole source (a derived character or combatant-like
// object). Current resources are kept, then clamped to the new maxima; if a
// maximum grows, the pool is topped up by the same amount (a stronger hero is
// not a wounded one).
export function applyModifiersToSource(source = {}, modifiers = []) {
  const baseStats = source.stats || {};
  const stats = effectiveStats(baseStats, modifiers);
  const refill = (current, field) => {
    const oldMax = baseStats[field];
    const newMax = stats[field];
    if (current == null) return newMax;
    if (oldMax == null || newMax <= oldMax) return Math.min(current, newMax);
    return Math.min(newMax, current + (newMax - oldMax));
  };
  return {
    ...source,
    stats,
    hp: refill(source.hp, 'maxHp'),
    mana: refill(source.mana, 'maxMana'),
    stamina: refill(source.stamina, 'maxStamina'),
  };
}

// Readable summary of what is active, for the UI: one entry per stat with the
// total delta and the contributing modifiers.
export function modifierSummary(list = []) {
  const totals = sumModifiers(list);
  return Object.entries(totals).map(([stat, total]) => ({
    stat,
    total,
    modifiers: list.filter((m) => m.stat === stat),
  }));
}
