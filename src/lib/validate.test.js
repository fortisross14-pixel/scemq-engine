import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './validate.js';

function baseProjectData(overrides = {}) {
  return {
    settings: { defaultSceneId: 'scene1', titleSceneId: '', ...(overrides.settings || {}) },
    characters: overrides.characters || [{ id: 'mara', name: 'Mara', playable: true }],
    inventory: overrides.inventory || [],
    variables: overrides.variables || { variables: [] },
    ui: overrides.ui || { elements: [] }
  };
}

// A minimally playable room: one playable actor standing on one walk area. Tests
// add the specific mistake they are checking for on top of this.
const PLAYER_OBJECT = {
  id: 'mara', name: 'Mara', type: 'character',
  character: { characterId: 'mara', role: 'playable' },
  transform: { x: 0, y: 0, width: 80, height: 160, visible: true },
  hotspot: { enabled: true, actions: {} }, asset: { states: { default: '' } }
};
const WALK_AREA = { id: 'floor', enabled: true, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }] };

function scene(id, { objects = [], rules = [], dialogues = [], sceneType = 'gameplay', name = id } = {}) {
  const all = sceneType === 'title' ? objects : [PLAYER_OBJECT, ...objects];
  return {
    ref: { id, name },
    bundle: {
      meta: { sceneId: id, sceneType },
      visual: { walkAreas: [WALK_AREA], scaleAreas: [], objectRefs: all.map((o) => o.id), player: { characterObjectId: 'mara' } },
      objects: all,
      logic: { rules, variables: [] },
      dialogues
    }
  };
}

function codes(report) {
  return report.issues.map((i) => i.code);
}

test('a coherent one-room project reports no errors', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }] },
    projectData: baseProjectData(),
    scenes: [scene('scene1')]
  });
  assert.equal(report.counts.error, 0, report.issues.map((i) => i.message).join(' | '));
});

test('an item nothing can give the player is flagged', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }] },
    projectData: baseProjectData({ inventory: [{ id: 'key', name: 'Key', initiallyOwned: false }] }),
    scenes: [scene('scene1')]
  });
  assert.ok(codes(report).includes('unobtainable-item'));
});

test('an item handed out by a rule is not flagged', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }] },
    projectData: baseProjectData({ inventory: [{ id: 'key', name: 'Key' }] }),
    scenes: [scene('scene1', { rules: [{ id: 'r1', name: 'Take key', event: {}, conditions: [], actions: [{ type: 'giveItem', targetId: 'key' }] }] })]
  });
  assert.ok(!codes(report).includes('unobtainable-item'));
});

test('a flag that is tested but never set is flagged', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }] },
    projectData: baseProjectData(),
    scenes: [scene('scene1', {
      rules: [{ id: 'r1', name: 'Gate', event: {}, conditions: [{ left: 'flag', key: 'bribedGuard', op: 'equals', value: 'true' }], actions: [] }]
    })]
  });
  assert.ok(codes(report).includes('flag-never-set'));
});

test('a story-critical item that a rule can consume raises the unwinnable warning', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }] },
    projectData: baseProjectData({ inventory: [{ id: 'idol', name: 'Idol', initiallyOwned: true, critical: true }] }),
    scenes: [scene('scene1', { rules: [{ id: 'r1', name: 'Trade idol', event: {}, conditions: [], actions: [{ type: 'removeItem', targetId: 'idol' }] }] })]
  });
  assert.ok(codes(report).includes('critical-item-removed'));
});

test('a room no exit and no changeScene reaches is flagged', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }, { id: 'scene2', name: 'Attic' }] },
    projectData: baseProjectData(),
    scenes: [scene('scene1'), scene('scene2', { name: 'Attic' })]
  });
  assert.ok(codes(report).includes('unreachable-scene'));
});

test('an exit makes the destination reachable', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }, { id: 'scene2', name: 'Attic' }] },
    projectData: baseProjectData(),
    scenes: [
      scene('scene1', { objects: [{ id: 'door', name: 'Door', type: 'exit', exit: { destinationSceneId: 'scene2' }, hotspot: {}, transform: {} }] }),
      scene('scene2', { name: 'Attic' })
    ]
  });
  assert.ok(!codes(report).includes('unreachable-scene'));
});

test('a changeScene action also counts as a route', () => {
  const report = validateProject({
    project: { scenes: [{ id: 'scene1', name: 'Room' }, { id: 'scene2', name: 'Attic' }] },
    projectData: baseProjectData(),
    scenes: [
      scene('scene1', { rules: [{ id: 'r1', name: 'Cutscene', event: {}, conditions: [], actions: [{ type: 'changeScene', value: 'scene2' }] }] }),
      scene('scene2', { name: 'Attic' })
    ]
  });
  assert.ok(!codes(report).includes('unreachable-scene'));
});

test('the report always carries counts by level', () => {
  const report = validateProject({ project: { scenes: [] }, projectData: baseProjectData(), scenes: [] });
  assert.equal(typeof report.counts.error, 'number');
  assert.equal(typeof report.counts.warning, 'number');
  assert.equal(typeof report.counts.info, 'number');
});
