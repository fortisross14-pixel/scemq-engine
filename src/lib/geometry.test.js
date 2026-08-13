import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, nearestPointInPolygons, clampPointToWalkAreas, depthZAtPoint, clampCamera, findPathInWalkAreas, followCameraForCharacter, worldViewportForZoom } from './geometry.js';

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

test('path finder never crosses disconnected walk areas and stops at reachable edge', () => {
  const right = square.map((p) => ({ x: p.x + 200, y: p.y }));
  const path = findPathInWalkAreas({ x: 20, y: 20 }, { x: 240, y: 20 }, [
    { enabled: true, points: square },
    { enabled: true, points: right }
  ]);
  assert.ok(path.length > 0);
  assert.equal(Math.round(path.at(-1).x), 100);
  assert.equal(Math.round(path.at(-1).y), 20);
});

test('follow camera centers visible character rather than feet', () => {
  const point = { x: 800, y: 700 };
  const transform = { width: 100, height: 300, anchorX: 0.5, anchorY: 1 };
  const camera = followCameraForCharacter(point, transform, { width: 1600, height: 1000 }, { width: 800, height: 600 });
  // Visible center is y=550, so the desired camera top is 250.
  assert.equal(camera.x, 400);
  assert.equal(camera.y, 250);
});

test('follow camera stops only at actual scene edges', () => {
  const transform = { width: 100, height: 300, anchorX: 0.5, anchorY: 1 };
  const viewport = { width: 800, height: 600 };
  const canvas = { width: 1600, height: 1000 };
  assert.deepEqual(followCameraForCharacter({ x: 50, y: 180 }, transform, canvas, viewport), { x: 0, y: 0 });
  assert.deepEqual(followCameraForCharacter({ x: 1550, y: 980 }, transform, canvas, viewport), { x: 800, y: 400 });
});


test('camera zoom preserves GUI aspect ratio while changing world view size', () => {
  const guiViewport = { width: 1280, height: 720 };
  assert.deepEqual(worldViewportForZoom(guiViewport, 1), { width: 1280, height: 720, zoom: 1 });
  assert.deepEqual(worldViewportForZoom(guiViewport, 0.8), { width: 1600, height: 900, zoom: 0.8 });
  assert.deepEqual(worldViewportForZoom(guiViewport, 1.25), { width: 1024, height: 576, zoom: 1.25 });
});

test('zoomed follow camera centers using world-space viewport dimensions', () => {
  const transform = { width: 100, height: 300, anchorX: 0.5, anchorY: 1 };
  const canvas = { width: 2400, height: 1400 };
  const view = worldViewportForZoom({ width: 1280, height: 720 }, 0.8);
  const camera = followCameraForCharacter({ x: 1200, y: 900 }, transform, canvas, view);
  // visible character center = (1200, 750), world view = 1600x900
  assert.deepEqual(camera, { x: 400, y: 300 });
});

test('interaction target outside the walk polygon clamps to reachable floor',()=>{
  const areas=[{enabled:true,points:[{x:0,y:100},{x:300,y:100},{x:300,y:300},{x:0,y:300}]}];
  const path=findPathInWalkAreas({x:50,y:200},{x:200,y:20},areas);
  assert.ok(path.length>0);
  const end=path.at(-1);
  assert.equal(Math.round(end.y),100);
  assert.equal(Math.round(end.x),200);
});

test('interaction chooses reachable polygon instead of closer disconnected island',()=>{
  const areas=[
    {enabled:true,points:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]},
    {enabled:true,points:[{x:200,y:0},{x:300,y:0},{x:300,y:100},{x:200,y:100}]}
  ];
  const path=findPathInWalkAreas({x:50,y:50},{x:205,y:50},areas);
  assert.ok(path.length>0);
  assert.equal(Math.round(path.at(-1).x),100);
});
