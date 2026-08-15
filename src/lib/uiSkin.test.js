import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundSizeForFit, cursorRoleForObject, normalizeCursorRoles } from './uiSkin.js';

test('cursor roles distinguish exits from ordinary interactive hotspots',()=>{
  assert.equal(cursorRoleForObject({type:'exit'}),'exit');
  assert.equal(cursorRoleForObject({type:'character'}),'interactive');
  assert.equal(cursorRoleForObject({type:'hotspot'}),'interactive');
});

test('cursor role normalization keeps all three semantic slots',()=>{
  assert.deepEqual(normalizeCursorRoles({normal:'walk.png'}),{normal:'walk.png',interactive:'',exit:''});
});

test('interface background fit maps stretch to full rectangle sizing',()=>{
  assert.equal(backgroundSizeForFit('stretch'),'100% 100%');
  assert.equal(backgroundSizeForFit('cover'),'cover');
  assert.equal(backgroundSizeForFit('contain'),'contain');
});
