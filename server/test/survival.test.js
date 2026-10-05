import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { closeDb } from '../src/db/index.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { listBuffs, activeModifiers, applyBuff } from '../src/services/items.js';
import { effectiveStats, sumModifiers, STAT_KEYS } from '../src/game/modifiers.js';
import {
  NEEDS, NEED_TIERS, FOOD_VALUES, DRINK_VALUES, TRAVEL_RATE, TURN_RATE, REST_RESET,
  clampMeter, normalizeMeters, advanceNeed, advanceMeters, advanceTravelMeters,
  advanceTurnMeters, restMeters, applyConsumable, needTier, needTierKey,
  needModifiers, needModifiersFromMeters, needStatTotals, hasNeedDebuff, needSummary,
} from '../src/game/survival.js';
import {
  getMeters, setMeters, syncNeedBuffs, advanceOnTravel, advanceOnTurn, rest,
  consume, isSurvivalConsumable, getSurvivalView,
} from '../src/services/survival.js';

let counter = 0;
function freshLeader() {
  counter += 1;
  return createCharacter({ name: `Выживший ${counter} ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
}

test.after(() => closeDb());

// --- pure meters ------------------------------------------------------------

test('every meter stays inside 0..100 and is a whole number', () => {
  assert.equal(clampMeter(-40), 0);
  assert.equal(clampMeter(140), 100);
  assert.equal(clampMeter(42.6), 43);
  assert.equal(clampMeter('nonsense'), 0);

  const norm = normalizeMeters({ hunger: 150, thirst: -10, fatigue: 42.6 });
  assert.deepEqual(norm, { hunger: 100, thirst: 0, fatigue: 43 });

  // A missing meter defaults to sated, not undefined.
  assert.deepEqual(normalizeMeters({}), { hunger: 0, thirst: 0, fatigue: 0 });
  assert.deepEqual(normalizeMeters(), { hunger: 0, thirst: 0, fatigue: 0 });
});

test('advanceNeed and advanceMeters clamp at both ends', () => {
  assert.equal(advanceNeed('hunger', 98, 50), 100, 'never passes the limit');
  assert.equal(advanceNeed('thirst', 4, -20), 0, 'never drops below zero');
  assert.throws(() => advanceNeed('bogus', 0, 1), /Неизвестная потребность/);

  const up = advanceMeters({ hunger: 10, thirst: 10, fatigue: 10 }, { hunger: 5, thirst: 5, fatigue: 5 });
  assert.deepEqual(up, { hunger: 15, thirst: 15, fatigue: 15 });
  // A need absent from the delta map is left alone.
  assert.deepEqual(advanceMeters({ hunger: 10, thirst: 10, fatigue: 10 }, { hunger: 3 }).thirst, 10);
});

test('meters rise with travel time and with combat turns', () => {
  const after30 = advanceTravelMeters({}, 30);
  assert.equal(after30.hunger, TRAVEL_RATE.hunger * 3);
  assert.equal(after30.thirst, TRAVEL_RATE.thirst * 3);
  assert.equal(after30.fatigue, TRAVEL_RATE.fatigue * 3);

  const afterTurn = advanceTurnMeters({});
  assert.deepEqual(afterTurn, { hunger: TURN_RATE.hunger, thirst: TURN_RATE.thirst, fatigue: TURN_RATE.fatigue });

  // A long journey still cannot push a meter past 100.
  const long = advanceTravelMeters({ hunger: 90, thirst: 90, fatigue: 90 }, 1000);
  assert.deepEqual(long, { hunger: 100, thirst: 100, fatigue: 100 });
});

test('eating and drinking lower the matching meter, a rest wipes fatigue', () => {
  const fed = applyConsumable({ hunger: 80, thirst: 80 }, 'ration');
  assert.equal(fed.fed, FOOD_VALUES.ration);
  assert.equal(fed.drank, 0);
  assert.equal(fed.meters.hunger, 80 - FOOD_VALUES.ration);
  assert.equal(fed.meters.thirst, 80, 'a ration does not quench thirst');

  const drank = applyConsumable({ hunger: 80, thirst: 80 }, 'waterskin');
  assert.equal(drank.drank, DRINK_VALUES.waterskin);
  assert.equal(drank.meters.thirst, 80 - DRINK_VALUES.waterskin);
  assert.equal(drank.meters.hunger, 80);

  // An unknown key changes nothing (no crash).
  assert.deepEqual(applyConsumable({ hunger: 50, thirst: 50 }, 'no_such_item').meters, { hunger: 50, thirst: 50, fatigue: 0 });

  const rested = restMeters({ hunger: 90, thirst: 90, fatigue: 90 });
  assert.deepEqual(rested, { hunger: REST_RESET.hunger, thirst: REST_RESET.thirst, fatigue: 0 });
  // A rest never makes a meter worse.
  assert.deepEqual(restMeters({ hunger: 5, thirst: 5, fatigue: 5 }), { hunger: 5, thirst: 5, fatigue: 0 });
});

// --- thresholds and the debuffs they produce --------------------------------

test('each meter has the documented tiers and picks the highest crossed one', () => {
  assert.equal(needTierKey('fatigue', 34), 'fine');
  assert.equal(needTierKey('fatigue', 35), 'tired');
  assert.equal(needTierKey('fatigue', 60), 'weary');
  assert.equal(needTierKey('fatigue', 80), 'exhausted');
  assert.equal(needTierKey('hunger', 80), 'starving');
  assert.equal(needTierKey('thirst', 35), 'dry');
  assert.equal(needTierKey('thirst', 100), 'parched');
  assert.equal(needTier('fatigue', 34), null, 'below the floor there is no debuff');
});

test('the tier effects match the documented stat changes', () => {
  const starving = needModifiers('hunger', 85);
  assert.deepEqual(sumModifiers(starving), { attack: -6, maxStamina: -10 });
  assert.equal(needModifiers('hunger', 40)[0].amount, -1, 'peckish bites only lightly');

  assert.deepEqual(sumModifiers(needModifiers('thirst', 85)), { maxStamina: -15, accuracy: -4 });

  const exhausted = needModifiers('fatigue', 85);
  assert.deepEqual(sumModifiers(exhausted), { accuracy: -8, evasion: -8, speed: -3 });

  assert.deepEqual(needModifiers('hunger', 0), [], 'a sated hero gets nothing');
});

test('every need modifier is a valid debuff descriptor for the G2 engine', () => {
  const descriptors = needModifiersFromMeters({ hunger: 100, thirst: 100, fatigue: 100 });
  assert.ok(descriptors.length >= 6);
  for (const mod of descriptors) {
    assert.ok(STAT_KEYS.includes(mod.stat), `${mod.stat} is a known stat`);
    assert.equal(mod.sourceType, 'need');
    assert.equal(mod.kind, 'debuff');
    assert.equal(mod.turns, null, 'need debuffs last until the meter recovers');
    assert.equal(mod.stack, 'refresh');
    assert.match(mod.source, /^need:(hunger|thirst|fatigue)$/);
    assert.ok(mod.label && /[А-Яа-яЁё]/.test(mod.label), 'labels are Russian');
  }
  // Totals are the sum across every need.
  assert.equal(needStatTotals({ fatigue: 85, hunger: 85, thirst: 0 }).accuracy, -8);
  assert.equal(hasNeedDebuff({ hunger: 10, thirst: 10, fatigue: 10 }), false);
  assert.equal(hasNeedDebuff({ hunger: 80, thirst: 0, fatigue: 0 }), true);
});

test('the need summary reports the value, tier and effects for the UI', () => {
  const summary = needSummary({ hunger: 65, thirst: 0, fatigue: 85 });
  const hunger = summary.find((s) => s.need === 'hunger');
  const fatigue = summary.find((s) => s.need === 'fatigue');
  assert.equal(hunger.tier, 'hungry');
  assert.deepEqual(hunger.effects, { attack: -3 });
  assert.equal(fatigue.tier, 'exhausted');
  assert.equal(summary.find((s) => s.need === 'thirst').tier, 'fine');
});

// --- service: persistence + the existing buff table -------------------------

test('a fresh hero is sated and gets no need debuffs', () => {
  const leader = freshLeader();
  assert.deepEqual(getMeters(leader.id), { hunger: 0, thirst: 0, fatigue: 0 });
  assert.equal(listBuffs(leader.id).filter((b) => b.sourceType === 'need').length, 0);
  const view = getSurvivalView(leader.id);
  assert.equal(view.hungry, false);
  assert.equal(view.needs.length, NEEDS.length);
});

test('crossing a threshold applies the right debuff through character_buffs', () => {
  const leader = freshLeader();
  const base = getCharacter(leader.id).stats;

  setMeters(leader.id, { hunger: 85, thirst: 0, fatigue: 0 });
  syncNeedBuffs(leader.id);

  const needBuffs = listBuffs(leader.id).filter((b) => b.sourceType === 'need');
  assert.ok(needBuffs.length >= 2, 'starving writes attack and maxStamina');
  assert.ok(needBuffs.every((b) => b.source === 'need:hunger'));
  assert.ok(needBuffs.every((b) => b.turns === null), 'stored as permanent until removed');

  const totals = sumModifiers(activeModifiers(leader.id));
  assert.equal(totals.attack, -6);
  assert.equal(totals.maxStamina, -10);

  // The debuff reaches the effective sheet, not just the buff table.
  const eff = effectiveStats(base, activeModifiers(leader.id));
  assert.equal(eff.attack, base.attack - 6);
  assert.equal(eff.maxStamina, base.maxStamina - 10);
});

test('climbing a tier replaces the weaker debuff instead of stacking it', () => {
  const leader = freshLeader();
  setMeters(leader.id, { hunger: 40, thirst: 0, fatigue: 0 });
  syncNeedBuffs(leader.id);
  assert.equal(sumModifiers(activeModifiers(leader.id)).attack, -1);

  setMeters(leader.id, { hunger: 85, thirst: 0, fatigue: 0 });
  syncNeedBuffs(leader.id);
  const hungerBuffs = listBuffs(leader.id).filter((b) => b.source === 'need:hunger');
  assert.equal(hungerBuffs.filter((b) => b.stat === 'attack').length, 1, 'one attack row, not two');
  assert.equal(sumModifiers(activeModifiers(leader.id)).attack, -6, 'the stronger tier wins');
});

test('the debuff is removed when the meter recovers', () => {
  const leader = freshLeader();
  setMeters(leader.id, { hunger: 85, thirst: 0, fatigue: 0 });
  syncNeedBuffs(leader.id);
  assert.ok(listBuffs(leader.id).some((b) => b.sourceType === 'need'));

  // Eat back down to a safe level.
  consume(leader.id, 'ration');
  consume(leader.id, 'ration');
  consume(leader.id, 'ration');
  assert.deepEqual(getMeters(leader.id), { hunger: 0, thirst: 0, fatigue: 0 });
  assert.equal(listBuffs(leader.id).filter((b) => b.sourceType === 'need').length, 0, 'no stale debuff remains');
  assert.equal(sumModifiers(activeModifiers(leader.id)).attack ?? 0, 0);
});

test('travel, turns and rest move the meters and re-sync the debuffs', () => {
  const leader = freshLeader();

  const travelled = advanceOnTravel(leader.id, 60);
  assert.deepEqual(travelled, {
    hunger: TRAVEL_RATE.hunger * 6,
    thirst: TRAVEL_RATE.thirst * 6,
    fatigue: TRAVEL_RATE.fatigue * 6,
  });
  assert.equal(getMeters(leader.id).thirst, TRAVEL_RATE.thirst * 6);

  // Push fatigue over its worst threshold and confirm the debuff lands.
  setMeters(leader.id, { hunger: 0, thirst: 0, fatigue: 90 });
  syncNeedBuffs(leader.id);
  assert.equal(sumModifiers(activeModifiers(leader.id)).accuracy, -8);

  const rested = rest(leader.id);
  assert.deepEqual(rested, { hunger: 0, thirst: 0, fatigue: 0 });
  assert.equal(sumModifiers(activeModifiers(leader.id)).accuracy ?? 0, 0, 'rest clears the debuff');

  advanceOnTurn(leader.id);
  assert.deepEqual(getMeters(leader.id), { hunger: TURN_RATE.hunger, thirst: TURN_RATE.thirst, fatigue: TURN_RATE.fatigue });
});

test('consume eats and drinks from the catalogue keys, and reports the change', () => {
  const leader = freshLeader();
  setMeters(leader.id, { hunger: 80, thirst: 80, fatigue: 0 });

  const water = consume(leader.id, 'waterskin');
  assert.equal(water.drank, DRINK_VALUES.waterskin);
  assert.equal(water.meters.thirst, 80 - DRINK_VALUES.waterskin);
  assert.equal(water.meters.hunger, 80, 'water does not feed');

  const fish = consume(leader.id, 'dried_fish');
  assert.equal(fish.fed, FOOD_VALUES.dried_fish);
  assert.equal(fish.meters.hunger, 80 - FOOD_VALUES.dried_fish);

  assert.equal(isSurvivalConsumable('ration'), true);
  assert.equal(isSurvivalConsumable('clean_water'), true);
  assert.equal(isSurvivalConsumable('rusty_sword'), false);
});

test('the survival view reports the meters, tiers and totals without touching other buffs', () => {
  const leader = freshLeader();
  // A normal combat buff must survive a survival sync.
  applyBuff(leader.id, { key: 'bless', source: 'ability:bless', sourceType: 'buff', stat: 'attack', amount: 5, turns: 3 });

  setMeters(leader.id, { hunger: 85, thirst: 0, fatigue: 0 });
  syncNeedBuffs(leader.id);

  const view = getSurvivalView(leader.id);
  assert.equal(view.meters.hunger, 85);
  assert.equal(view.hungry, true);
  assert.equal(view.statTotals.attack, -6);
  assert.ok(view.food.includes('ration'));
  assert.ok(view.drink.includes('waterskin'));

  const buffs = listBuffs(leader.id);
  assert.ok(buffs.some((b) => b.source === 'ability:bless'), 'the unrelated buff is untouched');
  assert.equal(sumModifiers(activeModifiers(leader.id)).attack, 5 - 6, 'buff and need debuff combine honestly');
});

test('the need tables stay consistent with the documented rates', () => {
  for (const need of NEEDS) {
    assert.ok(NEED_TIERS[need]?.length, `${need} has tiers`);
    // Tiers are ordered highest-first so the first crossed one is the worst.
    for (let i = 1; i < NEED_TIERS[need].length; i += 1) {
      assert.ok(NEED_TIERS[need][i].min < NEED_TIERS[need][i - 1].min, `${need} tiers descend`);
    }
  }
  assert.deepEqual(Object.keys(FOOD_VALUES).sort(), ['bread_loaf', 'dried_fish', 'ration', 'turnip']);
  assert.deepEqual(Object.keys(DRINK_VALUES).sort(), ['clean_water', 'waterskin']);
});
