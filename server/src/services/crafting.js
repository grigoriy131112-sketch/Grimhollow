// Smithy crafting (Wave W-SMITH). The pure recipes live in game/crafting.js;
// this service checks materials and gold, spends them together, and hands over
// the forged item. One transaction so a failure cannot half-spend a recipe.

import { transaction } from '../db/index.js';
import { getBuilding, describeItemKey } from './settlements.js';
import { getCharacter } from './characters.js';
import { grantItem, listItems } from './items.js';
import { itemInfo } from '../game/items.js';
import { RECIPES, recipeByKey, canCraft } from '../game/crafting.js';

function requireCharacter(characterId) {
  const c = getCharacter(characterId);
  if (!c) throw new Error('Персонаж не найден');
  return c;
}

// A recipe as the UI needs it: what it makes, what it costs, and whether the
// hero can afford it right now.
function recipeView(recipe, characterId, inventoryMap, gold) {
  const { ok, missing, short } = canCraft(recipe, { have: inventoryMap, gold });
  const output = itemInfo(recipe.output);
  return {
    key: recipe.key,
    name: recipe.name,
    output: { key: recipe.output, name: output.name, description: output.description, rarity: output.rarity, type: output.type },
    qty: recipe.qty || 1,
    gold: recipe.gold || 0,
    materials: recipe.materials.map((m) => ({
      itemKey: m.itemKey,
      name: describeItemKey(m.itemKey).name,
      need: m.qty,
      have: inventoryMap[m.itemKey] || 0,
    })),
    canCraft: ok,
    short,
    missing,
  };
}

// Every recipe with live affordability for a hero.
export function listRecipes(characterId) {
  const c = requireCharacter(characterId);
  const inventoryMap = {};
  for (const it of listItems(characterId)) inventoryMap[it.key] = it.qty;
  return { gold: c.gold, recipes: RECIPES.map((r) => recipeView(r, characterId, inventoryMap, c.gold)) };
}

// Forge one recipe: spend the materials and the fee, grant the output.
export function craft(characterId, recipeKey) {
  const c = requireCharacter(characterId);
  const recipe = recipeByKey(recipeKey);
  if (!recipe) throw new Error('Такого рецепта нет');

  const inventoryMap = {};
  for (const it of listItems(characterId)) inventoryMap[it.key] = it.qty;
  const { ok, missing, short } = canCraft(recipe, { have: inventoryMap, gold: c.gold });
  if (!ok) {
    const parts = [];
    if (missing.length) parts.push(`не хватает: ${missing.map((m) => `${describeItemKey(m.itemKey).name} (${m.has}/${m.need})`).join(', ')}`);
    if (short) parts.push(`нужно ещё ${short} золота`);
    throw new Error(`Не выковать: ${parts.join('; ')}`);
  }

  transaction((d) => {
    for (const m of recipe.materials) {
      const row = d.prepare('SELECT qty FROM character_items WHERE character_id = ? AND item_key = ?').get(characterId, m.itemKey);
      if (!row || row.qty < m.qty) throw new Error('Материалы закончились');
      if (row.qty === m.qty) d.prepare('DELETE FROM character_items WHERE character_id = ? AND item_key = ?').run(characterId, m.itemKey);
      else d.prepare('UPDATE character_items SET qty = qty - ?, updated_at = datetime(\'now\') WHERE character_id = ? AND item_key = ?').run(m.qty, characterId, m.itemKey);
    }
    if (recipe.gold) {
      d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(recipe.gold, characterId);
    }
  });

  const qty = recipe.qty || 1;
  grantItem(characterId, recipe.output, qty);
  const output = itemInfo(recipe.output);
  return {
    recipe: recipe.key,
    forged: { key: recipe.output, qty, name: output.name, description: output.description, rarity: output.rarity, type: output.type },
    character: getCharacter(characterId),
    recipes: listRecipes(characterId).recipes,
  };
}

// Is this building a smithy? Used by the route to guard the forge endpoints.
export function isSmithy(buildingId) {
  const b = getBuilding(buildingId);
  return !!b && b.type === 'smithy';
}
