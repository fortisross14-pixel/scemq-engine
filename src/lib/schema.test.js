import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterDefinition, createCharacterObjectConfig, createDialogueConfig, createInventoryItem, createObjectConfig, createProjectSettings, createProjectUi, createRule, createSceneManifest, createVisualConfig } from './schema.js';

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
  assert.equal(visual.viewport.zoom, 1);
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

test('inventory items expose adventure verbs by default', () => {
  const item = createInventoryItem('Rolled Form');
  assert.equal(item.interactions.open, true);
  assert.equal(item.interactions.look, true);
  assert.equal(item.interactions.give, true);
  assert.equal(Object.hasOwn(item.interactions, 'walk'), false);
});

test('character definitions support named animation libraries',()=>{
 const character=createCharacterDefinition('Mara');
 assert.deepEqual(character.animations,{});
 assert.equal(character.actionAnimations.pickUp,'pickup');
 assert.equal(Array.isArray(character.idleVariants),true);
});


test('project settings support a separate title scene and gameplay start scene', () => {
  const settings = createProjectSettings('Test');
  assert.equal(settings.titleSceneId, '');
  assert.equal(settings.defaultSceneId, '');
});

test('scene metadata can identify a title screen', () => {
  const meta = createSceneManifest('scene0', 'Home', 'title');
  assert.equal(meta.sceneType, 'title');
});

test('visual config carries editable title screen controls', () => {
  const visual = createVisualConfig('scene0');
  assert.equal(visual.titleScreen.newGame.label, 'New Game');
  assert.equal(visual.titleScreen.loadGame.label, 'Load Game');
  assert.ok(visual.titleScreen.titleTransform.width > 0);
});

// v0.5.2 geometry regression: a point clamped onto a walk polygon edge must
// remain valid walk space instead of being treated as outside on the next tick.
test('walk polygon edges count as inside', async () => {
  const { pointInPolygon } = await import('./geometry.js');
  const polygon = [{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  assert.equal(pointInPolygon({x:50,y:100}, polygon), true);
  assert.equal(pointInPolygon({x:0,y:30}, polygon), true);
});
