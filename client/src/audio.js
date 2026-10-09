// Client audio engine (Wave W-AUDIO). One music loop per context, a small set of
// short SFX, and volume/mute driven by the browser preferences the Settings page
// already stores. The pure parts (resolveContext, mapSfx, volumeFromPrefs) are
// exported so they can be reasoned about and tested without a browser.

const BASE = `${(import.meta.env && import.meta.env.BASE_URL) || '/'}audio/`;

// --- catalogue ---------------------------------------------------------------
export const MUSIC_CONTEXTS = [
  'menu', 'world', 'location', 'settlement', 'battle', 'sea', 'port', 'tavern',
  'temple', 'forest', 'marsh', 'waste', 'coast', 'bonefield', 'snow', 'campaign',
];
export const MUSIC_FILES = Object.fromEntries(MUSIC_CONTEXTS.map((c) => [c, `${BASE}${c}.ogg`]));

export const SFX_FILES = {
  ui_click: `${BASE}ui_click.ogg`,
  ui_back: `${BASE}ui_back.ogg`,
  hit: `${BASE}hit.ogg`,
  miss: `${BASE}miss.ogg`,
  crit: `${BASE}crit.ogg`,
  loot: `${BASE}loot.ogg`,
  level_up: `${BASE}level_up.ogg`,
  death: `${BASE}death.ogg`,
  coin: `${BASE}coin.ogg`,
  open: `${BASE}open.ogg`,
  cannon: `${BASE}cannon.ogg`,
  splash: `${BASE}splash.ogg`,
};

// A few loops are hotter than the rest; trim them a little so they sit under SFX.
export const CONTEXT_VOLUME = { battle: 0.5, tavern: 0.45, snow: 0.5, bonefield: 0.55, temple: 0.5, coast: 0.6 };
export const FADE_MS = { in: 1400, out: 1000 };

// --- pure helpers ------------------------------------------------------------
// Pick the music context from the route plus any location/settlement the screen
// already loaded. Continent beats the biome: an ice place is "snow" even though
// its stored biome reads as waste.
export function resolveContext({ pathname = '/', location = null, settlement = null } = {}) {
  if (!pathname || pathname === '/') return 'menu';

  if (pathname.startsWith('/battles/')) return 'battle';
  if (pathname.startsWith('/travel/')) return 'sea';
  if (pathname.startsWith('/campaign/')) return 'campaign';
  if (pathname.startsWith('/world/atlas') || pathname === '/world' || pathname.startsWith('/world/continents/')) return 'world';

  if (pathname.startsWith('/world/locations/')) {
    const scene = location && location.scene;
    const biome = location && location.biome;
    if (location && location.isPort) return 'port';
    if (scene === 'sunken_chapel' || scene === 'stained_well') return 'temple';
    if (scene === 'city' || scene === 'village') return 'settlement';
    if (['frozen_sea', 'ice_harbor', 'ice_tombs', 'ice_graveyard'].includes(scene)) return 'snow';
    if (['glass_archive', 'ship_graveyard', 'black_spire', 'glass_dunes'].includes(scene)) return 'bonefield';
    if (biome === 'coast' && location && location.isSafe) return 'port';
    if (biome === 'forest') return 'forest';
    if (biome === 'marsh') return 'marsh';
    if (biome === 'bonefield') return 'bonefield';
    if (biome === 'coast') return 'coast';
    if (biome === 'waste') return 'waste';
    return 'location';
  }

  if (pathname.startsWith('/settlements/')) return 'settlement';
  if (pathname.startsWith('/trade/')) {
    const type = settlement && settlement.type;
    if (type === 'tavern') return 'tavern';
    if (type === 'temple') return 'temple';
    if (type === 'library') return 'location';
    return 'settlement';
  }
  if (pathname.startsWith('/shipyard/')) return 'port';
  if (pathname.startsWith('/world')) return 'world';

  // Menus, sheets, the codex and the lore are all quiet reading screens.
  return 'menu';
}

// Which one-shots a turn's events should fire. Kept pure so it is easy to adjust
// without touching the player.
export function mapSfx(events = []) {
  const out = [];
  for (const e of events) {
    if (e.type === 'hit') out.push('hit');
    else if (e.type === 'miss') out.push('miss');
    else if (e.type === 'heal') out.push('loot');
    else if (e.type === 'down') out.push('death');
  }
  return out;
}

// Turn the stored preferences into a target music volume and an SFX switch.
export function volumeFromPrefs(prefs) {
  const music = Number(prefs && prefs.musicVolume);
  const sfx = Number(prefs && prefs.sfxVolume);
  return {
    musicEnabled: !(prefs && prefs.music === false),
    sfxEnabled: !(prefs && prefs.sfx === false),
    musicVolume: Number.isFinite(music) ? Math.max(0, Math.min(1, music)) : 0.6,
    sfxVolume: Number.isFinite(sfx) ? Math.max(0, Math.min(1, sfx)) : 0.8,
  };
}

// --- player ------------------------------------------------------------------
// One long-lived <audio> per layer. Music crossfades between contexts; SFX are
// fire-and-forget clones so several can overlap. Nothing throws when audio is
// unavailable (SSR, an old browser): every entry point is a no-op there.
let musicEl = null;
let currentContext = null;
let currentSfxVolume = 0.8;
let currentMusicVolume = 0.6;
let musicEnabled = true;
let sfxEnabled = true;
let unlocked = false;
let unlockInstalled = false;
let fadeTimer = null;

function audioAvailable() {
  return typeof window !== 'undefined' && typeof window.Audio !== 'undefined';
}

export function setVolumes(prefs) {
  const v = volumeFromPrefs(prefs);
  musicEnabled = v.musicEnabled;
  sfxEnabled = v.sfxEnabled;
  currentMusicVolume = v.musicVolume;
  currentSfxVolume = v.sfxVolume;
  if (musicEl) {
    const target = musicEnabled ? currentMusicVolume * (CONTEXT_VOLUME[currentContext] ?? 0.7) : 0;
    musicEl.volume = target;
  }
}

// Browsers block audio until the first gesture; start a silent track to unlock.
export function installUnlock() {
  if (!audioAvailable() || unlocked || unlockInstalled) return;
  unlockInstalled = true;
  const unlock = () => {
    unlocked = true;
    if (musicEl) { musicEl.play().catch(() => {}); }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export function playMusic(context) {
  if (!audioAvailable() || !context || !MUSIC_CONTEXTS.includes(context)) return;
  if (context === currentContext) return;
  currentContext = context;

  const fade = () => {
    if (musicEl) {
      const el = musicEl;
      el.pause();
      if (el.__fade) clearInterval(el.__fade);
    }
    const next = new window.Audio(MUSIC_FILES[context]);
    next.loop = true;
    next.volume = 0;
    next.preload = 'auto';
    musicEl = next;
    const goal = musicEnabled ? currentMusicVolume * (CONTEXT_VOLUME[context] ?? 0.7) : 0;
    next.play().then(() => {
      if (fadeTimer) clearInterval(fadeTimer);
      const step = goal / (FADE_MS.in / 50);
      next.__fade = setInterval(() => {
        if (next.volume + step >= goal) { next.volume = goal; clearInterval(next.__fade); }
        else next.volume = Math.min(goal, next.volume + step);
      }, 50);
    }).catch(() => { /* waits for the unlock gesture */ });
  };

  if (musicEl && !musicEl.paused) {
    // Fade the old loop down before swapping.
    const old = musicEl;
    const goal = 0;
    const step = old.volume / (FADE_MS.out / 50) || 0.05;
    if (old.__fade) clearInterval(old.__fade);
    old.__fade = setInterval(() => {
      if (old.volume - step <= goal) { old.volume = 0; clearInterval(old.__fade); }
      else old.volume = Math.max(goal, old.volume - step);
    }, 50);
    musicEl = null;
    setTimeout(fade, FADE_MS.out);
  } else {
    fade();
  }
}

export function playSfx(name) {
  if (!audioAvailable() || !sfxEnabled || !SFX_FILES[name]) return;
  try {
    const el = new window.Audio(SFX_FILES[name]);
    el.volume = Math.max(0, Math.min(1, currentSfxVolume));
    el.play().catch(() => {});
  } catch { /* ignore */ }
}

// A page announces what it is showing once its data has loaded; the top-level
// route listener turns that into the right music context.
export function hintScene(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('grimhollow:scene', { detail: detail || null }));
}

// One delegated listener gives every button and link a click, so the UI reacts
// without touching each component. `[data-sfx="none"]` opts an element out and
// `[data-sfx="..."]` overrides the sound.
export function bindUiSounds() {
  if (typeof document === 'undefined') return () => {};
  const onClick = (e) => {
    const el = e.target && e.target.closest && e.target.closest('a,button');
    if (!el || el.disabled) return;
    const override = el.getAttribute('data-sfx');
    if (override === 'none') return;
    playSfx(override || 'ui_click');
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
