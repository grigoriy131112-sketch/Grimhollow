PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  class       TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  hp          INTEGER,
  mana        INTEGER,
  stamina     INTEGER,
  gold        INTEGER NOT NULL DEFAULT 0,
  portrait    TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  party_points INTEGER NOT NULL DEFAULT 0,
  fate        TEXT NOT NULL DEFAULT 'alive',   -- alive | dead
  fate_ref    INTEGER,                          -- battle that killed the hero
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fog of war: which places a character has stood in. The map reveals visited
-- places and their immediate roads, so travel opens the world up as you go.
CREATE TABLE IF NOT EXISTS character_visits (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  location_id  INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  visited_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, location_id)
);

CREATE TABLE IF NOT EXISTS continents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS regions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  continent_id  INTEGER NOT NULL REFERENCES continents(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id    INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  danger       INTEGER NOT NULL DEFAULT 1,
  is_safe      INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  map_x        REAL,
  map_y        REAL,
  scene        TEXT,
  biome        TEXT
);

CREATE TABLE IF NOT EXISTS connections (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id  INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  to_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  label    TEXT NOT NULL DEFAULT '',
  minutes  INTEGER,
  UNIQUE (from_id, to_id)
);

-- One in-progress road trip per character. Kept in the DB so a page reload does
-- not lose the journey; the road itself is deterministic, so this only records
-- where the party is along it.
CREATE TABLE IF NOT EXISTS travels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  from_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  to_id        INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  minutes      INTEGER NOT NULL,
  state        TEXT NOT NULL,
  arrived      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monsters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  level         INTEGER NOT NULL DEFAULT 1,
  max_hp        INTEGER NOT NULL,
  attack        INTEGER NOT NULL DEFAULT 8,
  defense       INTEGER NOT NULL DEFAULT 3,
  accuracy      INTEGER NOT NULL DEFAULT 25,
  evasion       INTEGER NOT NULL DEFAULT 5,
  speed         INTEGER NOT NULL DEFAULT 6,
  mana          INTEGER NOT NULL DEFAULT 0,
  stamina       INTEGER NOT NULL DEFAULT 0,
  class_key     TEXT NOT NULL DEFAULT 'fighter',
  xp_reward     INTEGER NOT NULL DEFAULT 20,
  gold_reward   INTEGER NOT NULL DEFAULT 0,
  portrait      TEXT
);

CREATE TABLE IF NOT EXISTS location_monsters (
  location_id  INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  monster_id   INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
  weight       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (location_id, monster_id)
);

CREATE TABLE IF NOT EXISTS battles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT NOT NULL DEFAULT 'active',
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  monster_id    INTEGER REFERENCES monsters(id) ON DELETE SET NULL,
  location_id   INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  state         TEXT NOT NULL,
  log           TEXT NOT NULL DEFAULT '[]',
  reward_xp     INTEGER NOT NULL DEFAULT 0,
  reward_gold   INTEGER NOT NULL DEFAULT 0,
  result        TEXT,
  kind          TEXT NOT NULL DEFAULT 'normal',
  revive_member INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Party (отряд): companions recruited by a leader, with their own sheet.
CREATE TABLE IF NOT EXISTS party_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  name          TEXT NOT NULL,
  class         TEXT NOT NULL,
  level         INTEGER NOT NULL DEFAULT 1,
  xp            INTEGER NOT NULL DEFAULT 0,
  hp            INTEGER,
  mana          INTEGER,
  stamina       INTEGER,
  portrait      TEXT,
  history       TEXT NOT NULL DEFAULT '',
  pluses        TEXT NOT NULL DEFAULT '[]',
  minuses       TEXT NOT NULL DEFAULT '[]',
  source        TEXT NOT NULL DEFAULT 'road',
  status        TEXT NOT NULL DEFAULT 'active',   -- active | dead | left
  recruit_log   TEXT NOT NULL DEFAULT '[]',
  joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Directed relationships: a party member's feeling toward another party member.
-- The leader is stored as leader_id, so a row is (from_member -> to_member|leader).
CREATE TABLE IF NOT EXISTS party_relations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  from_member_id INTEGER NOT NULL REFERENCES party_members(id) ON DELETE CASCADE,
  to_member_id   INTEGER REFERENCES party_members(id) ON DELETE CASCADE,  -- NULL = the leader
  value          INTEGER NOT NULL DEFAULT 50,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_member_id, to_member_id)
);

-- Party upgrade tree: points spent per node, per leader.
CREATE TABLE IF NOT EXISTS party_upgrades (
  leader_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  node       TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (leader_id, node)
);

-- Named inhabitants of the world (Wave 6). Each has traits, a role and a mood.
CREATE TABLE IF NOT EXISTS npcs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'житель',
  class       TEXT NOT NULL DEFAULT 'fighter',
  portrait    TEXT,
  description TEXT NOT NULL DEFAULT '',
  pluses      TEXT NOT NULL DEFAULT '[]',
  minuses     TEXT NOT NULL DEFAULT '[]',
  opinion     INTEGER NOT NULL DEFAULT 50,
  mood        TEXT NOT NULL DEFAULT 'calm',
  source      TEXT NOT NULL DEFAULT 'world'
);

-- Every line ever spoken to (or by) an NPC or companion. This is the raw log.
CREATE TABLE IF NOT EXISTS dialogue_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,             -- npc | companion
  ref_id       INTEGER NOT NULL,          -- npc id or party_member id
  speaker      TEXT NOT NULL,             -- player | other | system
  text         TEXT NOT NULL,
  topic        TEXT,
  delta        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Distilled memory: what a character remembers about the leader and how much it
-- matters. `weight` decays over time and grows each time the fact repeats.
CREATE TABLE IF NOT EXISTS dialogue_memory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  ref_id       INTEGER NOT NULL,
  fact_key     TEXT NOT NULL,
  text         TEXT NOT NULL,
  weight       INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (leader_id, kind, ref_id, fact_key)
);

-- An NPC's opinion of a given leader. Kept separate from party_relations, which
-- is keyed to party_members and cascades on their deletion.
CREATE TABLE IF NOT EXISTS npc_relations (
  leader_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  npc_id     INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  value      INTEGER NOT NULL DEFAULT 50,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (leader_id, npc_id)
);

-- What a hero carries. `item_key` maps to ITEMS in game/items.js; ritual
-- components (the shepherd's key) are consumed, trophies are kept.
CREATE TABLE IF NOT EXISTS character_items (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, item_key)
);

-- Wave G2: which carried item fills each equipment slot. `slot` is one of the
-- EQUIP_SLOTS keys in game/items.js; one item per slot per character.
CREATE TABLE IF NOT EXISTS character_equipment (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot         TEXT NOT NULL,
  item_key     TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, slot)
);

-- Wave G2: active temporary modifiers (buffs and debuffs). Each row is one flat
-- change to one stat, with a duration (`turns`, NULL = permanent) and a source.
-- The pure shape is documented in game/modifiers.js; G3 needs reuse this table.
CREATE TABLE IF NOT EXISTS character_buffs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  buff_key     TEXT NOT NULL,
  source       TEXT NOT NULL,
  source_type  TEXT NOT NULL DEFAULT 'buff',
  stat         TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  turns        INTEGER,
  kind         TEXT NOT NULL DEFAULT 'buff',
  stack        TEXT NOT NULL DEFAULT 'refresh',
  label        TEXT NOT NULL DEFAULT '',
  max_stacks   INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
