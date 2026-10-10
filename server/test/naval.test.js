import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { seedContinents } from '../src/db/seed_continents.js';
import { createCharacter } from '../src/services/characters.js';
import { recordVisit } from '../src/services/world.js';
import { buyShip } from '../src/services/ship.js';
import {
  createSeaBattle, takeSeaAction, previewAction, seaBattleOver,
  heroShipSide, enemySide, pirateTier, monsterTier, seaPoints, effectiveOutput,
  rollIslands, rollVoyage, ISLAND_POOL_SIZE, seaHitChance, playerSide, enemySideOf,
} from '../src/game/naval.js';
import { POINTS_PER_PIRATE_WIN, POINTS_PER_MONSTER_WIN, bonusesFrom, forgedForLevel } from '../src/game/ship.js';

let n = 0;
function hero({ gold = 5000, klass = 'fighter', inPort = true } = {}) {
  n += 1;
  seedWorld();
  const c = createCharacter({ name: `Моряк ${n} ${Math.floor(Math.random() * 1e6)}`, class: klass });
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, c.id);
  if (inPort) {
    const port = getDb().prepare("SELECT id FROM locations WHERE name = 'Сумеречная гавань'").get().id;
    recordVisit(c.id, port);
  }
  return c;
}

const shipKit = (level = 1, bonuses = {}) => ({
  level,
  bonuses: { hullHp: 0, armour: 0, gunSlots: 0, cannonDamage: 0, reload: 0, accuracy: 0, evade: 0, crew: 0, ...bonuses },
  party: { attack: 60, defense: 50, members: 3 },
});

test.after(() => closeDb());

// --- pure engine -------------------------------------------------------------

test('a hero ship folds the party and the ship bonuses into one side', () => {
  const s = heroShipSide(shipKit(3, { hullHp: 100, gunSlots: 2, cannonDamage: 0.5 }));
  assert.equal(s.side, 'player');
  assert.equal(s.hull.maxHp, 300, 'base 200 + 100 from the hull');
  assert.equal(s.guns.count, 3, 'base 1 + 2 slots');
  assert.ok(s.guns.damage > 12, 'the cannon damage bonus raises the broadside');
  assert.ok(s.crew.count >= 1);
});

test('enemies scale with the tier, so a maxed ship still faces a real fight', () => {
  for (let t = 1; t <= 9; t += 1) {
    const a = pirateTier(t);
    const b = pirateTier(t + 1);
    assert.ok(b.hullHp > a.hullHp && b.crewCount > a.crewCount, `tier ${t + 1} pirates are stronger`);
    const ma = monsterTier(t);
    const mb = monsterTier(t + 1);
    assert.ok(mb.hullHp > ma.hullHp && mb.attack > ma.attack, `tier ${t + 1} monsters are stronger`);
  }
  const m1 = monsterTier(1);
  const m10 = monsterTier(10);
  assert.ok(m10.hullHp > m1.hullHp && m10.attack > m1.attack);
  // Both kinds must scale with the ship, not against a fixed table: a deeper
  // tier is sized for a stronger ship.
  assert.ok(pirateTier(10).hullHp > pirateTier(1).hullHp * 5);
  assert.ok(monsterTier(10).hullHp > monsterTier(1).hullHp * 5);
});

// A fully built ship at level L: the state a player reaches the tier-L fight in.
function builtShip(level) {
  const b = bonusesFrom(forgedForLevel(level));
  return { level, bonuses: { level, ...b, gunSlots: 1 + (b.gunSlots || 0) }, party: { attack: 60, defense: 50, members: 3 } };
}
// Greedy player: pick the action with the best expected damage each turn.
function bestAction(state) {
  let best = { type: 'broadside' }; let bestV = -1;
  for (const type of ['broadside', 'board', 'ram']) {
    const pv = previewAction(state, { type });
    if (!pv || pv.disabled) continue;
    const v = (pv.hitChance / 100) * pv.damage;
    if (v > bestV) { bestV = v; best = { type }; }
  }
  return best;
}
// A small deterministic RNG so a whole fight is reproducible in tests (both the
// enemy's opening turn and every later exchange draw from it).
function seededRng(str) {
  let a = 0;
  for (let i = 0; i < str.length; i += 1) a = (a * 31 + str.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fight(shipLevel, kind, tier, seed) {
  const rng = seededRng(seed);
  const st = createSeaBattle({ kind, tier, ship: builtShip(shipLevel), seed, rng });
  let guard = 0;
  while (!st.over && guard < 800) { takeSeaAction(st, bestAction(st), rng).state; guard += 1; }
  return st;
}
// Average over a few seeds to cover variance; each fight is fully deterministic.
function avgFight(shipLevel, kind, tier, trials = 7) {
  let lost = 0; let rounds = 0;
  for (let i = 0; i < trials; i += 1) {
    const st = fight(shipLevel, kind, tier, `bal:${kind}:${tier}:${i}`);
    lost += 1 - playerSide(st).hull.hp / playerSide(st).hull.maxHp;
    rounds += st.round;
  }
  return { lost: lost / trials, rounds: rounds / trials };
}

test('a fully built ship meets a real fight at every tier (hull is dented, fight lasts)', () => {
  for (const tier of [1, 3, 5, 7, 10]) {
    for (const kind of ['pirates', 'sea_monster']) {
      const r = avgFight(tier, kind, tier);
      assert.ok(r.lost >= 0.03, `tier ${tier} ${kind}: the hull takes real damage (lost ${(r.lost * 100).toFixed(0)}%)`);
      assert.ok(r.rounds >= 3, `tier ${tier} ${kind}: the fight lasts more than a couple of rounds (${r.rounds.toFixed(1)})`);
      assert.ok(r.rounds <= 30, `tier ${tier} ${kind}: the fight does not drag on (${r.rounds.toFixed(1)})`);
    }
  }
  // The deep fight must not be a two-turn rout the way a flat enemy table was.
  assert.ok(avgFight(10, 'sea_monster', 10).rounds > 3, 'the deepest fight is not a rout');
});

test('a fight the enemy opens is never left active without a player turn', () => {
  const pirate = enemySide('pirates', 3, 's');
  assert.equal(pirate.kind, 'pirate');
  assert.ok(pirate.crew.count > 0 && pirate.hull.maxHp > 0);
  const monster = enemySide('sea_monster', 3, 's');
  assert.equal(monster.kind, 'monster');
  assert.equal(monster.crew, null, 'the ship fights a monster alone');
});

test('the sea engine is diceless: an action previews an honest hit chance and damage', () => {
  const st = createSeaBattle({ kind: 'pirates', tier: 4, ship: shipKit(4), seed: 'x' });
  const broad = previewAction(st, { type: 'broadside' });
  assert.ok(broad.hitChance >= 5 && broad.hitChance <= 95);
  assert.ok(broad.damage > 0);
  const board = previewAction(st, { type: 'board' });
  assert.equal(board.target, 'команда');
  const ram = previewAction(st, { type: 'ram' });
  assert.equal(ram.disabled, true, 'no ram without the upgrade');
});

test('a fight the enemy opens is never left active without a player turn', () => {
  // A faster enemy acts first; createSeaBattle must resolve those turns so the
  // returned state either awaits the player or is already over.
  for (let i = 0; i < 30; i += 1) {
    const st = createSeaBattle({ kind: 'pirates', tier: 8, ship: shipKit(1), seed: `s${i}` });
    if (!st.over) {
      const hero = playerSide(st);
      const activeKey = st.order[st.turnIndex % st.order.length];
      assert.equal(activeKey, hero.key, 'an active sea fight waits for the player');
    }
  }
});

test('a sea fight runs to a winner', () => {
  const run = () => {
    const st = createSeaBattle({ kind: 'sea_monster', tier: 5, ship: shipKit(5, { cannonDamage: 0.4 }), seed: 'fixed' });
    let guard = 0;
    while (!st.over && guard < 300) { takeSeaAction(st, { type: 'broadside' }, () => 0.5); guard += 1; }
    return { over: st.over, winner: st.winner, hull: playerSide(st).hull.hp };
  };
  const a = run();
  assert.equal(a.over, true, 'the fight ends');
  assert.ok(['player', 'enemy'].includes(a.winner), 'somebody wins');
  const b = run();
  assert.equal(b.over, true);
});

test('sea points scale with the tier for both kinds, anchored at the user figures', () => {
  // The user's flat figures are the tier-1 anchors.
  assert.equal(seaPoints('pirates', 1), POINTS_PER_PIRATE_WIN);
  assert.equal(seaPoints('sea_monster', 1), POINTS_PER_MONSTER_WIN.min);
  // A deeper foe is worth more, because the fight is sized for a stronger ship.
  for (const kind of ['pirates', 'sea_monster']) {
    for (let t = 1; t < 10; t += 1) {
      assert.ok(seaPoints(kind, t + 1) > seaPoints(kind, t), `${kind} tier ${t + 1} pays more`);
    }
  }
  assert.ok(seaPoints('pirates', 10) > POINTS_PER_PIRATE_WIN, 'deep pirates pay more than the flat anchor');
  assert.ok(seaPoints('sea_monster', 10) > POINTS_PER_MONSTER_WIN.max, 'the deep beast tops its tier-1 band');
  // A monster is always worth at least a little more than a pirate at equal tier.
  for (let t = 1; t <= 10; t += 1) {
    assert.ok(seaPoints('sea_monster', t) > seaPoints('pirates', t), `tier ${t}: a beast pays more than pirates`);
  }
});

test('the hit helper keeps the same 5..95 band as the land engine', () => {
  const weak = { guns: { accuracy: -1000 }, evade: 0 };
  const strong = { guns: { accuracy: 1000 }, evade: 0 };
  assert.equal(seaHitChance(weak, strong), 5);
  assert.equal(seaHitChance(strong, strong), 95);
});

// --- Fortune islands ---------------------------------------------------------

test('islands never repeat within a voyage and are stable per seed', () => {
  const a = rollIslands('voyage:1', 5);
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((i) => i.id)).size, 5, 'all distinct');
  const b = rollIslands('voyage:1', 5);
  assert.deepEqual(a, b, 'the same seed yields the same islands');
  assert.ok(ISLAND_POOL_SIZE > 100, 'the pool is large enough to stay fresh');
});

test('a voyage draws zero to two non-repeating stops, stable per seed', () => {
  for (let i = 0; i < 40; i += 1) {
    const v = rollVoyage({ seed: `v${i}`, tier: 3 });
    assert.ok(v.stops.length >= 0 && v.stops.length <= 2);
    const again = rollVoyage({ seed: `v${i}`, tier: 3 });
    assert.deepEqual(v.stops, again.stops, 'a reload cannot reroll the sea');
  }
});

// --- service over the DB -----------------------------------------------------

test('a sea battle needs a ship and pays ship points only on a win', async () => {
  const { startNavalBattle, takeNavalTurn } = await import('../src/services/naval.js');
  const c = hero();
  assert.throws(() => startNavalBattle(c.id, { kind: 'pirates' }), /корабл/i, 'no ship, no fight');

  buyShip(c.id, { name: 'Тест' });

  // The sea engine is random, so run a few tier-1 fights until one is won, then
  // pin the payout. An active battle blocks the next, so each is settled first.
  let wonView = null;
  for (let attempt = 0; attempt < 12 && !wonView; attempt += 1) {
    let v = startNavalBattle(c.id, { kind: 'pirates', tier: 1, seed: `pay-${attempt}` });
    let guard = 0;
    while (!v.over && guard < 200) { v = takeNavalTurn(v.id, { type: 'broadside' }); guard += 1; }
    if (v.winner === 'player') wonView = v;
  }
  assert.ok(wonView, 'a low-tier pirate fight can be won');
  assert.ok(wonView.result.shipPoints >= POINTS_PER_PIRATE_WIN, 'a win pays ship points');
  const points = getDb().prepare('SELECT points FROM ships WHERE character_id = ?').get(c.id).points;
  assert.ok(points >= POINTS_PER_PIRATE_WIN);
});

// --- voyage + papers ---------------------------------------------------------

const PORT_A = 'Сумеречная гавань';
const PORT_B = 'Порт Солёного Стекла';

test('a voyage charges the fare, keeps the party at sea, and lands it at the far port', async () => {
  const { startVoyage, getVoyageView, resolveVoyageStop, putInIsland, sailPastIsland } = await import('../src/services/naval.js');
  const { getPapers } = await import('../src/services/naval.js');
  const { routeFor } = await import('../src/game/continent_travel.js');
  const { grantItem } = await import('../src/services/items.js');
  const { characterExploration } = await import('../src/services/world.js');

  const c = hero({ gold: 5000 });
  seedContinents();
  buyShip(c.id, { name: 'Вестник' });
  const route = routeFor(PORT_A, PORT_B);
  getDb().prepare('UPDATE characters SET gold = ? WHERE id = ?').run(route.gold + 50, c.id);
  if (route.item) grantItem(c.id, route.item.key, route.item.qty);

  const view = startVoyage({ characterId: c.id, fromId: portId(), toId: portBId() });
  assert.equal(view.to, PORT_B);
  assert.equal(view.mode, 'voyage', 'the party is on the open water, not landed yet');
  assert.ok(view.stops.length <= 2, 'zero to two stops');

  const after = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(c.id).gold;
  assert.ok(after <= 50, 'the fare was paid');

  // The party is at sea until every stop is answered; the road lands it at the
  // far port only when the list runs out.
  assert.equal(characterExploration(c.id).locationId, portId(), 'still at the home port until the voyage ends');

  let res = getVoyageView(c.id);
  let guard = 0;
  while (res && !res.done && guard < 12) {
    const r = resolveVoyageStop(c.id);
    guard += 1;
    res = getVoyageView(c.id);
    // An island asks first: decide so the loop can move on.
    if (r?.ask === 'island') {
      if (guard % 2 === 0) sailPastIsland(c.id); else putInIsland(c.id);
      res = getVoyageView(c.id);
      if (res?.mode === 'island') {
        const { leaveIsland } = await import('../src/services/naval.js');
        leaveIsland(c.id);
        res = getVoyageView(c.id);
      }
    }
    // If a fight was opened, settle it first so the voyage can continue.
    const active = getDb().prepare("SELECT id FROM naval_battles WHERE character_id = ? AND status = 'active'").get(c.id);
    if (active) {
      const { takeNavalTurn, getNavalView } = await import('../src/services/naval.js');
      let nv = getNavalView(active.id);
      let turnGuard = 0;
      while (!nv.over && turnGuard < 200) { nv = takeNavalTurn(active.id, { type: 'broadside' }); turnGuard += 1; }
    }
  }
  assert.equal(res, null, 'the voyage is over (resolved)');
  assert.equal(characterExploration(c.id).locationId, portBId(), 'landed at the far port');
  const papers = getPapers(c.id);
  assert.ok(papers.log.some((e) => e.kind === 'voyage'), 'the papers record the voyage');
});

test('the papers hold a free-form journal and learned lore', async () => {
  const { getPapers, setPapersNotes } = await import('../src/services/naval.js');
  const { addUnlock } = await import('../src/services/quests.js');
  const c = hero();
  setPapersNotes(c.id, 'Вернуться к Стеклянному маяку.');
  addUnlock(c.id, 'drowned_road');
  const papers = getPapers(c.id);
  assert.equal(papers.notes, 'Вернуться к Стеклянному маяку.');
  assert.ok(papers.lore.some((l) => /Утонувшая дорога/.test(l.text)), 'a learned note writes itself in');
});

const portId = () => getDb().prepare("SELECT id FROM locations WHERE name = ?").get(PORT_A).id;
const portBId = () => getDb().prepare("SELECT id FROM locations WHERE name = ?").get(PORT_B).id;
