import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterDefinition, createCharacterObjectConfig, createDialogueConfig, createInventoryItem, createObjectConfig, createProjectUi, createRule, createVisualConfig } from './schema.js';

test('scene character objects reference project characters', () => {
  const character = { ...createCharacterDefinition('Captain Nib'), id: 'captain-nib' };
  const object = createCharacterObjectConfig('scene4', character);
  assert.equal(object.sceneId, 'scene4');
  assert.equal(object.character.characterId, 'captain-nib');
  assert.equal(object.transform.anchor, 'bottom-center');
});

test('dialogues are scene scoped and use speaker ids', () => {
  const dialogue = createDialogueConfig('scene2', 'brine', 'Madame Brine');
  assert.equal(dialogue.sceneId, 'scene2');
  assert.equal(dialogue.characterId, 'brine');
  assert.equal(dialogue.nodes[0].beats[0].speakerId, 'brine');
});

test('visual config uses simple camera limits', () => {
  const visual = createVisualConfig('scene1');
  assert.deepEqual(visual.objectRefs, []);
  assert.deepEqual(visual.walkAreas, []);
  assert.deepEqual(visual.depthAreas, []);
  assert.equal(visual.viewport.followPlayer, true);
  assert.deepEqual(visual.viewport.limits, { left: 0, top: 0, right: 1600, bottom: 900 });
});

test('project UI separates game screen from viewport', () => {
  const ui = createProjectUi();
  assert.ok(ui.screen.height > ui.viewport.height);
  assert.equal(ui.viewport.width, 1280);
  assert.ok(ui.elements.some((element) => element.type === 'inventory'));
});

test('inventory recipes can explicitly be bidirectional', () => {
  const item = createInventoryItem('Short Ruler');
  item.combinations.push({ withItemId: 'long-ruler', resultItemId: 'ruler-pair', bidirectional: true });
  assert.equal(item.combinations[0].bidirectional, true);
});

test('inventory combine rules carry target type and both ways', () => {
  const rule = createRule();
  rule.event = { type: 'onInventoryCombine', targetType: 'inventory', itemId: 'short-ruler', targetId: 'long-ruler', bothWays: true };
  assert.equal(rule.event.targetType, 'inventory');
  assert.equal(rule.event.bothWays, true);
});


test('exit objects support rule-gated visibility and blocking', () => {
  const exit = createObjectConfig('scene1', 'City Map', 'exit');
  assert.equal(exit.exit.availabilityRuleId, '');
  assert.equal(exit.exit.hiddenUntilAvailable, false);
  assert.match(exit.exit.blockedMessage, /cannot go there/i);
});

test('inventory items can customize pickup popup text', () => {
  const item = createInventoryItem('Short Ruler');
  assert.equal(item.pickupMessage, '');
});
