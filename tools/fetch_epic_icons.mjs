// One-off: give every level 6-15 ability its own icon.
//
// Picks a distinct game-icons.net icon (CC BY 3.0) per ability by archetype,
// downloads the SVG into client/public/art/abilities/<ability id>.svg, and
// records the author/name for each in tools/epic_icons.json and CREDITS.txt.
//
//   node tools/fetch_epic_icons.mjs
//
// Requires network. Re-running is idempotent (skips files already present).

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ICON_INDEX = 'https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1';
const RAW = 'https://raw.githubusercontent.com/game-icons/icons/master/';
const ART_DIR = fileURLToPath(new URL('../client/public/art/abilities/', import.meta.url));
const OUT_JSON = fileURLToPath(new URL('./epic_icons.json', import.meta.url));
const CREDITS = fileURLToPath(new URL('../client/public/art/CREDITS.txt', import.meta.url));
const EPIC = fileURLToPath(new URL('../server/src/game/abilities_epic.js', import.meta.url));

// Keyword pools per archetype. Icons are drawn from these, in order, and each
// icon is used once.
const POOLS = {
  strike: ['sword', 'axe', 'blade', 'spear', 'dagger', 'claw', 'slash', 'cut', 'thrust', 'arrow', 'bolt', 'punch', 'kick', 'saber', 'scimitar', 'rapier', 'halberd', 'glaive', 'trident', 'mace', 'whip', 'lance', 'spike', 'hatchet', 'cleaver', 'knife', 'blade-bite', 'sword-wound', 'pointy-sword', 'sharp-axe'],
  heavy: ['hammer', 'maul', 'impact', 'crush', 'smash', 'club', 'boulder', 'anvil', 'wrecking', 'weight', 'hammer-drop', 'thor-hammer', 'flanged-mace', 'spiked-mace', 'gavel', 'sledgehammer', 'meteor-impact', 'stone-hammer', 'earth-crack'],
  heal: ['heal', 'heart', 'life', 'regeneration', 'potion', 'flask', 'bandage', 'cross', 'lotus', 'sprout', 'medkit', 'heart-plus', 'health', 'love-injection', 'heart-organ', 'hospital-cross', 'first-aid', 'green-cross', 'crystal-growth'],
  buffAttack: ['horn', 'banner', 'shout', 'roar', 'rage', 'fist', 'trumpet', 'drum', 'war-cry', 'sound-waves', 'megaphone', 'lion', 'bull', 'flame-tongue', 'crown', 'inspiration', 'muscle-up', 'arm-grow'],
  buffDefense: ['shield', 'armor', 'wall', 'fort', 'castle', 'tower', 'plate', 'guard', 'helm', 'barrier', 'round-shield', 'shield-bash', 'breastplate', 'shield-impact', 'brick-wall', 'stone-wall', 'portcullis', 'bulwark', 'aegis', 'pauldron'],
  buffEvasion: ['wind', 'feather', 'smoke', 'mist', 'dodge', 'wing', 'ghost', 'shadow', 'swirl', 'cloud', 'tornado', 'whirlwind', 'dust-cloud', 'wind-slap', 'flying', 'light-fighter', 'ninja-mask', 'hood', 'cloak-dagger'],
  dot: ['blood', 'poison', 'venom', 'drip', 'wound', 'scar', 'decay', 'rot', 'skull', 'thorn', 'bleeding', 'bloody-sword', 'vomiting', 'acid', 'toxic', 'plague', 'biohazard', 'death-juice', 'gooey-daemon', 'corrosive'],
  restore: ['water', 'mana', 'crystal', 'orb', 'gem', 'drop', 'energy', 'spark', 'bubbles', 'magic-swirl', 'water-splash', 'power-lightning', 'battery', 'spring', 'fountain', 'refinery', 'primitive-torch', 'flame'],
  leech: ['tentacle', 'grasp', 'hand', 'siphon', 'leech', 'fang', 'drain', 'bite', 'bleeding-heart', 'claw-grasp', 'monster-grasp', 'fangs', 'mouth', 'suicide', 'life-in-the-balance'],
  debuffDefense: ['crack', 'broken', 'shatter', 'mark', 'target', 'bullseye', 'split', 'fracture', 'shield-crack', 'broken-bone', 'cracked-glass', 'on-target', 'crosshair', 'aimed', 'fragmentation', 'shattered'],
  debuffAttack: ['curse', 'skull', 'hex', 'voodoo', 'doll', 'weaken', 'chain', 'cracked-skull', 'death-note', 'cursed-star', 'evil-moon', 'skull-crack', 'envelope', 'lips', 'silenced'],
  debuffSpeed: ['web', 'net', 'snare', 'trap', 'chain', 'root', 'ice', 'freeze', 'mud', 'glue', 'spider-web', 'fishing-net', 'chain-mail', 'frozen-orb', 'ice-bolt', 'ice-shield', 'anchor', 'weight-crush', 'manacles', 'shackles'],
  execute: ['guillotine', 'skull', 'scythe', 'reaper', 'gallows', 'tombstone', 'grave', 'beheading', 'death-skull', 'executioner', 'hanging', 'coffin', 'death-note', 'cemetery-gate', 'grave-flowers', 'tombstone'],
  ultimate: ['meteor', 'star', 'sun', 'storm', 'lightning', 'explosion', 'nova', 'comet', 'fireball', 'portal', 'vortex', 'sunbeams', 'lightning-storm', 'explosion-rays', 'star-swirl', 'falling-star', 'solar-system', 'black-hole-bolas', 'supernova'],
  passive: ['yin-yang', 'aura', 'eye', 'crown', 'star', 'radiations', 'halo', 'orb', 'beams-aura', 'aura', 'third-eye', 'ancient-columns', 'meditation', 'lotus-position', 'inner-self', 'chakra'],
};

const slugAuthor = (path) => path.split('/')[0];
const slugName = (path) => path.replace(/^[^/]+\//, '').replace(/\.svg$/, '');

// Parse the generated ability ids so we know each one's class/archetype/level.
function loadAbilities() {
  const src = readFileSync(EPIC, 'utf8');
  const out = [];
  for (const m of src.matchAll(/"id":"([A-Za-z_]+_\d+)"/g)) {
    const id = m[1];
    const parts = id.split('_');
    const level = Number(parts.pop());
    const klass = parts.shift();
    const arch = parts.join('_');
    out.push({ id, klass, arch, level });
  }
  return out;
}

function scoreIcon(iconPath, keywords) {
  const name = slugName(iconPath).toLowerCase();
  for (let i = 0; i < keywords.length; i += 1) if (name.includes(keywords[i])) return keywords.length - i;
  return 0;
}

async function main() {
  const index = await (await fetch(ICON_INDEX, { headers: { 'User-Agent': 'grimhollow-icon-fetch' } })).json();
  const all = index.tree.map((t) => t.path).filter((p) => p.endsWith('.svg') && p.includes('/') && !p.startsWith('badges/'));
  const used = new Set();
  const abilities = loadAbilities();

  const chosen = new Map(); // id -> path
  // First pass: best unused icon matching each ability's archetype pool.
  for (const a of abilities) {
    const pool = POOLS[a.arch] || [];
    let best = null; let bestScore = 0;
    for (const p of all) {
      if (used.has(p)) continue;
      const s = scoreIcon(p, pool);
      if (s > bestScore) { best = p; bestScore = s; }
    }
    if (best) { used.add(best); chosen.set(a.id, best); }
  }
  // Second pass: anything unmatched gets any unused icon (deterministic order).
  let cursor = 0;
  for (const a of abilities) {
    if (chosen.has(a.id)) continue;
    while (used.has(all[cursor])) cursor += 1;
    used.add(all[cursor]); chosen.set(a.id, all[cursor]);
  }

  mkdirSync(ART_DIR, { recursive: true });
  const manifest = {};
  let downloaded = 0; let skipped = 0;
  for (const a of abilities) {
    const path = chosen.get(a.id);
    manifest[a.id] = path;
    const dest = `${ART_DIR}${a.id}.svg`;
    if (existsSync(dest)) { skipped += 1; continue; }
    const res = await fetch(RAW + path, { headers: { 'User-Agent': 'grimhollow-icon-fetch' } });
    if (!res.ok) throw new Error(`failed ${path}: ${res.status}`);
    writeFileSync(dest, await res.text());
    downloaded += 1;
  }

  writeFileSync(OUT_JSON, JSON.stringify(manifest, null, 2) + '\n');

  // Append the per-file source list once.
  const credits = readFileSync(CREDITS, 'utf8');
  const marker = 'Per-file sources (Wave 15 epic ability icons)';
  if (!credits.includes(marker)) {
    const lines = [''.repeat(1), marker, '='.repeat(marker.length), '',
      'Each file client/public/art/abilities/<id>.svg (levels 6-15) is derived from',
      'the game-icons.net icon named below (<author>/<icon>).', ''];
    for (const a of abilities) lines.push(`  ${a.id}.svg  <-  ${manifest[a.id]}`);
    writeFileSync(CREDITS, credits.replace(/\s*$/, '\n') + lines.join('\n') + '\n');
  }

  console.log(`abilities ${abilities.length}; downloaded ${downloaded}, skipped ${skipped}; unique icons ${used.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
