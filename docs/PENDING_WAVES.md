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
- **Ship:** bought in **ports for gold**. **10 levels** (see the built section
  below), each unlocking upgrades. Ship **upgrade points** come **only from sea
  battles** (W-SEA). **Classes exist for both heroes and guns.** The ship
  **stays in the port after arrival and waits for the hero there**.
- **Ship combat:** a **separate, pure** system.
- **Ship:** bought in **ports for gold**. **10 levels** (the earlier "level 1
  only" is dropped); each level unlocks its own upgrades and **everything
  from lower levels stays available**. Separate **upgrade points** (sea
  battles only). **Classes exist for both heroes and guns.** The ship
  **stays in the port after arrival and waits for the hero there**.
- **Ship combat:** a **separate, pure** system with two kinds — **pirates**
  (party + guns vs the pirate ship) and **sea monsters** (the ship alone).
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
| **W-CODEX / W-SHELL** | Remove the top text nav; add a journal/book to the character's inventory (Лор / Карта мира / Настройки / Создатели), separate from the item slots. Depends on W-MENU being in `main` | `client/src/App.jsx`, `client/src/pages/Inventory.jsx`, new `pages/Codex.jsx` | W-MENU | **in this PR** (`wave/w-codex-shell`) |
| **W-AUDIO** | Music + SFX engine, real licensed files, volume in settings | `client/src/audio.js`, `client/public/audio/**` | files | not started |
| **W-MAP-GLOBAL** | Global map: all continents + names of continents and seas + **ports only** (no locations) | `client/src/GlobalMap.jsx`, art | — | not started |
| **W-MAP-CONT** | Per-continent map (regions + locations) shown when the hero is on it | `client/src/ContinentMap.jsx` | W-MAP-GLOBAL | not started |
| **W-SHIP** | Ship: buy in port for gold, **10 levels x 3 branches x 2 upgrades (60)**, **timed port shipyard**, classes (heroes & guns), ship waits in port. Points come only from sea battles (W-SEA) | `server/src/game/ship.js`, `server/src/services/ship.js`, `routes/ship.js`, `client/src/pages/Shipyard.jsx` | — | **in this PR** (`wave/w-ship`) |
| **W-SEA** | Sea crossing: pirates, non-repeating islands (Fortune), sea monsters, **ship combat**, party talk + papers on board | `server/src/game/naval.js`, `services/voyage.js`, `routes/voyage.js`, `client/src/pages/Voyage.jsx` | W-SHIP, W-MAP-GLOBAL | not started |
| **W-MAP-GLOBAL** | Global map: all continents + names of continents and seas + **ports only** (no locations) + **sea lanes with their voyage time** | `client/src/GlobalMap.jsx`, `client/src/mapProjection.js` | — | **in this PR** |
| **W-MAP-CONT** | Per-continent map (regions + locations) shown when the hero is on it | `client/src/ContinentMap.jsx` | W-MAP-GLOBAL | **in this PR** |
| **W-SHIP** | Ship: buy in port for gold, **10 levels x 3 branches**, **2 upgrades each per level (60 total)** + **timed port shipyard**, classes (heroes & guns), ship waits in port. Points are earned in W-SEA battles, not elsewhere | `server/src/services/ship.js`, `routes/ship.js`, `client/src/pages/Shipyard.jsx` | — | not started |
| **W-SEA** | Sea crossing: **pirates** (party + guns vs pirate ship) and **sea monsters** (ship alone), non-repeating islands (Fortune), **ship combat**, party talk + papers on board, and the ship **points** that W-SHIP spends | `server/src/game/naval.js`, `services/voyage.js`, `routes/voyage.js`, `client/src/pages/Voyage.jsx` | W-SHIP, W-MAP-GLOBAL | not started |

Order: `W-MENU → W-CODEX/W-SHELL → W-AUDIO → W-MAP-GLOBAL → W-MAP-CONT →
W-SHIP → W-SEA`.
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

## Ship upgrade points (W-SHIP) — revised by the user (2026-10-08)

> **Superseded (2026-10-08).** The earlier list (+1 per hero level, +1 per sea
> encounter, +2 per island, +1 per harbour quest) was replaced. Points now come
> **only from sea battles**: **+5** for a won pirate battle and **6-10** for a
> won sea-monster battle (scaled by danger). Islands and harbour quests do not
> pay ship points. See the built section below and `game/ship.js`
> (`POINTS_PER_PIRATE_WIN`, `POINTS_PER_MONSTER_WIN`).

Spent on: hull, guns (damage / reload / slot count) and class guns — 60 upgrades
over 10 levels, two per branch per level.
> **User requirement (verbatim):** «Игрок должен иметь возможность покупать
> корабль и улучшать его за отдельные очки которые можно получить только при
> плавоние в сражениях с пиратами (с ними сражается отряд+пушки коробля по
> кораблю пиратов) и с морскими монрами (с ними сражается только корабль). А
> также улучшать корабль можно только в портах и это занимает игровое время»

Ship upgrade points come **only from sea battles** — nothing else. This
**supersedes** the earlier list ("+1 per hero level / +2 per new island / +1 per
harbour quest"), which is removed: those no longer grant ship points.

- **Pirates** — a boarding fight: the **party fights the crew** while the ship's
  **cannons pound the pirate ship**. The party taking the deck clears the
  encounter; the guns soften the pirate hull. **+5 points** per win.
- **Sea monsters** — the ship fights **alone**: only the hull and the guns are in
  play, the party is not involved. **6-10 points** per win (scaled by the
  monster's danger, so a bigger beast pays more).

Spent at the port shipyard on the components in the **three branches** below
(hull pieces, gun pieces, class guns).

### The ship: 10 levels, three branches, several upgrades each (agent-decided)

The ship has **10 levels**. Each level unlocks **six upgrades — two in each of
the three branches**: the **hull** (the ship itself), the **guns** (damage /
reload / count), and the **class guns** (special guns only some classes can man,
each with its own ability). So the whole tree is **60 upgrades** (20 hull, 20
guns, 20 class guns). A component is raised up to the **current ship level**;
everything unlocked earlier stays available forever.

**Branch A — Корпус (the ship itself) — 2 per level**

| Lvl | Upgrade | Effect |
|----:|---------|--------|
| 1 | Обшивка | hull HP |
| 1 | Набор корпуса | structure (less damage taken) |
| 2 | Паруса | sail speed |
| 2 | Такелаж | rigging / evade |
| 3 | Трюм | cargo for crossings |
| 3 | Кладовые | extra cargo |
| 4 | Команда | boarding strength |
| 4 | Камбуз | crew morale / heal |
| 5 | Укреплённый корпус | +hull armour |
| 5 | Дубовый пояс | resist damage |
| 6 | Киль | resist being boarded |
| 6 | Форштевень | bow strength |
| 7 | Насосы | recover from flooding |
| 7 | Переборки | limit flooding spread |
| 8 | Руль | escape / disengage |
| 8 | Штурвал | helm control |
| 9 | Таран | ramming on the approach |
| 9 | Бивень | +ram damage |
| 10 | Флагман | every hull cap +1 |
| 10 | Адмиральский флаг | party aura at sea |

**Branch B — Пушки (damage, reload, count) — 2 per level**

| Lvl | Upgrade | Effect |
|----:|---------|--------|
| 1 | Заряд | cannon damage |
| 1 | Фитиль | ignition / reliability |
| 2 | Перезарядка | reload speed |
| 2 | Пороховая камора | powder charge |
| 3 | Второй борт | 2nd gun slot |
| 3 | Ядровый погреб | magazine capacity |
| 4 | Картечь | anti-crew shot |
| 4 | Дробь | scatter shot |
| 5 | Тяжёлые ядра | heavier damage |
| 5 | Каменные ядра | shatter rigging |
| 6 | Третий борт | 3rd gun slot |
| 6 | Бомбовые лотки | bomb racks |
| 7 | Наводка | accuracy |
| 7 | Дальномер | range finding |
| 8 | Четвёртый борт | 4th gun slot |
| 8 | Скорострельные салазки | quick-slide mounts |
| 9 | Дальность | range (reaches monsters sooner) |
| 9 | Удлинённые стволы | long barrels |
| 10 | Батарея | every gun cap +1 |
| 10 | Шквал огня | full barrage |

**Branch C — Оружие классов (class guns, own ability) — 2 per level**

A class gun may only be manned by the classes listed. It mounts in a gun slot
(from branch B); its ability is used in the sea battle. `key` stays Latin.

| Lvl | Gun (`key`) | Classes | Ability |
|----:|-------------|---------|---------|
| 1 | Кулеврина `culverin` | ranger, rogue | Прицельный залп — long, precise |
| 1 | Фальконет `falconet` | rogue, bard | Лёгкий залп — cheap, fast |
| 2 | Карронада `carronade` | fighter, barbarian | Бортовой залп — heavy, close |
| 2 | Мушкетон `musketoon` | fighter, paladin | Залп дробью — anti-crew |
| 3 | Мортира `mortar` | wizard, sorcerer | Навесный огонь — area |
| 3 | Бомбарда `bombard` | wizard, warlock | Бомбарда — siege damage |
| 4 | Гарпун `harpoon` | ranger, druid | Гарпунный трос — pull / slow |
| 4 | Китобой `whaler` | barbarian, ranger | Китобойный гарпун — heavy pull |
| 5 | Мистический жезл `arcane_rod` | wizard, warlock, sorcerer | Разряд — chain damage |
| 5 | Рунический болт `runic_ballista` | wizard, paladin | Рунический болт — pierce |
| 6 | Святая пушка `holy_cannon` | cleric, paladin | Кара — smite the ship |
| 6 | Реликварий `reliquary_gun` | cleric, monk | Залп мощей — ward the party |
| 7 | Певчая мортира `chant_mortar` | bard | Вдохновляющий залп — party buff |
| 7 | Певчий вертлюг `sonnet_swivel` | bard, rogue | Быстрый вертлюг — tempo |
| 8 | Костяной требушет `bone_trebuchet` | warlock | Залп костей — fear |
| 8 | Чумной залп `plague_caster` | warlock, druid | Чума — damage over time |
| 9 | Звериный гарпун `beast_harpoon` | druid, barbarian | Рывок зверя — charge |
| 9 | Залп шипов `thorn_volley` | druid, ranger | Шипы — bleed |
| 10 | Драконий огнемёт `dragon_lance` | any class | Драконье пламя — flagship gun |
| 10 | Левиафанов залп `leviathan_gun` | any class | Левиафан — huge burst |

**Points.** A component's level `n` costs `base * n` points (the same scale as
the party tree, so each level costs more). Bases: hull pieces 3, gun pieces 3,
class guns 5 (the special ones are dearer), slots 4, cargo 2, crew 2, sails 2.

**Time (the shipyard works on the game clock).** A component's level `n` takes
`HOURS_BASE * n` **in-game hours** on the dock (`HOURS_BASE = 1`; heavy pieces —
hull, slots, class guns — use 1.5-2). While the work runs the party waits at the
port. **Hired dock hands** do the same job for **gold** in **half the time**.
Reference: 1 in-game hour ≈ 10 real minutes (`MINUTE_MS = 10_000`), so a level-1
piece is ~10 real minutes and a level-5 piece is ~50 real minutes at base speed.

Example: raising the hull from 1 to 2 = `3 * 2 = 6` points and `1 * 2 = 2` in-game
hours (~20 real minutes), or ~10 real minutes with dock hands.

### Balance: enemies scale with the ship (W-SEA)

> **User requirement (verbatim, 2026-10-08):** «пиратов и монстров надо будет
> делать тоже такими же сильными, что бы был баланс»

A 60-upgrade ship would trivialise a fixed enemy, so **pirates and sea monsters
scale with the ship's level**: a level-N ship meets **tier-N** pirates and
monsters. Enemy hull HP, crew strength, gun damage and count are derived from the
tier, so a maxed ship still faces a real fight and a fresh ship is not
slaughtered. Concretely, each tier sets:

- **Pirates** — crew size and their ship's hull/guns grow with the tier (the
  boarding fight: party vs crew, guns vs pirate hull).
- **Sea monsters** — hull, damage and any special ability grow with the tier (the
  ship fights alone).

Because the enemy scales, the fixed payouts (**+5** pirates, **6-10** monsters by
danger) would make a maxed ship a long grind. **Open point:** whether the payout
should also scale with the tier (e.g. a tier multiplier) — flagged for W-SEA so
the effort/reward stays fair; the user's flat numbers are the tier-1 baseline.

**Upgrades happen only in a port, and cost in-game time** — the timed dock is
described under **The ship: 10 levels** above (the party waits at the port
while the work runs; hired dock hands trade gold for half the time).

## Classes (W-SHIP / W-SEA) — both kinds

- **Class guns (branch C)** are the "weapon classes": **twenty guns**, two
  unlocked per ship level, each usable only by the classes listed in the table
  above and each with its own sea-battle ability (`culverin` … `leviathan_gun`).
- **Hero classes**: reuse the existing 12 hero classes; a gun may only be manned
  by the classes its row allows, so the party composition decides which guns you
  can actually fire.

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
- **A lane sails over water, it does not cut across the land.** The server bends
  each lane around the coast: `seaRoute()` in `game/world_geo.js` runs a BFS over
  the same land/sea grid the plate yields (`world-mask.json`), snaps each port to
  the nearest sea cell, and simplifies the walk into a handful of waypoints; the
  `path` is shipped in `voyages[]` and drawn directly. The client's old
  arc-through-the-land rule is gone. A test samples every interior waypoint and
  fails if any lands on '1'.
- A **crossing now lands the party at the far port** (`startCrossing` calls
  `recordVisit(characterId, toId)`), and
  `GET /api/continents/locations/:id/crossings` is wired to a **«Морской путь»**
  card on the location page with an **«Отплыть»** button. Before this the fare was
  charged and the sea resolved, but the party was never moved to the destination.
- From the port the normal **road rules** apply: only places joined by a road to
  the port can be entered, obeyed by `startTravel` and mirrored on
  `ContinentMap.jsx`. So "from the port move to locations joined by a road" is the
  existing road system, not a new one.
- **The map and the place page both say where the party actually is.** The
  continent chart rings the party's spot and labels it «Вы здесь»; the place page
  marks the current place green and disables **«В путь»** / **«Отплыть»** with a
  note when the party is elsewhere. The server already refused a journey from a
  place the party does not stand in (`Отряд не находится здесь`), so this only
  stops the UI from offering a trip it would reject.
- The separate `W-SEA` wave still owns pirates, non-repeating islands (Fortune),
  sea monsters, ship combat and the papers; this PR only adds **paths + time** and
  the arrival-at-the-port move.

## Shell: no top nav, a journal in the inventory (W-CODEX / W-SHELL)

> **User requirement (verbatim, 2026-10-08):** «хочу убрать шапку сверху и
> добавить в инвентарь персонажа дневник»

This is the **W-CODEX / W-SHELL** work already agreed earlier (see
`docs/CHAT_ARCHIVE_MAIN.md`); the user has re-confirmed it.

- **Remove the top text nav** (`Меню · Герои · Мир · Лор · Настройки` in
  `App.jsx#Nav`) — the title screen stays, only the header bar goes.
- **Add a journal ("дневник") to the character's inventory**, as a book/tab
  **separate from the item slots** (`pages/Inventory.jsx`), holding the
  world-knowledge sections: **Лор**, **Карта мира**, **Настройки**,
  **Создатели** (the earlier "Кодекс" plan). Reachable globally too, so the
  player is not forced through the inventory every time.
- **Note:** W-MENU (`wave/w-menu`, PR #13) is still unmerged, so the header this
  removes only exists in that branch. This wave must land **after** W-MENU is in
  `main`, or be built on top of it, or the header will not be there to remove.

## W-SHIP — built in `wave/w-ship`

The ship wave is implemented (the full per-level design lives in the W-MAP
branch's `docs/PENDING_WAVES.md`, "The ship: 10 levels, three branches"):

- **Buy in a port for gold** (`SHIP_PRICE = 500`); one ship per hero; it stays
  in the port and waits. `ships` / `ship_upgrades` / `ship_works` tables.
- **10 levels x 3 branches x 2 upgrades = 60**, unlocked one level at a time
  (a level opens six; every level needs all six forged before the next). The
  three branches are **Корпус**, **Пушки** and **Оружие классов** (20 class
  guns, each mannable only by listed hero classes, each with its own ability).
- **Points only from sea battles** (`awardShipPoints`): W-SEA pays **+5** for
  pirates and **6-10** for sea monsters. W-SHIP exposes the hook and the rule.
- **Upgrades happen only in a port and take in-game time**: the dock runs on the
  same real clock as a road (`MS_PER_MINUTE`), one job at a time; **hired dock
  hands** pay gold to halve the time. `GET/POST /api/ship/:characterId`.
- **UI:** `pages/Shipyard.jsx` (`/shipyard/:characterId`), linked from the party
  strip; it shows the level, points, the three branches and the dock countdown.

W-SEA still owns the sea battles themselves (pirates, monsters, islands, the
papers) and calls `awardShipPoints`.

## Open questions

1. **Audio files** — sourcing confirmed CC0-only. Any preference on track length
   (loops vs. one-shots)? *(W-AUDIO)*
2. **Map art** — confirmed: generate procedural SVG in the current engraving
   style. *(W-MAP-GLOBAL)*
3. **"New game"** — confirmed: routes to the existing hero-creation page. *(W-MENU)*
4. **Ship upgrade points & time** — settled: source is **only** sea battles
   (**+5** pirates, **6-10** monsters); the ship is **10 levels x 3 branches
   x 2 upgrades** (60 total), each component level `n` costing `base * n`
   points and `n` in-game hours on the dock. **Open:** whether the payout
   scales with the enemy tier (enemies scale with the ship — see below).
   *(W-SHIP / W-SEA)*
5. **Papers on the ship** — confirmed: free-form notes + event log + auto lore
   notes. Need the lore "learned" hook (which discoveries set a flag). *(W-SEA)*

## Wave G12 (online)

Still **not started**; per the directive it is last and needs a **new explicit
approval** (it re-architects accounts and a shared world).
