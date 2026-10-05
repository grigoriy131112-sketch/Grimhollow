import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter, getCharacter } from '../src/services/characters.js';
import { recruit, getParty, getMember, adjustRelation } from '../src/services/party.js';
import { grantItem, listItems } from '../src/services/items.js';
import { awardPartyPoints, spendUpgrade, getPoints } from '../src/services/upgrades.js';
import { recordVisit } from '../src/services/world.js';
import {
  createSave, listSaves, getSave, loadSave, deleteSave, exportSave, importSave, captureSnapshot,
} from '../src/services/saves.js';

test.after(() => closeDb());

const name = () => `Герой ${Math.floor(Math.random() * 1e6)}`;

function locationId(name) {
  seedWorld();
  return getDb().prepare('SELECT id FROM locations WHERE name = ?').get(name).id;
}

// Build a hero whose whole state is worth saving: resources, gold, xp/level,
// a place, an item, a companion with a relation, and party upgrades.
function richHero() {
  const leader = createCharacter({ name: name(), class: 'fighter' });
  const db = getDb();
  const loc = locationId('Затонувшая часовня');
  recordVisit(leader.id, loc);
  db.prepare("UPDATE characters SET level=?, xp=?, hp=?, mana=?, stamina=?, gold=?, party_points=? WHERE id=?")
    .run(7, 3000, 41, 12, 9, 777, 9, leader.id);

  grantItem(leader.id, 'shepherd_key', 1);
  grantItem(leader.id, 'shepherd_crook', 2);

  db.prepare('UPDATE characters SET gold = 9999 WHERE id = ?').run(leader.id);
  const member = recruit(leader.id, 'marta_veil', { source: 'road', goldOffered: 9999 }, () => 0).member;
  db.prepare("UPDATE party_members SET level=?, xp=?, hp=?, status='active' WHERE id=?")
    .run(4, 700, 22, member.id);
  adjustRelation(member.id, null, 17);

  awardPartyPoints(leader.id, 30);
  spendUpgrade(leader.id, 'command_hp');
  spendUpgrade(leader.id, 'command_hp');

  return { leader, member, loc };
}

test('a save captures the full character state without touching the live game', () => {
  const { leader, member } = richHero();
  const before = getCharacter(leader.id);

  const save = createSave(leader.id, 'Перед часовней');
  assert.equal(save.name, 'Перед часовней');
  assert.equal(save.characterId, leader.id);

  // The auto-saved live character is untouched by taking a slot.
  assert.deepEqual(getCharacter(leader.id), before, 'creating a save does not mutate the hero');

  const snapshot = exportSave(save.id).snapshot;
  assert.equal(snapshot.character.name, before.name);
  assert.equal(snapshot.character.gold, 9999); // road recruitment is free
  assert.equal(snapshot.character.level, 7);
  assert.equal(snapshot.character.hp, 41);
  assert.equal(snapshot.character.mana, 12);
  assert.equal(snapshot.character.stamina, 9);
  assert.equal(snapshot.character.locationId, locationId('Затонувшая часовня'));
  assert.deepEqual(snapshot.items.map((i) => [i.key, i.qty]).sort(), [['shepherd_crook', 2], ['shepherd_key', 1]]);
  assert.equal(snapshot.party.length, 1);
  assert.equal(snapshot.party[0].name, member.name);
  assert.equal(snapshot.party[0].hp, 22);
  assert.ok(snapshot.upgrades.some((u) => u.node === 'command_hp' && u.points === 2));
});

test('loading a save fully restores the character state', () => {
  const { leader, member } = richHero();
  const save = createSave(leader.id, 'Слот');
  const relationBefore = getParty(leader.id).members[0].relationToLeader;

  // Wreck the live state: lose resources, gold, an item, the companion, the
  // upgrades and the location. A load must bring all of it back.
  const db = getDb();
  db.prepare("UPDATE characters SET level=1, xp=0, hp=1, mana=0, stamina=0, gold=0, party_points=0, location_id=NULL WHERE id=?")
    .run(leader.id);
  db.prepare('DELETE FROM character_items WHERE character_id=?').run(leader.id);
  db.prepare('DELETE FROM party_members WHERE leader_id=?').run(leader.id);
  db.prepare('DELETE FROM party_relations WHERE leader_id=?').run(leader.id);
  db.prepare('DELETE FROM party_upgrades WHERE leader_id=?').run(leader.id);
  db.prepare('DELETE FROM character_visits WHERE character_id=?').run(leader.id);

  const restored = loadSave(save.id);
  assert.equal(restored.characterId, leader.id);
  const c = restored.character;
  assert.equal(c.level, 7);
  assert.equal(c.xp, 3000);
  assert.equal(c.hp, 41);
  assert.equal(c.mana, 12);
  assert.equal(c.stamina, 9);
  assert.equal(c.gold, 9999);
  assert.equal(c.locationId, locationId('Затонувшая часовня'));
  assert.equal(getPoints(leader.id), 9 + 30 - 6, 'spent and unspent party points come back');

  const items = listItems(leader.id);
  assert.deepEqual(items.map((i) => [i.key, i.qty]).sort(), [['shepherd_crook', 2], ['shepherd_key', 1]]);

  const party = getParty(leader.id);
  assert.equal(party.size, 1);
  assert.equal(party.members[0].name, member.name);
  assert.equal(party.members[0].relationToLeader, relationBefore, 'relations are restored');
  // getParty() folds in the leader's tree bonuses; read the raw stored sheet.
  const raw = getMember(party.members[0].id);
  assert.equal(raw.level, 4);
  assert.equal(raw.hp, 22);

  // Loading twice is idempotent: no duplicated companions or items.
  loadSave(save.id);
  assert.equal(getParty(leader.id).size, 1);
  assert.equal(listItems(leader.id).length, 2);
});

test('saves are listed per character and can be deleted', () => {
  const { leader } = richHero();
  const other = createCharacter({ name: name(), class: 'rogue' });

  createSave(leader.id, 'A');
  createSave(leader.id, 'B');
  createSave(other.id, 'C');

  const mine = listSaves(leader.id);
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((s) => s.name).sort(), ['A', 'B']);
  assert.equal(listSaves(other.id).length, 1);
  assert.equal(getSave(mine[0].id).characterId, leader.id);

  assert.equal(deleteSave(mine[0].id), true);
  assert.equal(listSaves(leader.id).length, 1);
  assert.equal(deleteSave(mine[0].id), false, 'deleting a missing save is a no-op');
  assert.equal(getSave(mine[0].id), null);
});

test('export/import round-trips a save into a brand-new hero', () => {
  const { leader } = richHero();
  const save = createSave(leader.id, 'Экспорт');
  const exported = exportSave(save.id);
  assert.equal(exported.snapshot.character.name, getCharacter(leader.id).name);

  const imported = importSave(exported.snapshot, {});
  assert.notEqual(imported.characterId, leader.id, 'a fresh import makes a new hero');
  const c = imported.character;
  assert.equal(c.level, 7);
  assert.equal(c.hp, 41);
  assert.equal(c.gold, 9999);
  assert.equal(c.locationId, locationId('Затонувшая часовня'));
  assert.equal(listItems(imported.characterId).length, 2);
  assert.equal(getParty(imported.characterId).size, 1);
  assert.equal(getPoints(imported.characterId), 9 + 30 - 6);
});

test('importing over an existing hero replaces its state', () => {
  const source = richHero();
  const save = createSave(source.leader.id, 'Исходник');
  const snapshot = exportSave(save.id).snapshot;

  const target = createCharacter({ name: name(), class: 'wizard' });
  grantItem(target.id, 'shepherd_key', 1);

  const result = importSave(snapshot, { characterId: target.id });
  assert.equal(result.characterId, target.id, 'the existing hero is reused');
  assert.equal(result.character.name, snapshot.character.name);
  assert.equal(result.character.hp, 41);
  // The item the target had before must not survive a wholesale replace.
  const keys = listItems(target.id).map((i) => i.key).sort();
  assert.deepEqual(keys, ['shepherd_crook', 'shepherd_key']);
});

test('a corrupted snapshot is rejected and leaves the hero alone', () => {
  const leader = createCharacter({ name: name(), class: 'fighter' });
  const before = getCharacter(leader.id);

  assert.throws(() => importSave({ character: { name: 'X', class: 'not_a_class', level: 1 } }, {}), /класс/);
  assert.throws(() => importSave({ character: { name: 'X', class: 'fighter', level: 99 } }, {}), /уровень/);
  assert.throws(() => importSave(null, {}), /повреждено/);

  assert.deepEqual(getCharacter(leader.id), before);
  assert.equal(listSaves(leader.id).length, 0);
});

test('captureSnapshot reads the same shape the export writes', () => {
  const { leader } = richHero();
  const snapshot = captureSnapshot(leader.id);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.character.class, 'fighter');
  assert.ok(Array.isArray(snapshot.visits));
  assert.ok(snapshot.visits.length >= 1);
});
