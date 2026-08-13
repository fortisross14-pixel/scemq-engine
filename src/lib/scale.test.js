import test from 'node:test';
import assert from 'node:assert/strict';
import { actorScaleAtPoint, clampScale, polygonYRange, scaleInArea, scaledRenderBox } from './scale.js';

const floor = {
  id: 'floor', enabled: true, topScale: 0.5, bottomScale: 1,
  points: [{ x: 0, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 0, y: 300 }]
};

test('polygonYRange finds the top and bottom edges', () => {
  assert.deepEqual(polygonYRange(floor.points), { top: 100, bottom: 300 });
  // An empty polygon collapses to a zero range, which scaleInArea reads as
  // "no usable perspective" and answers with the bottom scale.
  assert.deepEqual(polygonYRange([]), { top: 0, bottom: 0 });
  assert.equal(scaleInArea({ x: 0, y: 0 }, { points: [], topScale: 0.5, bottomScale: 0.9 }), 0.9);
});

test('an actor shrinks toward the back of a scale area', () => {
  assert.equal(scaleInArea({ x: 200, y: 100 }, floor), 0.5);
  assert.equal(scaleInArea({ x: 200, y: 300 }, floor), 1);
  assert.equal(scaleInArea({ x: 200, y: 200 }, floor), 0.75);
});

test('points outside every scale area render at full size', () => {
  assert.equal(actorScaleAtPoint({ x: 200, y: 900 }, [floor], 1), 1);
  assert.equal(actorScaleAtPoint({ x: 200, y: 200 }, [], 1), 1);
  assert.equal(actorScaleAtPoint({ x: 200, y: 200 }, [{ ...floor, enabled: false }], 1), 1);
});

test('scaling keeps the feet anchor pinned to the walk point', () => {
  const box = scaledRenderBox({ x: 100, y: 300 }, { width: 80, height: 160, anchorX: 0.5, anchorY: 1 }, 0.5);
  assert.equal(box.width, 40);
  assert.equal(box.height, 80);
  assert.equal(box.left + box.width * 0.5, 100);
  assert.equal(box.top + box.height, 300);
});

test('clampScale refuses absurd values', () => {
  assert.equal(clampScale(0), 0.05);
  assert.equal(clampScale(99), 4);
  assert.equal(clampScale('nonsense', 1), 1);
});
