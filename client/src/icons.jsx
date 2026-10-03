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
  rage: 'rage', reckless_strike: 'reckless_strike', wide_swing: 'wide_swing', thick_skin: 'thick_skin',
  brutal_blow: 'brutal_blow', blood_rage: 'blood_rage', rampage: 'rampage', wild_heal: 'wild_heal',
  executioner: 'executioner', berserker: 'berserker',
  vicious_mockery: 'vicious_mockery', inspiring_song: 'inspiring_song', healing_ballad: 'healing_ballad',
  discordant_note: 'discordant_note', mesmerizing_tune: 'mesmerizing_tune', soothing_melody: 'soothing_melody',
  heroic_anthem: 'heroic_anthem', shatter_cry: 'shatter_cry', requiem: 'requiem', master_maestro: 'master_maestro',
  thorn_whip: 'thorn_whip', regrowth: 'regrowth', entangling_roots: 'entangling_roots', bark_skin: 'bark_skin',
  venom_bloom: 'venom_bloom', rejuvenate: 'rejuvenate', sunbeam: 'sunbeam', nature_ward: 'nature_ward',
  wildfire: 'wildfire', one_with_nature: 'one_with_nature',
  flurry_of_blows: 'flurry_of_blows', patient_defense: 'patient_defense', pressure_point: 'pressure_point',
  ki_focus: 'ki_focus', roundhouse: 'roundhouse', flowing_water: 'flowing_water', quivering_palm: 'quivering_palm',
  inner_peace: 'inner_peace', dragon_kick: 'dragon_kick', perfect_body: 'perfect_body',
  holy_strike: 'holy_strike', lay_on_hands: 'lay_on_hands', shield_of_faith: 'shield_of_faith',
  divine_favor: 'divine_favor', consecrate: 'consecrate', aura_of_warding: 'aura_of_warding',
  avenging_smite: 'avenging_smite', greater_blessing: 'greater_blessing', divine_judgment: 'divine_judgment',
  aura_mastery: 'aura_mastery',
  precise_shot: 'precise_shot', hunters_mark: 'hunters_mark', twin_shot: 'twin_shot', camouflage: 'camouflage',
  venom_arrow: 'venom_arrow', natural_recovery: 'natural_recovery', volley: 'volley', beasts_bond: 'beasts_bond',
  piercing_shot: 'piercing_shot', eagle_eye: 'eagle_eye',
  chaos_bolt: 'chaos_bolt', draconic_ward: 'draconic_ward', scorching_ray: 'scorching_ray',
  sorcerous_restore: 'sorcerous_restore', lightning_arc: 'lightning_arc', mirror_image: 'mirror_image',
  fireball: 'fireball', empowered_spell: 'empowered_spell', meteor_swarm: 'meteor_swarm', innate_power: 'innate_power',
  eldritch_blast: 'eldritch_blast', dark_pact: 'dark_pact', hex: 'hex', siphon_life: 'siphon_life',
  curse_of_weakness: 'curse_of_weakness', shadow_heal: 'shadow_heal', soul_rend: 'soul_rend',
  infernal_shield: 'infernal_shield', doom_bolt: 'doom_bolt', dark_blessing: 'dark_blessing',
};

const MONSTER_ICONS = {
  'Могильная крыса': 'grave_rat', 'Пустой крестьянин': 'hollow_peasant', 'Фонарный упырь': 'lantern_wight',
  'Терновый охотник': 'briar_stalker', 'Костяной рыцарь': 'ossuary_knight', 'Призрак хора': 'choir_wraith',
  'Колосс костяных полей': 'bonefield_colossus', 'Вестник чумы': 'plague_herald',
  'Хранитель шпиля': 'spire_warden', 'Полый король': 'hollow_king',
};

export const abilityIcon = (ability) =>
  (ability?.id && ABILITY_ICONS[ability.id]) ? `/art/abilities/${ABILITY_ICONS[ability.id]}.svg` : null;

export const monsterIcon = (name) =>
  MONSTER_ICONS[name] ? `/art/monsters/${MONSTER_ICONS[name]}.svg` : null;

export function Icon({ src, alt = '', size = 22 }) {
  if (!src) return null;
  return <img className="icon" src={src} alt={alt} width={size} height={size} />;
}
