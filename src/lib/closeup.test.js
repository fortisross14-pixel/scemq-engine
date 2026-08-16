import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleBoundValue, normalizeCloseUpConfig, stepBoundValue } from './closeup.js';

test('numeric close-up stepper clamps when wrapping is disabled', () => {
  assert.equal(stepBoundValue(9,{amount:1,min:0,max:9,wrap:false}),9);
  assert.equal(stepBoundValue(0,{amount:-1,min:0,max:9,wrap:false}),0);
});

test('numeric close-up stepper wraps in both directions', () => {
  assert.equal(stepBoundValue(9,{amount:1,min:0,max:9,wrap:true}),0);
  assert.equal(stepBoundValue(0,{amount:-1,min:0,max:9,wrap:true}),9);
});

test('toggle values cycle persistently', () => {
  assert.equal(cycleBoundValue('N',['N','S']),'S');
  assert.equal(cycleBoundValue('S',['N','S']),'N');
});

test('legacy scenes normalize to an empty close-up collection', () => {
  const config=normalizeCloseUpConfig(null,'scene7');
  assert.equal(config.sceneId,'scene7');
  assert.deepEqual(config.closeUps,[]);
});

test('numeric close-up stepper wraps cleanly with non-digit bounds and larger steps', () => {
  assert.equal(stepBoundValue(10,{amount:2,min:0,max:10,wrap:true}),0);
  assert.equal(stepBoundValue(0,{amount:-2,min:0,max:10,wrap:true}),10);
});
