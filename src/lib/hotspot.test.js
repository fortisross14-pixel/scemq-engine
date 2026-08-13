import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaBoundsFromImageData, alphaHit, hotspotRect, normalizeHotspotBounds } from './hotspot.js';

test('hotspot bounds stay inside object', () => {
  assert.deepEqual(normalizeHotspotBounds({ x: .8, y: .7, width: .8, height: .8 }), { x: .8, y: .7, width: .19999999999999996, height: .30000000000000004 });
});

test('hotspot rect is independent from visual transform size', () => {
  const rect = hotspotRect({ transform: { x: 100, y: 50, width: 200, height: 400 }, hotspot: { shape: 'rect', bounds: { x: .25, y: .1, width: .5, height: .8 } } });
  assert.deepEqual({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, { x: 150, y: 90, width: 100, height: 320 });
});

test('alpha trim finds painted pixels', () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (const [x,y] of [[1,1],[2,1],[1,2],[2,2]]) data[(y * 4 + x) * 4 + 3] = 255;
  const b = alphaBoundsFromImageData({ data, width: 4, height: 4 }, 8, 0);
  assert.deepEqual(b, { x: .25, y: .25, width: .5, height: .5 });
});

test('alpha hit rejects transparent pixels', () => {
  const data = new Uint8ClampedArray(2 * 2 * 4); data[(1 * 2 + 1) * 4 + 3] = 255;
  const mask = { data, width: 2, height: 2 };
  assert.equal(alphaHit(mask, .1, .1, 8), false);
  assert.equal(alphaHit(mask, .75, .75, 8), true);
});

test('hotspot-only objects and image-less exits stay invisible at runtime', async () => {
  const { runtimeObjectHasVisual } = await import('./hotspot.js');
  assert.equal(runtimeObjectHasVisual({ type: 'hotspot' }, 'anything.png'), false);
  assert.equal(runtimeObjectHasVisual({ type: 'exit' }, ''), false);
  assert.equal(runtimeObjectHasVisual({ type: 'exit' }, 'door.png'), true);
  assert.equal(runtimeObjectHasVisual({ type: 'prop' }, ''), true);
});
