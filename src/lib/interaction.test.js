import test from 'node:test';
import assert from 'node:assert/strict';
import { authoredRulesForInteraction, eventTypeForVerb, ruleEventMatches } from './interaction.js';

test('talk rule matches the verb that caused the interaction, not stale UI state',()=>{
  const rule={event:{type:'onTalk',targetType:'object',targetId:'pindle',verb:'talk'}};
  assert.equal(ruleEventMatches(rule,{type:'onTalk',targetId:'pindle',targetType:'object',verb:'talk'}),true);
  assert.equal(ruleEventMatches(rule,{type:'onTalk',targetId:'pindle',targetType:'object',verb:'look'}),false);
});

test('inventory item requirement matches selected inventory for scene targets',()=>{
  const rule={event:{type:'onUse',targetType:'object',targetId:'fishbowl',verb:'use',itemId:'tongs'}};
  assert.equal(ruleEventMatches(rule,{type:'onUse',targetId:'fishbowl',targetType:'object',verb:'use',itemId:'tongs'}),true);
  assert.equal(ruleEventMatches(rule,{type:'onUse',targetId:'fishbowl',targetType:'object',verb:'use',itemId:'ruler'}),false);
});


test('auto binding discovers object rules from target id and verb',()=>{
  const rules=[
    {id:'r-look-rulers',event:{type:'onLook',targetType:'object',targetId:'ruler-holder',verb:'look'}},
    {id:'r-pickup-rulers',event:{type:'onPickUp',targetType:'object',targetId:'ruler-holder',verb:'pickUp'}},
    {id:'other',event:{type:'onPickUp',targetType:'object',targetId:'fishbowl',verb:'pickUp'}}
  ];
  assert.deepEqual(authoredRulesForInteraction(rules,{targetId:'ruler-holder',verb:'pickUp'}).map(r=>r.id),['r-pickup-rulers']);
  assert.equal(eventTypeForVerb('pickUp'),'onPickUp');
});

test('auto binding preserves multiple conditional rules for one character verb',()=>{
  const rules=[
    {id:'talk-before',event:{type:'onTalk',targetType:'object',targetId:'mr-pindle',verb:'talk'},conditions:[{key:'phase',value:'before'}]},
    {id:'talk-after',event:{type:'onTalk',targetType:'object',targetId:'mr-pindle',verb:'talk'},conditions:[{key:'phase',value:'after'}]},
    {id:'give-form',event:{type:'onGive',targetType:'object',targetId:'mr-pindle',verb:'give',itemId:'form'}}
  ];
  assert.deepEqual(authoredRulesForInteraction(rules,{targetId:'mr-pindle',verb:'talk'}).map(r=>r.id),['talk-before','talk-after']);
  assert.deepEqual(authoredRulesForInteraction(rules,{targetId:'mr-pindle',verb:'give'}).map(r=>r.id),['give-form']);
});
