import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSceneId, slugify } from './id.js';

test('slugify makes portable ids', () => {
  assert.equal(slugify('Mr. Pindle'), 'mr-pindle');
});

test('nextSceneId finds the first free numeric scene id', () => {
  assert.equal(nextSceneId([{ id: 'scene1' }, { id: 'scene3' }]), 'scene2');
});
