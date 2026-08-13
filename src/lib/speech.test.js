import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEXT_COLOR, MAX_SPEECH_MS, MIN_SPEECH_MS, speechAnchorForActor, speechColorFor, speechDurationMs } from './speech.js';

test('a line is held roughly as long as it takes to read', () => {
  const short = speechDurationMs('Hi.');
  const long = speechDurationMs('A'.repeat(200));
  assert.ok(short >= MIN_SPEECH_MS);
  assert.ok(long > short);
  assert.ok(long <= MAX_SPEECH_MS);
});

test('text speed changes the hold', () => {
  assert.ok(speechDurationMs('A sentence of some length', { textSpeed: 120 }) > speechDurationMs('A sentence of some length', { textSpeed: 20 }));
});

test('a character colour wins over the project default', () => {
  assert.equal(speechColorFor({ textColor: '#ff0000' }, { textDefaultColor: '#00ff00' }), '#ff0000');
  assert.equal(speechColorFor({}, { textDefaultColor: '#00ff00' }), '#00ff00');
  assert.equal(speechColorFor(null, {}), DEFAULT_TEXT_COLOR);
});

test('speech sits above the head and follows the actor scale', () => {
  const full = speechAnchorForActor({ x: 100, y: 300 }, { width: 80, height: 160, anchorX: 0.5, anchorY: 1 }, 1);
  const half = speechAnchorForActor({ x: 100, y: 300 }, { width: 80, height: 160, anchorX: 0.5, anchorY: 1 }, 0.5);
  assert.equal(full.x, 100);
  assert.ok(full.y < 300);
  assert.ok(half.y > full.y, 'a smaller actor has a lower head');
});
