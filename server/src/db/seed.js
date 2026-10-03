import { getDb, transaction } from './index.js';

// A grim-dark world: a dying continent, its blighted regions, and the things
// that wait in them. Each location lists outgoing roads by name.

const WORLD = [
  {
    name: 'Mordrath',
    description: 'The Sundered Realm. A continent under a sky the colour of old bruises, where the dead do not always stay buried.',
    regions: [
      {
        name: 'The Ashen Reach',
        description: 'Fields of grey dust where a war no one remembers was fought.',
        locations: [
          { name: 'Gallows Crossroads', description: 'A crossroads marked by a gallows that never emptied.', danger: 1, safe: true, connects: ['Weeping Hollow', 'The Drowned Road'] },
          { name: 'Weeping Hollow', description: 'A fog-choked vale that swallows sound and light alike.', danger: 2, connects: ['Gallows Crossroads', 'Cinderwood'] },
          { name: 'The Drowned Road', description: 'A sunken causeway where the marsh crept over a king\'s highway.', danger: 2, connects: ['Gallows Crossroads', 'Sunken Chapel'] },
          { name: 'Cinderwood', description: 'Blackened trees, still warm to the touch, long after the fire.', danger: 3, connects: ['Weeping Hollow', 'The Bonefields'] },
        ],
      },
      {
        name: 'The Ossuary Coast',
        description: 'A shore of chalk cliffs and ossuaries, where the sea gives up bones instead of shells.',
        locations: [
          { name: 'Gloamharbour', description: 'A lantern-lit port that trades in salvage and secrets.', danger: 1, safe: true, connects: ['The Drowned Road', 'Tide-Gnawed Caves'] },
          { name: 'Tide-Gnawed Caves', description: 'Sea caves hung with the remains of those the tide claimed.', danger: 3, connects: ['Gloamharbour', 'Sunken Chapel', 'The Bonefields'] },
          { name: 'Sunken Chapel', description: 'A flooded chapel to a god who drowned with his flock.', danger: 4, connects: ['The Drowned Road', 'Tide-Gnawed Caves'] },
          { name: 'The Bonefields', description: 'A plain of bleached remains where the earth never healed.', danger: 4, connects: ['Cinderwood', 'Tide-Gnawed Caves', 'The Black Spire'] },
          { name: 'The Black Spire', description: 'A needle of obsidian that hums with a sound like flies.', danger: 5, connects: ['The Bonefields'] },
        ],
      },
    ],
  },
];

const MONSTERS = [
  { name: 'Grave Rat', description: 'A bloated rat grown fat on corpses.', level: 1, max_hp: 22, attack: 7, defense: 2, accuracy: 22, evasion: 8, speed: 9, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 25, gold_reward: 3 },
  { name: 'Hollow Peasant', description: 'A villager whose eyes hold nothing but hunger.', level: 1, max_hp: 26, attack: 8, defense: 3, accuracy: 20, evasion: 5, speed: 6, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 30, gold_reward: 5 },
  { name: 'Lantern Wight', description: 'A drowned sailor carrying a cold green flame.', level: 2, max_hp: 34, attack: 11, defense: 4, accuracy: 26, evasion: 8, speed: 7, mana: 20, stamina: 0, class_key: 'wizard', xp_reward: 55, gold_reward: 12 },
  { name: 'Briar Stalker', description: 'A knot of thorned limbs that hunts by smell.', level: 2, max_hp: 30, attack: 12, defense: 3, accuracy: 28, evasion: 12, speed: 11, mana: 0, stamina: 40, class_key: 'rogue', xp_reward: 55, gold_reward: 8 },
  { name: 'Ossuary Knight', description: 'Armour animated by grievance, still sworn to a dead liege.', level: 3, max_hp: 52, attack: 15, defense: 8, accuracy: 28, evasion: 6, speed: 7, mana: 0, stamina: 60, class_key: 'fighter', xp_reward: 95, gold_reward: 25 },
  { name: 'Choir Wraith', description: 'A chorus of the damned, singing in one broken voice.', level: 3, max_hp: 46, attack: 16, defense: 5, accuracy: 32, evasion: 14, speed: 10, mana: 50, stamina: 0, class_key: 'wizard', xp_reward: 95, gold_reward: 20 },
  { name: 'Bonefield Colossus', description: 'A hill of fused skeletons that stands and walks.', level: 4, max_hp: 80, attack: 20, defense: 10, accuracy: 30, evasion: 5, speed: 6, mana: 0, stamina: 80, class_key: 'fighter', xp_reward: 150, gold_reward: 45 },
  { name: 'Plague Herald', description: 'A robed figure whose breath turns flesh to rot.', level: 4, max_hp: 64, attack: 18, defense: 7, accuracy: 34, evasion: 12, speed: 9, mana: 70, stamina: 0, class_key: 'cleric', xp_reward: 150, gold_reward: 40 },
  { name: 'Spire Warden', description: 'The thing that keeps the Black Spire\'s door shut.', level: 5, max_hp: 120, attack: 24, defense: 13, accuracy: 34, evasion: 10, speed: 9, mana: 60, stamina: 60, class_key: 'cleric', xp_reward: 260, gold_reward: 90 },
  { name: 'The Hollow King', description: 'Crowned, seated, and entirely empty — save for the flies.', level: 5, max_hp: 140, attack: 26, defense: 12, accuracy: 36, evasion: 12, speed: 11, mana: 40, stamina: 80, class_key: 'fighter', xp_reward: 320, gold_reward: 150 },
];

const SPAWNS = {
  'Weeping Hollow': ['Grave Rat', 'Hollow Peasant', 'Briar Stalker'],
  'The Drowned Road': ['Hollow Peasant', 'Grave Rat', 'Lantern Wight'],
  Cinderwood: ['Briar Stalker', 'Hollow Peasant', 'Choir Wraith'],
  'Tide-Gnawed Caves': ['Lantern Wight', 'Ossuary Knight', 'Grave Rat'],
  'Sunken Chapel': ['Lantern Wight', 'Choir Wraith', 'Plague Herald'],
  'The Bonefields': ['Ossuary Knight', 'Bonefield Colossus', 'Choir Wraith'],
  'The Black Spire': ['Spire Warden', 'The Hollow King', 'Bonefield Colossus'],
};

export function seedWorld() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM continents').get().n;
  if (existing > 0) return { skipped: true };

  transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order) VALUES (?, ?, ?)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare('INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label) VALUES (?, ?, ?)');
    const insMonster = d.prepare(
      `INSERT INTO monsters (name, description, level, max_hp, attack, defense, accuracy, evasion, speed, mana, stamina, class_key, xp_reward, gold_reward)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');

    const locIds = new Map();
    WORLD.forEach((c, ci) => {
      const cid = insContinent.run(c.name, c.description, ci).lastInsertRowid;
      c.regions.forEach((r, ri) => {
        const rid = insRegion.run(cid, r.name, r.description, ri).lastInsertRowid;
        r.locations.forEach((l, li) => {
          const lid = insLocation.run(rid, l.name, l.description, l.danger, l.safe ? 1 : 0, li).lastInsertRowid;
          locIds.set(l.name, lid);
        });
      });
    });

    WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations).forEach((l) => {
      (l.connects || []).forEach((target) => {
        const from = locIds.get(l.name); const to = locIds.get(target);
        if (from && to) { insConn.run(from, to, `Road to ${target}`); insConn.run(to, from, `Road to ${l.name}`); }
      });
    });

    const monIds = new Map();
    MONSTERS.forEach((m) => {
      const mid = insMonster.run(m.name, m.description, m.level, m.max_hp, m.attack, m.defense, m.accuracy, m.evasion, m.speed, m.mana, m.stamina, m.class_key, m.xp_reward, m.gold_reward).lastInsertRowid;
      monIds.set(m.name, mid);
    });

    Object.entries(SPAWNS).forEach(([locName, names]) => {
      const lid = locIds.get(locName);
      if (!lid) return;
      names.forEach((n, i) => { const mid = monIds.get(n); if (mid) insSpawn.run(lid, mid, Math.max(1, 5 - i)); });
    });
  });
  return { continents: WORLD.length, monsters: MONSTERS.length };
}
