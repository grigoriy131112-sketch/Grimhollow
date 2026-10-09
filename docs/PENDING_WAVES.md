# Grimhollow — roadmap (single source of truth)

> **Read this first.** This file is the one list of every wave: what is **shipped**,
> what is **built but not yet wired into play**, and what is **next**. Status is
> kept current by the orchestrator. `docs/CHATPLAN.md` holds the chat/branch
> split; `docs/lore/**` holds the canon.

## Standing rules

- **One wave = one `погнали` = one chat = one branch = one PR.** Nothing is
  built ahead of an approval.
- **The user adds requirements from his head, often, mid-stream.** Every new
  requirement is written down here (verbatim where it matters) **before** it is
  built.
- A new wave branches from **`origin/main`**, never stacked on an unmerged wave
  branch. Shared files (`server/src/index.js`, `client/src/App.jsx`,
  `server/src/db/schema.sql`, `server/src/game/dialogue.js`) are owned by the
  orchestrator.
- **Build by adding to the finished model, not by rewriting it.** Where a
  mechanic exists but is not consumed by play, the wave *wires it up*; it does
  not re-architect.

---

## 1. Shipped (in `main`)

The offline game is complete. Merged waves:

| Chat | Wave | What |
|------|------|------|
| lore | G1 | Canon in `docs/lore/**` |
| items | G2 | Typed item catalogue + modifier engine |
| survival | G3 | Hunger/thirst/fatigue meters as debuffs |
| save-settings | G4 | Save slots/export + settings page |
| continents | G5 | 4 continents + inter-continent crossings |
| settlements | G6 | City Гримхольд + village Соляной Брод |
| trade | G7 | Buy/sell on the settlement stock shape |
| quests | G8 | 14 quests, progress + rewards |
| clan | G9 | Founding, doctrine, holdings, mercenaries |
| monsters | G10 | Bestiary + encounters/loot |
| campaign | G11 | Chapter flags + three endings |

Post-G12 shell/UX waves, also merged:

| Wave | What | PR |
|------|------|-----|
| W-MENU | Full-screen title hub: Новая игра / Сохранённые игры / Настройки / Создатели / Лор | #13/#12 |
| W-CODEX / W-SHELL | Top text bar removed; icon strip + the Codex book (Лор / Карта / Настройки / Создатели) | #17 |
| W-AUDIO | Music + SFX engine, CC0 files, volume in settings | #18 |
| W-BUGHUNT | Bug sweep | #19 |
| W-MAP (global + continent) | Dark chart: continents, seas, sea lanes with voyage time, per-continent maps | #20 |
| W-SHIP | Ship: 10 levels × 3 branches × sub-upgrades, timed port shipyard, class guns | #20 |
| W-SEA | Sea crossing: pirates, sea monsters, islands, papers, sea battle | #20 |
| W-THEME | Dark Dark Fantasy palette (cold ash + embers), cyrillic display type, grain/vignette | #21 |
| W-HERO-TABS | One tab strip across every per-hero screen | #22 |

`main` after #22: **338 pass / 0 fail**.

---

## 2. Built but **not yet wired into play** (the "unspelled" mechanics)

These are implemented and unit-tested, but nothing in the running game consumes
them. This section is the point of the current work: **finish the mechanic, add
it to the model — do not rewrite it.**

### 2.1 Clan bonuses — ✅ done in `wave/w-clan-live`

- `services/clan.js#clanEffects()` was computed but consumed by nothing. Now
  `clanPartyBonuses(leaderId)` folds the doctrine + holdings into the party-tree
  bonus shape, and `characters.js#getPartyBonuses()` merges tree + clan. Battle
  (`services/battles.js`), the hero sheet and the party strip all read it, so the
  numbers shown match the numbers fought with.
- Applied: `partyAttack`/`partyDefense` in battle; `trade` in `services/trade.js`
  (buy cheaper, sell dearer); `crossingDiscount` in `services/continents.js`
  (smaller fare). Still open: the opinion/thaw/dark flags in the finale — they
  already gate the endings through `character_unlocks`, so nothing to wire.

### 2.2 Clan «names» — ✅ done in `wave/w-clan-live`

- `grantNames()` is now called by play: a won death-realm ritual pays
  `NAMES_PER_RITUAL = 3` (`services/battles.js`), and a memory quest
  (`MEMORY_QUEST_KEYS`) pays `NAMES_PER_MEMORY_QUEST = 2` (`services/quests.js`).
  A hero with no clan earns none, without error.

### 2.3 The clan garrison — ✅ done in `wave/w-clan-roster` (W-CLAN-ROSTER)

User asked: invite party companions into the clan, let some ask to join on their
own, have them bring income/resources from raids, and be able to take any of
them back into the party at any moment. Built as **one system**:

- **A companion stationed in the clan is not gone.** `party_members.assignment`
  (`party` | `clan`) is the only thing that moves; the sheet, traits and
  relations stay with the member, so recall is a *move*, never a copy.
  `stationMember` / `recallMember` (`services/party.js`).
- **Recall respects the party cap.** The clan is a **reserve, not a bypass**:
  `recallMember` throws «Отряд уже полон» at `roster` (base 4 + «Сбор»), so
  «Сбор» keeps its value.
- **People ask to join on their own.** `clan_petitions` + `listPetitions` /
  `acceptPetition` / `declinePetition`. Rolled on the same clock as raids, so a
  reload cannot reroll; at most `MAX_PETITION_CANDIDATES = 3` open at once.
- **Passive raid income, by the real clock.** `services/garrison.js`
  `tickGarrison()` pays gold (`GOLD_PER_TICK = 6` × garrison, doctrine
  `goldRate`), names (every 6 ticks, + Дом летописей), and the odd trophy
  (every 4). `MS_PER_TICK = 5 min`, capped at `MAX_TICKS = 48` (6 h), so idling
  cannot be re-farmed; outcomes are hashed per tick, so a reload gives the same
  raid. A raid can wound or **kill** a companion (`status='dead'` → the death
  realm's ritual list). Nothing here touches a hero with no garrison.
- **Where it is spelled out:** routes under `/api/clan/leader/:id/garrison`,
  `/garrison/:memberId/station|recall`, `/petitions/:id/accept|decline`; the UI
  is the garrison section on `pages/Clan.jsx`.
- **Tests:** `server/test/garrison.test.js` (10) — station/recall, the cap,
  determinism, the idle cap, no double pay, empty garrison, petitions.

### 2.4 Random encounters / bestiary — ✅ done in `wave/w-bestiary` (W-BESTIARY)

- Road stops in `game/travel.js` still carry their small `ENCOUNTERS` table
  (`gold`/`heal`/`mana`/`battle`/`nothing`) for the friendly beats, but a road
  **ambush now draws its beast from the biome pool**: `chooseTravel` calls
  `resolveRoadEncounter` (`services/encounters.js`), which rolls the shared
  bestiary by the road's danger band + biome. The spoils ride on the battle row
  (`battles.loot`) and pay once on a win.
- A **bestiary screen** now exists: `GET /api/world/bestiary`
  (`services/world.js#getBestiary`) groups every monster into the lore's three
  tiers with its haunts, and `client/src/pages/Bestiary.jsx` is a Codex chapter
  (Бестиарий) with an on-the-spot hunt. `GET /api/world/monsters` still feeds the
  sheet's hunt list.

### 2.5 Party talk on board — ✅ done in `wave/w-sea-talk`

- `Voyage.jsx` now mounts `Talk` with `kind="companion"` next to the papers link:
  a «Поговорить с отрядом» card lists the active party and opens the same
  conversation panel the Party screen uses (same memory, same relations, same
  local-AI layer). The village/road talk and the sea talk are one system.

### 2.6 Enemy scaling for sea battles — ✅ done in `wave/w-sea-balance` (W-SEA-BALANCE)

- Sea enemies now scale to the **ship**: the enemy crew is sized off the hero's
  own crew and the hull from the ship's effective output, with guns/damage
  growing by tier (`game/naval.js`), so a fully built ship still meets a real
  fight instead of a two-round rout. The **payout scales with the tier too**, so
  a deeper fight pays more.
- The balance is pinned by a deterministic regression test (injectable `rng`),
  and the fights last 5–14 rounds with real hull risk at every tier.

---

## 3. Next queue (each needs its own `погнали`)

> **Empty.** Every queued wave is done and merged. **G12 (online) is cancelled**
> by an explicit user decision (2026-10-08: «не онлайн, онлайн не делаем
> вообще») — do not build it, do not offer it as a next wave, and do not treat it
> as an open plan item.

### 3.0 W-WIRE — wiring the unreachable into play — ✅ done, merged (PR #28)

The full-game audit found that G6/G7 (settlements + trade), the G8→G9→G11 endgame,
the survival meters and the campaign screen existed but nothing in play reached
them. W-WIRE finishes the mechanic **additively**:

- **Endgame reachable.** Completing the chapter quests now grants the clan's
  `chapter_1..chapter_6` unlocks (the milestones' ordinals — the campaign's own
  numbers skip 1) plus the campaign flags the clan/finale read as unlocks
  (`war_truth`, `world_woken`, …). Before, nothing granted `chapter_1`, so the clan
  (and the finale) could never be founded.
- **Quests auto-advance in land play.** Won battles report `kill`/`revive`, road
  arrivals report `visit`, NPC talk reports `talk` (by key), recruiting reports
  `collect companion`, and loot drops report `collect`. The manual "Отметить шаг"
  button is no longer the only way to move a quest.
- **Settlements + trade reachable.** A location with a settlement links into it;
  a shop/market building links to `/trade/:buildingId` (the stale "next wave" text
  is gone).
- **Survival meters visible.** A shared `SurvivalMeters` panel on the location
  (with a rest button) and the hero sheet.
- **Campaign screen reachable.** A «Кампания» tab on the hero strip.
- **Missing content keys.** `tide_shard` (the G8 collect target), the G10 randomizer
  loot keys, and `memory_fragment` now have catalogue entries; `broker_ledger`
  rewards 3× `tide_shard` so its objective is closeable. Three new continent quests
  (chapters 4-6) and their keepers open the branch flags.
- Tests: `server/test/wire.test.js` (9); suite **372 pass / 0 fail**.

### 3.1 W-ACTIONS-CRAFT — working settlements, fixed audio, a real forge — ✅ done, merged (PR #29)

The player could press «Войти» in a settlement but every line under it was
decoration; the location themes also all played at once; and a smithy existed
with nothing to forge. This wave makes the settlement actions real, fixes the
music player, and adds a crafting loop fed by the loot that was already rolled.

- **Buildings do something (Bug A).** A new service (`services/building_actions.js`)
  and `POST /api/settlements/buildings/:id/action` perform the action: a tavern
  meal costs gold and eases hunger, rest clears fatigue, the temple heals for a
  fee, the library yields lore, the guild opens its contract board, an inn rests.
  `Settlement.jsx` renders a «Сделать» button per action and shows the result.
- **One track at a time (Bug B).** `client/src/audio.js` no longer leaves an
  earlier `<audio>` element running: every started element lives in a registry and
  a new context stops all of them first. The old crossfade could orphan a loop when
  a `play()` was rejected or interrupted, so themes layered. `shouldSwitchMusic()`
  is the pure guard, unit-tested in `server/test/audio.test.js`.
- **Crafting at the smithy.** Recipes (`game/crafting.js`) turn the loot monsters
  already drop — bone shards, salt lumps, ash flakes, grave moss — plus a little
  iron and gold into weapons, armour and draughts. `services/crafting.js` spends
  the materials and fee in one transaction; the smithy shows a live recipe book
  with affordability. Seven new forged items were added to `game/items.js`.
- **Loot reaches the forge.** A direct hunt (`kind:'normal'`) never rolled the
  randomizer table, so the crafting resources never dropped outside a road
  ambush. Every normal battle now rolls the same table (guaranteeing one resource),
  stored on the battle row so a reload cannot reroll it.
- Tests: `server/test/buildings.test.js` (10) + the audio guard (1); suite
  **383 pass / 0 fail**.

| # | Wave | Goal | Touches |
|---|------|------|---------|
| ~~N1~~ | ~~**W-CLAN-LIVE**~~ | ✅ **done** — clan effects + names wired into battle, trade, crossings, rituals, quests | `wave/w-clan-live` |
| ~~N2~~ | ~~**W-CLAN-ROSTER**~~ | ✅ **done** — invite companions to the clan, self-petitions, real-clock raid income, recall | `wave/w-clan-roster` |
| ~~N3~~ | ~~**W-BESTIARY**~~ | ✅ **done** — ambushes draw from the biome pool; bestiary Codex chapter | `wave/w-bestiary` |
| ~~N4~~ | ~~**W-SEA-TALK**~~ | ✅ **done** — party talk on board (2.5) | `wave/w-sea-talk` |
| ~~N5~~ | ~~**W-SEA-BALANCE**~~ | ✅ **done** — sea enemies scale to the ship; payout scales with tier | `wave/w-sea-balance` |

Recommended order: **N4 → N3 → N5** (N4 is tiny and unblocks a verbatim user
request; N3 and N5 are larger). **All of N1–N5 are now done and merged**, and the
follow-on queue (W-WIRE #28, W-ACTIONS-CRAFT #29) is merged too. The roadmap is
**clear** — and **G12 (online) is cancelled** (see §3), so there is no open wave.
`main` is at **391 pass / 0 fail**.

---

## 4. Backlog

> **Empty.** **G12 (online)** is **cancelled** by explicit user decision
> (2026-10-08). Not to be built, offered, or counted as open. `docs/lore/online.md`
> stays as unused canon only.

---

## 5. Verbatim user requirements (kept for the waves that own them)

- **Ship purchase & upgrades:** «Игрок должен иметь возможность покупать корабль
  и улучшать его за отдельные очки которые можно получить только при плавоние в
  сражениях с пиратами (с ними сражается отряд+пушки коробля по кораблю пиратов)
  и с морскими монстрами (с ними сражается только корабль). А также улучшать
  корабль можно только в портах и это занимает игровое время».
- **Sea combat balance:** «пиратов и монстров надо будет делать тоже такими же
  сильными, что бы был баланс».
- **Journal:** «хочу убрать шапку сверху и добавить в инвентарь персонажа
  дневник» (done in W-CODEX/W-SHELL).
- **Sea travel:** «Игрок появляется на континенте… и там он может переходить из
  локации в те, которые соединены дорогой… Когда он плывёт по миру… и приплывает
  на другой континент, то он может из порта переместиться в те локации, которые
  соединены с портом дорогой» (paths + time done in W-MAP; the rest is W-SEA).
- **Clan roster / garrison:** «добавить функцию приглашать себе в клан людей (тех
  которые игрок приглашает в отряд свой), а также функцию что в клан сами смогут
  захотеть вступить. Ну и само собой эти ребята, которые будут в клане, будут
  пассивно приносить доход от походов и ресурсы, а также в любой момент Игрок
  может взять из клана любого персонажа» (done in W-CLAN-ROSTER).
