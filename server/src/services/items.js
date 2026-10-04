// Character inventory. Items are a small set (game/items.js); this is the I/O
// layer for the character_items table.

import { getDb } from '../db/index.js';
import { itemInfo } from '../game/items.js';

export function grantItem(characterId, itemKey, qty = 1) {
  getDb().prepare(
    `INSERT INTO character_items (character_id, item_key, qty) VALUES (?, ?, ?)
     ON CONFLICT(character_id, item_key) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime('now')`,
  ).run(characterId, itemKey, qty);
  return listItems(characterId);
}

export function takeItem(characterId, itemKey, qty = 1) {
  const db = getDb();
  const row = db.prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(characterId, itemKey);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM character_items WHERE character_id = ? AND item_key = ?').run(characterId, itemKey);
  } else {
    db.prepare("UPDATE character_items SET qty = qty - ?, updated_at = datetime('now') WHERE character_id = ? AND item_key = ?")
      .run(qty, characterId, itemKey);
  }
  return true;
}

export function hasItem(characterId, itemKey, qty = 1) {
  const row = getDb().prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?')
    .get(characterId, itemKey);
  return !!row && row.qty >= qty;
}

export function listItems(characterId) {
  return getDb().prepare('SELECT item_key, qty FROM character_items WHERE character_id = ? ORDER BY item_key')
    .all(characterId)
    .map((r) => ({ key: r.item_key, qty: r.qty, ...itemInfo(r.item_key) }));
}
