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
  sort_order   INTEGER NOT NULL DEFAULT 0
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
