import React, { useEffect, useRef, useState } from 'react';
import SceneList from './SceneList.jsx';
import VisualEditor from './VisualEditor.jsx';
import LogicEditor from './LogicEditor.jsx';
import DialogueEditor from './DialogueEditor.jsx';
import {
  copyAssetIntoScene,
  createScene,
  importJsonFiles,
  loadSceneBundle,
  saveSceneBundle,
} from '../lib/projectFs.js';

function downloadJson(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickJsonFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = multiple;
    input.onchange = () => resolve(input.files);
    input.click();
  });
}

function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/webp,image/jpeg';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export default function Workspace({ rootHandle, initialProject, onCloseProject }) {
  const [project, setProject] = useState(initialProject);
  const [activeScene, setActiveScene] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [tab, setTab] = useState('visual');
  const [saveStatus, setSaveStatus] = useState('Ready');
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const bundleRef = useRef(null);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  async function openScene(scene) {
    try {
      setError('');
      setSaveStatus('Loading…');
      const loaded = await loadSceneBundle(rootHandle, scene);
      bundleRef.current = loaded;
      setBundle(loaded);
      setActiveScene(scene);
      setSaveStatus('Saved');
    } catch (err) {
      setError(err.message);
      setSaveStatus('Error');
    }
  }

  async function addScene(name) {
    try {
      setSaveStatus('Creating…');
      const result = await createScene(rootHandle, project, name);
      setProject(result.project);
      const scene = result.project.scenes.find((item) => item.id === result.sceneId);
      await openScene(scene);
    } catch (err) {
      setError(err.message);
      setSaveStatus('Error');
    }
  }

  function scheduleSave(nextBundle) {
    if (!activeScene) return;
    bundleRef.current = nextBundle;
    setSaveStatus('Unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('Saving…');
        await saveSceneBundle(rootHandle, activeScene, bundleRef.current);
        setSaveStatus('Saved');
      } catch (err) {
        setError(err.message);
        setSaveStatus('Error');
      }
    }, 450);
  }

  function changeField(field, value) {
    const next = { ...bundleRef.current, [field]: value };
    bundleRef.current = next;
    setBundle(next);
    scheduleSave(next);
  }

  async function chooseAsset(objectId) {
    const file = await pickImageFile();
    if (!file) return;
    try {
      const path = await copyAssetIntoScene(rootHandle, activeScene, file);
      const url = URL.createObjectURL(file);
      const objects = bundleRef.current.objects.map((obj) => obj.id === objectId ? { ...obj, asset: { ...obj.asset, path } } : obj);
      const assetUrls = { ...bundleRef.current.assetUrls, [objectId]: url };
      const next = { ...bundleRef.current, objects, assetUrls };
      bundleRef.current = next;
      setBundle(next);
      scheduleSave(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function importVisual() {
    const files = await pickJsonFiles({ multiple: true });
    if (!files?.length) return;
    try {
      const imported = await importJsonFiles(files);
      let nextVisual = bundleRef.current.visual;
      let nextObjects = [...bundleRef.current.objects];
      for (const value of imported) {
        if (value.sceneId && value.sceneId !== activeScene.id) throw new Error(`Imported ${value.kind || 'file'} belongs to ${value.sceneId}, not ${activeScene.id}.`);
        if (value.kind === 'scemq-scene-visual') nextVisual = value;
        if (value.kind === 'scemq-scene-object') nextObjects = [...nextObjects.filter((obj) => obj.id !== value.id), value];
        if (value.kind === 'scemq-visual-package') {
          nextVisual = value.visual;
          nextObjects = value.objects;
        }
      }
      const next = { ...bundleRef.current, visual: nextVisual, objects: nextObjects };
      bundleRef.current = next;
      setBundle(next);
      scheduleSave(next);
    } catch (err) { setError(err.message); }
  }

  async function importLogic() {
    const files = await pickJsonFiles();
    if (!files?.length) return;
    try {
      const [value] = await importJsonFiles(files);
      if (value.kind !== 'scemq-scene-logic') throw new Error('That file is not a SCEMQ scene logic file.');
      if (value.sceneId !== activeScene.id) throw new Error(`Logic belongs to ${value.sceneId}, not ${activeScene.id}.`);
      changeField('logic', value);
    } catch (err) { setError(err.message); }
  }

  async function importDialogue() {
    const files = await pickJsonFiles({ multiple: true });
    if (!files?.length) return;
    try {
      const imported = await importJsonFiles(files);
      let next = [...bundleRef.current.dialogues];
      for (const value of imported) {
        if (value.kind !== 'scemq-scene-dialogue') throw new Error('One of the files is not a SCEMQ dialogue file.');
        if (value.sceneId !== activeScene.id) throw new Error(`Dialogue belongs to ${value.sceneId}, not ${activeScene.id}.`);
        next = [...next.filter((dialogue) => dialogue.characterId !== value.characterId), value];
      }
      changeField('dialogues', next);
    } catch (err) { setError(err.message); }
  }

  function exportVisual() {
    downloadJson(`visual.package.${activeScene.id}.json`, {
      schemaVersion: '0.1',
      kind: 'scemq-visual-package',
      sceneId: activeScene.id,
      visual: bundle.visual,
      objects: bundle.objects,
    });
  }

  return (
    <div className="workspace-shell">
      <SceneList project={project} activeSceneId={activeScene?.id} onOpenScene={openScene} onCreateScene={addScene} onCloseProject={onCloseProject} />
      <section className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-brand"><span className="mini-brand">S</span><span>SCEMQ</span></div>
          {activeScene ? (
            <div className="scene-heading"><strong>{activeScene.name}</strong><span>{activeScene.id}</span></div>
          ) : <div className="scene-heading"><strong>Project overview</strong><span>Select or create a scene</span></div>}
          <div className={`save-status ${saveStatus.toLowerCase().replace('…', '')}`}><span className="status-dot" />{saveStatus}</div>
        </header>

        {error && <div className="workspace-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

        {!activeScene || !bundle ? (
          <div className="welcome-workspace">
            <div className="welcome-icon">⌘</div>
            <h2>{project.scenes.length ? 'Choose a scene to author' : 'Create your first scene'}</h2>
            <p>Every scene is split into Visual Config, Logic, and Dialogues. SCEMQ saves each module directly into your project folder.</p>
            {!project.scenes.length && <button className="primary" onClick={() => addScene('Scene 1')}>Create Scene 1</button>}
          </div>
        ) : (
          <>
            <nav className="author-tabs">
              <button className={tab === 'visual' ? 'active' : ''} onClick={() => setTab('visual')}><span>01</span> Visual Config</button>
              <button className={tab === 'logic' ? 'active' : ''} onClick={() => setTab('logic')}><span>02</span> Logic</button>
              <button className={tab === 'dialogue' ? 'active' : ''} onClick={() => setTab('dialogue')}><span>03</span> Dialogues</button>
            </nav>
            <div className="author-surface">
              {tab === 'visual' && (
                <VisualEditor
                  sceneId={activeScene.id}
                  visual={bundle.visual}
                  objects={bundle.objects}
                  assetUrls={bundle.assetUrls}
                  logic={bundle.logic}
                  onChangeVisual={(value) => changeField('visual', value)}
                  onChangeObjects={(value) => changeField('objects', value)}
                  onChooseAsset={chooseAsset}
                  onImport={importVisual}
                  onExport={exportVisual}
                />
              )}
              {tab === 'logic' && (
                <LogicEditor
                  sceneId={activeScene.id}
                  logic={bundle.logic}
                  objects={bundle.objects}
                  onChange={(value) => changeField('logic', value)}
                  onImport={importLogic}
                  onExport={() => downloadJson(`scene.logic.${activeScene.id}.json`, bundle.logic)}
                />
              )}
              {tab === 'dialogue' && (
                <DialogueEditor
                  sceneId={activeScene.id}
                  objects={bundle.objects}
                  dialogues={bundle.dialogues}
                  onChangeDialogues={(value) => changeField('dialogues', value)}
                  onImport={importDialogue}
                  onExport={(dialogue) => downloadJson(`${dialogue.characterId}.dialogue.${activeScene.id}.json`, dialogue)}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
