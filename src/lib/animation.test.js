import test from 'node:test';
import assert from 'node:assert/strict';
import { animationDurationMs, frameIndexAtTime, normalizeCharacterAnimationData, requestedAnimationForVerb, resolveAnimation, shouldMirror } from './animation.js';

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
