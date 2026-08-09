import React, { useMemo, useRef, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { createDialogueConfig, createDialogueNode } from '../lib/schema.js';

function edgePath(from, to) {
  const x1 = from.x + 300;
  const y1 = from.y + 55;
  const x2 = to.x;
  const y2 = to.y + 55;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export default function DialogueEditor({ sceneId, objects, dialogues, onChangeDialogues, onImport, onExport }) {
  const characters = useMemo(() => objects.filter((obj) => obj.type === 'character' && obj.character), [objects]);
  const [characterId, setCharacterId] = useState(characters[0]?.character.characterId || '');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const boardRef = useRef(null);

  const activeCharacter = characters.find((obj) => obj.character.characterId === characterId) || characters[0] || null;
  const activeDialogue = activeCharacter ? dialogues.find((dialogue) => dialogue.characterId === activeCharacter.character.characterId) || null : null;
  const selectedNode = activeDialogue?.nodes.find((node) => node.id === selectedNodeId) || activeDialogue?.nodes[0] || null;

  function ensureDialogue() {
    if (!activeCharacter) return;
    if (activeDialogue) return activeDialogue;
    const dialogue = createDialogueConfig(sceneId, activeCharacter.character.characterId, activeCharacter.character.displayName || activeCharacter.name);
    onChangeDialogues([...dialogues, dialogue]);
    setSelectedNodeId(dialogue.entryNodeId);
    return dialogue;
  }

  function updateDialogue(next) {
    onChangeDialogues(dialogues.map((dialogue) => dialogue.characterId === next.characterId ? next : dialogue));
  }

  function addNode() {
    const dialogue = activeDialogue || ensureDialogue();
    if (!dialogue) return;
    const node = createDialogueNode(dialogue.displayName);
    node.x = 120 + dialogue.nodes.length * 35;
    node.y = 120 + dialogue.nodes.length * 28;
    const next = { ...dialogue, nodes: [...dialogue.nodes, node] };
    if (activeDialogue) updateDialogue(next);
    else onChangeDialogues([...dialogues.filter((d) => d.characterId !== dialogue.characterId), next]);
    setSelectedNodeId(node.id);
  }

  function updateNode(nextNode) {
    if (!activeDialogue) return;
    updateDialogue({ ...activeDialogue, nodes: activeDialogue.nodes.map((node) => node.id === nextNode.id ? nextNode : node) });
  }

  function beginDrag(event, node) {
    event.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const origin = { x: node.x, y: node.y };
    const move = (ev) => updateNode({ ...node, x: Math.max(0, Math.round(origin.x + ev.clientX - rect.left - start.x)), y: Math.max(0, Math.round(origin.y + ev.clientY - rect.top - start.y)) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function removeNode() {
    if (!activeDialogue || !selectedNode) return;
    const remaining = activeDialogue.nodes.filter((node) => node.id !== selectedNode.id).map((node) => ({ ...node, choices: node.choices.filter((choice) => choice.targetNodeId !== selectedNode.id) }));
    updateDialogue({ ...activeDialogue, nodes: remaining, entryNodeId: activeDialogue.entryNodeId === selectedNode.id ? (remaining[0]?.id || '') : activeDialogue.entryNodeId });
    setSelectedNodeId(remaining[0]?.id || '');
  }

  if (characters.length === 0) {
    return <div className="dialogue-empty-state"><h2>No characters in this scene</h2><p>Tag a visual object as <strong>character</strong> in Visual Config. SCEMQ will then offer a scene-scoped dialogue file for it here.</p></div>;
  }

  const dialogue = activeDialogue;
  const nodesById = Object.fromEntries((dialogue?.nodes || []).map((node) => [node.id, node]));

  return (
    <div className="dialogue-layout">
      <section className="character-rail">
        <div className="rail-title">Characters</div>
        {characters.map((obj) => {
          const id = obj.character.characterId;
          const hasDialogue = dialogues.some((d) => d.characterId === id);
          return <button key={id} className={`character-row ${activeCharacter?.character.characterId === id ? 'active' : ''}`} onClick={() => { setCharacterId(id); setSelectedNodeId(''); }}><span>{obj.character.displayName || obj.name}</span><small>{hasDialogue ? `${id}.dialogue.${sceneId}.json` : 'No dialogue file yet'}</small></button>;
        })}
        <button onClick={onImport}>Import dialogue JSON</button>
      </section>

      <section className="dialogue-board-shell">
        <div className="toolbar">
          <div className="toolbar-group"><strong>{activeCharacter?.character.displayName}</strong>{dialogue && <span className="file-pill">{dialogue.characterId}.dialogue.{sceneId}.json</span>}</div>
          <div className="toolbar-group">
            {!dialogue && <button className="primary-soft" onClick={ensureDialogue}>Create dialogue</button>}
            {dialogue && <><button onClick={addNode}>+ Node</button><button onClick={() => onExport(dialogue)}>Export dialogue</button></>}
          </div>
        </div>
        {!dialogue ? <div className="empty-panel centered">This character has no dialogue in {sceneId} yet.</div> : (
          <div className="dialogue-board-scroll">
            <div className="dialogue-board" ref={boardRef}>
              <svg className="dialogue-edges" width="2200" height="1400">
                {dialogue.nodes.flatMap((node) => node.choices.map((choice) => {
                  const target = nodesById[choice.targetNodeId];
                  if (!target) return null;
                  return <path key={`${node.id}-${choice.id}`} d={edgePath(node, target)} />;
                }))}
              </svg>
              {dialogue.nodes.map((node) => (
                <div key={node.id} className={`dialogue-node ${selectedNode?.id === node.id ? 'selected' : ''}`} style={{ left: node.x, top: node.y }} onPointerDown={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); beginDrag(e, node); }}>
                  <div className="node-speaker">{node.speaker}</div>
                  <div className="node-text">{node.text}</div>
                  <div className="node-footer">{node.id === dialogue.entryNodeId ? 'ENTRY · ' : ''}{node.choices.length} choice{node.choices.length === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="inspector dialogue-inspector">
        <div className="inspector-title">Dialogue inspector</div>
        {!selectedNode || !dialogue ? <div className="empty-inspector">Select a dialogue node.</div> : (
          <>
            <div className="object-title-row"><div><strong>{selectedNode.id}</strong><small>{selectedNode.id === dialogue.entryNodeId ? 'Entry node' : 'Dialogue node'}</small></div><button className="danger-ghost" onClick={removeNode}>Delete</button></div>
            <button className="wide-button" disabled={selectedNode.id === dialogue.entryNodeId} onClick={() => updateDialogue({ ...dialogue, entryNodeId: selectedNode.id })}>Set as entry node</button>
            <InspectorField label="Speaker"><input value={selectedNode.speaker} onChange={(e) => updateNode({ ...selectedNode, speaker: e.target.value })} /></InspectorField>
            <InspectorField label="Line"><textarea rows="5" value={selectedNode.text} onChange={(e) => updateNode({ ...selectedNode, text: e.target.value })} /></InspectorField>
            <div className="inspector-divider" />
            <div className="section-heading-row"><span className="inspector-subtitle">Player choices</span><button className="small-button" onClick={() => updateNode({ ...selectedNode, choices: [...selectedNode.choices, { id: `choice-${selectedNode.choices.length + 1}`, text: 'New choice', targetNodeId: '', condition: '', actions: [] }] })}>+ Choice</button></div>
            {selectedNode.choices.length === 0 && <div className="linked-note">No choices: this node ends unless logic continues the conversation.</div>}
            {selectedNode.choices.map((choice, index) => (
              <div className="choice-editor" key={choice.id}>
                <div className="choice-head"><strong>Choice {index + 1}</strong><button className="icon-button" onClick={() => updateNode({ ...selectedNode, choices: selectedNode.choices.filter((_, i) => i !== index) })}>×</button></div>
                <textarea rows="2" value={choice.text} onChange={(e) => updateNode({ ...selectedNode, choices: selectedNode.choices.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} />
                <select value={choice.targetNodeId || ''} onChange={(e) => updateNode({ ...selectedNode, choices: selectedNode.choices.map((item, i) => i === index ? { ...item, targetNodeId: e.target.value } : item) })}>
                  <option value="">End / no target</option>
                  {dialogue.nodes.filter((node) => node.id !== selectedNode.id).map((node) => <option key={node.id} value={node.id}>{node.id}: {node.text.slice(0, 40)}</option>)}
                </select>
                <input value={choice.condition || ''} onChange={(e) => updateNode({ ...selectedNode, choices: selectedNode.choices.map((item, i) => i === index ? { ...item, condition: e.target.value } : item) })} placeholder="Optional condition expression / flag" />
              </div>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
