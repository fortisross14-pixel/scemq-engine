import test from 'node:test';
import assert from 'node:assert/strict';
import { unionFrameContentBounds, contentMetricsForFrame } from './spriteContent.js';

test('unions visible bounds across animation frames', () => {
  const b = unionFrameContentBounds([
    {x:.1,y:.2,width:.6,height:.7,empty:false},
    {x:.05,y:.1,width:.8,height:.75,empty:false}
  ]);
  assert.ok(Math.abs(b.x-.05)<1e-9);
  assert.ok(Math.abs(b.y-.1)<1e-9);
  assert.ok(Math.abs(b.width-.8)<1e-9);
  assert.ok(Math.abs(b.height-.8)<1e-9);
});

test('content aspect ratio ignores transparent padding', () => {
  const m = contentMetricsForFrame(256,1024,{x:0,y:.1,width:1,height:.8,empty:false});
  assert.equal(m.contentPixelWidth,256);
  assert.equal(m.contentPixelHeight,819.2);
  assert.ok(Math.abs(m.aspectRatio-(256/819.2))<1e-9);
});

test('content metrics reflect an already-trimmed visible box',()=>{
  const m=contentMetricsForFrame(200,400,{x:.1,y:.1,width:.7,height:.6,empty:false});
  assert.equal(m.contentPixelWidth,140);
  assert.equal(m.contentPixelHeight,240);
  assert.ok(Math.abs(m.aspectRatio-(140/240))<1e-9);
});
