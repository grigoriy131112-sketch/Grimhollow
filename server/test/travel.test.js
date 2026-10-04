import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import {
  travelMinutes, MIN_TRAVEL, MAX_TRAVEL,
  encounterAt, encounterMinutes, encounterCount, planTravel,
  encounterOptions, resolveEncounter,
  MS_PER_MINUTE, startState, elapsedWalkMs, currentMinute, tick, resume, hasArrived,
} from '../src/game/travel.js';

const near = { id: 1, x: 100, y: 100, biome: 'waste', danger: 1, isSafe: true };
const far = { id: 2, x: 900, y: 600, biome: 'bonefield', danger: 5, isSafe: false };
const mid = { id: 3, x: 250, y: 300, biome: 'marsh', danger: 3, isSafe: false };

test('travel time always falls inside the 15-50 band', () => {
  for (const [a, b] of [[near, far], [near, mid], [mid, far], [near, { ...near, id: 9, x: 101, y: 100 }]]) {
    const m = travelMinutes({ from: a, to: b });
    assert.ok(m >= MIN_TRAVEL && m <= MAX_TRAVEL, `${m} is inside the band`);
    assert.equal(m, Math.round(m), 'minutes are whole numbers');
  }
});

test('a longer road on the map takes longer in the game', () => {
  const short = travelMinutes({ from: { ...near, x: 200, y: 200 }, to: { ...near, x: 260, y: 200 } });
  const long = travelMinutes({ from: near, to: { ...near, x: 800, y: 200 } });
  assert.ok(long > short, `${long} > ${short}`);
});

test('the same road always yields the same minutes', () => {
  assert.equal(travelMinutes({ from: near, to: far }), travelMinutes({ from: near, to: far }));
});

test('a road takes the same time whichever way it is walked', () => {
  for (const [a, b] of [[near, far], [near, mid], [mid, far]]) {
    assert.equal(travelMinutes({ from: a, to: b }), travelMinutes({ from: b, to: a }), `${a.id}<->${b.id} is symmetric`);
  }
});

test('a safe road has no encounters; a dangerous one does', () => {
  assert.equal(encounterCount(45, 1, true), 0);
  assert.ok(encounterCount(45, 4, false) >= 1);
});

test('encounters are deterministic for a given road and minute', () => {
  const args = { seed: '1->2', minute: 20, danger: 4, safe: false };
  assert.deepEqual(encounterAt(args), encounterAt(args));
});

test('safe roads never schedule an ambush', () => {
  for (let minute = 1; minute <= 50; minute += 1) {
    const e = encounterAt({ seed: 'safe-road', minute, danger: 1, safe: true });
    if (e) assert.notEqual(e.kind, 'ambush');
  }
});

test('low-danger roads never schedule an ambush either', () => {
  for (let minute = 1; minute <= 50; minute += 1) {
    const e = encounterAt({ seed: 'calm', minute, danger: 2, safe: false });
    if (e) assert.notEqual(e.kind, 'ambush');
  }
});

test('a plan keeps its stops in order and inside the road', () => {
  const plan = planTravel({ from: mid, to: far, seed: 'mid->far' });
  assert.ok(plan.events.length >= 1);
  const minutes = plan.events.map((e) => e.minute);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b), 'stops are ordered');
  assert.ok(minutes.every((m) => m > 0 && m < plan.minutes), 'no stop lands on either end');
});

test('every encounter offers at least one choice', () => {
  for (let minute = 1; minute <= 50; minute += 1) {
    const e = encounterAt({ seed: 'choices', minute, danger: 5, safe: false });
    if (e) assert.ok(encounterOptions(e).length >= 1, `${e.kind} has options`);
  }
});

test('an ambush can turn into a fight', () => {
  const ambush = { kind: 'ambush', id: 'ambush', title: 'Засада' };
  assert.equal(resolveEncounter({ encounter: ambush, choice: 'fight', seed: 's' }).kind, 'battle');
});

test('ignoring an encounter always resolves quietly', () => {
  const merchant = { kind: 'merchant', id: 'merchant', title: 'Торговец' };
  assert.equal(resolveEncounter({ encounter: merchant, choice: 'ignore', seed: 's' }).kind, 'nothing');
});

test('the same choice on the same road resolves identically', () => {
  const inn = { kind: 'inn', id: 'inn', title: 'Двор' };
  const a = resolveEncounter({ encounter: inn, choice: 'rest', seed: 'road-7' });
  const b = resolveEncounter({ encounter: inn, choice: 'rest', seed: 'road-7' });
  assert.deepEqual(a, b);
});

test('a journey walks in real time and pauses on each stop', () => {
  const plan = planTravel({ from: mid, to: far, seed: 'journey' });
  const t0 = 1_000_000;
  let state = startState(plan, t0);

  assert.equal(currentMinute(state, t0), 0);
  assert.equal(hasArrived(state, plan.minutes, t0), false);

  // Walk to just before the first stop: nothing pends yet.
  const first = plan.events[0].minute;
  state = tick(state, t0 + first * MS_PER_MINUTE - 1);
  assert.equal(state.pending, null, 'no stop before its minute');

  // Cross the minute and the stop appears, freezing the walk on that minute.
  state = tick(state, t0 + first * MS_PER_MINUTE);
  assert.ok(state.pending, 'the stop appears on its minute');
  assert.equal(currentMinute(state, t0 + first * MS_PER_MINUTE), first);
  assert.equal(elapsedWalkMs(state, t0 + 99 * MS_PER_MINUTE), first * MS_PER_MINUTE,
    'time stands still while a stop waits');
});

test('time spent deciding does not count against the road', () => {
  const plan = planTravel({ from: mid, to: far, seed: 'pause' });
  const t0 = 5_000;
  const first = plan.events[0].minute;
  let state = tick(startState(plan, t0), t0 + first * MS_PER_MINUTE);
  assert.ok(state.pending);

  // A long pause, then the answer: the walk resumes from the stop, not from now.
  const answeredAt = t0 + 500 * MS_PER_MINUTE;
  state = { ...state, cursor: state.cursor + 1, pending: null };
  state = resume(state, answeredAt);
  assert.equal(currentMinute(state, answeredAt), first, 'resumes at the stop minute');
});

test('a road with no stops is walked through to the far end', () => {
  const plan = planTravel({ from: mid, to: far, seed: 'quiet' });
  const quiet = { ...plan, events: [] };
  const t0 = 0;
  let state = startState(quiet, t0);
  assert.equal(hasArrived(state, plan.minutes, t0), false);
  state = tick(state, t0 + plan.minutes * MS_PER_MINUTE);
  assert.equal(hasArrived(state, plan.minutes, t0 + plan.minutes * MS_PER_MINUTE), true);
});
