import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDialogueConfig, dialogueSpeakersAreValid } from './dialogue.js';

const chars=[{id:'mara',name:'Mara'},{id:'mr-pindle',name:'Mr. Pindle'}];

test('legacy labelled dialogue becomes speaker-id beats',()=>{
 const d=normalizeDialogueConfig({kind:'scemq-scene-dialogue',sceneId:'scene1',characterId:'mr-pindle',entryNodeId:'start',nodes:[{id:'start',speaker:'Mara / Mr. Pindle',text:'Mara: Hello.\n\nMr. Pindle: Busy.',x:0,y:0,choices:[]}]},chars);
 assert.deepEqual(d.nodes[0].beats.map(b=>b.speakerId),['mara','mr-pindle']);
 assert.equal(dialogueSpeakersAreValid(d,chars),true);
});

test('import can be rebound to selected project character',()=>{
 const d=normalizeDialogueConfig({kind:'scemq-scene-dialogue',sceneId:'scene1',characterId:'old-id',entryNodeId:'start',nodes:[{id:'start',speaker:'Mara',text:'Hello.',x:0,y:0,choices:[]}]},chars,'mr-pindle');
 assert.equal(d.characterId,'mr-pindle');
});

test('dialogue can start at a requested authored node and falls back to entry',async()=>{
 const { resolveDialogueStartNode } = await import('./dialogue.js');
 const d={entryNodeId:'start',nodes:[{id:'start'},{id:'package-called'}]};
 assert.equal(resolveDialogueStartNode(d,'package-called'),'package-called');
 assert.equal(resolveDialogueStartNode(d,'missing'),'start');
});

test('dialogue runtime advances beats then waits for choices', async()=>{
 const { createDialogueRuntimeState, advanceDialogueRuntimeState } = await import('./dialogue.js');
 const dialogue={nodes:[{id:'start',beats:[{id:'b1'},{id:'b2'}],choices:[{id:'c1'}]}]};
 const node=dialogue.nodes[0];
 let state=createDialogueRuntimeState(dialogue,'start');
 assert.equal(state.beatIndex,0);
 assert.equal(state.awaitingChoice,false);
 state=advanceDialogueRuntimeState(state,node,1);
 assert.equal(state.beatIndex,1);
 assert.equal(state.awaitingChoice,false);
 state=advanceDialogueRuntimeState(state,node,1);
 assert.equal(state.beatIndex,1);
 assert.equal(state.awaitingChoice,true);
 assert.equal(advanceDialogueRuntimeState(state,node,1),state);
});

test('dialogue runtime closes after final beat when there are no choices', async()=>{
 const { createDialogueRuntimeState, advanceDialogueRuntimeState } = await import('./dialogue.js');
 const dialogue={nodes:[{id:'start',beats:[{id:'b1'}],choices:[]}]};
 const state=createDialogueRuntimeState(dialogue,'start');
 assert.equal(advanceDialogueRuntimeState(state,dialogue.nodes[0],0),null);
});

test('choice-only dialogue node begins waiting for a choice', async()=>{
 const { createDialogueRuntimeState } = await import('./dialogue.js');
 const dialogue={nodes:[{id:'start',beats:[],choices:[{id:'c1'}]}]};
 assert.equal(createDialogueRuntimeState(dialogue,'start').awaitingChoice,true);
});
