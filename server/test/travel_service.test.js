import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { getMap, getLocation, recordVisit } from '../src/services/world.js';
import { startTravel, getTravelView, chooseTravel } from '../src/services/travel.js';
import { MS_PER_MINUTE } from '../src/game/travel.js';

test.after(() => closeDb());

function leaderWith(gold = 100) {
  const c = createCharacter({ name: `Путник ${Math.floor(Math.random() * 1e6)}`, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  return getCharacter(c.id);
}

// A dangerous road (so encounters are scheduled) found from the seeded world.
function dangerousRoad() {
  seedWorld();
  const map = getMap();
  const locs = new Map(map.locations.map((l) => [l.id, l]));
  const road = map.connections.find((c) => Math.max(locs.get(c.from).danger, locs.get(c.to).danger) >= 3);
  return { from: locs.get(road.from), to: locs.get(road.to), road };
}

test('starting a trip records a deterministic road with minutes', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith();
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: 1_000_000 });
  assert.equal(trip.from.id, from.id);
  assert.equal(trip.to.id, to.id);
  assert.ok(trip.minutes >= 15 && trip.minutes <= 50);
  assert.equal(trip.minute, 0);
  assert.equal(trip.arrived, false);
  assert.equal(trip.paused, false);

  // The trip must agree with the minutes the map advertises for that road.
  const stored = getDb().prepare('SELECT minutes FROM connections WHERE from_id = ? AND to_id = ?')
    .get(from.id, to.id).minutes;
  assert.equal(trip.minutes, stored, 'trip length matches the road on the map');
});

test('a trip cannot start between places that are not neighbours', () => {
  seedWorld();
  const map = getMap();
  const a = map.locations[0];
  const b = map.locations.find((l) => !map.connections.some(
    (c) => (c.from === a.id && c.to === l.id) || (c.to === a.id && c.from === l.id),
  ) && l.id !== a.id);
  const leader = leaderWith();
  assert.throws(() => startTravel({ characterId: leader.id, fromId: a.id, toId: b.id, now: 0 }), /нет дороги/);
});

test('a trip can only set out from where the party stands', () => {
  const { from, to } = dangerousRoad();
  const map = getMap();
  const leader = leaderWith();
  const elsewhere = map.locations.find((l) => l.id !== from.id && l.id !== to.id);
  recordVisit(leader.id, elsewhere.id); // the party is somewhere else entirely
  assert.throws(
    () => startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: 0 }),
    /не находится здесь/,
    'naming a far place as the origin is refused',
  );
  // Walk to the origin, then the very same road opens.
  recordVisit(leader.id, from.id);
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: 0 });
  assert.equal(trip.from.id, from.id);
});

test('arriving at the drowned chapel yields the ritual key', () => {
  seedWorld();
  const map = getMap();
  const chapel = map.locations.find((l) => l.name === 'Затонувшая часовня');
  const neighbour = map.locations.find((l) => map.connections.some(
    (c) => (c.from === chapel.id && c.to === l.id) || (c.to === chapel.id && c.from === l.id),
  ));
  const leader = leaderWith();
  recordVisit(leader.id, neighbour.id);
  const t0 = 9_000;
  const trip = startTravel({ characterId: leader.id, fromId: neighbour.id, toId: chapel.id, now: t0 });
  let now = t0;
  for (let guard = 0; guard < 20; guard += 1) {
    const view = getTravelView(trip.id, now);
    if (!view || view.arrived) break;
    if (view.encounter) {
      const res = chooseTravel(trip.id, 'ignore', now);
      now = res.travel.arrived ? now : now + 1;
      continue;
    }
    now += trip.minutes * MS_PER_MINUTE;
  }
  const done = getTravelView(trip.id, now);
  assert.equal(done.arrived, true, 'the party reached the chapel');
  const key = getDb().prepare(
    'SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?',
  ).get(leader.id, 'shepherd_key');
  assert.ok(key && key.qty >= 1, 'the first arrival grants the key');
});

test('a character cannot be on two roads at once', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith();
  const first = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: 0 });
  const again = startTravel({ characterId: leader.id, fromId: to.id, toId: from.id, now: 0 });
  assert.equal(again.id, first.id, 'the unfinished trip is returned');
});

test('the road advances only as the real clock does', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith();
  const t0 = 2_000_000;
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: t0 });

  const soon = getTravelView(trip.id, t0 + 3 * MS_PER_MINUTE);
  assert.equal(soon.minute, 3, 'three real minutes walked');
  assert.ok(soon.progress > 0 && soon.progress < 1);
  assert.equal(soon.arrived, false);

  // A stop appears exactly on its scheduled minute and holds the road there.
  const stopMinute = soon.stopsLeft > 0 ? firstStopMinute(trip.id) : null;
  if (stopMinute != null) {
    const paused = getTravelView(trip.id, t0 + stopMinute * MS_PER_MINUTE);
    assert.equal(paused.paused, true, 'a stop pauses the road');
    assert.equal(paused.arrivesAt, null);
    const later = getTravelView(trip.id, t0 + (stopMinute + 5) * MS_PER_MINUTE);
    assert.equal(later.minute, stopMinute, 'time does not move while paused');
  }
});

function firstStopMinute(travelId) {
  const state = JSON.parse(getDb().prepare('SELECT state FROM travels WHERE id = ?').get(travelId).state);
  return state.events[0]?.minute ?? null;
}

test('the whole road ends by itself once enough real time passes', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith();
  const t0 = 9_000;
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: t0 });

  // Walk to each stop and answer it, jumping the clock; the road finishes by time.
  let now = t0;
  for (let guard = 0; guard < 20; guard += 1) {
    const view = getTravelView(trip.id, now);
    if (!view || view.arrived) break;
    if (view.encounter) {
      const res = chooseTravel(trip.id, 'ignore', now);
      now = res.travel.arrived ? now : now + 1;
      continue;
    }
    now += trip.minutes * MS_PER_MINUTE;
  }

  // Arrival is idempotent: the finished road keeps answering `arrived`, so a
  // client that polls once more does not fall into a 404.
  const done = getTravelView(trip.id, now);
  assert.equal(done.arrived, true, 'the finished trip reports arrival');
  assert.equal(done.minute, trip.minutes);
  assert.equal(getTravelView(trip.id, now).arrived, true, 'reading it again still arrives');
  const next = startTravel({ characterId: leader.id, fromId: to.id, toId: from.id, now });
  assert.notEqual(next.id, trip.id, 'a finished road does not block the next one');
});

test('an inn mends the party; a merchant takes coin', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith(50);
  getDb().prepare('UPDATE characters SET hp = 1 WHERE id = ?').run(leader.id);
  const t0 = 0;
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: t0 });

  // Force the pending encounter to be one we can reason about.
  const state = JSON.parse(getDb().prepare('SELECT state FROM travels WHERE id = ?').get(trip.id).state);
  state.pending = { minute: 5, encounter: { id: 'inn', kind: 'inn', title: 'Двор' } };
  state.segmentStart = null;
  state.walkedMs = 5 * MS_PER_MINUTE;
  getDb().prepare('UPDATE travels SET state = ? WHERE id = ?').run(JSON.stringify(state), trip.id);

  const before = getCharacter(leader.id).hp;
  const res = chooseTravel(trip.id, 'rest', t0);
  assert.equal(res.outcome.kind, 'heal');
  assert.ok(getCharacter(leader.id).hp > before, 'resting healed the leader');
});

test('gold never goes below zero from a road outcome', () => {
  const { from, to } = dangerousRoad();
  const leader = leaderWith(0);
  const t0 = 0;
  const trip = startTravel({ characterId: leader.id, fromId: from.id, toId: to.id, now: t0 });
  const state = JSON.parse(getDb().prepare('SELECT state FROM travels WHERE id = ?').get(trip.id).state);
  state.pending = { minute: 5, encounter: { id: 'merchant', kind: 'merchant', title: 'Торговец' } };
  state.segmentStart = null;
  state.walkedMs = 5 * MS_PER_MINUTE;
  getDb().prepare('UPDATE travels SET state = ? WHERE id = ?').run(JSON.stringify(state), trip.id);

  const res = chooseTravel(trip.id, 'trade', t0);
  assert.ok(res.outcome.delta < 0, 'trade costs money');
  assert.ok(getCharacter(leader.id).gold >= 0, 'gold is clamped at zero');
});
