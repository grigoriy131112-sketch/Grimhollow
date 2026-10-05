// Survival (Wave G3). Pure rules: no database, no I/O, so the math is unit-
// tested directly. Hunger, thirst and fatigue are three meters on a 0..100
// scale that RISE with time and travel and FALL when the hero eats, drinks or
// rests. Crossing a threshold applies a debuff through the G2 modifier engine
// (game/modifiers.js): this module only produces modifier descriptors, the
// service stores them in the existing character_buffs table.
//
// ---------------------------------------------------------------------------
// METERS AND THRESHOLDS (documented, locked)
// ---------------------------------------------------------------------------
//   0..100, where 0 = fully sated and 100 = at the limit. A meter is capped at
//   100 and floored at 0; there is NO death by starvation. Defeat stays
//   survivable (1 HP, 25% gold) — the meters only ever weaken the hero.
//
//   Every need has three tiers, checked highest-first:
//
//     hunger  (Голод)
//       >= 80  starving  attack -6, maxStamina -10
//       >= 60  hungry    attack -3
//       >= 35  peckish   attack -1
//
//     thirst  (Жажда)
//       >= 80  parched   maxStamina -15, accuracy -4
//       >= 60  thirsty   maxStamina -8
//       >= 35  dry       maxStamina -3
//
//     fatigue (Усталость)
//       >= 80  exhausted accuracy -8, evasion -8, speed -3
//       >= 60  weary     accuracy -4, evasion -4, speed -1
//       >= 35  tired     accuracy -2, evasion -2
//
//   NOTE on "thirst lowers max stamina regen": the G2 modifier engine
//   (game/modifiers.js, owned by the items wave) exposes only STAT_KEYS, and
//   there is no staminaRegen stat key there. This wave must not edit G2's file,
//   so thirst is expressed through maxStamina: a smaller pool means less stamina
//   is available after every turn and every rest, which is the observable form
//   of a weakened stamina regen. The orchestrator can promote this to a real
//   staminaRegen stat later without touching the meter logic.
//
//   Every effect above uses a stat key from STAT_KEYS, so each descriptor can be
//   fed straight to services/items.js#applyBuff. A need's descriptors use a
//   STABLE key per stat (`hunger:attack`), so the 'refresh' stack rule replaces
//   the old tier's amount instead of leaving a stale row behind; a need that
//   recovers to its lowest tier (or to 0) removes its source entirely.
//
// ---------------------------------------------------------------------------
// RATES (per the real clock and per combat turn)
// ---------------------------------------------------------------------------
//   Travel is measured in game minutes (services/travel.js, MS_PER_MINUTE). The
//   rates are per 10 game minutes so a 15..50 minute road moves the meters by a
//   readable amount. Combat advances per owner turn.

import { STAT_KEYS } from './modifiers.js';

export const NEEDS = ['hunger', 'thirst', 'fatigue'];

export const METER_MIN = 0;
export const METER_MAX = 100;

// Russian labels for the meters (player-visible).
export const NEED_META = {
  hunger: { label: 'Голод', icon: 'hunger' },
  thirst: { label: 'Жажда', icon: 'thirst' },
  fatigue: { label: 'Усталость', icon: 'fatigue' },
};

// How fast the meters climb. Hunger and thirst grow on the road; fatigue grows
// both on the road and in battle.
export const TRAVEL_RATE = { hunger: 5, thirst: 7, fatigue: 4 };   // per 10 game minutes
export const TURN_RATE = { hunger: 1, thirst: 1, fatigue: 2 };      // per own combat turn

// A rest (inn, tavern, camp) resets fatigue and takes the edge off hunger and
// thirst without emptying them.
export const REST_RESET = { hunger: 25, thirst: 35, fatigue: 0 };

// Food lowers hunger, drink lowers thirst. These reuse the G2 catalogue keys;
// bread_loaf and clean_water are G2 resource items, the rest are the provision
// keys the G6 settlements seed (ration, waterskin, dried_fish, turnip).
export const FOOD_VALUES = {
  ration: 40,
  dried_fish: 30,
  turnip: 18,
  bread_loaf: 15,
};
export const DRINK_VALUES = {
  waterskin: 45,
  clean_water: 35,
};

// Every need's tiers, highest threshold first. `effects` are flat STAT_KEYS
// deltas (negative = a debuff).
export const NEED_TIERS = {
  hunger: [
    { min: 80, key: 'starving', label: 'Голод изнуряет', effects: { attack: -6, maxStamina: -10 } },
    { min: 60, key: 'hungry', label: 'Голод', effects: { attack: -3 } },
    { min: 35, key: 'peckish', label: 'Лёгкий голод', effects: { attack: -1 } },
  ],
  thirst: [
    { min: 80, key: 'parched', label: 'Жажда мучит', effects: { maxStamina: -15, accuracy: -4 } },
    { min: 60, key: 'thirsty', label: 'Жажда', effects: { maxStamina: -8 } },
    { min: 35, key: 'dry', label: 'Пересохло в горле', effects: { maxStamina: -3 } },
  ],
  fatigue: [
    { min: 80, key: 'exhausted', label: 'Изнеможение', effects: { accuracy: -8, evasion: -8, speed: -3 } },
    { min: 60, key: 'weary', label: 'Усталость', effects: { accuracy: -4, evasion: -4, speed: -1 } },
    { min: 35, key: 'tired', label: 'Лёгкая усталость', effects: { accuracy: -2, evasion: -2 } },
  ],
};

// The lowest tier's floor, for reference by callers that want to know when a
// need starts to bite.
export const DEBUFF_FLOOR = 35;

const statIndex = new Set(STAT_KEYS);

// Keep a meter inside 0..100 as a whole number.
export function clampMeter(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return METER_MIN;
  return Math.max(METER_MIN, Math.min(METER_MAX, Math.round(n)));
}

// A complete { hunger, thirst, fatigue } meter set, defaulting the missing
// fields to 0 (a fresh hero is sated) and clamping the rest.
export function normalizeMeters(meters = {}) {
  const out = {};
  for (const need of NEEDS) out[need] = clampMeter(meters?.[need] ?? 0);
  return out;
}

// Raise or lower a single meter, clamped.
export function advanceNeed(need, value, points = 0) {
  if (!NEEDS.includes(need)) throw new Error(`Неизвестная потребность: ${need}`);
  return clampMeter(clampMeter(value) + (Number(points) || 0));
}

// Apply a delta map to a meter set.
export function advanceMeters(meters, deltas = {}) {
  const next = normalizeMeters(meters);
  for (const need of NEEDS) {
    if (deltas[need]) next[need] = advanceNeed(need, next[need], deltas[need]);
  }
  return next;
}

// The meters after a journey of `minutes` game minutes.
export function advanceTravelMeters(meters, minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  const scale = m / 10;
  return advanceMeters(meters, {
    hunger: TRAVEL_RATE.hunger * scale,
    thirst: TRAVEL_RATE.thirst * scale,
    fatigue: TRAVEL_RATE.fatigue * scale,
  });
}

// The meters after one of the owner's combat turns.
export function advanceTurnMeters(meters) {
  return advanceMeters(meters, TURN_RATE);
}

// The meters after a rest: fatigue is wiped, hunger and thirst ease.
export function restMeters(meters) {
  const next = normalizeMeters(meters);
  for (const need of NEEDS) next[need] = clampMeter(Math.min(next[need], REST_RESET[need]));
  return next;
}

// Eat or drink a catalogue item: lowers the matching meter. Returns the new
// meters plus what the item did, so the caller can tell the player.
export function applyConsumable(meters, itemKey) {
  const next = normalizeMeters(meters);
  const food = FOOD_VALUES[itemKey] ?? 0;
  const drink = DRINK_VALUES[itemKey] ?? 0;
  if (food) next.hunger = clampMeter(next.hunger - food);
  if (drink) next.thirst = clampMeter(next.thirst - drink);
  return { meters: next, fed: food, drank: drink };
}

// The active tier of a need, or null when it is not biting yet.
export function needTier(need, value) {
  const tiers = NEED_TIERS[need];
  if (!tiers) throw new Error(`Неизвестная потребность: ${need}`);
  const v = clampMeter(value);
  return tiers.find((t) => v >= t.min) || null;
}

// A stable tier key ('fine' when no tier applies).
export function needTierKey(need, value) {
  return needTier(need, value)?.key ?? 'fine';
}

// The modifier descriptors a need produces at a given meter value. Each uses a
// stat from STAT_KEYS and a stable key per stat, so the 'refresh' stack rule
// replaces the previous tier. Returns [] when the need is not biting.
export function needModifiers(need, value) {
  const tier = needTier(need, value);
  if (!tier) return [];
  return Object.entries(tier.effects).map(([stat, amount]) => {
    if (!statIndex.has(stat)) throw new Error(`Потребность «${need}» меняет неизвестный показатель: ${stat}`);
    return {
      key: `${need}:${stat}`,
      source: `need:${need}`,
      sourceType: 'need',
      stat,
      amount,
      turns: null,
      kind: 'debuff',
      stack: 'refresh',
      label: tier.label,
    };
  });
}

// Every descriptor for a full meter set, ready for applyBuff.
export function needModifiersFromMeters(meters) {
  const norm = normalizeMeters(meters);
  return NEEDS.flatMap((need) => needModifiers(need, norm[need]));
}

// The total flat stat change the meters currently impose, for display.
export function needStatTotals(meters) {
  const totals = {};
  for (const mod of needModifiersFromMeters(meters)) {
    totals[mod.stat] = (totals[mod.stat] || 0) + mod.amount;
  }
  return totals;
}

// A readable per-need view for the UI: the value, its tier and its label.
export function needSummary(meters) {
  const norm = normalizeMeters(meters);
  return NEEDS.map((need) => {
    const tier = needTier(need, norm[need]);
    return {
      need,
      label: NEED_META[need].label,
      value: norm[need],
      tier: tier?.key ?? 'fine',
      tierLabel: tier?.label ?? null,
      effects: tier ? { ...tier.effects } : {},
    };
  });
}

// True while any need is imposing a debuff.
export function hasNeedDebuff(meters) {
  return needModifiersFromMeters(meters).length > 0;
}
