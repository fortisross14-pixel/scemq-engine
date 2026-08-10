import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScenePackage, collectSceneReferences, createScenePackage, mergeDependencies, remapScenePackage } from './scenePackage.js';
import { createLogicConfig, createObjectConfig, createVisualConfig } from './schema.js';

function sampleScene(){
 const logic=createLogicConfig('scene1');
 logic.variables=[{id:'localFlag',name:'localFlag',type:'boolean',initialValue:false}];
 logic.rules=[{id:'r1',name:'Give ruler',event:{type:'onGive',targetId:'pindle',itemId:'short-ruler',verb:'give'},conditions:[{left:'variable',key:'globalDay',op:'equals',value:'1'}],actions:[{type:'startDialogue',targetId:'pindle',value:'package-called'},{type:'changeScene',value:'scene2',targetId:'default'}]}];
 const p=createObjectConfig('scene1','Pindle','character');p.id='pindle';p.character={characterId:'pindle',displayName:'Pindle',role:'npc',walkSpeed:180};
 const exit=createObjectConfig('scene1','Exit','exit');exit.id='exit';exit.exit.destinationSceneId='scene2';
 return {meta:{kind:'scemq-scene-meta',sceneId:'scene1',name:'Office'},visual:createVisualConfig('scene1'),logic,objects:[p,exit],dialogues:[{kind:'scemq-scene-dialogue',sceneId:'scene1',characterId:'pindle',entryNodeId:'start',nodes:[{id:'start',beats:[{speakerId:'mara',text:'Hi'}],choices:[]},{id:'package-called',beats:[{speakerId:'pindle',text:'Called.'}],choices:[]}]}]};
}

test('scene references distinguish scene-owned variables from global dependencies',()=>{
 const refs=collectSceneReferences(sampleScene());
 assert.deepEqual([...refs.characters].sort(),['mara','pindle']);
 assert.deepEqual([...refs.inventory],['short-ruler']);
 assert.deepEqual([...refs.variables],['globalDay']);
 assert.deepEqual([...refs.scenes],['scene2']);
});

test('package exporter includes only referenced project dependencies',()=>{
 const scene=sampleScene();
 const projectData={characters:[{id:'mara',name:'Mara'},{id:'pindle',name:'Pindle'},{id:'nib',name:'Nib'}],inventory:[{id:'short-ruler',name:'Short Ruler',combinations:[]}],variables:{variables:[{id:'globalDay',name:'Day'},{id:'unused',name:'Unused'}]}};
 const pkg=createScenePackage({scene,projectData,project:{scenes:[{id:'scene1'},{id:'scene2'}]}});
 assert.deepEqual(pkg.dependencies.characters.map(x=>x.id).sort(),['mara','pindle']);
 assert.deepEqual(pkg.dependencies.variables.map(x=>x.id),['globalDay']);
});

test('package analysis can create missing dependencies and leave destination scenes soft',()=>{
 const scene=sampleScene();
 const pkg={kind:'scemq-scene-package',packageVersion:1,sceneId:'scene1',scene,dependencies:{characters:[{id:'mara',name:'Mara'},{id:'pindle',name:'Pindle'}],inventory:[{id:'short-ruler',name:'Short'}],variables:[{id:'globalDay',name:'Day'}]}};
 const report=analyzeScenePackage(pkg,{scenes:[]},{characters:[],inventory:[],variables:{variables:[]}});
 assert.equal(report.errors.length,0);
 assert.equal(report.softScenes.find(x=>x.id==='scene2').status,'unresolved');
 assert.equal(report.dependencies.characters.every(x=>x.status==='create'),true);
});

test('scene remap updates internal scene ids and self destinations',()=>{
 const scene=sampleScene();scene.objects[1].exit.destinationSceneId='scene1';scene.logic.rules[0].actions[1].value='scene1';
 const pkg={kind:'scemq-scene-package',packageVersion:1,sceneId:'scene1',scene,dependencies:{}};
 const out=remapScenePackage(pkg,'scene3');
 assert.equal(out.scene.meta.sceneId,'scene3');
 assert.equal(out.scene.objects[1].exit.destinationSceneId,'scene3');
 assert.equal(out.scene.logic.rules[0].actions[1].value,'scene3');
});

test('dependency merge reuses existing ids',()=>{
 const merged=mergeDependencies({characters:[{id:'mara',name:'Existing Mara'}],inventory:[],variables:{variables:[]}},{dependencies:{characters:[{id:'mara',name:'Package Mara'},{id:'pindle',name:'Pindle'}],inventory:[],variables:[]}});
 assert.equal(merged.characters.find(x=>x.id==='mara').name,'Existing Mara');
 assert.equal(merged.characters.some(x=>x.id==='pindle'),true);
});

test('package analysis rejects a missing dialogue start node',()=>{
 const scene=sampleScene();scene.logic.rules[0].actions[0].value='does-not-exist';
 const pkg={kind:'scemq-scene-package',packageVersion:1,sceneId:'scene1',scene,dependencies:{characters:[{id:'mara',name:'Mara'},{id:'pindle',name:'Pindle'}],inventory:[{id:'short-ruler',name:'Short'}],variables:[{id:'globalDay',name:'Day'}]}};
 const report=analyzeScenePackage(pkg,{scenes:[]},{characters:[],inventory:[],variables:{variables:[]}});
 assert.equal(report.errors.some(e=>e.includes('does-not-exist')),true);
});
