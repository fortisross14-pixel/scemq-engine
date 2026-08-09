import { slugify, uniqueId } from './id.js';

export const SCHEMA_VERSION = '0.3';

export const EVENT_TYPES = [
  'onLook', 'onUse', 'onPickUp', 'onTalk', 'onGive', 'onOpen', 'onClose', 'onPush', 'onPull',
  'onEnterScene', 'onLeaveScene', 'onItemUsed', 'onInventoryCombine', 'onDialogueChoice', 'onVariableChanged'
];

export const ACTION_TYPES = [
  'say', 'setFlag', 'setVariable', 'giveItem', 'removeItem',
  'setVisualState', 'showObject', 'hideObject', 'moveCharacter',
  'changeScene', 'startDialogue'
];

export const OBJECT_TYPES = ['scenery', 'prop', 'character', 'hotspot', 'exit'];
export const VERBS = ['walk', 'look', 'use', 'talk', 'pickUp', 'give', 'open', 'close', 'push', 'pull'];
export const UI_ELEMENT_TYPES = ['verbButton', 'inventory', 'statusText', 'button', 'panel', 'text', 'image'];
export const UI_ACTION_TYPES = ['none', 'selectVerb', 'openSave', 'openLoad', 'toggleHotspots', 'pause', 'customRule'];
export const VARIABLE_TYPES = ['boolean', 'number', 'string'];

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

export function createProjectSettings(name = 'Untitled Project') {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-project-settings',
    title: name,
    defaultSceneId: '',
    defaultSpawnPointId: 'default',
    saveSlots: 3,
    defaultVerb: 'walk',
    showStatusLine: true,
    runtimeBackground: '#08090b'
  };
}

export function createProjectUi() {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-project-ui',
    screen: { width: 1280, height: 900, backgroundColor: '#111318' },
    viewport: { x: 0, y: 0, width: 1280, height: 700 },
    cursors: Object.fromEntries(VERBS.map((verb) => [verb, ''])),
    elements: [
      ...['walk', 'look', 'use', 'talk', 'pickUp', 'give'].map((verb, index) => ({
        id: `verb-${verb}`,
        type: 'verbButton',
        name: `${verb} button`,
        label: verb === 'pickUp' ? 'Pick up' : verb[0].toUpperCase() + verb.slice(1),
        transform: { x: 20 + (index % 3) * 118, y: 730 + Math.floor(index / 3) * 62, width: 108, height: 50, z: 20 },
        action: { type: 'selectVerb', value: verb },
        style: { fontSize: 16, background: '#292d35', color: '#eee9dc' }
      })),
      {
        id: 'inventory-main', type: 'inventory', name: 'Inventory', label: 'Inventory',
        transform: { x: 410, y: 720, width: 650, height: 150, z: 20 },
        inventory: { rows: 2, columns: 3, slotWidth: 96, slotHeight: 62, direction: 'horizontal' },
        style: { background: '#20242b', color: '#eee9dc' }
      },
      {
        id: 'status-main', type: 'statusText', name: 'Interaction status', label: '',
        transform: { x: 20, y: 700, width: 1040, height: 28, z: 21 },
        style: { fontSize: 14, background: 'transparent', color: '#e0b45d' }
      },
      {
        id: 'save-button', type: 'button', name: 'Save button', label: 'Save',
        transform: { x: 1090, y: 730, width: 80, height: 42, z: 20 },
        action: { type: 'openSave', value: '' }, style: { fontSize: 14, background: '#292d35', color: '#eee9dc' }
      },
      {
        id: 'load-button', type: 'button', name: 'Load button', label: 'Load',
        transform: { x: 1180, y: 730, width: 80, height: 42, z: 20 },
        action: { type: 'openLoad', value: '' }, style: { fontSize: 14, background: '#292d35', color: '#eee9dc' }
      }
    ]
  };
}

export function createProjectVariables() {
  return { schemaVersion: SCHEMA_VERSION, kind: 'scemq-project-variables', variables: [] };
}

export function createCharacterDefinition(name = 'New Character') {
  const id = slugify(name, uniqueId('character'));
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-character',
    id,
    name,
    playable: false,
    walkSpeed: 180,
    defaultFacing: 'right',
    notes: '',
    assets: { portrait: '', idle: '', walkLeft: '', walkRight: '', walkUp: '', walkDown: '' }
  };
}

export function createInventoryItem(name = 'New Item') {
  const id = slugify(name, uniqueId('item'));
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-inventory-item',
    id,
    name,
    description: '',
    asset: '',
    cursorAsset: '',
    initiallyOwned: false,
    persistent: true,
    stackable: false,
    combinations: []
  };
}

export function createSceneManifest(sceneId, name = 'Untitled Scene') {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-meta',
    sceneId,
    name,
    notes: '',
    audio: { music: '', ambient: '' },
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
    background: { path: '', fit: 'stretch' },
    viewport: {
      followPlayer: true,
      startX: 0,
      startY: 0,
      limits: { left: 0, top: 0, right: 1600, bottom: 900 }
    },
    player: { characterObjectId: '', start: { x: 220, y: 700 }, facing: 'right' },
    playerStart: { x: 220, y: 700 },
    spawnPoints: [{ id: 'default', name: 'Default', x: 220, y: 700, facing: 'right' }],
    walkAreas: [],
    depthAreas: [],
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
    asset: { path: '', state: 'default', states: { default: '' } },
    transform: {
      x: 120, y: 120, width: 180, height: 180, z: 20, opacity: 1, visible: true,
      flipX: false, locked: false, lockAspect: true,
      anchor: type === 'character' ? 'bottom-center' : 'top-left', anchorX: 0.5, anchorY: type === 'character' ? 1 : 0
    },
    hotspot: { enabled: type !== 'scenery', label: name, actions: {} },
    interactionPoint: { x: 210, y: 300, facing: 'right' },
    character: type === 'character' ? { characterId: '', displayName: name, role: 'npc', walkSpeed: 180 } : null,
    exit: type === 'exit' ? { destinationSceneId: '', spawnPointId: 'default', transition: 'fade', walkFirst: true } : null,
    notes: ''
  };
}

export function createCharacterObjectConfig(sceneId, character) {
  const object = createObjectConfig(sceneId, character.name, 'character');
  object.id = character.id;
  object.character = {
    characterId: character.id,
    displayName: character.name,
    role: character.playable ? 'playable' : 'npc',
    walkSpeed: character.walkSpeed || 180
  };
  return object;
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
        beats: [{ id: uniqueId('beat'), speakerId: characterId, text: 'New dialogue.' }],
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
    event: { type: 'onUse', targetType: 'object', targetId: '', verb: 'use', itemId: '', bothWays: false },
    conditions: [],
    actions: []
  };
}

export function createDialogueNode(defaultSpeakerId = '') {
  return {
    id: uniqueId('node'),
    beats: [{ id: uniqueId('beat'), speakerId: defaultSpeakerId, text: 'New line.' }],
    x: 180,
    y: 180,
    choices: []
  };
}

export function createUiElement(type = 'button') {
  const id = uniqueId(type);
  return {
    id, type, name: `New ${type}`, label: type === 'statusText' ? '' : 'New',
    transform: { x: 40, y: 740, width: type === 'inventory' ? 420 : 120, height: type === 'inventory' ? 120 : 48, z: 20 },
    action: { type: type === 'verbButton' ? 'selectVerb' : 'none', value: type === 'verbButton' ? 'walk' : '' },
    inventory: type === 'inventory' ? { rows: 2, columns: 3, slotWidth: 96, slotHeight: 54, direction: 'horizontal' } : undefined,
    style: { fontSize: 14, background: type === 'statusText' ? 'transparent' : '#292d35', color: '#eee9dc' },
    asset: ''
  };
}

export function createPolygon(kind = 'walk') {
  return {
    id: uniqueId(kind),
    name: kind === 'walk' ? 'Walk area' : 'Depth area',
    enabled: true,
    z: kind === 'depth' ? 30 : undefined,
    points: []
  };
}
