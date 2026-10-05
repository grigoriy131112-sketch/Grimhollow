# Grimhollow — полный архив волновых чатов

Все сообщения пользователя и агента из облачных разговоров G1–G11, извлечённые перед их удалением. Код этих волн уже влит в `main`; здесь — переписка и отчёты.


## G1 lore  (`a0f5512953bf4fe6960f02296565a13c`)


## G2 items  (`adadabfe17a648389cdad0806e8c2d8b`)

### assistant

G2 is complete. Here is the final report.

## PR link
**https://github.com/grigoriy131112-sketch/Grimhollow/pull/4** — `wave/g2-items` → `main`, title "G2: Items, equipment, artifacts, buffs and debuffs", mergeable, 1 commit.

## Test count
`npm test` → **153 pass / 0 fail** (baseline was 133; I added 20 focused tests and weakened/deleted none). Client `npm run build` also succeeds.

## Files created
- `server/src/game/modifiers.js` — pure modifier engine (base + active modifiers; buffs/debuffs with duration, stack rule `refresh|stack|replace`, source). Shape documented for G3 reuse.
- `server/src/routes/items.js` — inventory / equip / unequip / buffs / modifiers / use / catalogue endpoints.
- `client/src/pages/Inventory.jsx` — equipment + inventory screen, Russian labels, SVG icons only.
- `server/test/items.test.js` — catalogue, modifier math, equip/unequip, buffs, consumables.
- `client/public/art/items/*.svg` — 26 CC BY 3.0 game-icons.net SVGs (one per item; no rasters).

## Files changed
- `server/src/game/items.js` — extended catalogue (weapons, armour, resources, artifacts, consumables) with type/slot/rarity/stats/price + Russian text; `shepherd_key` keeps `ritual:true` and `RITUAL_ITEM` is unchanged.
- `server/src/services/items.js` — added equip/unequip, apply/remove/tick buffs, use-consumable, `activeModifiers`, `getInventory`.
- `server/src/db/schema.sql` — append-only `character_equipment` and `character_buffs` tables.
- `server/src/index.js` — one import + one `app.use('/api/items', itemRoutes)`.
- `client/src/App.jsx` — one import + one `<Route path="/inventory/:id">`.
- `client/src/api.js`, `client/src/icons.jsx` (`itemIcon`), `client/src/pages/CharacterSheet.jsx` (link), `client/public/art/CREDITS.txt` (icon credits).

## What the orchestrator must wire up on main
- **Nothing required.** All shared files were edited append-only (one import + one registration line each); no reformatting or reordering.
- **Deliberate design note:** battles still read the *raw* sheet (`services/characters.js#getCharacter`); folding equipment/buffs into combatants is intentionally left to a later wave so bonuses can't apply twice. `getInventory` folds them for display only.
- The G2 modifier engine is the contract G3 (hunger/thirst/fatigue) should reuse — its shape is documented in `server/src/game/modifiers.js`.

I also recorded the wave/test/art conventions in `.openhands/memory/` for future sessions.


## G3 survival  (`52b3cca8ba2d4068afa75e725db946f0`)

### assistant

G3 survival is complete and pushed. Final report below.

## PR link
**https://github.com/grigoriy131112-sketch/Grimhollow/pull/5** — open, against `main`, titled **"G3: Hunger, thirst and fatigue as debuffs"**.

## Test count
`npm test` → **184 pass / 0 fail** (168 baseline + 16 new). No existing test was weakened or deleted.

## Files created
- `server/src/game/survival.js` — pure rules: 0..100 meters, travel/turn rates, thresholds, food/drink values, and the debuff descriptors emitted into the G2 modifier engine. No DB, no I/O.
- `server/src/services/survival.js` — persistence (`character_survival`) + debuff sync through the existing `character_buffs` table via `services/items.js`; hooks `advanceOnTravel`, `advanceOnTurn`, `rest`, `consume`, `getSurvivalView`.
- `server/src/routes/survival.js` — `GET /api/survival/:characterId`, `POST .../travel|turn|rest|consume`.
- `server/test/survival.test.js` — 16 focused tests (meters rise/fall and clamp 0..100, thresholds pick the right tier, debuff lands on `character_buffs`, tier climbs replace rather than stack, debuff is removed on recovery, unrelated buffs survive a sync).

## Files changed (minimal append-only)
- `server/src/db/schema.sql` — additive `character_survival` block only.
- `server/src/index.js` — one import line + one `app.use('/api/survival', …)` line only.

## Design notes
- **No second buff system**: need debuffs are written through `applyBuff`/`removeBuff` with `sourceType: 'need'`, stable per-stat keys (`hunger:attack`), `turns: null`, `stack: 'refresh'`, so a stronger tier replaces the weaker row and recovery leaves nothing stale.
- **Effects**: hunger → attack / maxStamina; thirst → maxStamina / accuracy; fatigue → accuracy / evasion / speed. All use keys from `STAT_KEYS`.
- **No death by starvation** — defeat stays survivable (1 HP, 25% gold).
- **Food/drink**: reused `ration`, `waterskin`, `dried_fish`, `turnip`, `bread_loaf`, `clean_water`. No new items invented.

## What the orchestrator must wire up on `main`
1. `/api/survival` router registration is already included (append-only) — resolve it with the other batch edits at merge time.
2. No client page was added (outside this wave's file ownership). The meters can be surfaced from `GET /api/survival/:characterId` or folded into the character sheet.
3. To make the meters actually move during play, call `advanceOnTravel(characterId, minutes)` on arrival in `services/travel.js`, `advanceOnTurn(characterId)` in the battle turn loop, and `consume(characterId, key)` when a food/drink item is used (items are still spent by `services/items.js#useConsumable`).
4. **"Thirst lowers max stamina regen" caveat**: the G2 engine has no `staminaRegen` stat key and this wave may not edit G2's file, so thirst is expressed through `maxStamina`. If you want a literal regen debuff, promote `staminaRegen` to `STAT_KEYS` in `game/modifiers.js` on `main`; the meter logic needs no change.

_This report was produced by an AI agent (OpenHands) on behalf of the user._


## G4 save/settings  (`fdb21be5d055495889e31b6830f1c212`)

### assistant

G4 is complete. Final report:

## Summary

Built save management and a settings page for wave G4, committed to `wave/g4-save-settings` and opened a PR against `main`.

**PR:** https://github.com/grigoriy131112-sketch/Grimhollow/pull/1

**Tests:** `npm test` → **140 pass / 0 fail** (baseline was 133/0; +7 new focused tests). `npm run build` (vite client) also succeeds.

### Files created
- `server/src/services/saves.js` — named save slots: `listSaves`, `createSave`, `loadSave`, `deleteSave`, `exportSave`, `importSave`, plus `captureSnapshot` / `validateSnapshot` / `applySnapshot`. Wraps the existing SQLite state (`characters`, `party_members`, `party_relations`, `party_upgrades`, `character_items`, `character_visits`) and leaves the current auto-save behaviour untouched.
- `server/src/routes/saves.js` — HTTP layer under `/api/saves`.
- `client/src/pages/Settings.jsx` — audio/UI preferences persisted in `localStorage`, plus save-slot management (list/load/delete/export/import). Russian labels.
- `server/test/saves.test.js` — create/load/delete + export/import round-trip tests.

### Files changed (minimal, append-only)
- `server/src/db/schema.sql` — appended the `saves` table block.
- `server/src/index.js` — one import + one `app.use('/api/saves', saveRoutes)`.
- `client/src/App.jsx` — one import + one `<Route path="/settings">` + one nav link.
- `client/src/api.js` — save helper methods (api module wasn't listed as a shared conflict file).

### Constraints honoured
- **Full restore:** a load brings back hp/mana/stamina/gold/xp/level, location, the whole party (members, xp/level/resources/status/recruit log), directed relations, party-upgrade ranks/points, items and visited places. It replaces state wholesale inside one transaction, so no stale companion/item/upgrade/visit survives.
- **No data loss:** snapshots are validated before touching a live hero; export/import accepts either a bare snapshot or a full exported slot; a load is idempotent.
- **No dice/resource changes**, art stays SVG, player text Russian, stable keys Latin.

### What the orchestrator must wire up on `main`
Nothing — merging the branch is enough. The `saves` table is created by `CREATE TABLE IF NOT EXISTS` on startup, and all shared-file wiring is already in place (append-only edits). The page is reachable from the nav («Настройки») and at `/settings`; it can be pre-filtered with `/settings?characterId=<id>`. Preferences are intentionally client-only (`localStorage` key `grimhollow.settings.v1`), so no server preference table was added.


## G5 continents  (`8c7bf95df6a447f8a81a5be1098b053a`)


## G6 settlements  (`2faf20fb510e4f0fb95e6fc483df6ccc`)

### assistant

G6 is complete. Here is my final report.

## G6 — Settlements: done

**PR:** https://github.com/grigoriy131112-sketch/Grimhollow/pull/2 (open, mergeable, `wave/g6-settlements` → `main`)

**Tests:** `npm test` → **141 pass / 0 fail** (133 baseline + 8 new). I did not weaken or delete any existing test. `npm run build` also succeeds.

### Files created
- `server/src/db/seed_settlements.js` — seeds the city **Гримхольд** (10 buildings) and the village **Соляной Брод** (9 buildings) on the Мордрат continent, each with tavern, temple, library, guild hall, smithy, shop, market + inns/houses. Inserts their locations and two-way timed roads (via `travelMinutes`). Contains the `BUILDING_TYPES` catalog and the documented **G7 stock shape**.
- `server/src/services/settlements.js` — `listSettlements`, `getSettlement` (with buildings), `getSettlementByLocation`, `getBuilding`, and `actionsFor(type)` which resolves "what can I do here".
- `server/src/routes/settlements.js` — `GET /api/settlements`, `/:id`, `/buildings/:buildingId`, `/by-location/:locationId`.
- `client/src/pages/Settlement.jsx` — settlement screen listing buildings, letting the player enter one; Russian labels; existing CC BY 3.0 SVG landmark icons only, no rasters.
- `server/test/settlements.test.js` — 8 focused tests (seed consistency, building types, land placement, two-way timed roads, G7 stock shape, action resolution, re-seed idempotency).

### Files changed (minimal, append-only)
- `server/src/db/schema.sql` — additive block: `settlements`, `settlement_buildings`, `settlement_stock`.
- `server/src/index.js` — one import + one `app.use('/api/settlements', …)` + one `seedSettlements()` startup call.
- `client/src/App.jsx` — one import + one `<Route path="/settlements/:id">`.
- `client/src/styles.css` — appended Wave G6 style block only.

### G7 contract (documented in code)
`settlement_stock` holds one row per offer; the service exposes `stock: [{ itemKey, price, quantity }]`, where `itemKey` is Latin (maps to `ITEMS` once G2 lands), `price` is gold/unit, and `quantity = -1` means endless. Buying/selling is intentionally **not** implemented.

### What the orchestrator must wire on main
1. **UI entry point (recommended).** The route `/settlements/:id` exists but nothing links to it. A "Войти в поселение" link should be added from `pages/Location.jsx` / `WorldMap.jsx` (owned by other waves, so I left them untouched). `GET /api/settlements/by-location/:locationId` is provided for exactly this.
2. **Optional:** add `api.getSettlements` / `api.getSettlement` to `client/src/api.js` — I kept `Settlement.jsx` self-contained with a local fetch helper because `api.js` is treated as shared/not in the G6 exclusive list.
3. **Note:** I made an append-only edit to `client/src/styles.css` (not listed in CHATPLAN's shared-file set but not exclusively owned either); flag it if another wave edits that file concurrently.
4. No other main-side wiring is needed — the seed and router are already registered in `server/src/index.js`.


## G7 trade  (`fcbc50ca0ad3411aaff3299b96640305`)


## G8 quests  (`deeec5699ce8475792de0ddb446da43a`)

### assistant

## G8 Quests — complete ✅

### PR
**https://github.com/grigoriy131112-sketch/Grimhollow/pull/9** — *G8: Quests — sources, progress, rewards*
Status: **merged** into `main` (merge commit `b7029f8`), 8 files changed.

### Test count
`npm test` → **227 pass / 0 fail** (was 217; **+10** focused quest tests). Client `npm run build` also passes.

### Files created / changed
**New (owned by G8):**
- `server/src/db/seed_quests.js` — 14 quests (prologue + chapters 1–3), idempotent seed. `source`/`giver`/`chapter`/`title`/`text`/`objective`/`reward`/`requires`/`story`; objective types `kill|visit|collect|deliver|talk|survive|revive|no_steel`, reward fields `gold|xp|item|opinion|unlock` exactly per spec. Givers are existing NPCs (`hangman_keeper`, `sister_maeve`, `marsh_ferryman`, `tide_hermit`, `harbor_broker`, `chapel_ghost`, `fog_widow`, `ash_druid`, `bonepicker`, `spire_warden`) or G6 buildings (`salt_ford_village:tavern`).
- `server/src/services/quests.js` — accept / abandon / event-driven `advanceQuest` / `reportProgress` / `completeQuest` / `failQuest`. Reuses **G2 `services/items.js`** for items and the existing `npc_relations` table for opinion; XP via `game/rules.js`. Story quests return to the pool on failure; side-quest failure costs the giver `SIDE_FAIL_OPINION = -5`; unlock flags land in `character_unlocks`.
- `server/src/routes/quests.js` — list, accept, abandon, progress, advance, complete, fail.
- `client/src/pages/Quests.jsx` — Russian quest log (available / active / completed / failed tabs, progress bars, rewards); SVG icons only (existing game-icons.net landmarks), no rasters.
- `server/test/quests.test.js` — 10 tests: seeding & idempotency, accept/progress/complete rewards, requirement gating, item reward, collect-by-item, story-quest return, side-fail opinion, opinion reward, abandon, report-progress, availability gating.

**Shared files (minimal append-only):**
- `server/src/db/schema.sql` — one additive block: `quests`, `character_quests`, `character_unlocks` (all `CREATE TABLE IF NOT EXISTS`, so **no `migrate()` edit needed**).
- `server/src/index.js` — one import + one `seedQuests()` call + one router import + one `app.use('/api/quests', …)`.
- `client/src/App.jsx` — one import + one `<Route path="/quests/:characterId">`.

### What the orchestrator must wire on `main`
Nothing further — the append-only wiring was included and merged. Notes for later waves:
- `advanceQuest(characterId, event)` and `adjustNpcOpinion` are exported so G10 (encounters) and G11 (campaign) can report kills/visits/talks without new endpoints.
- `character_unlocks` is the progress-flag store G11 reads.
- `docs/lore/quests.md` chapters 4–7 are intentionally deferred (spec says they are added as continents open).

### Verification done
- Live smoke test against a temp DB: health, character creation, quest log (5 available initially), accept, progress → gold +20 / xp +50 granted, side-quest fail → opinion 40→35 and quest lost, SPA route `/quests/1` returns 200.
- Reverted `package.json` install noise (workspace formatting + `allowScripts`) so only intended files are in the PR.


## G9 clan  (`c99053100ada441ba11852ce0469c0a6`)

### assistant

G9 is complete. Here is the final report.

## PR

**https://github.com/grigoriy131112-sketch/Grimhollow/pull/11** — *"G9: The player's clan — founding, doctrine, holdings"* (`wave/g9-clan` → `main`).

## Tests

`npm test`: **251 pass / 0 fail** (baseline 242 → +9 new G9 tests). All existing tests untouched.

## Files created

- `server/src/db/seed_clan.js` — idempotent seed of the 4 doctrines and 6 building types, plus the pure design data (costs, bonuses, founding conditions, Cyrillic→Latin key).
- `server/src/services/clan.js` — founding, irreversible doctrine, levels 1–5, holdings, resources (gold + `names`), mercenaries (hire/revive).
- `server/src/routes/clan.js` — `/api/clan/leader/:leaderId` GET, plus `found`, `doctrine`, `level`, `build`, `names`, `names/buy`, `hireable`, `hire`, `mercenary/:id/revive`.
- `client/src/pages/Clan.jsx` — clan screen (doctrine, holdings, resources, mercenaries), Russian text, SVG icons only.
- `server/test/clan.test.js` — 9 tests.

## Files changed (append-only shared edits)

- `server/src/db/schema.sql` — one block at the end: `clans`, `clan_buildings`, `clan_mercenaries`, `clan_catalog`.
- `server/src/index.js` — 1 import + 1 `seedClan()` call + 1 `app.use('/api/clan', clanRoutes)` + its import.
- `client/src/App.jsx` — 1 import + 1 `<Route path="/clan/:leaderId">`.

No other files were touched; no reformatting/reordering of shared files.

## Design notes / orchestrator wiring

- **Founding conditions** (spec: chapters 1–6, a fleet, an ally) are enforced. I chose the flags: chapters = `chapter_1..chapter_6` in `character_unlocks`; allies map to the G11 progress flags (Лес=`world_woken`, Архивы=`north_frozen`, Дома-витражи=`memory_bought`, капитаны=`war_truth`); the fleet is the seeded harbours (Гримхольд + 4 ports).
- **What the orchestrator must wire on `main`:** nothing beyond merging this PR — all shared edits are already included and append-only. For the clan to be *reachable in play*, G11 (campaign) must grant the `chapter_1..chapter_6` flags (and an ally flag).
- Reuse, not duplication: G8 `hasUnlock`/`addUnlock`, G2 `hasItem`/`takeItem` + `game/items.js`, `game/companions.js` templates, and `RITUAL_SITE`/`RITUAL_ITEM` for the mercenary ritual.
- No rasters added; combat/resources/turn-order rules untouched.

One note on interpretation: the spec's "5 building slots" is implemented as *distinct holdings* (level 1→1, level 3→2, level 4→3, level 5→6 as the fleet opens everything), and a building's *tier* is gated separately (tier 2 at clan level 3, tier 3 at level 5) — this keeps the spec's "5 levels, more buildings per level" and "улучшения стоят золото + имена" both satisfied.


## G10 monsters  (`7dff7d77f36e4d0f90900cf6a2cd66c8`)

### assistant

Wave G10 is complete. Here is the final report.

## PR link
**https://github.com/grigoriy131112-sketch/Grimhollow/pull/8** — `wave/g10-monsters` → `main`, titled **"G10: Monsters, random encounters and loot"** (open, not marked ready).

## Test count
**232 pass / 0 fail** (`npm test`). Baseline was 217; the 15 new tests in `server/test/monsters.test.js` cover danger bands, safe locations, level-scaling loot, memory-fragment drops, fixed-seed reproducibility, and a real battle + loot payout. No existing tests were weakened or deleted.

## Files created / changed
Created:
- `server/src/game/randomizer.js` — pure rules: the 21 new monsters (levels 2–15) with level, class profile, biome affinity, Russian name and epitaph description; danger bands (1–2 → levels 1–3, 3–4 → 4–8, 5+ → 9–15); biome-aware pools; titled monsters (level 9+) rare and capped at one; deterministic `rollEncounter` / `rollLoot` (gold by level + a resource; titled monsters have a chance of a `memory_fragment`).
- `server/src/db/seed_monsters_extra.js` — idempotent seeding of the extra monsters plus `location_monsters` spawn links chosen by danger band and biome. Never renames/moves/duplicates `seed.js` rows; `Костяной Пастырь` stays off-map.
- `server/src/services/encounters.js` — I/O layer: `encounterPool`, `resolveEncounter`, `startEncounter` (reuses `startBattle` with `kind:'encounter'`), `applyLoot` (reuses `services/items.js`).
- `server/test/monsters.test.js` — focused tests.

Changed (minimal, append-only):
- `server/src/index.js` — **2 lines only**: `import { seedMonstersExtra } from './db/seed_monsters_extra.js';` and `seedMonstersExtra();` after `seedContinents()`.

No `schema.sql` change, no `App.jsx` change, no edit to `server/src/db/seed.js` world/monster rows, and no change to battle math.

## What the orchestrator must wire up on `main`
Only the two append-only lines in `server/src/index.js` above (import + call after `seedContinents()`). Nothing else.

## Notes for later waves
- Loot item keys (`bone_shard`, `salt_lump`, `ash_flake`, `grave_moss`, `memory_fragment`) are **not yet in `game/items.js`** (owned by G2). They are carried as opaque keys for now; a later wave should add catalogue entries. G8/G11 can consume `memory_fragment` as a quest resource.
- `startEncounter()` opens a battle with `kind: 'encounter'`; a location-screen button can call it when a UI is desired (would be one import + one `<Route>`/button in the client).


## G11 campaign  (`4902cdd422234f61ac682eeb1048cd63`)

### assistant

G11 is complete.

## Final report

**PR:** https://github.com/grigoriy131112-sketch/Grimhollow/pull/10 — `G11: Campaign progress — chapter flags and the three endings` (branch `wave/g11-campaign` → `main`, OPEN)

**Tests:** `npm test` → **258 pass / 0 fail** (242 baseline + 16 new). `npm run build` succeeds. No existing test weakened or removed.

**Files created (wave-owned):**
- `server/src/game/campaign.js` — pure: 7 chapter flags with conditions/unlocks, `derivedFlags()` from G8 completions, `finalGateStatus()`, `resolveEnding()`, `buildEpilogue()`.
- `server/src/services/campaign.js` — flag I/O on `campaign_progress`, derive-from-quests, finale gate, `startFinalBattle()`, `claimTrophy()`.
- `server/src/routes/campaign.js` — progress / ending / flag / derive / final / trophy endpoints.
- `client/src/pages/Campaign.jsx` — chapter + gate + ending screen, Russian text, SVG icons only.
- `server/test/campaign.test.js` — 16 tests.

**Files changed (append-only only):**
- `server/src/index.js` — one import + `app.use('/api/campaign', …)`.
- `client/src/App.jsx` — one import + `<Route path="/campaign/:characterId">`.
- `server/src/db/schema.sql` — one additive `campaign_progress` table block.

**Design notes**
- The finale gate is `war_truth` + `clan_founded` + the G8 unlock `spire_approach` + a living party. The boss is the **off-map** `Костяной Пастырь`, fought as a dedicated `campaign_final` battle (`location_id` NULL) — it is never a normal map kill, and his `shepherd_crook` trophy is claimed only after a win.
- Endings: `restore` (world_woken or north_frozen), `freeze` (north_frozen), `hollow_king` (memory_bought + `shepherds` doctrine); ties break restore-first. G8 is reused via `listQuests().completed` — no quest logic duplicated.

**What the orchestrator must wire on `main`:** the three append-only shared edits above are already in the branch; if `main` moved, re-apply them in the same minimal spots. **G9 interface:** `services/campaign.js` reads the clan doctrine defensively from a `clans` table (candidate columns `doctrine` / `doctrine_key` / `path` / `creed`); until G9 lands it is `null` and the finale still resolves. No other wiring needed.
