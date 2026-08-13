import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneManager, createSceneConnection, normalizeSceneManager, orderedScenes } from './sceneManager.js';

const scenes = [
  { id: 'scene0', name: 'Home' },
  { id: 'scene1', name: 'Office' },
  { id: 'scene2', name: 'Harbor' }
];

test('scene manager starts in manifest order', () => {
  assert.deepEqual(createSceneManager(scenes).sceneOrder, ['scene0', 'scene1', 'scene2']);
});

test('scene manager keeps authored order and appends new scenes', () => {
  const manager = normalizeSceneManager({ sceneOrder: ['scene2', 'scene0'] }, scenes);
  assert.deepEqual(manager.sceneOrder, ['scene2', 'scene0', 'scene1']);
});

test('scene manager drops stale scene ids and stale connections', () => {
  const manager = normalizeSceneManager({
    sceneOrder: ['missing', 'scene2'],
    connections: [
      { id: 'ok', fromSceneId: 'scene1', toSceneId: 'scene2' },
      { id: 'bad', fromSceneId: 'scene2', toSceneId: 'missing' }
    ]
  }, scenes);
  assert.deepEqual(manager.sceneOrder, ['scene2', 'scene0', 'scene1']);
  assert.equal(manager.connections.length, 1);
  assert.equal(manager.connections[0].id, 'ok');
});

test('ordered scenes follow scene manager order', () => {
  const manager = { sceneOrder: ['scene2', 'scene1', 'scene0'], connections: [] };
  assert.deepEqual(orderedScenes(scenes, manager).map(scene => scene.id), ['scene2', 'scene1', 'scene0']);
});

test('connections can represent bidirectional hub routes', () => {
  const connection = createSceneConnection('ship-map', 'main-deck', 'hub');
  connection.bidirectional = true;
  assert.equal(connection.kind, 'hub');
  assert.equal(connection.bidirectional, true);
});
