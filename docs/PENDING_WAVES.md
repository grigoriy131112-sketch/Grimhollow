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
  those images.
- **Ship:** bought in **ports for gold**. **Level 1 only** for now. Separate
  **upgrade points** for the ship. **Classes exist for both heroes and guns.**
  The ship **stays in the port after arrival and waits for the hero there**.
- **Ship combat:** a **separate, pure** system.
- **Crossing time:** keep as-is (1 in-game hour; `MINUTE_MS = 10_000` ⇒ ~10 min
  real time).
- **On the ship:** while sailing, the player can **talk with the party** and
  **write on papers** (a logbook / notes feature) — **only on the ship**.
- **Islands:** a **huge number**, **non-repeating**, chosen by **Fortune**
  (randomness, seeded).

## Waves

| Wave | Goal | New files (owner) | Depends on | Status |
|------|------|-------------------|------------|--------|
| **W-MENU** | Start menu hub: Новая игра / Сохранённые игры (continue) / Настройки / Создатели / Лор. Remove save **import**. | `client/src/pages/MainMenu.jsx`, `Creators.jsx`, `Lore.jsx` | — | not started |
| **W-AUDIO** | Music + SFX engine, real licensed files, volume in settings | `client/src/audio.js`, `client/public/audio/**` | files | not started |
| **W-MAP-GLOBAL** | Global map: all continents + names of continents and seas + **ports only** (no locations) | `client/src/GlobalMap.jsx`, art | — | not started |
| **W-MAP-CONT** | Per-continent map (regions + locations) shown when the hero is on it | `client/src/ContinentMap.jsx` | W-MAP-GLOBAL | not started |
| **W-SHIP** | Ship: buy in port for gold, L1, upgrade points, classes (heroes & guns), ship waits in port | `server/src/services/ship.js`, `routes/ship.js`, `client/src/pages/Shipyard.jsx` | — | not started |
| **W-SEA** | Sea crossing: pirates, non-repeating islands (Fortune), sea monsters, **ship combat**, party talk + papers on board | `server/src/game/naval.js`, `services/voyage.js`, `routes/voyage.js`, `client/src/pages/Voyage.jsx` | W-SHIP, W-MAP-GLOBAL | not started |

Order: `W-MENU → W-AUDIO → W-MAP-GLOBAL → W-MAP-CONT → W-SHIP → W-SEA`.
(`W-MENU` and `W-MAP-GLOBAL` are independent; shared files — `App.jsx`,
`index.js`, `schema.sql` — are owned by the orchestrator.)

## Open questions

1. **Audio files** — which contexts (menu / world / battle / sea), how many
   tracks, and confirm CC0-only sourcing. *(blocks W-AUDIO)*
2. **Map art** — do the continent/global engravings already exist as images, or
   do we generate SVG from the current style? *(blocks W-MAP-GLOBAL)*
3. **"New game"** — reuse the existing character-creation screen, or a new
   wizard? *(W-MENU)*
4. **Ship upgrade points** — earned how (level, gold, quests)? "Classes of guns"
   = which taxonomy (by weapon type, by hero class)? *(W-SHIP)*
5. **Papers on the ship** — free-form notes stored per character, or
   logbook entries auto-written from events? *(W-SEA)*

## Wave G12 (online)

Still **not started**; per the directive it is last and needs a **new explicit
approval** (it re-architects accounts and a shared world).
