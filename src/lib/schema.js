import { DEFAULT_ACTION_ANIMATIONS } from './animation.js';
import { createDefaultResponses } from './responses.js';
import { DEFAULT_TEXT_COLOR, DEFAULT_TEXT_SPEED } from './speech.js';
import { slugify, uniqueId } from './id.js';

export const SCHEMA_VERSION = '0.4';

export const EVENT_TYPES = [
  'onLook', 'onUse', 'onPickUp', 'onTalk', 'onGive', 'onOpen', 'onClose', 'onPush', 'onPull',
  'onEnterScene', 'onLeaveScene', 'onItemUsed', 'onInventoryCombine', 'onDialogueChoice', 'onVariableChanged',
  'onTick'
];

export const ACTION_TYPES = [
  'say', 'setFlag', 'setVariable', 'giveItem', 'removeItem',
  'setVisualState', 'showObject', 'hideObject', 'moveCharacter',
  'changeScene', 'startDialogue', 'playAnimation',
  // v0.6 cutscene/sequencing vocabulary
  'wait', 'moveCharacterTo', 'faceCharacter', 'cameraPanTo', 'cameraFollowPlayer',
  'setInputEnabled', 'fadeOut', 'fadeIn', 'playSound', 'playMusic', 'stopMusic',
  'switchPlayerCharacter', 'stopDialogue'
];

// Actions whose targetId is a scene object id (used by validation and editors).
export const OBJECT_ACTION_TYPES = ['setVisualState', 'showObject', 'hideObject', 'moveCharacter'];

// Actions that can block a sequence until they finish.
export const AWAITABLE_ACTION_TYPES = ['say', 'wait', 'moveCharacterTo', 'cameraPanTo', 'playAnimation', 'fadeOut', 'fadeIn'];

export const SEQUENCE_ACTION_TYPES = [
  'wait', 'moveCharacterTo', 'faceCharacter', 'cameraPanTo', 'cameraFollowPlayer',
  'setInputEnabled', 'fadeOut', 'fadeIn', 'playSound', 'playMusic', 'stopMusic',
  'switchPlayerCharacter', 'stopDialogue'
];

export const OBJECT_TYPES = ['scenery', 'prop', 'character', 'hotspot', 'exit'];
export const VERBS = ['walk', 'look', 'use', 'talk', 'pickUp', 'give', 'open', 'close', 'push', 'pull'];
export const INVENTORY_VERBS = VERBS.filter((verb) => verb !== 'walk');
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
    titleSceneId: '',
    defaultSceneId: '',
    defaultSpawnPointId: 'default',
    saveSlots: 3,
    defaultVerb: 'walk',
    showStatusLine: true,
    runtimeBackground: '#08090b',
    // v0.6 runtime feel
    textSpeed: DEFAULT_TEXT_SPEED,
    textDefaultColor: DEFAULT_TEXT_COLOR,
    floatingSpeech: true,
    rightClickVerb: 'look',
    keyboardShortcuts: true,
    autosaveOnSceneChange: true,
    sharedInventory: true,
    masterVolume: 1,
    musicVolume: 0.6,
    ambientVolume: 0.5,
    sfxVolume: 0.9,
    defaultActionSounds: {
      look: '', use: '', talk: '', pickUp: '', give: '', open: '', close: '', push: '', pull: ''
    },
    language: '',
    defaultResponses: createDefaultResponses()
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
    assets: { portrait: '', idle: '', walkLeft: '', walkRight: '', walkUp: '', walkDown: '' },
    animations: {},
    textColor: '',
    defaultAnimation: '',
    actionAnimations: { ...DEFAULT_ACTION_ANIMATIONS },
    idleVariants: []
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
    pickupMessage: '',
    folder: '',
    sourceSceneId: '',
    asset: '',
    cursorAsset: '',
    initiallyOwned: false,
    critical: false,
    persistent: true,
    stackable: false,
    interactions: Object.fromEntries(INVENTORY_VERBS.map((verb) => [verb, true])),
    combinations: []
  };
}

export function createSceneManifest(sceneId, name = 'Untitled Scene', sceneType = 'gameplay') {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-meta',
    sceneId,
    name,
    sceneType,
    notes: '',
    audio: { music: '', ambient: '', sfx: [] },
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
    titleScreen: {
      title: '',
      titleTransform: { x: 160, y: 120, width: 960, height: 110 },
      titleStyle: { fontSize: 54, color: '#f0dfb0', background: 'transparent' },
      newGame: { label: 'New Game', transform: { x: 490, y: 560, width: 300, height: 64 }, style: { fontSize: 22, color: '#eee9dc', background: '#292d35' } },
      loadGame: { label: 'Load Game', transform: { x: 490, y: 640, width: 300, height: 64 }, style: { fontSize: 22, color: '#eee9dc', background: '#292d35' } }
    },
    viewport: {
      followPlayer: true,
      zoom: 1,
      startX: 0,
      startY: 0,
      limits: { left: 0, top: 0, right: 1600, bottom: 900 }
    },
    player: { characterObjectId: '', start: { x: 220, y: 700 }, facing: 'right' },
    playerStart: { x: 220, y: 700 },
    spawnPoints: [{ id: 'default', name: 'Default', x: 220, y: 700, facing: 'right' }],
    walkAreas: [],
    depthAreas: [],
    scaleAreas: [],
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
      flipX: false, locked: false, lockAspect: true, aspectRatio: 0,
      anchor: type === 'character' ? 'bottom-center' : 'top-left', anchorX: 0.5, anchorY: type === 'character' ? 1 : 0
    },
    hotspot: { enabled: type !== 'scenery', label: name, actions: {}, shape: 'visual', bounds: { x: 0, y: 0, width: 1, height: 1 }, alphaThreshold: 8 },
    interactionPoint: { x: 210, y: 300, facingMode: 'auto', facing: 'right' },
    speechAnchor: type === 'character' ? { x: 0.5, y: -0.04 } : null,
    character: type === 'character' ? { characterId: '', displayName: name, role: 'npc', walkSpeed: 180 } : null,
    exit: type === 'exit' ? { destinationSceneId: '', spawnPointId: 'default', transition: 'fade', walkFirst: true, availabilityRuleId: '', hiddenUntilAvailable: false, blockedMessage: 'You cannot go there yet.' } : null,
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
  const names = { walk: 'Walk area', depth: 'Depth area', scale: 'Scale area' };
  return {
    id: uniqueId(kind),
    name: names[kind] || 'Area',
    enabled: true,
    z: kind === 'depth' ? 30 : undefined,
    topScale: kind === 'scale' ? 0.6 : undefined,
    bottomScale: kind === 'scale' ? 1 : undefined,
    points: []
  };
}
