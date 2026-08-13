import test from 'node:test';
import assert from 'node:assert/strict';
import { frameAspectRatioFromImage, anchorWorldPoint, resizeCharacterByWidth, resizeCharacterByHeight } from './characterLayout.js';

test('sprite-strip aspect ratio uses one frame, not the whole strip',()=>{
  assert.equal(frameAspectRatioFromImage(1200,400,{frames:6}),0.5);
});

test('character resize preserves the feet world point',()=>{
  const t={x:100,y:100,width:100,height:200,anchorX:.5,anchorY:1,aspectRatio:.5};
  const before=anchorWorldPoint(t);
  const next=resizeCharacterByWidth(t,200);
  assert.deepEqual(anchorWorldPoint(next),before);
  assert.equal(next.width,200);
  assert.equal(next.height,400);
});

test('height edits preserve original ratio',()=>{
  const t={x:0,y:0,width:100,height:200,anchorX:.5,anchorY:1,aspectRatio:.5};
  const next=resizeCharacterByHeight(t,300);
  assert.equal(next.width,150);
  assert.equal(next.height,300);
});
