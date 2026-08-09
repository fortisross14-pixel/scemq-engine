import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogueConfig, createObjectConfig, createVisualConfig } from './schema.js';

test('object configs are scene scoped', () => {
  const object = createObjectConfig('scene4', 'Captain Nib', 'character');
  assert.equal(object.sceneId, 'scene4');
  assert.equal(object.character.characterId, 'captain-nib');
});

test('dialogues are scene scoped', () => {
  const dialogue = createDialogueConfig('scene2', 'brine', 'Madame Brine');
  assert.equal(dialogue.sceneId, 'scene2');
  assert.equal(dialogue.characterId, 'brine');
});

test('visual config starts empty and modular', () => {
  const visual = createVisualConfig('scene1');
  assert.deepEqual(visual.objectRefs, []);
});
