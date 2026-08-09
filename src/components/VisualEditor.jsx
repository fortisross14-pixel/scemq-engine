import React, { useMemo, useRef, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { OBJECT_TYPES, VERBS, createObjectConfig } from '../lib/schema.js';
import { slugify } from '../lib/id.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export default function VisualEditor({
  sceneId,
  visual,
  objects,
  assetUrls,
  logic,
  onChangeVisual,
  onChangeObjects,
  onChooseAsset,
  onImport,
  onExport,
}) {
  const [selectedId, setSelectedId] = useState(objects[0]?.id || '');
  const [showHotspots, setShowHotspots] = useState(true);
  const [zoom, setZoom] = useState(0.72);
  const [newName, setNewName] = useState('New Prop');
  const stageRef = useRef(null);

  const selected = objects.find((item) => item.id === selectedId) || null;
  const orderedObjects = useMemo(() => [...objects].sort((a, b) => a.transform.z - b.transform.z), [objects]);

  function patchObject(id, patch) {
    onChangeObjects(objects.map((obj) => obj.id === id ? { ...obj, ...patch } : obj));
  }

  function patchTransform(id, patch) {
    const obj = objects.find((item) => item.id === id);
    if (!obj) return;
    patchObject(id, { transform: { ...obj.transform, ...patch } });
  }

  function addObject(type = 'prop') {
    let baseName = newName.trim() || 'New Object';
    const baseId = slugify(baseName, 'object');
    let id = baseId;
    let suffix = 2;
    while (objects.some((obj) => obj.id === id)) id = `${baseId}-${suffix++}`;
    const object = { ...createObjectConfig(sceneId, baseName, type), id };
    if (type === 'character') object.character = { characterId: id, displayName: baseName };
    onChangeObjects([...objects, object]);
    onChangeVisual({ ...visual, objectRefs: [...visual.objectRefs, id] });
    setSelectedId(id);
  }

  function removeSelected() {
    if (!selected) return;
    onChangeObjects(objects.filter((obj) => obj.id !== selected.id));
    onChangeVisual({ ...visual, objectRefs: visual.objectRefs.filter((id) => id !== selected.id) });
    setSelectedId('');
  }

  function stagePoint(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  }

  function beginDrag(event, obj) {
    if (event.button !== 0) return;
    event.preventDefault();
    setSelectedId(obj.id);
    const start = stagePoint(event);
    const origin = { x: obj.transform.x, y: obj.transform.y };
    const move = (ev) => {
      const point = stagePoint(ev);
      patchTransform(obj.id, {
        x: Math.round(clamp(origin.x + point.x - start.x, 0, visual.canvas.width - obj.transform.width)),
        y: Math.round(clamp(origin.y + point.y - start.y, 0, visual.canvas.height - obj.transform.height)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginResize(event, obj) {
    event.stopPropagation();
    event.preventDefault();
    const start = stagePoint(event);
    const origin = { width: obj.transform.width, height: obj.transform.height };
    const move = (ev) => {
      const point = stagePoint(ev);
      patchTransform(obj.id, {
        width: Math.max(16, Math.round(origin.width + point.x - start.x)),
        height: Math.max(16, Math.round(origin.height + point.y - start.y)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function updateHotspotAction(verb, key, value) {
    const hotspot = selected.hotspot || { enabled: true, label: selected.name, actions: {} };
    const existing = hotspot.actions?.[verb] || {};
    patchObject(selected.id, {
      hotspot: {
        ...hotspot,
        actions: {
          ...hotspot.actions,
          [verb]: { ...existing, [key]: value }
        }
      }
    });
  }

  return (
    <div className="editor-layout visual-editor-layout">
      <section className="editor-main">
        <div className="toolbar">
          <div className="toolbar-group">
            <input className="toolbar-name-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button onClick={() => addObject('prop')}>+ Prop</button>
            <button onClick={() => addObject('character')}>+ Character</button>
            <button onClick={() => addObject('scenery')}>+ Scenery</button>
            <button onClick={() => addObject('hotspot')}>+ Hotspot</button>
            <button onClick={() => addObject('exit')}>+ Exit</button>
          </div>
          <div className="toolbar-group">
            <button className={showHotspots ? 'active-tool' : ''} onClick={() => setShowHotspots((v) => !v)}>Hotspots</button>
            <label className="zoom-control">Zoom <input type="range" min="0.35" max="1" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
            <button onClick={onImport}>Import JSONs</button>
            <button onClick={onExport}>Export visual</button>
          </div>
        </div>

        <div className="stage-scroll">
          <div
            ref={stageRef}
            className="scene-stage"
            style={{
              width: visual.canvas.width,
              height: visual.canvas.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              backgroundColor: visual.canvas.backgroundColor,
              '--stage-zoom': zoom,
            }}
            onPointerDown={() => setSelectedId('')}
          >
            <div className="stage-grid" />
            {orderedObjects.filter((obj) => obj.transform.visible).map((obj) => {
              const t = obj.transform;
              const isSelected = obj.id === selectedId;
              return (
                <div
                  key={obj.id}
                  className={`scene-object ${isSelected ? 'selected' : ''} ${obj.type === 'hotspot' ? 'hotspot-object' : ''}`}
                  style={{ left: t.x, top: t.y, width: t.width, height: t.height, zIndex: t.z, opacity: t.opacity }}
                  onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, obj); }}
                >
                  {assetUrls[obj.id] ? (
                    <img src={assetUrls[obj.id]} draggable="false" alt="" />
                  ) : (
                    <div className="object-placeholder">
                      <span>{obj.name}</span>
                      <small>{obj.type}</small>
                    </div>
                  )}
                  {showHotspots && obj.hotspot?.enabled && <div className="hotspot-overlay"><span>{obj.hotspot.label || obj.name}</span></div>}
                  {isSelected && <button className="resize-handle" onPointerDown={(e) => beginResize(e, obj)} aria-label="Resize" />}
                </div>
              );
            })}
            <div className="player-start" style={{ left: visual.playerStart.x - 9, top: visual.playerStart.y - 9 }} title="Player start" />
          </div>
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-title">Visual inspector</div>
        {!selected ? (
          <>
            <div className="inspector-subtitle">Scene canvas</div>
            <div className="linked-note">Click an object to edit it, or use these scene-wide settings while nothing is selected.</div>
            <div className="inspector-divider" />
            <div className="transform-grid">
              <InspectorField label="Width"><input type="number" value={visual.canvas.width} onChange={(e) => onChangeVisual({ ...visual, canvas: { ...visual.canvas, width: Number(e.target.value) } })} /></InspectorField>
              <InspectorField label="Height"><input type="number" value={visual.canvas.height} onChange={(e) => onChangeVisual({ ...visual, canvas: { ...visual.canvas, height: Number(e.target.value) } })} /></InspectorField>
            </div>
            <InspectorField label="Canvas color"><input type="color" value={visual.canvas.backgroundColor} onChange={(e) => onChangeVisual({ ...visual, canvas: { ...visual.canvas, backgroundColor: e.target.value } })} /></InspectorField>
            <div className="inspector-divider" />
            <div className="inspector-subtitle">Player start</div>
            <div className="transform-grid">
              <InspectorField label="X"><input type="number" value={visual.playerStart.x} onChange={(e) => onChangeVisual({ ...visual, playerStart: { ...visual.playerStart, x: Number(e.target.value) } })} /></InspectorField>
              <InspectorField label="Y"><input type="number" value={visual.playerStart.y} onChange={(e) => onChangeVisual({ ...visual, playerStart: { ...visual.playerStart, y: Number(e.target.value) } })} /></InspectorField>
            </div>
          </>
        ) : (
          <>
            <div className="object-title-row">
              <div>
                <strong>{selected.name}</strong>
                <small>{selected.id}.object.{sceneId}.json</small>
              </div>
              <button className="danger-ghost" onClick={removeSelected}>Delete</button>
            </div>
            <InspectorField label="Name"><input value={selected.name} onChange={(e) => patchObject(selected.id, { name: e.target.value, hotspot: { ...selected.hotspot, label: e.target.value } })} /></InspectorField>
            <InspectorField label="Type">
              <select value={selected.type} onChange={(e) => {
                const type = e.target.value;
                patchObject(selected.id, {
                  type,
                  character: type === 'character' ? (selected.character || { characterId: selected.id, displayName: selected.name }) : null,
                  hotspot: { ...selected.hotspot, enabled: type !== 'scenery' }
                });
              }}>{OBJECT_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            </InspectorField>
            <div className="transform-grid">
              {['x', 'y', 'width', 'height', 'z'].map((key) => (
                <InspectorField key={key} label={key.toUpperCase()}>
                  <input type="number" value={selected.transform[key]} onChange={(e) => patchTransform(selected.id, { [key]: Number(e.target.value) })} />
                </InspectorField>
              ))}
              <InspectorField label="Opacity"><input type="number" min="0" max="1" step="0.05" value={selected.transform.opacity} onChange={(e) => patchTransform(selected.id, { opacity: Number(e.target.value) })} /></InspectorField>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={selected.transform.visible} onChange={(e) => patchTransform(selected.id, { visible: e.target.checked })} /> Visible</label>
            <div className="inspector-divider" />
            <div className="inspector-subtitle">Asset</div>
            <div className="asset-path">{selected.asset?.path || 'No PNG assigned'}</div>
            <button className="wide-button" onClick={() => onChooseAsset(selected.id)}>Replace PNG / image</button>

            {selected.type === 'character' && (
              <>
                <div className="inspector-divider" />
                <div className="inspector-subtitle">Character</div>
                <InspectorField label="Character ID"><input value={selected.character?.characterId || ''} readOnly title="Stable scene-scoped ID" /></InspectorField>
                <InspectorField label="Display name"><input value={selected.character?.displayName || ''} onChange={(e) => patchObject(selected.id, { character: { ...selected.character, displayName: e.target.value } })} /></InspectorField>
                <div className="linked-note">This character will automatically appear in the Dialogues tab.</div>
              </>
            )}

            <div className="inspector-divider" />
            <div className="inspector-subtitle">Hotspot</div>
            <label className="checkbox-row"><input type="checkbox" checked={!!selected.hotspot?.enabled} onChange={(e) => patchObject(selected.id, { hotspot: { ...selected.hotspot, enabled: e.target.checked } })} /> Enabled</label>
            {selected.hotspot?.enabled && (
              <div className="action-binding-list">
                {VERBS.map((verb) => {
                  const binding = selected.hotspot.actions?.[verb];
                  return (
                    <details key={verb} open={verb === 'talk' && selected.type === 'character'}>
                      <summary>{verb}{binding?.ruleId || binding?.dialogueId ? ' •' : ''}</summary>
                      <InspectorField label="Logic rule">
                        <select value={binding?.ruleId || ''} onChange={(e) => updateHotspotAction(verb, 'ruleId', e.target.value)}>
                          <option value="">No rule</option>
                          {(logic?.rules || []).map((rule) => <option key={rule.id} value={rule.id}>{rule.name} ({rule.event.type})</option>)}
                        </select>
                      </InspectorField>
                      {verb === 'talk' && <InspectorField label="Dialogue character">
                        <select value={binding?.dialogueId || ''} onChange={(e) => updateHotspotAction(verb, 'dialogueId', e.target.value)}>
                          <option value="">No dialogue</option>
                          {objects.filter((obj) => obj.type === 'character' && obj.character).map((obj) => <option key={obj.character.characterId} value={obj.character.characterId}>{obj.character.displayName || obj.name}</option>)}
                        </select>
                      </InspectorField>}
                    </details>
                  );
                })}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
