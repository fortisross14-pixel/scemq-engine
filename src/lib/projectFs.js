import {
  createDialogueConfig,
  createLogicConfig,
  createProjectManifest,
  createSceneManifest,
  createVisualConfig,
} from './schema.js';
import { nextSceneId, slugify } from './id.js';

function requireDirectoryPicker() {
  if (!window.showDirectoryPicker) {
    throw new Error('SCEMQ needs a Chromium-based browser with the File System Access API. Open it in current Chrome or Edge from localhost.');
  }
}

export async function pickProjectDirectory({ mode = 'readwrite' } = {}) {
  requireDirectoryPicker();
  return window.showDirectoryPicker({ mode });
}

export async function ensureDirectory(root, pathParts) {
  let current = root;
  for (const part of pathParts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

export async function writeJson(dir, filename, value) {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  await writable.close();
}

export async function readJson(dir, filename) {
  const handle = await dir.getFileHandle(filename);
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

export async function exists(dir, filename) {
  try {
    await dir.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

export async function initializeProject(root, name) {
  const manifest = createProjectManifest(name);
  await writeJson(root, 'scemq.project.json', manifest);
  await ensureDirectory(root, ['scenes']);
  return manifest;
}

export async function loadProject(root) {
  const manifest = await readJson(root, 'scemq.project.json');
  if (manifest.kind !== 'scemq-project') throw new Error('This folder does not contain a SCEMQ project.');
  return manifest;
}

export async function saveProject(root, manifest) {
  const next = { ...manifest, updatedAt: new Date().toISOString() };
  await writeJson(root, 'scemq.project.json', next);
  return next;
}

export async function createScene(root, project, sceneName) {
  const sceneId = nextSceneId(project.scenes);
  const sceneFolder = sceneId;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneFolder]);
  await ensureDirectory(sceneDir, ['objects']);
  await ensureDirectory(sceneDir, ['dialogues']);
  await ensureDirectory(sceneDir, ['assets']);

  const meta = createSceneManifest(sceneId, sceneName);
  const visual = createVisualConfig(sceneId);
  const logic = createLogicConfig(sceneId);

  await writeJson(sceneDir, `scene.meta.${sceneId}.json`, meta);
  await writeJson(sceneDir, `scene.visual.${sceneId}.json`, visual);
  await writeJson(sceneDir, `scene.logic.${sceneId}.json`, logic);

  const nextProject = {
    ...project,
    scenes: [...project.scenes, { id: sceneId, name: sceneName, folder: sceneFolder }],
  };
  return { sceneId, project: await saveProject(root, nextProject) };
}

async function scanJsonDirectory(dir, suffix) {
  const values = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.endsWith(suffix)) continue;
    try {
      values.push(await readJson(dir, name));
    } catch (error) {
      console.warn(`Could not read ${name}`, error);
    }
  }
  return values;
}

export async function loadSceneBundle(root, sceneRef) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);

  const meta = await readJson(sceneDir, `scene.meta.${sceneId}.json`);
  const visual = await readJson(sceneDir, `scene.visual.${sceneId}.json`);
  const logic = await readJson(sceneDir, `scene.logic.${sceneId}.json`);
  const scannedObjects = await scanJsonDirectory(objectsDir, `.object.${sceneId}.json`);
  const objectMap = new Map(scannedObjects.map((object) => [object.id, object]));
  const objects = (visual.objectRefs || []).map((id) => objectMap.get(id)).filter(Boolean);
  const dialogues = await scanJsonDirectory(dialoguesDir, `.dialogue.${sceneId}.json`);
  const assetUrls = {};

  for (const object of objects) {
    if (!object.asset?.path) continue;
    try {
      const fileHandle = await assetsDir.getFileHandle(object.asset.path);
      const file = await fileHandle.getFile();
      assetUrls[object.id] = URL.createObjectURL(file);
    } catch {
      // Missing assets are intentionally rendered as placeholders.
    }
  }

  return { meta, visual, logic, objects, dialogues, assetUrls };
}

export async function saveSceneBundle(root, sceneRef, bundle) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);

  await writeJson(sceneDir, `scene.meta.${sceneId}.json`, { ...bundle.meta, updatedAt: new Date().toISOString() });
  await writeJson(sceneDir, `scene.visual.${sceneId}.json`, bundle.visual);
  await writeJson(sceneDir, `scene.logic.${sceneId}.json`, bundle.logic);

  const expectedObjectFiles = new Set();
  for (const object of bundle.objects) {
    const filename = `${slugify(object.id)}.object.${sceneId}.json`;
    expectedObjectFiles.add(filename);
    await writeJson(objectsDir, filename, object);
  }
  for await (const [name, handle] of objectsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith(`.object.${sceneId}.json`) && !expectedObjectFiles.has(name)) {
      await objectsDir.removeEntry(name);
    }
  }

  const expectedDialogueFiles = new Set();
  for (const dialogue of bundle.dialogues) {
    const filename = `${slugify(dialogue.characterId)}.dialogue.${sceneId}.json`;
    expectedDialogueFiles.add(filename);
    await writeJson(dialoguesDir, filename, dialogue);
  }
  for await (const [name, handle] of dialoguesDir.entries()) {
    if (handle.kind === 'file' && name.endsWith(`.dialogue.${sceneId}.json`) && !expectedDialogueFiles.has(name)) {
      await dialoguesDir.removeEntry(name);
    }
  }
}

export async function copyAssetIntoScene(root, sceneRef, file) {
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneRef.id]);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const fileHandle = await assetsDir.getFileHandle(cleanName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  return cleanName;
}

export async function importJsonFiles(fileList) {
  const imported = [];
  for (const file of Array.from(fileList || [])) {
    imported.push(JSON.parse(await file.text()));
  }
  return imported;
}
