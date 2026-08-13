import test from 'node:test';import assert from 'node:assert/strict';
import {findInventoryRecipe,inventoryEventTypeForVerb,inventoryRuleMatches,inventoryVerbEnabled} from './inventory.js';
const items=[{id:'short',combinations:[{withItemId:'long',resultItemId:'pair',bidirectional:true}]},{id:'long',combinations:[]},{id:'one-way',combinations:[{withItemId:'long',resultItemId:'x',bidirectional:false}]}];
test('bidirectional inventory recipe works in reverse',()=>assert.equal(findInventoryRecipe(items,'long','short')?.recipe.resultItemId,'pair'));
test('one-way recipe does not work in reverse',()=>assert.equal(findInventoryRecipe(items,'long','one-way'),null));
test('inventory combine rule obeys bothWays',()=>{const r={event:{type:'onInventoryCombine',itemId:'short',targetId:'long',bothWays:true}};assert.equal(inventoryRuleMatches(r,'long','short'),true)});

test('inventory verbs can be enabled or disabled per item',()=>{
 const item={id:'form',interactions:{open:true,talk:false}};
 assert.equal(inventoryVerbEnabled(item,'open'),true);
 assert.equal(inventoryVerbEnabled(item,'talk'),false);
});

test('inventory self verbs map to interaction events',()=>{
 assert.equal(inventoryEventTypeForVerb('open'),'onOpen');
 assert.equal(inventoryEventTypeForVerb('look'),'onLook');
 assert.equal(inventoryEventTypeForVerb('use'),'');
});
