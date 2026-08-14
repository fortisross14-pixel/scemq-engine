import test from 'node:test';
import assert from 'node:assert/strict';
import { animationDurationMs, animationGrid, animationSheetGeometry, frameIndexAtTime, horizontalFacingFromDelta, horizontalFacingToward, normalizeCharacterAnimationData, requestedAnimationForVerb, resolveAnimation, shouldMirror } from './animation.js';

test('frame animation timing loops and clamps',()=>{
 const a={frames:4,fps:10,loop:true};
 assert.equal(frameIndexAtTime(a,0),0);
 assert.equal(frameIndexAtTime(a,450),0);
 assert.equal(animationDurationMs(a),400);
 const once={...a,loop:false};
 assert.equal(frameIndexAtTime(once,900),3);
});

test('character animation data is additive for legacy characters',()=>{
 const c=normalizeCharacterAnimationData({id:'mara',assets:{idle:'mara.png'}});
 assert.equal(c.assets.idle,'mara.png');
 assert.deepEqual(c.animations,{});
 assert.equal(c.actionAnimations.pickUp,'pickup');
});

test('animation resolver falls back to idle and supports mirroring',()=>{
 const c=normalizeCharacterAnimationData({id:'mara',animations:{idle:{src:'idle.png'},walk:{src:'walk.png',frames:8}}});
 assert.equal(resolveAnimation(c,'pickup','right').name,'idle');
 const walk=resolveAnimation(c,'walk','left');
 assert.equal(walk.name,'walk');
 assert.equal(shouldMirror(walk.animation,'left',walk.name),true);
});

test('action animation mapping can be overridden',()=>{
 const c=normalizeCharacterAnimationData({actionAnimations:{pickUp:'crouch'}});
 assert.equal(requestedAnimationForVerb(c,'pickUp'),'crouch');
});

test('vertical movement preserves horizontal facing',()=>{
  assert.equal(horizontalFacingFromDelta(0,'left'),'left');
  assert.equal(horizontalFacingFromDelta(0,'right'),'right');
});

test('target X chooses left or right for every action',()=>{
  assert.equal(horizontalFacingToward(100,20,'right'),'left');
  assert.equal(horizontalFacingToward(100,180,'left'),'right');
});

test('generic action strip mirrors for left-facing actor',()=>{
  const c={animations:{pickup:{src:'pickup.png',frames:6,allowHorizontalFlip:true}},defaultAnimation:'pickup'};
  const resolved=resolveAnimation(c,'pickup','left');
  assert.equal(resolved.name,'pickup');
  assert.equal(shouldMirror(resolved.animation,'left',resolved.name),true);
});

test('walk-right alias can be reused and mirrored to walk left',()=>{
  const c={animations:{'walk-right':{src:'walk.png',frames:6,allowHorizontalFlip:true}},defaultAnimation:''};
  const resolved=resolveAnimation(c,'walk','left');
  assert.equal(resolved.name,'walk-right');
  assert.equal(shouldMirror(resolved.animation,'left',resolved.name),true);
});


test('sprite sheets support columns by rows in row-major order',()=>{
  assert.deepEqual(animationGrid({columns:6,rows:2}),{columns:6,rows:2,frames:12});
  const legacy=animationGrid({frames:8});
  assert.deepEqual(legacy,{columns:8,rows:1,frames:8});
});

test('loop delay pauses on the first frame between playback cycles',()=>{
  const a={columns:4,rows:1,fps:10,loop:true,loopDelaySeconds:1};
  assert.equal(frameIndexAtTime(a,0),0);
  assert.equal(frameIndexAtTime(a,999),0);
  assert.equal(frameIndexAtTime(a,1000),0);
  assert.equal(frameIndexAtTime(a,1100),1);
  assert.equal(frameIndexAtTime(a,1399),3);
  assert.equal(frameIndexAtTime(a,1400),0);
  assert.equal(frameIndexAtTime(a,2399),0);
  assert.equal(frameIndexAtTime(a,2500),1);
});

test('normalization migrates legacy horizontal strips to one-row grids',()=>{
  const c=normalizeCharacterAnimationData({id:'mara',animations:{walk:{src:'walk.png',frames:8,fps:10,loop:true}}});
  assert.equal(c.animations.walk.columns,8);
  assert.equal(c.animations.walk.rows,1);
  assert.equal(c.animations.walk.frames,8);
  assert.equal(c.animations.walk.loopDelaySeconds,0);
});

test('visible content aspect ratio ignores transparent frame padding',()=>{
  const a=normalizeCharacterAnimationData({id:'nib',animations:{idle:{src:'nib.png',columns:6,rows:1,contentBounds:{x:0,y:.1,width:1,height:.8},framePixelWidth:256,framePixelHeight:1024,contentPixelWidth:256,contentPixelHeight:819.2}}}).animations.idle;
  assert.ok(Math.abs(a.contentPixelWidth/a.contentPixelHeight-(256/819.2))<1e-9);
});

test('global sheet crop is applied before the animation grid',()=>{
  const g=animationSheetGeometry({columns:6,rows:2,sheetCropPixels:{left:60,right:60,top:0,bottom:0}},600,240);
  assert.equal(g.croppedWidth,480);
  assert.equal(g.croppedHeight,240);
  assert.equal(g.frameWidth,80);
  assert.equal(g.frameHeight,120);
  assert.deepEqual(g.crop,{top:0,right:60,bottom:0,left:60});
});

test('top and bottom crop change the whole sheet height, not every frame independently',()=>{
  const g=animationSheetGeometry({columns:6,rows:2,sheetCropPixels:{top:60,bottom:60,left:0,right:0}},600,240);
  assert.equal(g.croppedWidth,600);
  assert.equal(g.croppedHeight,120);
  assert.equal(g.frameWidth,100);
  assert.equal(g.frameHeight,60);
});

test('animation normalization preserves whole-sheet crop',()=>{
  const c=normalizeCharacterAnimationData({animations:{idle:{src:'idle.png',columns:6,rows:2,sheetCropPixels:{top:4,right:8,bottom:12,left:16}}}});
  assert.deepEqual(c.animations.idle.sheetCropPixels,{top:4,right:8,bottom:12,left:16});
});


test('sourceFacing can invert mirroring when art is authored facing left',()=>{
  const c=normalizeCharacterAnimationData({animations:{walk:{src:'walk.png',frames:6,allowHorizontalFlip:true,sourceFacing:'left'}}});
  const resolved=resolveAnimation(c,'walk','left');
  assert.equal(shouldMirror(resolved.animation,'left',resolved.name),false);
  assert.equal(shouldMirror(resolved.animation,'right',resolved.name),true);
});

test('named left/right suffix still works when sourceFacing is absent',()=>{
  const c=normalizeCharacterAnimationData({animations:{'walk-left':{src:'walk.png',frames:6,allowHorizontalFlip:true}}});
  const resolved=resolveAnimation(c,'walk','left');
  assert.equal(resolved.name,'walk-left');
  assert.equal(shouldMirror(resolved.animation,'left',resolved.name),false);
});
