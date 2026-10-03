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
  HP/mana (plus per-class growth in `game/classes.js`).
- XP comes from quests (future), battles, and exploration (future).

## Conventions

- ES modules everywhere. Server code has no build step.
- Keep game math in `src/game/*` pure and unit-tested; keep I/O in services/routes.
- The DB auto-seeds on startup (`seedWorld()` in `src/index.js`). The sqlite file
  lives in `server/src/data/` and is gitignored.
- `server/src/index.js` also serves `client/dist` (SPA fallback) so the whole app
  is reachable from one port in preview.
