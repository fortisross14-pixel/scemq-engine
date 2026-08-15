import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEXT_COLOR, MAX_SPEECH_MS, MIN_SPEECH_MS, speechAnchorForActor, speechColorFor, speechDurationMs, speechScreenPosition, resolveSpeechSpeakerId } from './speech.js';

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

test('speech point follows actor size and authored relative anchor', () => {
  const defaultPoint = speechAnchorForActor({ x: 100, y: 300 }, { width: 80, height: 160, anchorX: 0.5, anchorY: 1 }, 1);
  const rightPoint = speechAnchorForActor({ x: 100, y: 300 }, { width: 80, height: 160, anchorX: 0.5, anchorY: 1 }, 1, { x: 1, y: 0 });
  assert.equal(defaultPoint.x, 100);
  assert.ok(defaultPoint.y < 140, 'default speech point sits above the sprite');
  assert.equal(rightPoint.x, 140);
  assert.equal(rightPoint.y, 140);
});

test('speech is clamped inside the viewport so it cannot be cut off', () => {
  const left = speechScreenPosition({ x: -100, y: -100 }, { x: 0, y: 0 }, 1, { width: 1280, height: 720 });
  const right = speechScreenPosition({ x: 5000, y: 5000 }, { x: 0, y: 0 }, 1, { width: 1280, height: 720 });
  assert.ok(left.x > 0 && left.y > 0);
  assert.ok(right.x < 1280 && right.y < 720);
});


test('rule speech can resolve a scene character object id to the character definition id',()=>{
  const characters=[{id:'madame-brine',textColor:'#12ab34'}];
  const objects=[{id:'brine-stall-character',type:'character',character:{characterId:'madame-brine'}}];
  assert.equal(resolveSpeechSpeakerId('brine-stall-character',characters,objects),'madame-brine');
  assert.equal(resolveSpeechSpeakerId('madame-brine',characters,objects),'madame-brine');
  assert.equal(resolveSpeechSpeakerId('',characters,objects,'Madame Brine: Hands off the sardine.'),'madame-brine');
});
