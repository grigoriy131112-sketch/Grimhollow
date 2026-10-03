// Maps game content to the SVG icons in client/public/art.
const ABILITY_ICONS = {
  basic: 'basic', cleave: 'cleave', shield_wall: 'shield_wall', power_strike: 'power_strike',
  battle_cry: 'battle_cry', rend: 'rend', second_wind: 'second_wind', whirlwind: 'whirlwind',
  fortify: 'fortify', execute: 'execute', unbreakable: 'unbreakable',
  fire_bolt: 'fire_bolt', arcane_shield: 'arcane_shield', frost_nova: 'frost_nova',
  mana_surge: 'mana_surge', lightning_lance: 'lightning_lance', mage_armor: 'mage_armor',
  chain_lightning: 'chain_lightning', drain_life: 'drain_life', meteor: 'meteor',
  arcane_mastery: 'arcane_mastery',
  backstab: 'backstab', evade: 'evade', poison_blade: 'poison_blade', quick_step: 'quick_step',
  fan_of_knives: 'fan_of_knives', smoke_bomb: 'smoke_bomb', assassinate: 'assassinate',
  adrenaline: 'adrenaline', death_mark: 'death_mark', shadow_master: 'shadow_master',
  smite: 'smite', heal: 'heal', bless: 'bless', purify: 'purify', holy_lance: 'holy_lance',
  sanctuary: 'sanctuary', divine_wrath: 'divine_wrath', greater_heal: 'greater_heal',
  judgment: 'judgment', blessed_vitality: 'blessed_vitality',
};

const MONSTER_ICONS = {
  'Grave Rat': 'grave_rat', 'Hollow Peasant': 'hollow_peasant', 'Lantern Wight': 'lantern_wight',
  'Briar Stalker': 'briar_stalker', 'Ossuary Knight': 'ossuary_knight', 'Choir Wraith': 'choir_wraith',
  'Bonefield Colossus': 'bonefield_colossus', 'Plague Herald': 'plague_herald',
  'Spire Warden': 'spire_warden', 'The Hollow King': 'hollow_king',
};

export const abilityIcon = (ability) =>
  (ability?.id && ABILITY_ICONS[ability.id]) ? `/art/abilities/${ABILITY_ICONS[ability.id]}.svg` : null;

export const monsterIcon = (name) =>
  MONSTER_ICONS[name] ? `/art/monsters/${MONSTER_ICONS[name]}.svg` : null;

export function Icon({ src, alt = '', size = 22 }) {
  if (!src) return null;
  return <img className="icon" src={src} alt={alt} width={size} height={size} />;
}
