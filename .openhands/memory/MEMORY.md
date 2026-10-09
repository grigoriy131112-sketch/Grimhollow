# Project memory ‚Äî Grimhollow

Durable facts learned while working in this repo. Keep this index short; put
long detail in the daily logs.

## Sandbox / preview (learned 2026-10-06)

- **"Чат доступен только для чтения" (read-only) is not a code bug.** The Cloud
  marks a conversation read-only when its sandbox is `PAUSED` (idle timeout),
  `ERROR` or `MISSING`. A fresh conversation starts with a **brand-new empty
  sandbox**, so a resumed session must re-clone the repo. Fixes, via the Cloud
  API with `$OPENHANDS_API_KEY`:
  - `POST /api/v1/sandboxes/{sandbox_id}/resume` — brings a PAUSED sandbox back
    (was `{"success":true}`; status goes `STARTING` → `RUNNING` in ~8s, and the
    `exposed_urls`/work-host subdomain change on resume).
  - `ERROR` is usually recoverable, `MISSING` is not. **An `ERROR` sandbox whose
    `status_detail` is `runtime_ingress:http_status:404` does NOT come back from
    a plain `resume` — you must do a full `POST /pause` then `POST /resume`
    cycle.** It goes `PAUSED → STARTING → (503 detail) → RUNNING` in ~35s, and
    the workspace (repo + unpushed commits) is intact. `send-message` against a
    dead runtime just returns 503; it does not self-heal.
  - **"The chat is re-printing the whole conversation" is a UI symptom, not a
    backend loop.** Verify with `GET /api/v1/conversation/{id}/events/count`
    polled twice — if the number is frozen, the server is idle (this chat sat at
    14 057 events) and the Canvas UI is replaying history because it lost its
    live runtime connection while the sandbox was PAUSED/ERROR. Fix: get the
    sandbox back to RUNNING (pause/resume cycle), then reload the chat tab; a
    busy history makes the replay look endless. Keep this chat's event count in
    mind — the conversation is very large (14k+ events), so a replay is slow.
  - Find the `sandbox_id` from `GET /api/v1/app-conversations?ids=<conv_id>`.
- **`execution_status=error` while `sandbox_status=RUNNING` is a *separate* fault:**
  a transient LLM-proxy 503 (`ConversationErrorEvent` code `OpenAIError`, detail =
  an HTML "Service Temporarily Unavailable" page) aborts the turn and the chat
  goes read-only even though the sandbox is fine. Fix without losing the turn:
  `POST /api/v1/app-conversations/{id}/send-message` with
  `{"content":[{"type":"text","text":"…"}],"run":true}` — it resumes the sandbox
  and restarts the agent loop; `execution_status` flips back to `running` in
  ~10s and the agent continues from where it crashed. (Do NOT recreate the
  conversation — that abandons the in-flight turn.) Check the proxy with
  `curl -m10 -o /dev/null -w '%{http_code}' https://llm-proxy.app.all-hands.dev/`.
- **The empty workspace was a missing repo binding, not a lost one.** This
  conversation's `meta.json` has no `selected_repository`; the agent is
  responsible for cloning. `git clone` into `/workspace/project` (the dir is
  writable and `safe.directory` is preset).
- **A 403 `team_model_access_denied` also shows as read-only.** A conversation
  launched on an LLM profile the team cannot use 403s on *every* turn
  (`ConversationErrorEvent` code `OpenAIError`, detail
  `team not allowed to access model … Tried to access claude-fable-5`) and the
  chat is read-only even though the sandbox is RUNNING. The account had profile
  `Fuuu` = `openhands/claude-fable-5`; the team may only use
  `deepseek-v4.1-flash` / `deepseek-v4-flash`. Fix in place:
  `POST /api/v1/app-conversations/{id}/switch_profile {"profile_name":"Default"}`
  (`Default` = `openhands/deepseek-v4.1-flash`), then
  `send-message {run:true}`. `llm_model` on the conversation record updates
  immediately. List profiles at `GET /api/v1/settings/profiles`. Account-wide
  `POST /api/v1/settings/profiles/{name}/activate` returns success but
  `active_profile` stays `Fuuu`, so fix the profile per conversation.
  **Symptom vs. model error:** 403 = wrong model (switch profile); 503 =
  transient proxy outage (just resend).
- **Preview needs `npm install` first.** `scripts/serve.sh` starts the server but
  does NOT install deps, so a fresh sandbox fails with
  `ERR_MODULE_NOT_FOUND: express`. Run `npm install && npm run build` before
  `scripts/serve.sh`. The watcher then self-heals (kill the server, it returns in
  <5s).
- **Hooks don't run in resumed conversations.** `meta.json.hook_config` is `null`
  for conversations created before `.openhands/hooks.json` existed — hooks are
  captured at creation and never re-read. The resident watcher, not the hook, is
  what keeps the preview up in-session.
- **Test baseline on 2026-10-08 is 291 pass / 0 fail** (Node 24.21) — older
  numbers (186/227/251/267) are stale. See the Workflow note below: trust the run.

## Workflow

- Waves are gated one at a time; one wave = one branch = one PR. See
  `docs/CHATPLAN.md` for exclusive file ownership. The orchestrator owns shared
  files (`server/src/index.js`, `client/src/App.jsx`,
  `server/src/db/schema.sql`, `game/dialogue.js`).
- Tests run serially (`--test-concurrency=1`) because they share one SQLite file.
  The live count moves with every wave — always trust the run, not this file
  (historical: 186 → 227 → 251 → 267 → 287 → 291; 291 on `wave/w-map`, 2026-10-08).
- **`npm install` is needed before the server will boot** in a fresh sandbox ‚Äî
  otherwise `node server/src/index.js` dies with `ERR_MODULE_NOT_FOUND: express`.
- Git identity is preconfigured as `openhands` / `openhands@all-hands.dev`.

## World canon (as of G1)

- `server/src/db/seed.js` is the source of truth for the world. The seed has
  since grown far past G1: **45 locations** on **5 continents** (Мордрат 13 with
  2 regions, each outer continent 8 with 2 regions) and 57 roads, as of
  `wave/w-map` (2026-10-08). Numbers drift between waves; the API
  (`GET /api/world/map`, `GET /api/continents`) is authoritative.
- **29 monsters** (levels 1-15) + the off-map **Костяной Пастырь** (level 15,
  reachable only via the resurrection ritual).
- `game/npcs.js`: 11 named NPCs; `game/companions.js`: 24 companion templates;
  `game/items.js`: `shepherd_key` (ritual, consumed) and `shepherd_crook`
  (trophy).
- `docs/lore/**` (added in G1) is the lore bible: README, cosmology,
  continents, factions, campaign, names. It expands the seed and must not
  contradict it.

## Gotchas

- **After a sandbox pause/resume, rebuild before chasing a "site error".** A
  stale `client/dist` (gitignored) is served once the runtime comes back: server
  up, all APIs 200, but the client bundle predates HEAD and the page "falls over".
  `scripts/serve.sh` now stamps the bundle (`client/dist/.build-stamp` =
  `git rev-parse HEAD:client`) and rebuilds when it is stale/missing/older than a
  client source — both in `ensure()` and in the resident `--watch` loop. Manual
  remedy is still `npm run build` then `bash scripts/serve.sh`.
- **A chat reload cannot be made fully drop-proof from inside the sandbox.** A
  pause/resume wipes the resident watcher; the only auto-recovery is the
  `session_start`/`user_prompt_submit` hook, which is frozen at conversation
  creation and does not fire for conversations older than `.openhands/hooks.json`
  (no SDK resume hook exists). See AGENTS.md for the honest limits.
- `docs/lore/` did not exist before G1; the editor cannot create a file in a
  missing directory ‚Äî `mkdir -p docs/lore` first.
- `getLocation()` returns DB rows (`map_x`/`map_y`); the travel engine wants
  `x`/`y`. Always pass through `services/travel.js#roadPoint`.
- **World shape has one source of truth.** `client/src/world-geo.json` (generated
  by `tools/gen_world_map.mjs` + `tools/gen_world_geo.mjs`) is read by the client
  (to draw) and the server (`game/world_geo.js#isLand`) alike; the land grid is
  `server/test-support/world-mask.json`, thresholded from the same
  `world-chart.svg` pixels. `land-mask.js` just re-exports the grid from
  `world_geo.js`. Change the plate only by re-running the tools, or the picture
  and the "every location on land" test drift apart.
- **Cross-continent travel must not be a normal `connections` road.** A free road
  would let a player walk between continents and bypass the crossing fare/toll/
  danger. The G5 design: ports carry only *internal* roads; the inter-continent
  link is the special crossing in `game/continent_travel.js`.

## G5 continents (added on `wave/g5-continents`)

- 4 new continents (Морозная Колыбель, Кор-Ашан, Вольные Гавани, Зелёный
  Предел), seeded by `db/seed_continents.js`.
  `seedContinents()` runs after `seedWorld()` and `seedSettlements()` in
  `server/src/index.js`; it is now **additive** (`backfillLocations()` adds
  missing Мордрат places/roads; `seedContinents()` adds missing locations/roads
  into an already-seeded continent) rather than skipping a seeded DB. Each
  continent now has 2 regions / 8 locations (W-MAP spread them from 4).
- Crossings live in `game/continent_travel.js` (pure): `MINUTES_PER_DAY = 15`
  (deliberately > the 50-minute road max so a crossing is always longer), gold +
  item toll + danger 0..1, deterministic `resolveCrossing(route,{seed,day})`.
- Service `services/continents.js`; routes `/api/continents` (list, `/gates`,
  `/locations/:id/crossings`, `POST /cross`, `/:id` by id or name). Router
  mounted + seeded via 4 append-only lines in `server/src/index.js`.
- Orchestrator must wire on `main`: only the 4 `index.js` lines (import seed,
  call `seedContinents()`, import router, `app.use`). No schema change; no client
  change (map/list are data-driven and already render all continents).

## G8 quests (added on `wave/g8-quests`)

- `db/seed_quests.js` holds 14 quests (prologue + chapters 1-3 from
  `docs/lore/quests.md`), idempotent. Objective types `kill|visit|collect|
  deliver|talk|survive|revive|no_steel`; rewards `gold|xp|item|opinion|unlock`.
  `STORY_QUESTS` = {prologue_name, first_revival, bone_records, spire_permission}
  (cannot be permanently failed); side failure = `SIDE_FAIL_OPINION = -5`.
- `services/quests.js` is event-driven: `advanceQuest(characterId, event)` where
  event is `{type, target, item?, count?}`. `collect` matches on item (target or
  item field); `deliver` needs both target=giver and item. Reuses G2
  `services/items.js` and the `npc_relations` table (opinion). Unlock flags live
  in `character_unlocks` — G11 reads these.
- 3 new tables in `schema.sql` (CREATE TABLE IF NOT EXISTS, so no migrate() edit
  needed): `quests`, `character_quests`, `character_unlocks`.
- Wiring on main: 4 append-only `index.js` lines (import seed, `seedQuests()`,
  import router, `app.use('/api/quests')`) + 2 `App.jsx` lines (import + Route
  `/quests/:characterId`).
- Tests: `npm test` now **227 pass / 0 fail** (+10).
- Gotcha: **no test imports `server/src/index.js`** — express isn't installed in
  the test env (`npm test` runs on node:sqlite only). Do not add an app-level
  route test unless express is added as a dependency.

## G9 clan (added on `wave/g9-clan`, PR #11)

- Built the player's clan (`docs/lore/clan.md`). `npm test` is now **251 pass /
  0 fail** (+9). New files: `db/seed_clan.js`, `services/clan.js`,
  `routes/clan.js`, `client/src/pages/Clan.jsx`, `test/clan.test.js`. New tables
  `clans`/`clan_buildings`/`clan_mercenaries`/`clan_catalog` (one append block in
  `schema.sql`); `seedClan()` runs on boot.
- **Founding convention**: chapters are `chapter_1..chapter_6` flags in
  `character_unlocks`; allies map to G11 flags (Лес=`world_woken`,
  Архивы=`north_frozen`, Дома-витражи=`memory_bought`, капитаны=`war_truth`); the
  fleet is the seeded harbours (Гримхольд + 4 port locations). G11 must grant
  `chapter_*` for founding to be reachable in play.
- Four irreversible doctrines; Пастухи grant `dark_ending`, Оттепель
  `thaw_unlocked`. Clan resources are gold (leader's purse) + `names` (memory
  currency, `GOLD_PER_NAME=25`). Building rank r costs `base*r` gold +
  `namesBase*r` names; tier 2 opens at clan level 3, tier 3 at level 5.
- Mercenaries reuse `game/companions.js` templates; Казарма tier raises the cap
  (2 + tier); a fallen one is revived for names at `RITUAL_SITE` with
  `RITUAL_ITEM`.

## W-MAP world map rework (branch `wave/w-map`, PR #14)

- **One generated plate is the source of truth.** `client/public/art/maps/world-chart.svg`
  (Azgaar Fantasy Map Generator coastline, recoloured in code by
  `tools/gen_world_map.mjs`) is both the picture and, thresholded, the land mask
  `server/test-support/world-mask.json` read by `server/src/game/world_geo.js#isLand`.
  Change it only by re-running `node tools/gen_world_map.mjs <source.svg>`.
- **Per-continent charts** are cut from that plate by
  `tools/gen_continent_maps.mjs` into `continent-<slug>.svg` and recorded as `map`
  + a world->chart frame (`scale`,`tx`,`ty`) in `client/src/world-geo.json`.
  `ContinentMap.jsx` maps seals through the frame; the global map is already in
  chart space.
- **Three views, one drawing:** `GlobalMap.jsx` (ports only, gates),
  `ContinentMap.jsx` (one continent), `WorldMap.jsx` ("Атлас", all places). All
  import `WorldChart`/`Vignette` from `worldMapArt.jsx`; `pages/World.jsx` list
  mirrors the map.
- **Tools:** `gen_world_geo.mjs` (click shapes), `place_map_locations.mjs`
  (re-place a broken layout), `apply_coords.mjs` (apply to a live DB), then
  `backfillTravel()`.
- **`PX_PER_MINUTE` recalibrated** to the compact plate so roads span a range of
  times (guarded by `world_map.test.js`).
- **Preview hardening:** `server/src/ports.js` serves both work-host ports
  (`PORT` + `PORT_ALT`, default 12001 when PORT=12000); `index.js` binds both, a
  busy extra port is skipped. Branch also merges `wave/w-menu`.
- Test baseline on this branch, Node 24.21: **291 pass / 0 fail** (was 251 before
  W-MAP/w-menu work; sea travel + origin gate added 3).
- **Sea travel (added 2026-10-08 on `wave/w-map`):** the global map draws the
  `CROSSINGS` lanes (from `seaLanes()` in `services/world.js`, exposed as
  `GET /api/world/map` -> `voyages[]`, time in **days**). **A lane sails over
  water:** `seaRoute()` in `game/world_geo.js` BFS-walks the land/sea grid
  (`world-mask.json`) from the nearest sea cell of one port to the other and
  ships the simplified `path`; `GlobalMap.jsx` draws that path (no arc-through-
  land). `services/continents.js#startCrossing`
  now **`recordVisit(characterId, toId)`** so a cross lands the party at the far
  port (before, the fare was charged but the party stayed put), and it **refuses
  an origin the party is not standing in** (`Отряд не находится здесь`), like
  `startTravel`. Crossing UI is the «Морской путь» card on `pages/Location.jsx`
  (`api.getCrossings`/`startCrossing`). W-SEA (pirates/islands/ship combat)
  remains unbuilt.
- **Testing gotcha:** `recordVisit` (POST visit) only marks a place **seen** — it
  does **not** move `characters.location_id`. To place a hero in a port in a test
  or script, call `services/world.js#recordVisit` directly (what `finish()` does).
- **AGENTS.md was double-encoded** (all Russian -> mojibake) by commit `7dd4fc1`
  on `wave/w-map`; repaired 2026-10-08 (`edcbd65`) by restoring the affected
  lines from clean `origin/main`, content unchanged. When editing these files,
  use python UTF-8 writes — the in-session editor corrupted Russian text.

- **W-MAP status 2026-10-08:** branch rescued via `git bundle` after the old
  orchestrator sandbox ERRORed; pushed to GitHub, PR **#14** opened
  (`wave/w-map` -> `main`, draft). Only open PRs: #13 (W-MENU, draft) and #14.
  `main` unchanged. The next wave still needs an explicit `погнали`
  (`docs/PENDING_WAVES.md` order: W-MENU -> W-AUDIO -> W-MAP-GLOBAL/CONT ->
  W-SHIP -> W-SEA).
- **Ship points (user, 2026-10-08, supersedes the old list):** ship upgrade
  points come **only from sea battles** — pirates (party + guns vs the pirate
  ship) pay **+5**, sea monsters (the ship fights **alone**) pay **6-10** (by
  danger). The old "+1/hero level, +2/island, +1/harbour quest" is dead.
  The ship has **10 levels**; each level unlocks **six upgrades — two per branch**
  (so **60 total**): **hull** (the ship), **guns** (damage/reload/slot count), and
  **class guns** (20 special guns, two per level, each mannable only by listed
  hero classes and each with its own sea ability; `key` stays Latin). Everything
  lower stays available. Upgrades happen **only in a port and cost in-game time**
  (a timed dock on the travel clock; hired hands trade gold for half the time).
  **Enemies scale with the ship** (tier-N pirates/monsters for a level-N ship) so
  a 60-upgrade ship is still balanced; whether the payout scales with tier is
  open. Full tables in `docs/PENDING_WAVES.md`; nothing built (no `погнали` yet).
- **Journal in the inventory (user, re-confirmed 2026-10-08):** remove the top
  text nav and add a **journal/«дневник»** to the character's inventory (book
  tab separate from item slots: Лор / Карта мира / Настройки / Создатели). This
  is the earlier **W-CODEX / W-SHELL** plan (`docs/CHAT_ARCHIVE_MAIN.md`); it
  needs W-MENU in `main` first, since the header it removes lives in PR #13.


## main is now up to date (2026-10-08) — W-MAP + W-MENU + W-SHIP merged

- **`main` HEAD `028b078`** contains everything: **#14** (`wave/w-map` -> main,
  merge-commit `207185f`) and **#15** (`wave/w-ship` -> main, `028b078`). **#13**
  (`wave/w-menu`) was closed as superseded — it is fully contained in
  `wave/w-map` (`git merge-base --is-ancestor origin/wave/w-menu origin/main`).
- **Merge style is merge-commits** (not squash): `git log --merges` shows
  `Merge G5/G7/G8/...`. Use `merge_method=merge` when merging PRs.
- Before merging #15 I merged `main` into `wave/w-ship` (commit `0b5fa30`) and
  resolved 5 conflicts — all **union** conflicts (both sides append to the same
  spot): `.openhands/memory/{MEMORY,2026-10-08}.md`, `client/src/styles.css`,
  `docs/PENDING_WAVES.md`, `server/src/index.js`. Both routers
  (`/api/lore`, `/api/ship`) and both port resolvers survive.
- **Test baseline on `main`: 312 pass / 0 fail** (was 251 before W-MAP/W-SHIP).
- Preview: both work-host ports answer 200 (`server/src/ports.js`).
- **Next wave: W-SEA** (pirates, non-repeating islands/Fortune, sea monsters,
  ship combat; spends the ship points W-SHIP awards). Then W-CODEX/W-SHELL.

## W-CODEX/W-SHELL (added on `wave/w-codex-shell`, PR #17)

- The `wave/w-map`/`wave/w-ship` merge resolved all five union conflicts; W-MENU
  was folded in, so PR #13 was closed as superseded (already an ancestor of
  `main`).
- **The Codex is a real book, not tabs** (user asked for a flipping book): a
  closed cover → two-leaf spread (table of contents left, chapter right) with a
  page-turn animation, `‹ Назад / Вперёд ›`, arrow keys and Esc. Same chapters
  (Лор / Карта мира / Настройки / Создатели), each a thin wrapper over the
  existing page so there is one implementation per section. A `?tab=` bookmark
  (from the inventory) opens straight to that chapter.
- **The Lore page is curated by `LORE_DOCS` in `game/lore_docs.js`** (not a
  directory scan). User asked to hide **Клан / Квесты / Онлайн / Имена и стиль**
  from the player-facing Lore — removed from `LORE_DOCS` so they 404 and vanish
  from the list; the canon `.md` files stay for the waves that reference them
  (G8 quests, G9 clan, G12 online). There is **no** "Разработчики" lore doc —
  that is the separate **Создатели** (Creators) tab. `getLore` also requires a
  server restart (catalogue read at boot) — `serve.sh` alone does not reload it.

## W-SHIP (added on `wave/w-ship`, PR #15)

- A hero buys a **ship** in a **port** for gold (ports = `CROSSING_GATES` in
  `game/continent_travel.js`); one ship per hero; it waits in the port. Tables
  `ships`/`ship_upgrades`/`ship_works` (additive in `schema.sql`).
- **10 levels x 3 branches x 2 upgrades = 60** (`game/ship.js`): hull, guns,
  class guns (20 guns, class-locked, own ability). A level needs all six forged
  before the ship rises. Cost `base*n` points; dock time `HOURS_BASE*n` in-game
  hours on the **road clock** (`MS_PER_MINUTE`), one job at a time, hired hands
  halve it for gold.
- Points **only from sea battles** (`awardShipPoints`); W-SEA pays +5 pirates /
  6-10 monsters. UI `pages/Shipyard.jsx` (`/shipyard/:characterId`), linked from
  the party strip. `npm test` 282/0 (+15).


## Preview "ошибка" root cause (2026-10-08) — fix/preview-resilient-requests (PR #16)

- The sandbox **stops after 20 min idle** (`OH_RUNTIME_IDLE_TIMEOUT_SECONDS=1200`).
  While stopped the preview URL is down; on return the runtime wakes and the
  server restarts, but a browser request arriving one moment too early fails at
  the **network level**. `client/src/api.js#request` turned that into the raw
  **"Failed to fetch"**, which read as "the site is broken again" and cleared
  only after sending the agent a message (which runs the `serve.sh` hook).
- Fix: `request()` **retries a GET** up to 4x (400/800/1200 ms) and shows
  «Сервер просыпается, подождите секунду…»; **writes are never retried**.
- Verified healthy otherwise: `npm test` 312/0, both ports 200, and the resident
  watcher restarts the server within ~5 s (killed it and watched it come back).
- **Hooks do bind to this conversation** (`meta.json` has `user_prompt_submit` +
  `session_start` with the `serve.sh` command), but they do NOT re-fire on every
  message here — so the resident watcher is what keeps the preview up in-session,
  and it must be started once after a runtime restart (`bash scripts/serve.sh`).
- **Do not run `npm run build` while `serve.sh` may rebuild**: a parallel vite
  build fails with a non-zero exit though the artifact is fine. Build first,
  then serve.
