import { OBJECT_ACTION_TYPES } from './schema.js';

function issue(level, code, message, extra = {}) {
  return { level, code, message, ...extra };
}

function allActions(bundle) {
  const out = [];
  for (const rule of bundle?.logic?.rules || []) {
    for (const [index, action] of (rule.actions || []).entries()) out.push({ action, rule, index, origin: 'rule' });
  }
  for (const dialogue of bundle?.dialogues || []) {
    for (const node of dialogue.nodes || []) {
      for (const choice of node.choices || []) {
        for (const [index, action] of (choice.actions || []).entries()) out.push({ action, dialogue, node, choice, index, origin: 'dialogue' });
      }
    }
  }
  return out;
}

function reachableDialogueNodes(dialogue) {
  const nodes = new Map((dialogue.nodes || []).map((node) => [node.id, node]));
  const start = dialogue.entryNodeId || dialogue.nodes?.[0]?.id;
  const seen = new Set();
  const queue = start ? [start] : [];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id) || !nodes.has(id)) continue;
    seen.add(id);
    for (const choice of nodes.get(id).choices || []) if (choice.targetNodeId) queue.push(choice.targetNodeId);
  }
  return seen;
}

// Scene reachability follows both authored exits and changeScene actions,
// because either can be the real route between two rooms.
function sceneGraph(scenes) {
  const edges = new Map();
  for (const { ref, bundle } of scenes) {
    const targets = new Set();
    for (const object of bundle.objects || []) {
      if (object.type === 'exit' && object.exit?.destinationSceneId) targets.add(object.exit.destinationSceneId);
    }
    for (const { action } of allActions(bundle)) {
      if (action.type === 'changeScene' && (action.value || action.targetId)) targets.add(String(action.value || action.targetId));
    }
    edges.set(ref.id, targets);
  }
  return edges;
}

export function validateProject({ project, projectData, scenes = [] }) {
  const issues = [];
  const settings = projectData?.settings || {};
  const characters = projectData?.characters || [];
  const items = projectData?.inventory || [];
  const globalVariables = projectData?.variables?.variables || [];
  const characterIds = new Set(characters.map((c) => c.id));
  const itemIds = new Set(items.map((i) => i.id));
  const sceneIds = new Set((project?.scenes || []).map((s) => s.id));
  const globalVariableIds = new Set(globalVariables.map((v) => v.id));

  const startSceneId = settings.defaultSceneId
    || (project?.scenes || []).find((scene) => scene.id !== settings.titleSceneId && scene.sceneType !== 'title')?.id
    || '';
  if (!startSceneId) issues.push(issue('error', 'no-start-scene', 'No New Game start scene is configured, so the game cannot begin.'));

  const flagsSet = new Set();
  const flagsRead = new Set();
  const itemSources = new Map();
  const itemRemovals = new Map();

  for (const item of items) {
    if (item.initiallyOwned) itemSources.set(item.id, ['starting inventory']);
    for (const combo of item.combinations || []) {
      if (!combo.resultItemId) continue;
      itemSources.set(combo.resultItemId, [...(itemSources.get(combo.resultItemId) || []), `recipe on ${item.id}`]);
      if (combo.consumeSelf !== false) itemRemovals.set(item.id, [...(itemRemovals.get(item.id) || []), `consumed by recipe on ${item.id}`]);
      if (combo.consumeOther !== false && combo.withItemId) itemRemovals.set(combo.withItemId, [...(itemRemovals.get(combo.withItemId) || []), `consumed by recipe on ${item.id}`]);
    }
  }

  for (const { ref, bundle } of scenes) {
    const sceneId = ref.id;
    const where = { sceneId, sceneName: ref.name };
    const objectIds = new Set((bundle.objects || []).map((o) => o.id));
    const ruleIds = new Set((bundle.logic?.rules || []).map((r) => r.id));
    const localVariableIds = new Set((bundle.logic?.variables || []).map((v) => v.id));
    const knownVariable = (id) => globalVariableIds.has(id) || localVariableIds.has(id);
    const isTitle = bundle.meta?.sceneType === 'title';

    if (!isTitle) {
      const playerObject = (bundle.objects || []).find((o) => o.id === bundle.visual?.player?.characterObjectId)
        || (bundle.objects || []).find((o) => o.type === 'character' && o.character?.role === 'playable');
      if (!playerObject) issues.push(issue('error', 'no-playable-character', `Scene "${ref.name}" has no playable character object.`, where));
      if (!(bundle.visual?.walkAreas || []).some((area) => area.enabled !== false && area.points?.length >= 3)) {
        issues.push(issue('warning', 'no-walk-area', `Scene "${ref.name}" has no walk area, so the character can walk anywhere.`, where));
      }
      if (!(bundle.visual?.scaleAreas || []).length) {
        issues.push(issue('info', 'no-scale-area', `Scene "${ref.name}" has no scale areas, so the character never changes size with depth.`, where));
      }
    }

    for (const object of bundle.objects || []) {
      if (object.type === 'character' && !characterIds.has(object.character?.characterId)) {
        issues.push(issue('error', 'missing-character', `Object "${object.name}" points at character "${object.character?.characterId || '(blank)'}" which no longer exists.`, { ...where, objectId: object.id }));
      }
      if (object.type === 'exit') {
        const destination = object.exit?.destinationSceneId;
        if (!destination) issues.push(issue('warning', 'exit-no-destination', `Exit "${object.name}" has no destination scene.`, { ...where, objectId: object.id }));
        else if (!sceneIds.has(destination)) issues.push(issue('error', 'exit-bad-destination', `Exit "${object.name}" points at missing scene "${destination}".`, { ...where, objectId: object.id }));
        if (object.exit?.availabilityRuleId && !ruleIds.has(object.exit.availabilityRuleId)) {
          issues.push(issue('error', 'exit-bad-rule', `Exit "${object.name}" is gated by a rule that no longer exists.`, { ...where, objectId: object.id }));
        }
      }
      for (const [verb, binding] of Object.entries(object.hotspot?.actions || {})) {
        if (binding?.ruleId && !ruleIds.has(binding.ruleId)) {
          issues.push(issue('error', 'binding-bad-rule', `"${object.name}" binds ${verb} to a rule that no longer exists.`, { ...where, objectId: object.id }));
        }
        if (binding?.dialogueId && !(bundle.dialogues || []).some((d) => d.characterId === binding.dialogueId)) {
          issues.push(issue('error', 'binding-bad-dialogue', `"${object.name}" binds ${verb} to a dialogue that does not exist in this scene.`, { ...where, objectId: object.id }));
        }
      }
    }

    for (const rule of bundle.logic?.rules || []) {
      const ruleWhere = { ...where, ruleId: rule.id, ruleName: rule.name };
      if (rule.event?.targetType === 'object' && rule.event.targetId && !objectIds.has(rule.event.targetId)) {
        issues.push(issue('error', 'rule-bad-target', `Rule "${rule.name}" listens to object "${rule.event.targetId}" which no longer exists.`, ruleWhere));
      }
      if (rule.event?.targetType === 'inventory' && rule.event.targetId && !itemIds.has(rule.event.targetId)) {
        issues.push(issue('error', 'rule-bad-item', `Rule "${rule.name}" listens to item "${rule.event.targetId}" which no longer exists.`, ruleWhere));
      }
      if (rule.event?.itemId && !itemIds.has(rule.event.itemId)) {
        issues.push(issue('error', 'rule-bad-item', `Rule "${rule.name}" requires item "${rule.event.itemId}" which no longer exists.`, ruleWhere));
      }
      for (const condition of rule.conditions || []) {
        if (condition.left === 'item' && condition.key && !itemIds.has(condition.key)) {
          issues.push(issue('error', 'condition-bad-item', `Rule "${rule.name}" checks missing item "${condition.key}".`, ruleWhere));
        }
        if (condition.left === 'variable' && condition.key && !knownVariable(condition.key)) {
          issues.push(issue('error', 'condition-bad-variable', `Rule "${rule.name}" checks undefined variable "${condition.key}".`, ruleWhere));
        }
        if (condition.left === 'state' && condition.key && !objectIds.has(condition.key)) {
          issues.push(issue('error', 'condition-bad-object', `Rule "${rule.name}" checks the state of missing object "${condition.key}".`, ruleWhere));
        }
        if (condition.left === 'flag' && condition.key) flagsRead.add(condition.key);
        if (condition.left === 'item' && condition.key) {
          if (!itemSources.has(condition.key)) itemSources.set(condition.key, itemSources.get(condition.key) || []);
        }
      }
    }

    for (const dialogue of bundle.dialogues || []) {
      if (!characterIds.has(dialogue.characterId)) {
        issues.push(issue('error', 'dialogue-bad-character', `Dialogue for "${dialogue.characterId}" has no matching project character.`, where));
      }
      const nodeIds = new Set((dialogue.nodes || []).map((n) => n.id));
      const reachable = reachableDialogueNodes(dialogue);
      for (const node of dialogue.nodes || []) {
        if (!reachable.has(node.id)) {
          issues.push(issue('warning', 'dialogue-orphan-node', `Dialogue node "${node.id}" (${dialogue.characterId}) cannot be reached from the entry node.`, where));
        }
        for (const choice of node.choices || []) {
          if (choice.targetNodeId && !nodeIds.has(choice.targetNodeId)) {
            issues.push(issue('error', 'dialogue-bad-target', `A choice in "${dialogue.characterId}" points at missing node "${choice.targetNodeId}".`, where));
          }
        }
        for (const beat of node.beats || []) {
          if (!characterIds.has(beat.speakerId)) {
            issues.push(issue('error', 'dialogue-bad-speaker', `A beat in "${dialogue.characterId}" is spoken by missing character "${beat.speakerId || '(blank)'}".`, where));
          }
        }
      }
    }

    for (const entry of allActions(bundle)) {
      const { action } = entry;
      const label = entry.origin === 'rule' ? `Rule "${entry.rule.name}"` : `A dialogue choice in "${entry.dialogue.characterId}"`;
      const actionWhere = { ...where, ruleId: entry.rule?.id };
      const key = action.targetId || '';
      if (action.type === 'giveItem') {
        const id = key || action.value;
        if (id && !itemIds.has(id)) issues.push(issue('error', 'action-bad-item', `${label} gives missing item "${id}".`, actionWhere));
        if (id) itemSources.set(id, [...(itemSources.get(id) || []), `${label} in ${ref.name}`]);
      }
      if (action.type === 'removeItem') {
        const id = key || action.value;
        if (id && !itemIds.has(id)) issues.push(issue('error', 'action-bad-item', `${label} removes missing item "${id}".`, actionWhere));
        if (id) itemRemovals.set(id, [...(itemRemovals.get(id) || []), `${label} in ${ref.name}`]);
      }
      if (action.type === 'setFlag' && key) flagsSet.add(key);
      if (action.type === 'setVariable' && key && !knownVariable(key)) {
        issues.push(issue('error', 'action-bad-variable', `${label} writes undefined variable "${key}".`, actionWhere));
      }
      if (action.type === 'changeScene') {
        const destination = String(action.value || key || '');
        if (!destination) issues.push(issue('warning', 'action-no-scene', `${label} has a changeScene with no destination.`, actionWhere));
        else if (!sceneIds.has(destination)) issues.push(issue('error', 'action-bad-scene', `${label} changes to missing scene "${destination}".`, actionWhere));
      }
      if (['startDialogue', 'playAnimation', 'faceCharacter', 'moveCharacterTo', 'switchPlayerCharacter'].includes(action.type)) {
        const id = key || (action.type === 'switchPlayerCharacter' ? action.value : '');
        if (id && !characterIds.has(id) && !objectIds.has(id)) {
          issues.push(issue('error', 'action-bad-character', `${label} targets missing character "${id}".`, actionWhere));
        }
        if (action.type === 'startDialogue' && id && !(bundle.dialogues || []).some((d) => d.characterId === id)) {
          issues.push(issue('warning', 'action-no-dialogue', `${label} starts dialogue for "${id}", which has no dialogue file in this scene.`, actionWhere));
        }
        if (action.type === 'playAnimation' && id) {
          const character = characters.find((c) => c.id === id);
          const name = String(action.value || '');
          if (character && name && !character.animations?.[name]) {
            issues.push(issue('warning', 'action-bad-animation', `${label} plays animation "${name}" which "${id}" does not have.`, actionWhere));
          }
        }
        if (action.type === 'switchPlayerCharacter' && id) {
          const character = characters.find((c) => c.id === id);
          if (character && !character.playable) {
            issues.push(issue('error', 'switch-not-playable', `${label} switches to "${id}", which is not marked playable.`, actionWhere));
          }
        }
      }
      if (OBJECT_ACTION_TYPES.includes(action.type) && key && !objectIds.has(key)) {
        issues.push(issue('error', 'action-bad-object', `${label} targets missing object "${key}".`, actionWhere));
      }
      if (action.type === 'playSound' || action.type === 'playMusic') {
        const path = String(action.value || '');
        if (path && !(bundle.sounds || []).includes(path) && bundle.meta?.audio?.music !== path && bundle.meta?.audio?.ambient !== path) {
          issues.push(issue('warning', 'action-missing-sound', `${label} plays "${path}", which is not in this scene's assets folder.`, actionWhere));
        }
      }
    }
  }

  // Reachability from the New Game scene.
  if (startSceneId) {
    const edges = sceneGraph(scenes);
    const seen = new Set();
    const queue = [startSceneId];
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const next of edges.get(id) || []) queue.push(next);
    }
    for (const { ref, bundle } of scenes) {
      if (bundle.meta?.sceneType === 'title' || ref.id === settings.titleSceneId) continue;
      if (!seen.has(ref.id)) issues.push(issue('warning', 'unreachable-scene', `Scene "${ref.name}" cannot be reached from the New Game scene by any exit or changeScene.`, { sceneId: ref.id, sceneName: ref.name }));
    }
  }

  // Items nothing can ever hand the player.
  for (const item of items) {
    const sources = itemSources.get(item.id) || [];
    if (!sources.length) issues.push(issue('warning', 'unobtainable-item', `Item "${item.name}" is never given to the player and is not owned at the start.`, { itemId: item.id }));
    if (item.critical && (itemRemovals.get(item.id) || []).length) {
      issues.push(issue('warning', 'critical-item-removed', `Story-critical item "${item.name}" can be removed or consumed (${itemRemovals.get(item.id).length} place(s)). Check that this cannot make the game unwinnable.`, { itemId: item.id }));
    }
  }

  for (const flag of flagsRead) {
    if (!flagsSet.has(flag)) issues.push(issue('warning', 'flag-never-set', `Flag "${flag}" is tested but nothing ever sets it, so that branch can never open.`, { flag }));
  }

  return {
    issues,
    counts: {
      error: issues.filter((i) => i.level === 'error').length,
      warning: issues.filter((i) => i.level === 'warning').length,
      info: issues.filter((i) => i.level === 'info').length
    }
  };
}
