# Grimhollow

A dark-fantasy, classic D&D-flavoured browser RPG. Node/Express + SQLite API
with a React (Vite) client. No dice, no external services required — the whole
game runs on your own machine.

## Run it anywhere (no sandbox needed)

### Option 1 — Docker (one command)

```bash
docker compose up --build
```

Open <http://localhost:3001>. The world (SQLite) is kept in a named volume, so
restarts do not wipe your heroes.

### Option 2 — Node directly

Requires **Node 24+** (the server uses the built-in `node:sqlite` module).

```bash
npm install
npm start          # builds the client, then serves API + UI on http://localhost:3001
```

`npm start` runs `prestart` (a client build) first, so a single command gives you
the production app. Set `PORT` to listen elsewhere:

```bash
PORT=8080 npm start
```

### Development (hot reload)

```bash
npm install
npm run dev        # API on :3001, Vite dev server on :5173
```

## Configuration

Every setting is optional; see `.env.example`. Copy it to `.env` to override:

- `PORT` — listen port (default `3001`).
- `DB_PATH` — SQLite file (default `server/src/data/grimhollow.sqlite`; Docker uses `/data/grimhollow.sqlite`).
- `LLM_PROVIDER` — `off` (default), `auto`, `local`, or `cloud`. The game plays
  fine with the LLM off; it only re-words NPC dialogue.

## Layout

- `server/` — Express API, game engine, SQLite storage.
  - `src/game/` — pure rules: `classes.js`, `rules.js`, `combat.js`, `travel.js`.
  - `src/db/` — `schema.sql`, connection (`index.js`), world seed (`seed.js`).
  - `src/services/` — persistence + orchestration (`characters`, `world`, `battles`, `travel`).
  - `src/routes/` — HTTP layer.
  - `test/` — `node:test` suites.
- `client/` — React + Vite SPA (`src/pages`, `src/api.js`, `src/icons.jsx`).
  - `public/art/` — CC BY 3.0 icons from game-icons.net, plus one CC0 parchment
    texture for the world map (see `CREDITS.txt`).

The client talks to the API over a relative `/api` path, so the two always share
an origin: the same server serves the built UI and the API. There is nothing
host-specific to configure.

## Commands

```bash
npm install                 # installs server + client workspaces
npm run dev                 # server (3001) + vite (5173) together
npm test                    # server test suite (node --test)
npm run build               # build the client into client/dist
npm start                   # build, then run the API serving client/dist
```
