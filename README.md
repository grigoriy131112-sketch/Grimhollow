# Grimhollow

A dark-fantasy, classic D&D-flavoured browser RPG. Node/Express + SQLite API
with a React (Vite) client. No dice, no external services required — the whole
game runs on your own machine.

## Give it a permanent home (no sandbox)

The app builds into **one image** that serves both the API and the built SPA, so
the same image runs anywhere Docker runs. `main` is automatically tested, then
built and published to GitHub Container Registry by
`.github/workflows/publish.yml` — so you can run the game straight from GHCR:

```bash
docker run -d --name grimhollow -p 3001:3001 \
  -v grimhollow-data:/data \
  ghcr.io/grigoriy131112-sketch/grimhollow:latest
```

Open <http://localhost:3001>. The `grimhollow-data` volume keeps the SQLite world
across restarts and upgrades.

To put it on the public internet (a real URL that lives independently of any
sandbox), two ready-to-use configs are included:

- **Render** — push to GitHub, then *New +* → *Blueprint* → pick this repo
  (`render.yaml`). The free plan needs no card; note it has an ephemeral disk, so
  the world resets on redeploy. Uncomment the `disk` block in `render.yaml` and
  switch to a paid plan to keep progress.
- **Fly.io** — `fly launch --no-deploy --copy-config --name grimhollow`,
  `fly volumes create grimhollow_data --size 1`, `fly deploy` (`fly.toml`). Fly
  gives the app a persistent volume, so heroes survive restarts.

Any other Docker host (Railway, Koyeb, a VPS, `docker compose` on your own
machine) works the same way: run the image, mount a volume at `/data`, point the
health check at `/api/health`.

## Run it anywhere (no sandbox needed)

### Preview in the sandbox (work-host)

The work-host preview (ports `12000`/`12001`) shows **Bad Gateway** whenever
nothing is listening on the port — the app is not running. Start (or restart)
it with:

```bash
scripts/serve.sh            # ensure it is up + start the self-healing watcher
scripts/serve.sh --watch    # stay resident and auto-restart if it dies
scripts/serve.sh --stop     # stop both the server and the watcher
```

`scripts/serve.sh` is idempotent (a second call says "already up"), rebuilds the
client only when `client/dist` is missing, and starts the server detached so it
outlives the shell that launched it. Set `PORT` to serve elsewhere.

The preview is **self-healing**: `scripts/serve.sh` also keeps one resident
watcher that polls `/api/health` and restarts the server within ~5 seconds if it
crashes, and `.openhands/hooks.json` runs the same command on every new session
(`session_start`) and every message (`user_prompt_submit`). So after the runtime
restarts you do not need to ask anyone to bring it back — open a conversation and
the preview comes up on its own.

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
