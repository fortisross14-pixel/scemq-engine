import { uniqueId } from './id.js';

function characterByLabel(characters, label) {
  const clean = String(label || '').trim().toLowerCase();
  if (!clean) return null;
  return characters.find(c => c.id.toLowerCase() === clean || c.name.toLowerCase() === clean) || null;
}

function parseLegacyBeats(node, characters, fallbackCharacterId) {
  if (Array.isArray(node.beats) && node.beats.length) {
    return node.beats.map(beat => {
      const known = characters.some(c => c.id === beat.speakerId);
      if (!known) throw new Error(`Dialogue beat references unknown project character "${beat.speakerId || '(blank)'}".`);
      return { id: beat.id || uniqueId('beat'), speakerId: beat.speakerId, text: String(beat.text || '') };
    });
  }

  const raw = String(node.text || '').trim();
  const chunks = raw.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const parsed = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^([^:\n]{1,80}):\s*([\s\S]*)$/);
    if (!match) continue;
    const speaker = characterByLabel(characters, match[1]);
    if (speaker) parsed.push({ id: uniqueId('beat'), speakerId: speaker.id, text: match[2].trim() });
  }
  if (parsed.length) return parsed;

  const legacySpeaker = characterByLabel(characters, node.speaker);
  return [{ id: uniqueId('beat'), speakerId: legacySpeaker?.id || fallbackCharacterId, text: raw || 'New dialogue.' }];
}

export function normalizeDialogueConfig(dialogue, characters, targetCharacterId = null) {
  const target = targetCharacterId || dialogue.characterId;
  if (!characters.some(c => c.id === target)) throw new Error(`Dialogue target "${target}" is not in the project character list.`);
  const displayName = characters.find(c => c.id === target)?.name || dialogue.displayName || target;
  return {
    ...dialogue,
    schemaVersion: '0.4',
    kind: 'scemq-scene-dialogue',
    characterId: target,
    displayName,
    nodes: (dialogue.nodes || []).map(node => ({
      id: node.id,
      x: Number(node.x || 0),
      y: Number(node.y || 0),
      beats: parseLegacyBeats(node, characters, target),
      choices: (node.choices || []).map(choice => ({ ...choice, actions: choice.actions || [] }))
    }))
  };
}

export function dialogueSpeakersAreValid(dialogue, characters) {
  const ids = new Set(characters.map(c => c.id));
  return (dialogue.nodes || []).every(node => (node.beats || []).every(beat => ids.has(beat.speakerId)));
}

export function resolveDialogueStartNode(dialogue, requestedNodeId = '') {
  if (!dialogue) return '';
  if (requestedNodeId && (dialogue.nodes || []).some(node => node.id === requestedNodeId)) return requestedNodeId;
  return dialogue.entryNodeId || dialogue.nodes?.[0]?.id || '';
}


export function createDialogueRuntimeState(dialogue, nodeId) {
  if (!dialogue || !nodeId) return null;
  const node = (dialogue.nodes || []).find(item => item.id === nodeId);
  if (!node) return null;
  const beats = node.beats || [];
  return { data: dialogue, nodeId, beatIndex: 0, awaitingChoice: beats.length === 0 };
}

export function advanceDialogueRuntimeState(state, node, visibleChoiceCount = 0) {
  if (!state || !node || state.awaitingChoice) return state;
  const beats = node.beats || [];
  const index = Number(state.beatIndex || 0);
  if (index < beats.length - 1) return { ...state, beatIndex: index + 1 };
  if (visibleChoiceCount > 0) return { ...state, awaitingChoice: true };
  return null;
}

export function moveDialogueRuntimeToNode(state, dialogue, targetNodeId) {
  if (!state || !dialogue || !targetNodeId) return null;
  const node = (dialogue.nodes || []).find(item => item.id === targetNodeId);
  if (!node) return null;
  return { ...state, nodeId: targetNodeId, beatIndex: 0, awaitingChoice: (node.beats || []).length === 0 };
}
