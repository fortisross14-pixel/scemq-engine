import { SCHEMA_VERSION } from './schema.js';

export const SCENE_PACKAGE_VERSION = 1;

function actionRefs(actions = [], refs) {
  for (const action of actions || []) {
    if (!action) continue;
    if (action.type === 'giveItem' || action.type === 'removeItem') refs.inventory.add(action.targetId || action.value || '');
    if (action.type === 'startDialogue') refs.characters.add(action.targetId || '');
    if (action.type === 'setVariable') refs.variables.add(action.targetId || '');
    if (action.type === 'changeScene') refs.scenes.add(action.value || action.targetId || '');
  }
}

function conditionRefs(conditions = [], refs) {
  for (const condition of conditions || []) {
    if (!condition) continue;
    if (condition.left === 'item') refs.inventory.add(condition.key || '');
    if (condition.left === 'variable') refs.variables.add(condition.key || '');
  }
}

export function collectSceneReferences(scene = {}) {
  const refs = { characters: new Set(), inventory: new Set(), variables: new Set(), scenes: new Set() };
  const localVariables = new Set((scene.logic?.variables || []).map(v => v.id));

  for (const object of scene.objects || []) {
    if (object.type === 'character' && object.character?.characterId) refs.characters.add(object.character.characterId);
    if (object.type === 'exit' && object.exit?.destinationSceneId) refs.scenes.add(object.exit.destinationSceneId);
  }

  for (const rule of scene.logic?.rules || []) {
    const event = rule.event || {};
    if (event.type === 'onInventoryCombine') {
      if (event.itemId) refs.inventory.add(event.itemId);
      if (event.targetId) refs.inventory.add(event.targetId);
    } else if (event.itemId) refs.inventory.add(event.itemId);
    conditionRefs(rule.conditions, refs);
    actionRefs(rule.actions, refs);
  }

  for (const dialogue of scene.dialogues || []) {
    if (dialogue.characterId) refs.characters.add(dialogue.characterId);
    for (const node of dialogue.nodes || []) {
      for (const beat of node.beats || []) if (beat.speakerId) refs.characters.add(beat.speakerId);
      for (const choice of node.choices || []) {
        if (choice.condition) conditionRefs([choice.condition], refs);
        actionRefs(choice.actions, refs);
      }
    }
  }

  for (const id of localVariables) refs.variables.delete(id);
  for (const set of Object.values(refs)) set.delete('');
  return refs;
}

export function createScenePackage({ scene, projectData, project }) {
  const refs = collectSceneReferences(scene);
  const inventoryById = new Map((projectData.inventory || []).map(item => [item.id, item]));
  const inventoryIds = new Set(refs.inventory);
  // Include directly referenced recipe dependencies so a portable package can reproduce combinations.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...inventoryIds]) {
      const item = inventoryById.get(id);
      for (const combo of item?.combinations || []) {
        for (const dep of [combo.withItemId, combo.resultItemId]) {
          if (dep && !inventoryIds.has(dep)) { inventoryIds.add(dep); changed = true; }
        }
      }
    }
  }

  const dependencies = {
    characters: (projectData.characters || []).filter(c => refs.characters.has(c.id)),
    inventory: (projectData.inventory || []).filter(i => inventoryIds.has(i.id)),
    variables: (projectData.variables?.variables || []).filter(v => refs.variables.has(v.id))
  };
  const sceneIds = new Set((project?.scenes || []).map(s => s.id));
  const softScenes = [...refs.scenes].filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'scemq-scene-package',
    packageVersion: SCENE_PACKAGE_VERSION,
    sceneId: scene.meta?.sceneId || scene.visual?.sceneId || scene.logic?.sceneId || '',
    name: scene.meta?.name || 'Imported Scene',
    exportedAt: new Date().toISOString(),
    dependencies,
    softDependencies: { scenes: softScenes.map(id => ({ id, resolvedAtExport: sceneIds.has(id) })) },
    scene: {
      meta: scene.meta,
      visual: scene.visual,
      logic: scene.logic,
      objects: scene.objects || [],
      dialogues: scene.dialogues || []
    },
    assets: []
  };
}

function knownIds(list = []) { return new Set(list.map(value => value.id)); }

export function analyzeScenePackage(pkg, project = {}, projectData = {}) {
  const errors = [];
  if (!pkg || pkg.kind !== 'scemq-scene-package') errors.push('File is not a SCEMQ scene package.');
  if (Number(pkg?.packageVersion || 0) !== SCENE_PACKAGE_VERSION) errors.push(`Unsupported scene package version ${pkg?.packageVersion ?? '(missing)'}.`);
  if (!pkg?.sceneId) errors.push('Scene package has no sceneId.');
  if (!pkg?.scene?.meta || !pkg?.scene?.visual || !pkg?.scene?.logic) errors.push('Scene package is missing meta, visual, or logic data.');

  const refs = collectSceneReferences(pkg?.scene || {});
  const includedCharacters = knownIds(pkg?.dependencies?.characters || []);
  const includedInventory = knownIds(pkg?.dependencies?.inventory || []);
  const includedVariables = knownIds(pkg?.dependencies?.variables || []);
  const existingCharacters = knownIds(projectData.characters || []);
  const existingInventory = knownIds(projectData.inventory || []);
  const existingVariables = knownIds(projectData.variables?.variables || []);
  const localVariables = knownIds(pkg?.scene?.logic?.variables || []);

  const requiredInventory = new Set(refs.inventory);
  for (const item of pkg?.dependencies?.inventory || []) for (const combo of item.combinations || []) for (const id of [combo.withItemId, combo.resultItemId]) if (id) requiredInventory.add(id);
  const missingCharacterDefinitions = [...refs.characters].filter(id => !existingCharacters.has(id) && !includedCharacters.has(id));
  const missingInventoryDefinitions = [...requiredInventory].filter(id => !existingInventory.has(id) && !includedInventory.has(id));
  const missingVariableDefinitions = [...refs.variables].filter(id => !localVariables.has(id) && !existingVariables.has(id) && !includedVariables.has(id));
  if (missingCharacterDefinitions.length) errors.push(`Missing character definitions: ${missingCharacterDefinitions.join(', ')}`);
  if (missingInventoryDefinitions.length) errors.push(`Missing inventory definitions: ${missingInventoryDefinitions.join(', ')}`);
  if (missingVariableDefinitions.length) errors.push(`Missing global variable definitions: ${missingVariableDefinitions.join(', ')}`);

  const objects = pkg?.scene?.objects || [];
  const objectIds = new Set(objects.map(o => o.id));
  for (const ref of pkg?.scene?.visual?.objectRefs || []) if (!objectIds.has(ref)) errors.push(`Visual config references missing object "${ref}".`);
  const playerObjectId = pkg?.scene?.visual?.player?.characterObjectId;
  if (playerObjectId && !objectIds.has(playerObjectId)) errors.push(`Playable character object "${playerObjectId}" is missing.`);
  const dialogueMap = new Map((pkg?.scene?.dialogues || []).map(d => [d.characterId, d]));
  const checkActions = (actions = []) => {
    for (const action of actions || []) {
      if (action?.type === 'startDialogue') {
        const dialogue = dialogueMap.get(action.targetId);
        if (!dialogue) errors.push(`Start Dialogue targets "${action.targetId}" but that character has no dialogue in this scene.`);
        else if (action.value && !(dialogue.nodes || []).some(node => node.id === action.value)) errors.push(`Start Dialogue targets missing node "${action.value}" for ${action.targetId}.`);
      }
      if (action?.type === 'setVisualState') {
        const object = objects.find(o => o.id === action.targetId);
        if (!object) errors.push(`Set Visual State targets missing object "${action.targetId}".`);
        else if (action.value && !Object.hasOwn(object.asset?.states || {}, action.value)) errors.push(`Object ${action.targetId} has no visual state "${action.value}".`);
      }
    }
  };
  for (const rule of pkg?.scene?.logic?.rules || []) {
    if (rule.event?.targetType !== 'inventory' && rule.event?.targetId && !objectIds.has(rule.event.targetId)) errors.push(`Rule "${rule.name || rule.id}" targets missing object "${rule.event.targetId}".`);
    checkActions(rule.actions);
  }
  for (const dialogue of pkg?.scene?.dialogues || []) for (const node of dialogue.nodes || []) for (const choice of node.choices || []) checkActions(choice.actions);

  const scenes = knownIds(project.scenes || []);
  return {
    errors,
    sceneConflict: scenes.has(pkg?.sceneId),
    dependencies: {
      characters: (pkg?.dependencies?.characters || []).map(c => ({ id: c.id, name: c.name || c.id, status: existingCharacters.has(c.id) ? 'reuse' : 'create' })),
      inventory: (pkg?.dependencies?.inventory || []).map(i => ({ id: i.id, name: i.name || i.id, status: existingInventory.has(i.id) ? 'reuse' : 'create' })),
      variables: (pkg?.dependencies?.variables || []).map(v => ({ id: v.id, name: v.name || v.id, status: existingVariables.has(v.id) ? 'reuse' : 'create' }))
    },
    softScenes: [...refs.scenes].map(id => ({ id, status: scenes.has(id) ? 'resolved' : 'unresolved' }))
  };
}

function remapAction(action, oldId, newId) {
  if (!action || action.type !== 'changeScene') return action;
  return { ...action, value: action.value === oldId ? newId : action.value };
}

export function remapScenePackage(pkg, newSceneId) {
  const oldId = pkg.sceneId;
  if (!newSceneId || newSceneId === oldId) return structuredClone(pkg);
  const copy = structuredClone(pkg);
  copy.sceneId = newSceneId;
  const scene = copy.scene;
  scene.meta = { ...scene.meta, sceneId: newSceneId };
  scene.visual = { ...scene.visual, sceneId: newSceneId };
  scene.logic = {
    ...scene.logic,
    sceneId: newSceneId,
    rules: (scene.logic.rules || []).map(rule => ({ ...rule, actions: (rule.actions || []).map(a => remapAction(a, oldId, newSceneId)) }))
  };
  scene.objects = (scene.objects || []).map(object => ({
    ...object,
    sceneId: newSceneId,
    exit: object.exit ? { ...object.exit, destinationSceneId: object.exit.destinationSceneId === oldId ? newSceneId : object.exit.destinationSceneId } : object.exit
  }));
  scene.dialogues = (scene.dialogues || []).map(dialogue => ({
    ...dialogue,
    sceneId: newSceneId,
    nodes: (dialogue.nodes || []).map(node => ({
      ...node,
      choices: (node.choices || []).map(choice => ({ ...choice, actions: (choice.actions || []).map(a => remapAction(a, oldId, newSceneId)) }))
    }))
  }));
  if (copy.softDependencies?.scenes) copy.softDependencies.scenes = copy.softDependencies.scenes.map(s => typeof s === 'string' ? (s === oldId ? newSceneId : s) : ({ ...s, id: s.id === oldId ? newSceneId : s.id }));
  return copy;
}

export function mergeDependencies(projectData, pkg) {
  const dep = pkg.dependencies || {};
  const characters = [...(projectData.characters || [])];
  for (const value of dep.characters || []) if (!characters.some(x => x.id === value.id)) characters.push({ ...value, schemaVersion: SCHEMA_VERSION });
  const inventory = [...(projectData.inventory || [])];
  for (const value of dep.inventory || []) if (!inventory.some(x => x.id === value.id)) inventory.push({ ...value, schemaVersion: SCHEMA_VERSION });
  const global = [...(projectData.variables?.variables || [])];
  for (const value of dep.variables || []) if (!global.some(x => x.id === value.id)) global.push(value);
  return { ...projectData, characters, inventory, variables: { ...(projectData.variables || {}), schemaVersion: SCHEMA_VERSION, variables: global } };
}
