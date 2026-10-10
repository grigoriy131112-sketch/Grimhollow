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
  sort_order  INTEGER NOT NULL DEFAULT 0,
  -- Wave W-ISLES: a hidden continent (the sea's scattered islands) is never
  -- drawn on the atlas and never listed; it is reachable only by sailing.
  hidden      INTEGER NOT NULL DEFAULT 0
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
  biome        TEXT,
  -- Wave W-ISLES: a hidden place (a sea island) never appears on the map, in a
  -- region or in a list; the party can only stand on it after sailing ashore.
  hidden       INTEGER NOT NULL DEFAULT 0
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
  loot          TEXT,
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

-- Named save slots (Wave G4). A slot freezes one character's full state as JSON
-- so it can be listed, loaded back, exported or imported. `snapshot` holds the
-- same shape export/import uses; the live game state is untouched.
CREATE TABLE IF NOT EXISTS saves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  snapshot     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Settlements (Wave G6): a city or village sits on a normal location, so the
-- map, roads and travel keep working untouched. `kind` is 'city' | 'village'.
CREATE TABLE IF NOT EXISTS settlements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'village',
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- A building inside a settlement. `type` is a stable Latin key (tavern, temple,
-- library, guild, smithy, shop, market, inn, house); `name` is Russian. The
-- first building of each functional type carries the settlement's stock.
CREATE TABLE IF NOT EXISTS settlement_buildings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (settlement_id, key)
);

-- Shop and market stock (Wave G6 defines the shape; Wave G7 trades on it).
-- One row per offer: `item_key` maps to ITEMS (game/items.js) once G2 lands,
-- `price` is gold per unit and `quantity` is how many are on the shelf (-1 for
-- an endless supply). Buying/selling is NOT implemented here.
CREATE TABLE IF NOT EXISTS settlement_stock (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id   INTEGER NOT NULL REFERENCES settlement_buildings(id) ON DELETE CASCADE,
  item_key      TEXT NOT NULL,
  price         INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT -1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (building_id, item_key)
);

-- Wave G3: survival meters (hunger, thirst, fatigue) as 0..100 values that rise
-- with travel and combat turns and fall when the hero eats, drinks or rests.
-- The debuffs a crossed threshold applies live in `character_buffs` (Wave G2),
-- not here; this table is only the meters. The rules are in game/survival.js.
CREATE TABLE IF NOT EXISTS character_survival (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  hunger       INTEGER NOT NULL DEFAULT 0,
  thirst       INTEGER NOT NULL DEFAULT 0,
  fatigue      INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave G8: the quest catalogue. `objective` and `reward` are JSON blobs whose
-- shape is documented in db/seed_quests.js; `requires` is a JSON array of quest
-- keys. `story` marks a key quest that can never be permanently failed.
CREATE TABLE IF NOT EXISTS quests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL,                -- guild | tavern | temple | library | npc | story
  giver      TEXT,                         -- NPC key, building key, or 'settlement:building'
  chapter    INTEGER NOT NULL DEFAULT 0,
  title      TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  objective  TEXT NOT NULL DEFAULT '{}',   -- { type, target, count, item? }
  reward     TEXT NOT NULL DEFAULT '{}',   -- { gold?, xp?, item?, opinion?, unlock? }
  requires   TEXT NOT NULL DEFAULT '[]',   -- quest keys completed first
  story      INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- A hero's relationship to a quest: accepted -> active, then completed or
-- failed. Progress is the number of objective units already done.
CREATE TABLE IF NOT EXISTS character_quests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_key    TEXT NOT NULL REFERENCES quests(key) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | completed | failed
  progress     INTEGER NOT NULL DEFAULT 0,
  accepted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (character_id, quest_key)
);

-- Wave G8: progress flags a quest reward grants (a location or chapter gate).
-- Wave G11 (campaign) reads these to advance the story.
CREATE TABLE IF NOT EXISTS character_unlocks (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  flag         TEXT NOT NULL,
  quest_key    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, flag)
);

-- Wave G11: campaign chapter flags. One row per flag a hero has reached. Kept
-- separate from character_unlocks (G8) because a flag may be set by a branch
-- (the north, Kor-Ashan) or by the clan (G9), not only by a quest reward. The
-- rules and the three endings live in game/campaign.js; services/campaign.js
-- is the I/O layer.
CREATE TABLE IF NOT EXISTS campaign_progress (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  flag         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, flag)
);

-- Wave G9: the player's own clan (docs/lore/clan.md). One clan per leader. The
-- doctrine is irreversible; the clan's two resources are gold (the leader's own
-- purse, spent as the clan's treasury) and `names`, the memory currency earned
-- by rituals and quests. Building tiers are gated by the clan level (1..5).
-- Mercenaries reuse the party member shape; a fallen one is revived for `names`.
CREATE TABLE IF NOT EXISTS clans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id     INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  key           TEXT NOT NULL UNIQUE,          -- latin slug generated from the name
  name          TEXT NOT NULL,
  doctrine      TEXT,                          -- chroniclers | thaw | silent | shepherds (chosen once)
  base_id       INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  level         INTEGER NOT NULL DEFAULT 1,
  names         INTEGER NOT NULL DEFAULT 0,    -- the memory currency
  founded_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One building the clan has raised. `tier` is its level (1..3); `MAX_RANK` in
-- game/clan.js caps it. The type keys are Latin; `name` is Russian.
CREATE TABLE IF NOT EXISTS clan_buildings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id     INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  tier        INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (clan_id, type)
);

-- A clan mercenary. Reuses the party member sheet; `status` is active | dead.
CREATE TABLE IF NOT EXISTS clan_mercenaries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id      INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name         TEXT NOT NULL,
  class        TEXT NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1,
  portrait     TEXT,
  history      TEXT NOT NULL DEFAULT '',
  pluses       TEXT NOT NULL DEFAULT '[]',
  minuses      TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'active',   -- active | dead
  hired_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The clan content catalogue (Wave G9): the four doctrines and the six building
-- types, seeded idempotently from db/seed_clan.js. `data` holds the full entry
-- (costs, bonuses, effects) as JSON; the service reads it through the seed.
CREATE TABLE IF NOT EXISTS clan_catalog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                 -- doctrine | building
  key         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, key)
);

-- The hero's ship (Wave W-SHIP). One ship per character; it is bought in a port
-- for gold and waits for the hero there. `level` is 1..MAX_SHIP_LEVEL; `points`
-- are unspent ship upgrade points, earned only in sea battles (W-SEA).
CREATE TABLE IF NOT EXISTS ships (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Корабль',
  class_key     TEXT NOT NULL DEFAULT 'sloop',
  level         INTEGER NOT NULL DEFAULT 1,
  home_port_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  bought_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One forged component of a ship; `key` is a game/ship.js upgrade key and
-- `level` is how many times it has been raised.
CREATE TABLE IF NOT EXISTS ship_upgrades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ship_id   INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  level     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ship_id, key)
);

-- A timed job at the dock: a component level-up or the ship's own level-up.
-- `state` is the travel-clock shape ({ walkedMs, segmentStart }) as JSON, so the
-- dock runs on the same real clock as a road; the job lands when it is due.
CREATE TABLE IF NOT EXISTS ship_works (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ship_id        INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                  -- component | level
  upgrade_key    TEXT,
  to_level       INTEGER NOT NULL,
  minutes        INTEGER NOT NULL,
  hired          INTEGER NOT NULL DEFAULT 0,
  paid_points    INTEGER NOT NULL DEFAULT 0,
  paid_gold      INTEGER NOT NULL DEFAULT 0,
  state          TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'active', -- active | done
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave W-SEA: a sea battle (pirates or a sea monster) and the voyage it belongs
-- to. The fight is a pure state machine (game/naval.js) whose whole state lives
-- in `state` as JSON, so a reload resumes mid-fight; `kind`, `tier` and `result`
-- are duplicated as columns for listing and honesty. One ship fights one battle
-- at a time.
CREATE TABLE IF NOT EXISTS naval_battles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                   -- pirates | sea_monster
  tier          INTEGER NOT NULL DEFAULT 1,
  voyage_id     INTEGER,
  state         TEXT NOT NULL,
  result        TEXT,                            -- end-of-battle report as JSON
  status        TEXT NOT NULL DEFAULT 'active',  -- active | won | lost | fled
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave W-SEA: a sea voyage between two ports. Deterministic like a road: the
-- stops are re-derived from the seed, so the row only records how far the party
-- has got. `stops` is the planned list (pirates / monster / Fortune island) and
-- `cursor` is the stop reached; once the cursor passes the end the voyage lands
-- the party at the far port.
CREATE TABLE IF NOT EXISTS voyages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  from_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  to_id         INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  route_key     TEXT,
  seed          TEXT NOT NULL,
  stops         TEXT NOT NULL DEFAULT '[]',
  cursor        INTEGER NOT NULL DEFAULT 0,
  resolved      INTEGER NOT NULL DEFAULT 0,      -- 1 once the party has landed
  -- Wave W-ISLES: where the party stands in the open-water stretch --
  -- 'voyage' (at sea), 'island' (ashore, id in ashore_id), 'aside' (held at the
  -- port) or 'battle' -- and `island_ref`, the stop's island key when a stop is
  -- an island, so the prompt and the ashore screen resolve the same place.
  mode          TEXT NOT NULL DEFAULT 'voyage',
  ashore_id     INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  island_ref    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave W-ISLES: each sea island the party has set foot on: when it was first
-- seen, whether its hoard has been searched yet (loot pays once), and the last
-- place it was standing before it went ashore -- so "put back to sea" returns it
-- to the water beside the island, not to some far port.
CREATE TABLE IF NOT EXISTS island_discoveries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  island_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  from_id        INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  searched       INTEGER NOT NULL DEFAULT 0,
  -- The ids of the island's places whose cache has already been emptied; an
  -- island hides a hoard in each place, and each pays once.
  searched_places TEXT NOT NULL DEFAULT '[]',
  found_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (character_id, island_id)
);


-- Wave W-SEA: the ship's papers -- a free-form journal plus an automatic event
-- log. `notes` are the player's own lines, `log` the milestones the game writes
-- (a won sea battle, a discovered island, a learned lore note).
CREATE TABLE IF NOT EXISTS ship_papers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  notes         TEXT NOT NULL DEFAULT '',
  log           TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave W-CLAN-ROSTER: someone who asks to join the clan on their own. `day` is
-- the tick the petition was rolled for, keyed so a reload cannot reroll it.
CREATE TABLE IF NOT EXISTS clan_petitions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id       INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  day           INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wave W-CLAN-ROSTER: the garrison's real-clock watermark (one row per clan).
-- Petitions and raids are both derived from the wall clock, capped at this
-- stamp, so the world pays out only for time actually lived.
CREATE TABLE IF NOT EXISTS clan_garrison (
  clan_id       INTEGER PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,
  last_tick_ms  INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);


