import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, nearestPointInPolygons, clampPointToWalkAreas, depthZAtPoint, clampCamera, findPathInWalkAreas } from './geometry.js';

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

test('point in polygon', () => {
  assert.equal(pointInPolygon({ x: 50, y: 50 }, square), true);
  assert.equal(pointInPolygon({ x: 150, y: 50 }, square), false);
});

test('nearest point clamps to walk area', () => {
  const p = nearestPointInPolygons({ x: 130, y: 60 }, [{ enabled: true, points: square }]);
  assert.equal(Math.round(p.x), 100);
  assert.equal(Math.round(p.y), 60);
});

test('depth area resolves actor z', () => {
  assert.equal(depthZAtPoint({ x: 20, y: 20 }, [{ enabled: true, z: 55, points: square }], 30), 55);
});

test('camera clamps to canvas bounds', () => {
  assert.deepEqual(clampCamera({ x: 900, y: 900 }, { width: 1000, height: 800 }, { width: 400, height: 300 }, { x: 0, y: 0, width: 1000, height: 800 }), { x: 600, y: 500 });
});

test('path finder routes around a concave forbidden notch', async () => {
  const { findPathInWalkAreas } = await import('./geometry.js');
  const concave = [{x:0,y:0},{x:100,y:0},{x:100,y:40},{x:40,y:40},{x:40,y:100},{x:0,y:100}];
  const path = findPathInWalkAreas({x:20,y:80},{x:80,y:20},[{enabled:true,points:concave}]);
  assert.ok(path.length >= 2);
  assert.deepEqual(path.at(-1), {x:80,y:20});
});


test('spawn point outside walk area clamps to nearest valid point', () => {
  assert.deepEqual(clampPointToWalkAreas({ x: 150, y: 40 }, [{ enabled: true, points: square }]), { x: 100, y: 40 });
});

test('path finder refuses to cross disconnected walk areas', () => {
  const right = square.map((p) => ({ x: p.x + 200, y: p.y }));
  const path = findPathInWalkAreas({ x: 20, y: 20 }, { x: 240, y: 20 }, [
    { enabled: true, points: square },
    { enabled: true, points: right }
  ]);
  assert.deepEqual(path, []);
});
