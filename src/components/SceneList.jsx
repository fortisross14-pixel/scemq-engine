import React, { useState } from 'react';

export default function SceneList({ project, activeSceneId, onOpenScene, onCreateScene, onCloseProject }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('New Scene');

  function submit() {
    const value = name.trim();
    if (!value) return;
    onCreateScene(value);
    setCreating(false);
    setName('New Scene');
  }

  return (
    <aside className="scene-sidebar">
      <div className="scene-sidebar-head">
        <div>
          <div className="eyebrow">Project</div>
          <div className="project-name">{project.name}</div>
        </div>
        <button className="icon-button" title="Close project" onClick={onCloseProject}>×</button>
      </div>
      <div className="sidebar-section-title">
        <span>Scenes</span>
        <button className="small-button" onClick={() => setCreating(true)}>+ New</button>
      </div>
      <div className="scene-list">
        {project.scenes.length === 0 && <div className="empty-sidebar">No scenes yet.</div>}
        {project.scenes.map((scene, index) => (
          <button
            key={scene.id}
            className={`scene-row ${activeSceneId === scene.id ? 'active' : ''}`}
            onClick={() => onOpenScene(scene)}
          >
            <span className="scene-index">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>{scene.name}</strong>
              <small>{scene.id}</small>
            </span>
          </button>
        ))}
      </div>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Create scene</h2>
            <label>Scene name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
            <div className="modal-actions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button className="primary" onClick={submit}>Create scene</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
