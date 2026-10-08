import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveListenPorts } from '../src/ports.js';

test('the default single port is used outside the preview', () => {
  assert.deepEqual(resolveListenPorts({}), [3001]);
  assert.deepEqual(resolveListenPorts({ PORT: '3001' }), [3001]);
});

test('the preview binds both work-host ports so neither shows Bad Gateway', () => {
  assert.deepEqual(resolveListenPorts({ PORT: '12000' }), [12000, 12001]);
});

test('PORT_ALT overrides the second port and 0 disables it', () => {
  assert.deepEqual(resolveListenPorts({ PORT: '12000', PORT_ALT: '13000' }), [12000, 13000]);
  assert.deepEqual(resolveListenPorts({ PORT: '12000', PORT_ALT: '0' }), [12000]);
  assert.deepEqual(resolveListenPorts({ PORT: '4000' }), [4000]);
});

test('invalid ports are dropped', () => {
  assert.deepEqual(resolveListenPorts({ PORT: '12000', PORT_ALT: 'abc' }), [12000]);
  assert.deepEqual(resolveListenPorts({ PORT: '12000', PORT_ALT: '70000' }), [12000]);
});
