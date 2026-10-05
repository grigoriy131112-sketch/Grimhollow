# Grimhollow — chat bundle (how parallel work is split)

Grimhollow grows through **waves**. One wave = one approval (`погнали`) = one
chat = one branch = one PR. Parallel chats are allowed only when they touch
**disjoint files**, so they never block each other.

## Chat roles and branch ownership

| Chat | Wave | Owns (exclusive) | Branch |
|------|------|------------------|--------|
| Orchestrator | — | planning, review, merges, preview, **lore/story** (`docs/lore/**`) | `main` |
| lore | G1 | **DONE by orchestrator** — canon lives in `docs/lore/**`; no chat re-writes it | — |
| items | G2 | `server/src/game/items.js`, `server/src/game/modifiers.js`*, `server/src/services/items.js`, `server/src/routes/items.js`*, `client/src/pages/Inventory.jsx`* | `wave/g2-items` |
| survival | G3 | `server/src/game/survival.js`*, `server/src/services/survival.js`* | `wave/g3-survival` |
| save-settings | G4 | `server/src/services/saves.js`*, `server/src/routes/saves.js`*, `client/src/pages/Settings.jsx`* | `wave/g4-save-settings` |
| settlements | G6 | `server/src/db/seed_settlements.js`*, `server/src/services/settlements.js`*, `server/src/routes/settlements.js`*, `client/src/pages/Settlement.jsx`* | `wave/g6-settlements` |

`*` = new file, created by that chat. New files never collide.

## Shared files: one writer at a time

A few files are read by every wave but must have a **single writer** per batch:

- `server/src/index.js` — add `app.use(...)` for a new router.
- `client/src/App.jsx` — add a `<Route>` / nav link.
- `server/src/db/schema.sql` — new tables.
- `server/src/game/dialogue.js` — new topics.

Rule: **the orchestrator owns shared-file edits** and lands them on `main`
between waves, or assigns the edit to exactly one chat for the batch. A feature
chat writes its own new files and asks for the shared wiring; it never edits a
shared file that another chat is also editing.

## Dependencies (what must land before what)

```
G1 lore (DONE, orchestrator) ─┐
G2 items ─┼─> G3 survival (needs the modifier engine from G2)
G4 save/settings ─┘
G6 settlements ─> G7 trade ─> G8 quests ─> G9 clan ─> G11 campaign
G5 continents ─> G12 online (last, per directive)
G10 monsters + randomizer
```

Parallel-safe at the same time: **G2, G4, G6** (G1 lore is done by the orchestrator). Then G3 (after G2), G5.
Then G7, G8, G9. Then G10, G11. G12 last.

## How a chat is created

Chats are started through the OpenHands **Cloud API** (each gets its own
sandbox and a fresh clone of the repo, so they are fully isolated):

```bash
curl -X POST "https://app.all-hands.dev/api/v1/app-conversations" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"initial_message":{"content":[{"type":"text","text":"<self-contained task>"}]},
       "selected_repository":"grigoriy131112-sketch/Grimhollow",
       "selected_branch":"wave/<wave-id>",
       "title":"<wave title>"}'
```

Every chat prompt must be self-contained (it does not see this conversation),
name its branch, list its exclusive files, forbid touching shared files, require
`npm test` to pass, and require a push + PR against `main`.

## Approval gate

No chat is started for a wave until the user says `погнали` for that wave.
