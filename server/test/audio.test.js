import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MUSIC_CONTEXTS, MUSIC_FILES, SFX_FILES, SFX_FILES as SFX,
  resolveContext, mapSfx, volumeFromPrefs,
} from '../../client/src/audio.js';

// The client has no test runner of its own, so the audio engine's pure parts and
// the shipped asset set are checked here. The audio.js module touches no browser
// global at import time, so it can be imported from Node directly.
const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(HERE, '..', '..', 'client', 'public', 'audio');

const sizeOf = (name) => {
  const p = join(AUDIO_DIR, name);
  return existsSync(p) ? statSync(p).size : 0;
};

test('every music context has a shipped loop', () => {
  assert.equal(MUSIC_CONTEXTS.length, 16);
  for (const ctx of MUSIC_CONTEXTS) {
    assert.ok(MUSIC_FILES[ctx], `no file mapped for ${ctx}`);
    assert.ok(sizeOf(`${ctx}.ogg`) > 2000, `music/${ctx}.ogg missing or tiny`);
  }
});

test('every sfx has a shipped one-shot', () => {
  assert.deepEqual(Object.keys(SFX).sort(), [
    'cannon', 'coin', 'crit', 'death', 'hit', 'level_up', 'loot', 'miss',
    'open', 'splash', 'ui_back', 'ui_click',
  ]);
  for (const name of Object.keys(SFX_FILES)) {
    assert.ok(sizeOf(`${name}.ogg`) > 500, `sfx/${name}.ogg missing or tiny`);
  }
});

test('resolveContext picks the screen from route, scene and biome', () => {
  assert.equal(resolveContext({ pathname: '/' }), 'menu');
  assert.equal(resolveContext({ pathname: '/characters/3' }), 'menu');
  assert.equal(resolveContext({ pathname: '/battles/9' }), 'battle');
  assert.equal(resolveContext({ pathname: '/travel/4' }), 'sea');
  assert.equal(resolveContext({ pathname: '/campaign/2' }), 'campaign');
  assert.equal(resolveContext({ pathname: '/world' }), 'world');
  assert.equal(resolveContext({ pathname: '/world/continents/Мордрат' }), 'world');
  assert.equal(resolveContext({ pathname: '/shipyard/5' }), 'port');
});

test('a place resolves by port, scene, continent, then biome', () => {
  const at = (loc) => resolveContext({ pathname: '/world/locations/12', location: loc });
  assert.equal(at({ scene: 'harbor', biome: 'coast', isPort: true }), 'port');
  assert.equal(at({ scene: 'city', biome: 'waste' }), 'settlement');
  assert.equal(at({ scene: 'sunken_chapel', biome: 'coast' }), 'temple');
  assert.equal(at({ scene: 'ice_harbor', biome: 'coast', isPort: true }), 'port');
  assert.equal(at({ scene: 'ice_tombs', biome: 'waste' }), 'snow');
  assert.equal(at({ scene: 'glass_archive', biome: 'bonefield' }), 'bonefield');
  assert.equal(at({ scene: 'widows_wood', biome: 'forest' }), 'forest');
  assert.equal(at({ scene: 'glass_mire', biome: 'marsh' }), 'marsh');
  assert.equal(at({ scene: 'ash_forest', biome: 'forest' }), 'forest');
  assert.equal(at({ scene: 'bone_field', biome: 'bonefield' }), 'bonefield');
  assert.equal(at({ scene: 'crossroads', biome: 'waste' }), 'waste');
  assert.equal(at({ scene: 'drowned_road', biome: 'marsh' }), 'marsh');
});

test('a trade building tunes the settlement context', () => {
  const trade = (type) => resolveContext({ pathname: '/trade/7', settlement: { type } });
  assert.equal(trade('tavern'), 'tavern');
  assert.equal(trade('temple'), 'temple');
  assert.equal(trade('smithy'), 'settlement');
});

test('mapSfx turns events into one-shots', () => {
  assert.deepEqual(mapSfx([
    { type: 'hit' }, { type: 'miss' }, { type: 'heal' }, { type: 'down' }, { type: 'info' },
  ]), ['hit', 'miss', 'loot', 'death']);
  assert.deepEqual(mapSfx([]), []);
});

test('volumeFromPrefs honours switches and clamps ranges', () => {
  assert.deepEqual(volumeFromPrefs({}), {
    musicEnabled: true, sfxEnabled: true, musicVolume: 0.6, sfxVolume: 0.8,
  });
  assert.equal(volumeFromPrefs({ music: false }).musicEnabled, false);
  assert.equal(volumeFromPrefs({ sfx: false }).sfxEnabled, false);
  assert.equal(volumeFromPrefs({ musicVolume: 5 }).musicVolume, 1);
  assert.equal(volumeFromPrefs({ musicVolume: -3 }).musicVolume, 0);
  assert.equal(volumeFromPrefs({ sfxVolume: 0.25 }).sfxVolume, 0.25);
});
