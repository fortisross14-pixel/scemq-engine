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


test('sprite-grid aspect ratio uses one cell, not the whole sheet',()=>{
  assert.equal(frameAspectRatioFromImage(1200,800,{columns:6,rows:2}),0.5);
});

test('frame aspect ratio uses visible content bounds when available',()=>{
  const ratio=frameAspectRatioFromImage(1536,1024,{columns:6,rows:1,contentBounds:{x:0,y:.1,width:1,height:.8}});
  assert.ok(Math.abs(ratio-(256/819.2))<1e-9);
});

test('whole-sheet crop changes frame ratio before the grid is divided',()=>{
  const ratio=frameAspectRatioFromImage(1200,800,{columns:6,rows:2,detectedContentBounds:{x:0,y:0,width:1,height:1},sheetCropPixels:{top:100,bottom:100,left:0,right:0}});
  // cropped sheet is 1200x600; each 6x2 frame is 200x300
  assert.ok(Math.abs(ratio-(2/3))<1e-9);
});
