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
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  UNIQUE (from_id, to_id)
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
