import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleEventMatches } from './interaction.js';

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
