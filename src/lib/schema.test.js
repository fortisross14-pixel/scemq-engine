import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogueConfig, createObjectConfig, createProjectUi, createVisualConfig } from './schema.js';

test('object configs are scene scoped', () => {
  const object = createObjectConfig('scene4', 'Captain Nib', 'character');
  assert.equal(object.sceneId, 'scene4');
  assert.equal(object.character.characterId, 'captain-nib');
  assert.equal(object.transform.anchor, 'bottom-center');
});

test('dialogues are scene scoped', () => {
  const dialogue = createDialogueConfig('scene2', 'brine', 'Madame Brine');
  assert.equal(dialogue.sceneId, 'scene2');
  assert.equal(dialogue.characterId, 'brine');
});

test('visual config starts empty and includes runtime authoring layers', () => {
  const visual = createVisualConfig('scene1');
  assert.deepEqual(visual.objectRefs, []);
  assert.deepEqual(visual.walkAreas, []);
  assert.deepEqual(visual.depthAreas, []);
  assert.equal(visual.spawnPoints[0].id, 'default');
});

test('project UI separates game screen from viewport', () => {
  const ui = createProjectUi();
  assert.ok(ui.screen.height > ui.viewport.height);
  assert.equal(ui.viewport.width, 1280);
  assert.ok(ui.elements.some((element) => element.type === 'inventory'));
});
