import { slugify, uniqueId } from './id.js';

export const SCHEMA_VERSION = '0.1';

export const EVENT_TYPES = [
  'onLook', 'onUse', 'onPickUp', 'onTalk', 'onGive',
  'onEnterScene', 'onLeaveScene', 'onItemUsed',
  'onDialogueChoice', 'onVariableChanged'
];

export const ACTION_TYPES = [
  'say', 'setFlag', 'setVariable', 'giveItem', 'removeItem',
  'setVisualState', 'showObject', 'hideObject', 'moveCharacter',
  'changeScene', 'startDialogue'
];

export const OBJECT_TYPES = ['scenery', 'prop', 'character', 'hotspot', 'exit'];
export const VERBS = ['walk', 'look', 'use', 'talk', 'pickUp', 'give', 'open', 'close', 'push', 'pull'];

export function createProjectManifest(name = 'Untitled Project') {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-project',
    engine: 'SCEMQ',
    id: slugify(name, 'project'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes: []
  };
}

export function createSceneManifest(sceneId, name = 'Untitled Scene') {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-meta',
    sceneId,
    name,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createVisualConfig(sceneId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-visual',
    sceneId,
    canvas: { width: 1600, height: 900, backgroundColor: '#20242b' },
    playerStart: { x: 220, y: 700 },
    objectRefs: []
  };
}

export function createLogicConfig(sceneId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-logic',
    sceneId,
    variables: [],
    rules: []
  };
}

export function createObjectConfig(sceneId, name = 'New Object', type = 'prop') {
  const id = slugify(name, uniqueId('object'));
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-object',
    sceneId,
    id,
    name,
    type,
    asset: { path: '', state: 'default', states: {} },
    transform: { x: 120, y: 120, width: 180, height: 180, z: 20, opacity: 1, visible: true },
    hotspot: {
      enabled: type !== 'scenery',
      label: name,
      actions: {}
    },
    character: type === 'character' ? { characterId: id, displayName: name } : null
  };
}

export function createDialogueConfig(sceneId, characterId, displayName = characterId) {
  const startId = 'start';
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-dialogue',
    sceneId,
    characterId,
    displayName,
    entryNodeId: startId,
    nodes: [
      {
        id: startId,
        speaker: displayName,
        text: 'New dialogue.',
        x: 120,
        y: 120,
        choices: []
      }
    ]
  };
}

export function createRule() {
  return {
    id: uniqueId('rule'),
    name: 'New rule',
    event: { type: 'onUse', targetId: '', verb: 'use', itemId: '' },
    conditions: [],
    actions: []
  };
}

export function createDialogueNode(displayName = 'Character') {
  return {
    id: uniqueId('node'),
    speaker: displayName,
    text: 'New line.',
    x: 180,
    y: 180,
    choices: []
  };
}
