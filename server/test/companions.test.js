import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import {
  COMPANIONS, RECRUIT_SOURCES, TRAITS, PORTRAITS,
  traitCompat, templatePrice, seedBondBetween, seedOpinionToPlayer,
  acceptanceChance, shouldLeave, clampRelation, LEAVE_THRESHOLD,
} from '../src/game/companions.js';

const byKey = (k) => COMPANIONS.find((c) => c.key === k);

test('every companion template is well formed', () => {
  assert.ok(COMPANIONS.length >= 12, 'at least a dozen companions');
  for (const c of COMPANIONS) {
    assert.ok(c.name && c.history.length > 20, `${c.key} needs a history`);
    assert.ok(c.plus.length >= 2 && c.minus.length >= 2, `${c.key} needs pluses and minuses`);
    for (const t of [...c.plus, ...c.minus]) assert.ok(TRAITS[t], `${c.key} unknown trait ${t}`);
    assert.ok(c.sources.length >= 1 && c.sources.every((s) => RECRUIT_SOURCES[s]), `${c.key} bad source`);
    assert.ok(PORTRAITS[c.portrait], `${c.key} needs a portrait`);
  }
});

test('there are fourteen ways to build a party', () => {
  assert.equal(Object.keys(RECRUIT_SOURCES).length, 14);
});

test('compatible people bond higher than clashing ones', () => {
  const marta = byKey('marta_veil');
  const dorin = byKey('dorin_stone');
  const brann = byKey('brann');
  const lute = byKey('lute');
  const kin = seedBondBetween(dorin, brann);
  const clash = seedBondBetween(lute, marta);
  assert.ok(kin > clash, `kindred pair ${kin} should beat hostile pair ${clash}`);
  assert.ok(kin > 60 && clash < 40);
  assert.ok(kin >= 30 && kin <= 90 && clash >= 30 && clash <= 90);
});

test('traitCompat is symmetric and bounded', () => {
  const a = [...byKey('gorr').plus, ...byKey('gorr').minus];
  const b = [...byKey('yara_thorn').plus, ...byKey('yara_thorn').minus];
  const ab = traitCompat(a, b);
  const ba = traitCompat(b, a);
  assert.equal(ab, ba);
  assert.ok(ab >= -1 && ab <= 1);
});

test('relationships are clamped to 0..100', () => {
  assert.equal(clampRelation(-40), 0);
  assert.equal(clampRelation(400), 100);
  assert.equal(clampRelation(63.6), 64);
});

test('rescuing someone raises their opinion of the leader', () => {
  const t = byKey('marta_veil');
  const rescued = seedOpinionToPlayer(t, { source: 'rescue' });
  const plain = seedOpinionToPlayer(t, { source: 'road' });
  assert.ok(rescued > plain);
});

test('raising the dead sours the relationship', () => {
  const t = byKey('marta_veil');
  assert.ok(seedOpinionToPlayer(t, { source: 'raise' }) < seedOpinionToPlayer(t, { source: 'road' }));
});

test('prices are deterministic and inside the source range', () => {
  const t = byKey('marta_veil');
  const p1 = templatePrice(t);
  const p2 = templatePrice(byKey('marta_veil'));
  assert.equal(p1, p2);
  const [lo, hi] = RECRUIT_SOURCES[t.sources[0]].goldRange;
  assert.ok(p1 >= lo && p1 <= hi);
});

test('acceptance chance reacts to the offer and to persuasion', () => {
  const t = byKey('gorr');
  const low = acceptanceChance(t, { source: 'tavern', relationToPlayer: 50, charisma: 50, goldOffered: 0 });
  const high = acceptanceChance(t, { source: 'tavern', relationToPlayer: 50, charisma: 50, goldOffered: 999 });
  assert.ok(high > low, 'a bigger purse should help');
  const charming = acceptanceChance(t, { source: 'tavern', relationToPlayer: 80, charisma: 90, goldOffered: 999 });
  assert.ok(charming >= high);
  assert.ok(low >= 0.05 && charming <= 0.95);
});

test('winning a trial all but guarantees a recruit', () => {
  const chance = acceptanceChance(byKey('cass'), { source: 'arena', relationToPlayer: 20, charisma: 10 });
  assert.ok(chance >= 0.8);
});

test('a companion leaves when any relationship falls below the threshold', () => {
  assert.equal(LEAVE_THRESHOLD, 25);
  assert.equal(shouldLeave({ relationToPlayer: 80, bonds: [{ key: 2, value: 60 }] }).leave, false);
  assert.equal(shouldLeave({ relationToPlayer: 24, bonds: [] }).leave, true);
  const peer = shouldLeave({ relationToPlayer: 80, bonds: [{ key: 2, value: 10 }] });
  assert.equal(peer.leave, true);
  assert.equal(peer.reason, 'peer');
  assert.equal(peer.peerKey, 2);
});
