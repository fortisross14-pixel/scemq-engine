import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKING_ACTION_TYPES, parseDurationMs, parsePoint, ruleIsCutscene } from './cutscene.js';

test('parsePoint reads authored "x,y" values and rejects junk', () => {
  assert.deepEqual(parsePoint('640,720'), { x: 640, y: 720 });
  assert.deepEqual(parsePoint(' 12 , 34 '), { x: 12, y: 34 });
  assert.equal(parsePoint('nowhere'), null);
  assert.equal(parsePoint(''), null);
});

test('parseDurationMs accepts both milliseconds and seconds', () => {
  assert.equal(parseDurationMs('800'), 800);
  assert.equal(parseDurationMs('1.2s'), 1200);
  assert.equal(parseDurationMs('2 S'), 2000);
  assert.equal(parseDurationMs('', 500), 500);
  assert.equal(parseDurationMs('abc', 250), 250);
});

test('a rule counts as a cutscene once it can block', () => {
  assert.ok(BLOCKING_ACTION_TYPES.has('wait'));
  assert.equal(ruleIsCutscene({ actions: [{ type: 'setFlag' }] }), false);
  assert.equal(ruleIsCutscene({ actions: [{ type: 'setFlag' }, { type: 'wait', value: '500' }] }), true);
  assert.equal(ruleIsCutscene(null), false);
});
