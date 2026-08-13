import React, { useMemo } from 'react';
import { createSceneConnection, linkedSceneIds, normalizeSceneManager, orderedScenes, SCENE_CONNECTION_KINDS } from '../lib/sceneManager.js';

function sceneNumber(scene,index){const match=String(scene.id||'').match(/^scene(\d+)$/);return match?String(Number(match[1])).padStart(2,'0'):String(index+1).padStart(2,'0')}

function move(order, id, delta) {
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function SceneManagerEditor({ project, manager, settings, onChangeManager, onChangeSettings, onOpenScene, onImport, onExport }) {
  const normalized = useMemo(() => normalizeSceneManager(manager, project.scenes), [manager, project.scenes]);
  const scenes = orderedScenes(project.scenes, normalized);
  const linked = linkedSceneIds(normalized);
  const homeId = settings.titleSceneId || '';
  const startId = settings.defaultSceneId || '';

  function patchConnection(id, patch) {
    onChangeManager({ ...normalized, connections: normalized.connections.map(connection => connection.id === id ? { ...connection, ...patch } : connection) });
  }
  function addConnection() {
    const from = startId || scenes[0]?.id || '';
    const to = scenes.find(scene => scene.id !== from)?.id || from;
    onChangeManager({ ...normalized, connections: [...normalized.connections, createSceneConnection(from, to)] });
  }
  function removeConnection(id) {
    onChangeManager({ ...normalized, connections: normalized.connections.filter(connection => connection.id !== id) });
  }
  function setEntry(key, value) {
    onChangeSettings({ ...settings, [key]: value });
  }

  return <div className="scene-manager-shell">
    <section className="scene-manager-head">
      <div><div className="eyebrow">Project Flow</div><h2>Scene Manager</h2><p>Define the stable scene order and the logical routes between rooms. Puzzle conditions still live inside each scene's Logic/Exit rules.</p></div>
      <div className="scene-manager-head-actions"><button onClick={onImport}>Import</button><button onClick={onExport}>Export</button></div>
    </section>

    <section className="scene-manager-entry">
      <div className="scene-manager-section-title"><strong>Game entry</strong><span>Where Play Game and New Game begin</span></div>
      <div className="scene-manager-entry-grid">
        <label><span>Home / title screen</span><select value={homeId} onChange={e=>setEntry('titleSceneId',e.target.value)}><option value="">None</option>{scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name} · {scene.id}</option>)}</select></label>
        <label><span>New Game starts at</span><select value={startId} onChange={e=>setEntry('defaultSceneId',e.target.value)}><option value="">Choose scene</option>{scenes.filter(scene=>scene.sceneType!=='title').map(scene=><option key={scene.id} value={scene.id}>{scene.name} · {scene.id}</option>)}</select></label>
      </div>
      {homeId&&startId&&<div className="scene-route-pill"><b>{project.scenes.find(s=>s.id===homeId)?.name||homeId}</b><span>New Game →</span><b>{project.scenes.find(s=>s.id===startId)?.name||startId}</b></div>}
    </section>

    <section className="scene-manager-section">
      <div className="scene-manager-section-title"><strong>Scene order</strong><span>This order is used everywhere SCEMQ lists scenes.</span></div>
      <div className="scene-order-list">
        {scenes.map((scene,index)=><div className="scene-order-row" key={scene.id}>
          <span className="scene-order-index">{sceneNumber(scene,index)}</span>
          <div><strong>{scene.name}</strong><small>{scene.id} · {scene.sceneType==='title'?'title':'gameplay'}{!linked.has(scene.id)&&scene.id!==homeId&&scene.id!==startId?' · unlinked':''}</small></div>
          <button disabled={index===0} onClick={()=>onChangeManager({...normalized,sceneOrder:move(normalized.sceneOrder,scene.id,-1)})} title="Move up">↑</button>
          <button disabled={index===scenes.length-1} onClick={()=>onChangeManager({...normalized,sceneOrder:move(normalized.sceneOrder,scene.id,1)})} title="Move down">↓</button>
          <button onClick={()=>onOpenScene(scene)}>Open</button>
        </div>)}
      </div>
    </section>

    <section className="scene-manager-section">
      <div className="scene-manager-section-title"><div><strong>Connections</strong><span>Directional project structure. Use Both ways for open pairs or map hubs.</span></div><button className="primary-soft" onClick={addConnection}>+ Connection</button></div>
      {!normalized.connections.length&&<div className="scene-manager-empty">No scene connections yet. Add one to describe the project's flow.</div>}
      <div className="scene-connection-list">
        {normalized.connections.map(connection=><div className="scene-connection-card" key={connection.id}>
          <div className="scene-connection-flow">
            <select value={connection.fromSceneId} onChange={e=>patchConnection(connection.id,{fromSceneId:e.target.value})}>{scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
            <span>{connection.bidirectional?'↔':'→'}</span>
            <select value={connection.toSceneId} onChange={e=>patchConnection(connection.id,{toSceneId:e.target.value})}>{scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
          </div>
          <div className="scene-connection-options">
            <label><span>Type</span><select value={connection.kind} onChange={e=>patchConnection(connection.id,{kind:e.target.value})}>{SCENE_CONNECTION_KINDS.map(kind=><option key={kind} value={kind}>{kind}</option>)}</select></label>
            <label><span>Label / purpose</span><input value={connection.label} placeholder="e.g. package opened" onChange={e=>patchConnection(connection.id,{label:e.target.value})}/></label>
            <label className="checkbox-row compact"><input type="checkbox" checked={connection.bidirectional} onChange={e=>patchConnection(connection.id,{bidirectional:e.target.checked})}/>Both ways</label>
            <label className="checkbox-row compact"><input type="checkbox" checked={connection.enabled} onChange={e=>patchConnection(connection.id,{enabled:e.target.checked})}/>Enabled</label>
            <button className="danger-ghost" onClick={()=>removeConnection(connection.id)}>Delete</button>
          </div>
        </div>)}
      </div>
      <div className="linked-note scene-manager-note"><strong>Important:</strong> Scene Manager describes structure only in this iteration. Existing exits and <code>changeScene</code> rules remain responsible for actually moving the player and for checking conditions.</div>
    </section>

    <section className="scene-manager-section">
      <div className="scene-manager-section-title"><strong>Director notes</strong><span>Optional project-level notes about hubs, branches, or scene progression.</span></div>
      <textarea rows="5" value={normalized.notes||''} onChange={e=>onChangeManager({...normalized,notes:e.target.value})} placeholder="Example: Scene 4 and Scene 5 remain open in both directions. The Never Was uses a ship-map hub."/>
    </section>
  </div>;
}
