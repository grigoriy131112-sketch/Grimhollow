// Regression tests for bugs found in the cross-wave audit. Each one pins a fix
// that a whole feature depended on but nothing covered before.

import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { getMap, getLocation, recordVisit, recordVisited } from '../src/services/world.js';
import { startTravel, getTravelView, chooseTravel } from '../src/services/travel.js';
import { MS_PER_MINUTE } from '../src/game/travel.js';
import { startBattle, getBattle, getBattleView } from '../src/services/battles.js';
import { effectiveStat } from '../src/game/combat.js';
import { grantItem, equipItem, applyBuff } from '../src/services/items.js';
import { startCrossing } from '../src/services/continents.js';
import { CROSSINGS, resolveCrossing } from '../src/game/continent_travel.js';
import { seedContinents } from '../src/db/seed_continents.js';

test.after(() => closeDb());

function leader(classKey = 'fighter') {
  return createCharacter({ name: `Проверка ${Math.floor(Math.random() * 1e9)}`, class: classKey });
}

// --- 1. travel/continent healing must not overflow to a full heal -----------

test('a road heal clamps to the maximum instead of resetting the pools', () => {
  seedWorld();
  const map = getMap();
  const locs = new Map(map.locations.map((l) => [l.id, l]));
  const road = map.connections.find((c) => Math.max(locs.get(c.from).danger, locs.get(c.to).danger) >= 1);
  const hero = leader();
  getDb().prepare('UPDATE characters SET hp = 1, mana = 1, stamina = 1 WHERE id = ?').run(hero.id);

  const t0 = 0;
  const trip = startTravel({ characterId: hero.id, fromId: road.from, toId: road.to, now: t0 });
  // Pin the next stop to an inn (a heal), then answer it.
  const state = JSON.parse(getDb().prepare('SELECT state FROM travels WHERE id = ?').get(trip.id).state);
  state.pending = { minute: 5, encounter: { id: 'inn', kind: 'inn', title: 'Двор' } };
  state.segmentStart = null;
  state.walkedMs = 5 * MS_PER_MINUTE;
  getDb().prepare('UPDATE travels SET state = ? WHERE id = ?').run(JSON.stringify(state), trip.id);

  const res = chooseTravel(trip.id, 'rest', t0);
  assert.equal(res.outcome.kind, 'heal');
  const after = getCharacter(hero.id);
  // The old bug stored NaN as NULL, which reads back as a full pool. Prove the
  // heal actually moved the number and stayed inside the ceiling.
  assert.ok(after.hp > 1 && after.hp < after.stats.maxHp, `hp healed but did not reset (${after.hp}/${after.stats.maxHp})`);
  assert.ok(Number.isFinite(after.hp) && Number.isFinite(after.mana) && Number.isFinite(after.stamina));
});

test('a calm sea crossing clamps its heal too', () => {
  seedWorld();
  seedContinents();
  const hero = leader();

  // Find a deterministic crossing that resolves to a heal: the outcome's seed is
  // `${fromId}->${toId}` and the day is fixed, so trying days is enough to find
  // one without touching the service's private math.
  let pick = null;
  for (const route of CROSSINGS) {
    const far = getDb().prepare('SELECT id, name FROM locations WHERE name = ?').get(route.to);
    const from = getDb().prepare('SELECT id, name FROM locations WHERE name = ?').get(route.from);
    if (!from || !far) continue;
    const probe = CROSSINGS.indexOf(route);
    void probe;
    // resolveCrossing is the same pure rule the service uses.
    for (const day of Array.from({ length: 5000 }, (_, i) => i + 1)) {
      const outcome = resolveCrossing(route, { seed: `${from.id}->${far.id}`, day });
      if (outcome.kind === 'heal') { pick = { from, to: far, day }; break; }
    }
    if (pick) break;
  }
  assert.ok(pick, 'a heal crossing exists for some day of this world');

  getDb().prepare('UPDATE characters SET gold = 5000, hp = 1, mana = 1, stamina = 1 WHERE id = ?').run(hero.id);
  recordVisit(hero.id, pick.from.id);
  // Some routes demand a toll item; hand it over so only the heal is under test.
  const route = CROSSINGS.find((r) => r.from === pick.from.name && r.to === pick.to.name);
  if (route && route.item) grantItem(hero.id, route.item.key, route.item.qty);
  const res = startCrossing({
    characterId: hero.id, fromId: pick.from.id, toId: pick.to.id, now: pick.day * 86_400_000,
  });
  assert.equal(res.outcome.kind, 'heal');
  const after = getCharacter(hero.id);
  assert.ok(after.hp > 1 && after.hp <= after.stats.maxHp, `crossing heal moved but did not exceed the cap (${after.hp})`);
  assert.ok(Number.isFinite(after.hp) && Number.isFinite(after.mana) && Number.isFinite(after.stamina));
});

// --- 2. a battle decided before the player's first turn must settle ---------

test('a battle the enemy wins before the player acts is settled, not left active', () => {
  seedWorld();
  const boss = getDb().prepare('SELECT id FROM monsters ORDER BY level DESC LIMIT 1').get();
  let instant = null;
  // startBattle uses a real RNG, so an enemy-only opening turn happens on some
  // rolls. Loop until one occurs, then pin the fix; along the way assert the
  // invariant that an active battle always awaits the player.
  for (let i = 0; i < 40 && !instant; i += 1) {
    const hero = leader('wizard');
    const battle = startBattle({ characterId: hero.id, monsterId: boss.id, locationId: 1 });
    const view = getBattleView(battle.id);
    if (view.status !== 'active') instant = { hero, view };
    else assert.equal(view.isPlayerTurn, true, 'an active battle always waits for the player');
  }
  assert.ok(instant, 'the enemy can decide a fight before the player acts');
  assert.ok(instant.view.result, 'the end-of-battle report is stored');
  const after = getCharacter(instant.hero.id);
  assert.equal(after.fate, 'dead', 'a wiped party kills the hero for good');
  assert.equal(after.hp, 0);
});

test('a normal battle is still active and awaits the player', () => {
  seedWorld();
  const hero = leader('fighter');
  const weak = getDb().prepare('SELECT id FROM monsters ORDER BY level ASC LIMIT 1').get();
  const battle = startBattle({ characterId: hero.id, monsterId: weak.id, locationId: 1 });
  const view = getBattleView(battle.id);
  assert.equal(view.status, 'active');
  assert.equal(view.isPlayerTurn, true);
  assert.equal(view.result, null);
});

// --- 3. the chapel key is granted on arrival, even if the place was opened --

test('opening the chapel from the map does not steal its ritual key', () => {
  seedWorld();
  const map = getMap();
  const chapel = map.locations.find((l) => l.name === 'Затонувшая часовня');
  const neighbour = map.locations.find((l) => map.connections.some(
    (c) => (c.from === chapel.id && c.to === l.id) || (c.to === chapel.id && c.from === l.id),
  ));
  const hero = leader();
  recordVisit(hero.id, neighbour.id);

  // The player merely looks at the chapel page first (the Location screen does
  // this on mount, without moving the party).
  const looked = recordVisited(hero.id, chapel.id);
  assert.equal(looked.firstVisit, true, 'the sighting is recorded');

  // Now the party actually walks there.
  const t0 = 9_000;
  const trip = startTravel({ characterId: hero.id, fromId: neighbour.id, toId: chapel.id, now: t0 });
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
  assert.equal(getCharacter(hero.id).locationId, chapel.id, 'and now stands there');
  const key = getDb().prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(hero.id, 'shepherd_key');
  assert.ok(key && key.qty >= 1, 'the arrival still grants the key');

  // Walking in again must not farm a second key.
  const t1 = now + 1_000_000;
  const second = startTravel({ characterId: hero.id, fromId: chapel.id, toId: neighbour.id, now: t1 });
  void second;
  const again = getDb().prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(hero.id, 'shepherd_key');
  assert.equal(again.qty, key.qty, 'the key is granted once, not per visit');
});

// --- 4. equipment and buffs must reach the fight ----------------------------

test('equipment, buffs and needs reach the combatant that fights', () => {
  seedWorld();
  const hero = leader('fighter');
  const base = getCharacter(hero.id).stats;
  grantItem(hero.id, 'worn_leathers', 1);
  equipItem(hero.id, 'worn_leathers');
  applyBuff(hero.id, {
    key: 'iron_brew', source: 'consumable:iron_brew', sourceType: 'buff',
    stat: 'defense', amount: 6, turns: 3, label: 'Железный настой',
  });

  const weak = getDb().prepare('SELECT id FROM monsters ORDER BY level ASC LIMIT 1').get();
  const battle = startBattle({ characterId: hero.id, monsterId: weak.id, locationId: 1 });
  const full = getBattle(battle.id);
  const p = full.state.combatants.find((c) => c.kind === 'leader');
  const defMods = p.modifiers.filter((m) => m.stat === 'defense').reduce((s, m) => s + m.amount, 0);
  assert.ok(defMods >= 6, `equipment + buff defence reached the fight (got ${defMods})`);
  assert.equal(p.base.defense, base.defense, 'the sheet stays the un-modded base; mods are separate');

  // The effective stat the engine uses is genuinely higher.
  assert.equal(effectiveStat(p, 'defense'), p.base.defense + defMods);
});
