// Browser-side preferences (Wave G4, extended in W-AUDIO). They live only in
// localStorage: the server never needs them, and they apply the moment the page
// loads. Both the Settings page and the audio engine read the same shape.

export const PREFS_KEY = 'grimhollow.settings.v1';

export const DEFAULT_PREFS = {
  sfx: true,          // звуковые эффекты
  music: true,        // фоновая музыка
  sfxVolume: 0.8,     // громкость эффектов, 0..1
  musicVolume: 0.6,   // громкость музыки, 0..1
  animations: true,   // анимации боя
  uiScale: 1,         // масштаб интерфейса
};

const listeners = new Set();

export function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// The interface is sized in rem, so changing the root font-size scales it.
export function applyPrefs(prefs) {
  document.documentElement.style.fontSize = `${16 * (Number(prefs.uiScale) || 1)}px`;
  document.documentElement.dataset.animations = prefs.animations ? 'on' : 'off';
  document.documentElement.dataset.sfx = prefs.sfx ? 'on' : 'off';
  document.documentElement.dataset.music = prefs.music ? 'on' : 'off';
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  listeners.forEach((fn) => { try { fn(prefs); } catch { /* ignore */ } });
}

export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
