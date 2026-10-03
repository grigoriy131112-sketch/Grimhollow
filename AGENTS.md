# Grimhollow

A dark-fantasy, classic D&D-flavoured browser RPG. Node/Express + SQLite API
with a React (Vite) client.

## Layout

- `server/` — Express API, game engine, SQLite storage.
  - `src/game/` — pure rules: `classes.js`, `rules.js`, `combat.js`.
  - `src/db/` — `schema.sql`, connection (`index.js`), world seed (`seed.js`).
  - `src/services/` — persistence + orchestration (`characters`, `world`, `battles`).
  - `src/routes/` — HTTP layer.
  - `test/` — `node:test` suites.
- `client/` — React + Vite SPA (`src/pages`, `src/api.js`, `src/icons.jsx`).
  - `public/art/` — CC BY 3.0 icons from game-icons.net (see `CREDITS.txt`).

## Commands

```bash
npm install                 # installs server + client workspaces
npm run dev                 # server (3001) + vite (5173) together
npm test                    # server test suite (node --test)
npm run build               # build the client into client/dist
npm start                   # run the API, serving client/dist if built
```

## Game design rules (locked)

- Combat is **diceless**: an ability shows an honest hit % (accuracy vs evasion)
  and a damage estimate. No dice rolls are shown to the player.
- Resources are **mana** and **stamina**; both regenerate a little on the
  owner's turn (`MANA_REGEN` / `STAMINA_REGEN` in `game/combat.js`).
- **Speed** decides turn order; there are no extra turns.
- **Defeat is survivable**: the hero keeps 1 HP and loses 25% of their gold
  (`DEFEAT_GOLD_PENALTY` in `services/battles.js`).
- Every class has **5 levels**; each level unlocks **2 abilities** and raises
  HP/mana (plus per-class growth in `game/classes.js`). There are **12 classes**
  (the D&D set).
- XP comes from quests (future), battles, and exploration (future).

## Content language

- All player-visible text is **Russian** (class/monster/location names, ability
  names and descriptions, combat log, UI labels, error messages).
- Stable keys stay **Latin**: class `key` (e.g. `fighter`), ability `id`
  (e.g. `fire_bolt`), stat keys, route paths. These are the identity used by the
  DB, the API, and the client, so never translate them.

## Ability icons

- Icons resolve by `ability.id` via `ABILITY_ICONS` in `client/src/icons.jsx`.
- Each entry maps an id to `client/public/art/abilities/<file>.svg`; a missing
  entry just renders no icon.
- Icons are CC BY 3.0 from game-icons.net (see `client/public/art/CREDITS.txt`
  for the per-file source manifest).

## Party (отряд)

- A party is a **leader** (a normal character) plus **companions** stored in
  `party_members`; each companion is a full sheet of its class/level.
- **14 recruitment sources** live in `game/companions.js` (`RECRUIT_SOURCES`):
  tavern, road, rescue, quest, arena, mercy, ransom, necromancy, guild, beast,
  sermon, deed, favor, orphan. Methods: free | gold | trial | quest | tame |
  raise | persuade | favor.
- `COMPANIONS` holds ready-made people with a history, two pluses, two minuses,
  a starting opinion, a portrait slug and the sources they can appear from.
  Traits live in `TRAITS` (each with `effects` and `likes`/`dislikes`).
- **Relationships** are directed and clamped 0..100: each member feels something
  toward the leader (`to_member_id IS NULL`) and toward every other member.
  `LEAVE_THRESHOLD = 25` — below it with *anyone*, the companion leaves
  (`sweepDepartures`). A fresh bond is seeded 30..90 so nobody leaves on day one.
- Recruitment may be **refused**; `acceptanceChance` is an honest 5..95% shown to
  the player. Deterministic pieces (prices, seeded opinions/bonds) keep it fair;
  `rng` is injectable for tests.
- Endpoints live under `/api/party` (see `routes/party.js`); the UI is
  `pages/Party.jsx` (cards + relation bars) and `pages/Recruit.jsx` (source chips
  + candidates).
- Companion portraits are game-icons faces under `client/public/art/portraits/`
  (map `PORTRAITS` in `game/companions.js`, credited in CREDITS.txt).

### Still to come (approved waves, not yet built)

- 3C battle as a party (control every member; permadeath).
- 3D party upgrade tree paid with a separate **Очки отряда** resource
  (`party_upgrades` table already exists).
- 3E living AI dialogue with the party — self-contained, no external key,
  never breaks the game.
- 3F resurrection rituals (animal sacrifice, no currency).

## Conventions

- ES modules everywhere. Server code has no build step.
- Keep game math in `src/game/*` pure and unit-tested; keep I/O in services/routes.
- The DB auto-seeds on startup (`seedWorld()` in `src/index.js`). The sqlite file
  lives in `server/src/data/` and is gitignored.
- `server/src/index.js` also serves `client/dist` (SPA fallback) so the whole app
  is reachable from one port in preview.

## Party combat (Wave 3C)

- `server/src/game/combat.js` builds combatants with `key`/`side`/`kind`
  (`leader|ally|enemy`)/`refId`.
- `startBattle` loads the leader's active party; every player-side member is
  human-controlled, turn order by speed. The enemy AI targets the lowest-HP
  living party member.
- Settlement applies leader XP/HP, companion XP, and permanent companion death
  (`party_members.status='dead'`). Defeat is survivable: the leader ends at 1 HP
  and loses 25% of gold unless the party still won.
- `battles.result` (JSON) stores the end-of-battle report; the Battle page reads
  it so the report survives a reload. Additive migrations live in
  `server/src/db/index.js#migrate`.
- Tests share one SQLite file, so they run serially:
  `npm --workspace server test` uses `node --test --test-concurrency=1`.

## World map, scenes and arena (Waves 4-5)

- `locations` carry `map_x`/`map_y`/`scene`/`biome`; migrations live in
  `server/src/db/index.js#migrate` and `seedWorld()` backfills map data into
  databases that predate the columns (no duplicates, keyed by location name).
- `GET /api/world/map` (see `services/world.js#getMap`) returns flat locations
  with coordinates plus undirected roads and per-location monster counts.
- All art is procedural SVG, no rasters: `client/src/WorldMap.jsx` is the
  interactive atlas, `client/src/scenes.jsx` renders layered scene backdrops
  (biome palette + location-specific accents) reused by location cards, the
  location hero and the battle arena.
- The arena in `client/src/pages/Battle.jsx` turns the engine's event stream
  into transient VFX (floating damage/heal numbers, hit shake, heal pulse,
  dodge, screen flash); `getBattleView` exposes the location's scene/biome.
