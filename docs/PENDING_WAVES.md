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

### 2.1 Clan bonuses are computed but never applied

- `services/clan.js#clanEffects()` folds the doctrine + every raised holding into
  an effect map: `partyAttack`, `partyDefense`, `trade`, `diplomacy`, `stealth`,
  `crossingDiscount`, `ritualSuccess`, `goldRate`, `magicDiscount`,
  `templeOpinion`, `forestOpinion`, `choirOpinion`, `thaw`, `madnessRisk`,
  `fleet`, `activeAbilities`.
- **No consumer.** It is shown on the clan screen and returned by the API, but no
  battle, trade, crossing, ritual or campaign code reads it.
- **To finish:** apply `partyAttack`/`partyDefense` in `services/battles.js`;
  `trade` in `services/trade.js`; `crossingDiscount` in `services/travel.js` /
  `services/continents.js`; `ritualSuccess` in `services/resurrections.js`;
  the opinion/thaw/dark flags in `services/campaign.js` (they already gate the
  endings via `character_unlocks`).

### 2.2 Clan «names» are never earned by play

- `grantNames()` exists but is only reachable through `POST /api/clan/.../names`;
  nothing in play calls it. Today names can only be **bought for gold**
  (`GOLD_PER_NAME = 25`).
- **To finish:** award names from rituals (`services/resurrections.js`) and from
  memory quests (`services/quests.js`), as `docs/lore/clan.md` says ("набираются
  ритуалами и квестами памяти").

### 2.3 Random encounters / bestiary are unused

- `game/randomizer.js` (bestiary encounters + loot) and
  `services/encounters.js` (`encounterPool`, `resolveEncounter`, `startEncounter`,
  `applyLoot`) have **no caller** outside their own module and tests.
- Road stops come from `game/travel.js`'s own small `ENCOUNTERS` table
  (`gold`/`heal`/`mana`/`battle`/`nothing`); the bestiary pool is never drawn.
- There is **no bestiary screen**; `GET /api/world/monsters` is only read by the
  hero sheet's hunt list.
- **To finish:** draw road/location encounters from the biome pool via
  `services/encounters.js`, and add a **bestiary** section to the Codex.

### 2.4 Party talk on board is missing (W-SEA)

- `Voyage.jsx` links to the papers but does not mount `Talk`. The user asked for
  **dialogue with the party while sailing** ("можно поговорить с отрядом").
- **To finish:** mount `Talk` with `kind="companion"` on `Voyage.jsx`.

### 2.5 Enemy scaling for sea battles (W-SEA open point) ✅ shipped (W-SEA-BALANCE)

- Enemies now scale with the ship's level so a maxed ship still faces a real
  fight. `pirateTier`/`monsterTier` (`game/naval.js`) are sized off a **reference
  ship** for that tier — the ship a player actually has (`forgedForLevel` in
  `game/ship.js` folds the unlocked-and-forged upgrades). The old flat table was
  100%-trivial by level 5; enemy hull is now a multiple of the hero's *effective*
  per-round output (`effectiveOutput`), and morale/hull scale with depth, so a
  fight lasts several rounds and the hull takes real damage at every tier. The
  sea monster's heavy strike fires on its own turn (a `ram` action) so it no
  longer double-attacks on the round it bites.
- **Payout settled:** it now scales with the tier for *both* kinds. Because the
  fight scales, a flat payout would punish every deep voyage for no reason. The
  user's figures stay the tier-1 anchors (pirates 5, monsters 6-10); `seaPoints`
  interpolates the monster band across the tiers and scales both by depth, so a
  monster is always worth a little more than a pirate at equal tier.
- Balance is guarded by `server/test/naval.test.js` ("a fully built ship meets a
  real fight at every tier"): a deterministic seeded fight per tier asserts the
  hull is dented and the fight lasts 3-30 rounds.
- Still open (separate knob, not this wave): the **absolute** grind length —
  a fully upgraded ship costs ~13,000 ship points, so the number of wins is a
  design choice independent of the per-fight balance.

---

## 3. Next queue (each needs its own `погнали`)

| # | Wave | Goal | Touches |
|---|------|------|---------|
| N1 | **W-CLAN-LIVE** | Wire clan effects + names (2.1, 2.2) into battles, trade, crossings, rituals, campaign | `services/battles.js`, `trade.js`, `travel.js`, `resurrections.js`, `campaign.js`, `quests.js` |
| N2 | **W-BESTIARY** | Draw encounters from the biome pool (2.3) + a bestiary page in the Codex | `services/travel.js`, `services/encounters.js`, `client/src/pages/Codex.jsx` |
| N3 | **W-SEA-TALK** | Party talk on board (2.4) | `client/src/pages/Voyage.jsx` |
| N4 | **W-SEA-BALANCE** | ✅ shipped — sea enemies scale to the ship; payout scales with tier too (2.5) | `game/naval.js`, `game/ship.js` |

Recommended order: **N1 → N3 → N2 → N4** (impact first; N3 is tiny and unblocks a
verbatim user request; N2 and N4 are larger).

---

## 4. Backlog

- **G12 (online)** — the last wave by directive; needs a **new explicit
  approval**. Re-architects accounts and a shared world; scope in
  `docs/lore/online.md`. **Not started.**

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
