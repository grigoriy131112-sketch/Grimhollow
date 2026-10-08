# Grimhollow — pending waves (post-G12 backlog)

Everything below is **approved-in-principle but NOT started**. Each wave still
needs its own explicit `погнали` (one wave = one approval = one chat = one branch
= one PR). No agent builds ahead.

## Standing rule

> **The user adds requirements from his head, often, mid-stream.** Any new
> requirement the user states must be written down here (verbatim where it
> matters) before it is built. Nothing is built without a per-wave `погнали`.

## Locked decisions (from the user)

- **Audio:** take tracks **by license** (CC0 / public domain only). Real files,
  not placeholders. Ship them with credits.
- **Main menu:** a first page with the usual game list — **Новая игра**,
  **Сохранённые игры**, **Настройки**, **Создатели**, **Лор** (+ anything else
  that fits). "Сохранённые игры" lets you pick a save and **continue**. "Новая
  игра" **creates a new character and adds it to the saves**.
- **Maps:** reuse the *same kind of images as the current map* (antique engraving
  style) but **with other shapes**; assemble the **global map ourselves** from
  those images. **Generate the art in the current style** (procedural SVG
  engraving, no rasters).
- **Ship:** bought in **ports for gold**. **Level 1 only** for now. Separate
  **upgrade points** for the ship. **Classes exist for both heroes and guns.**
  The ship **stays in the port after arrival and waits for the hero there**.
- **Ship combat:** a **separate, pure** system.
- **Crossing time:** keep as-is (1 in-game hour; `MINUTE_MS = 10_000` ⇒ ~10 min
  real time).
- **On the ship:** while sailing, the player can **talk with the party** and
  **write on papers** — **only on the ship**. The papers are **free-form notes**
  combined with an **event log** and **lore notes that appear automatically once
  a detail is learned**.
- **Islands:** a **huge number**, **non-repeating**, chosen by **Fortune**
  (randomness, seeded).
- **"New game"** simply **routes to the existing hero-creation page** — no new
  wizard.
- **Upgrade points (ship):** the agent decides — see W-SHIP below.
- **Classes:** classes exist for **both weapons and heroes**.

## Waves

| Wave | Goal | New files (owner) | Depends on | Status |
|------|------|-------------------|------------|--------|
| **W-MENU** | Start menu hub: Новая игра / Сохранённые игры (continue) / Настройки / Создатели / Лор. Remove save **import**. | `client/src/pages/MainMenu.jsx`, `Creators.jsx`, `Lore.jsx` | — | **PR #13 (in review)** |
| **W-AUDIO** | Music + SFX engine, real licensed files, volume in settings | `client/src/audio.js`, `client/public/audio/**` | files | not started |
| **W-MAP-GLOBAL** | Global map: all continents + names of continents and seas + **ports only** (no locations) + **sea lanes with their voyage time** | `client/src/GlobalMap.jsx`, `client/src/mapProjection.js` | — | **in this PR** |
| **W-MAP-CONT** | Per-continent map (regions + locations) shown when the hero is on it | `client/src/ContinentMap.jsx` | W-MAP-GLOBAL | **in this PR** |
| **W-SHIP** | Ship: buy in port for gold, L1, upgrade points, classes (heroes & guns), ship waits in port | `server/src/services/ship.js`, `routes/ship.js`, `client/src/pages/Shipyard.jsx` | — | not started |
| **W-SEA** | Sea crossing: pirates, non-repeating islands (Fortune), sea monsters, **ship combat**, party talk + papers on board | `server/src/game/naval.js`, `services/voyage.js`, `routes/voyage.js`, `client/src/pages/Voyage.jsx` | W-SHIP, W-MAP-GLOBAL | not started |

Order: `W-MENU → W-AUDIO → W-MAP-GLOBAL → W-MAP-CONT → W-SHIP → W-SEA`.
(`W-MENU` and `W-MAP-GLOBAL` are independent; shared files — `App.jsx`,
`index.js`, `schema.sql` — are owned by the orchestrator.)

## Audio contexts (W-AUDIO) — one file per context

The user wants **every context to have its own audio file**. The contexts that
already exist in the game:

| Key | Context |
|-----|---------|
| `menu` | main menu |
| `world` | world / atlas / continent map |
| `location` | exploring a location |
| `settlement` | city / village |
| `battle` | combat |
| `sea` | crossing the sea (voyage) |
| `port` | a port / harbour |
| `tavern` | inside a tavern |
| `temple` | temple / chapel |
| `forest` | forest biome |
| `marsh` | marsh biome |
| `waste` | ash waste biome |
| `coast` | coast biome |
| `bonefield` | bone field biome |
| `snow` | frozen north |
| `campaign` | story / campaign screen |

SFX (short): `ui_click`, `ui_back`, `hit`, `miss`, `crit`, `loot`, `level_up`,
`death`, `coin`, `open`, `cannon`, `splash`.

All tracks sourced **CC0 / public domain only**, credited in `CREDITS.txt`.
Music tracks are **seamlessly looped** (the engine crossfades and restarts them);
SFX are short one-shots. Audio credits go in the same `client/public/art/CREDITS.txt`
(a new "Audio credits" section), not a separate file.

## Ship upgrade points (W-SHIP) — decided

Upgrade points are earned by:

- **+1 per hero level** (ship grows with its captain);
- **+1 per cleared sea encounter** (pirates / sea monsters) — a capped trickle;
- **+2 for discovering a new island** (exploration reward);
- **+1 for each completed harbour quest** tied to a shipwright.

Spent on: hull HP, cannon damage, extra cannon slots, reload speed, cargo/crew.

## Classes (W-SHIP / W-SEA) — both kinds

- **Weapon classes** (guns): `culverin`, `carronade`, `mortar`, `harpoon` —
  each with its own damage/arc/reload profile.
- **Hero classes**: reuse the existing hero classes; each class mans guns with a
  small bonus (e.g. a warrior reloads slower but hits harder).

## Sea travel on the global map (W-MAP-GLOBAL, done in this PR)

> **User requirement (verbatim):** «Игрок появляется на континенте… и там он может
> переходить из локации в те, которые соединены дорогой с той, где он находится.
> Когда он плывёт по миру (сделай в мире пути и время этого пути…) и приплывает
> на другой континент, то он может из порта переместиться в те локации, которые
> соединены с портом дорогой.»

What this settled:

- The **global map draws the sea lanes** between the five port gates, each with
  its **voyage time in days** (from `CROSSINGS`). The lanes come from
  `GET /api/world/map` as `voyages[]`, not hand-drawn in the client, so the map
  and the crossing screen read one source.
- A **crossing now lands the party at the far port** (`startCrossing` calls
  `recordVisit(characterId, toId)`), and
  `GET /api/continents/locations/:id/crossings` is wired to a **«Морской путь»**
  card on the location page with an **«Отплыть»** button. Before this the fare was
  charged and the sea resolved, but the party was never moved to the destination.
- From the port the normal **road rules** apply: only places joined by a road to
  the port can be entered, obeyed by `startTravel` and mirrored on
  `ContinentMap.jsx`. So "from the port move to locations joined by a road" is the
  existing road system, not a new one.
- The separate `W-SEA` wave still owns pirates, non-repeating islands (Fortune),
  sea monsters, ship combat and the papers; this PR only adds **paths + time** and
  the arrival-at-the-port move.

## Open questions

1. **Audio files** — sourcing confirmed CC0-only. Any preference on track length
   (loops vs. one-shots)? *(W-AUDIO)*
2. **Map art** — confirmed: generate procedural SVG in the current engraving
   style. *(W-MAP-GLOBAL)*
3. **"New game"** — confirmed: routes to the existing hero-creation page. *(W-MENU)*
4. **Ship upgrade points** — decided above; confirm the numbers. *(W-SHIP)*
5. **Papers on the ship** — confirmed: free-form notes + event log + auto lore
   notes. Need the lore "learned" hook (which discoveries set a flag). *(W-SEA)*

## Wave G12 (online)

Still **not started**; per the directive it is last and needs a **new explicit
approval** (it re-architects accounts and a shared world).
