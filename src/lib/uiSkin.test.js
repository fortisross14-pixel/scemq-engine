import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundSizeForFit, bottomGuiBand, cursorRoleForObject, normalizeCursorRoles, skinMakesElementTransparent } from './uiSkin.js';

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

test('GUI background occupies only the band below the viewport',()=>{
  assert.deepEqual(bottomGuiBand({width:1280,height:900},{y:0,height:700}),{left:0,top:700,width:1280,height:200});
});

test('image-backed buttons and panels drop their fallback chrome',()=>{
  assert.equal(skinMakesElementTransparent({type:'verbButton',asset:'look.png'}),true);
  assert.equal(skinMakesElementTransparent({type:'button',asset:'save.png'}),true);
  assert.equal(skinMakesElementTransparent({type:'inventory',asset:'inventory.png'}),false);
});
