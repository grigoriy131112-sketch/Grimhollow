// Crafting recipes (Wave W-SMITH). Pure rules: no database, no I/O. The smithy
// service (services/crafting.js) only checks materials/gold and moves items.
//
// A recipe turns gathered materials — the loot monsters drop (bone shards, salt
// lumps, ash flakes, grave moss) plus a little gold for the forge — into a piece
// of gear or a draught. Materials are spent; the gold is the smith's fee.
//
// Shape:
//   key        latin, stable id (the DB/API identity of the recipe)
//   name       Russian, player-visible
//   output     the item key forged (must exist in game/items.js)
//   qty        how many are produced (default 1)
//   gold       the smith's fee
//   materials  [{ itemKey, qty }] — spent, in order

export const RECIPES = [
  {
    key: 'forgeblade',
    name: 'Выковать клинок',
    output: 'forgeblade',
    gold: 45,
    materials: [{ itemKey: 'bone_shard', qty: 3 }, { itemKey: 'iron_ore', qty: 1 }],
  },
  {
    key: 'ashen_plate',
    name: 'Выковать пепельную броню',
    output: 'ashen_plate',
    gold: 60,
    materials: [{ itemKey: 'ash_flake', qty: 3 }, { itemKey: 'salt_lump', qty: 2 }],
  },
  {
    key: 'bone_buckler_forged',
    name: 'Сколотить костяной щит',
    output: 'bone_buckler_forged',
    gold: 30,
    materials: [{ itemKey: 'bone_shard', qty: 2 }, { itemKey: 'salt_lump', qty: 1 }],
  },
  {
    key: 'grave_moss_salve',
    name: 'Сварить мазь из мха',
    output: 'grave_moss_salve',
    qty: 2,
    gold: 20,
    materials: [{ itemKey: 'grave_moss', qty: 2 }],
  },
  {
    key: 'ember_draught',
    name: 'Выгнать настой из пепла',
    output: 'ember_draught',
    qty: 2,
    gold: 25,
    materials: [{ itemKey: 'ash_flake', qty: 2 }, { itemKey: 'grave_moss', qty: 1 }],
  },
  {
    key: 'tempered_edge',
    name: 'Закалить лезвие',
    output: 'tempered_edge',
    gold: 90,
    materials: [{ itemKey: 'bone_shard', qty: 4 }, { itemKey: 'ash_flake', qty: 3 }, { itemKey: 'iron_ore', qty: 1 }],
  },
  {
    key: 'salted_hide',
    name: 'Выделать просоленную кожу',
    output: 'salted_hide',
    gold: 95,
    materials: [{ itemKey: 'salt_lump', qty: 4 }, { itemKey: 'grave_moss', qty: 2 }, { itemKey: 'iron_ore', qty: 1 }],
  },
];

export const recipeByKey = (key) => RECIPES.find((r) => r.key === key) || null;

// Can the hero afford this recipe? `have` maps itemKey -> qty carried and
// `gold` is the purse. Pure, so the UI can grey out a recipe honestly.
export function canCraft(recipe, { have = {}, gold = 0 } = {}) {
  if (!recipe) return { ok: false, missing: [], short: 0 };
  const missing = recipe.materials
    .filter((m) => (have[m.itemKey] || 0) < m.qty)
    .map((m) => ({ itemKey: m.itemKey, need: m.qty, has: have[m.itemKey] || 0 }));
  const short = Math.max(0, (recipe.gold || 0) - gold);
  return { ok: missing.length === 0 && short === 0, missing, short };
}

// The recipes a hero could forge right now (materials and gold in hand).
export function craftable(recipes, inventory) {
  return recipes.filter((r) => canCraft(r, inventory).ok).map((r) => r.key);
}
