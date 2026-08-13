import React, { useState } from 'react';
import { initializeProject, loadProject, pickProjectDirectory } from '../lib/projectFs.js';

export default function ProjectHub({ onOpen }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('New SCEMQ Project');
  const [error, setError] = useState('');

  async function openExisting() {
    try {
      setError('');
      const handle = await pickProjectDirectory();
      const project = await loadProject(handle);
      onOpen(handle, project);
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err.message);
    }
  }

  async function createNew() {
    try {
      setError('');
      const handle = await pickProjectDirectory();
      const project = await initializeProject(handle, name.trim() || 'Untitled Project');
      onOpen(handle, project);
      setCreating(false);
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err.message);
    }
  }

  return (
    <main className="hub-shell">
      <section className="hub-card">
        <div className="brand-mark">S</div>
        <div className="eyebrow">Script Creation Engine</div>
        <h1>SCEMQ</h1>
        <p className="hub-copy">A focused authoring engine for scene-based point-and-click adventures. Projects stay as editable local files.</p>
        <div className="hub-actions">
          <button className="primary" onClick={openExisting}>Load project</button>
          <button onClick={() => setCreating(true)}>Create project</button>
        </div>
        <div className="support-note">Runs locally in Chrome or Edge and writes directly into the project folder you choose.</div>
        {error && <div className="error-banner">{error}</div>}
      </section>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Create SCEMQ project</h2>
            <label>Project name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <p className="muted">Next, choose the local folder that should become this project's root.</p>
            <div className="modal-actions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button className="primary" onClick={createNew}>Choose folder & create</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
