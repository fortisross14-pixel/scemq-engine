import {
  createCharacterDefinition,
  createInventoryItem,
  createLogicConfig,
  createProjectManifest,
  createProjectSettings,
  createProjectUi,
  createProjectVariables,
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
  for (const part of pathParts) current = await current.getDirectoryHandle(part, { create: true });
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
  try { await dir.getFileHandle(filename); return true; } catch { return false; }
}

async function scanJsonDirectory(dir, suffix) {
  const values = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.endsWith(suffix)) continue;
    try { values.push(await readJson(dir, name)); }
    catch (error) { console.warn(`Could not read ${name}`, error); }
  }
  return values;
}

async function ensureProjectModules(root, manifest) {
  const projectDir = await ensureDirectory(root, ['project']);
  const charactersDir = await ensureDirectory(root, ['characters']);
  const inventoryDir = await ensureDirectory(root, ['inventory']);
  await ensureDirectory(root, ['assets', 'ui']);
  await ensureDirectory(root, ['assets', 'characters']);
  await ensureDirectory(root, ['assets', 'inventory']);

  if (!(await exists(projectDir, 'project.ui.json'))) await writeJson(projectDir, 'project.ui.json', createProjectUi());
  if (!(await exists(projectDir, 'project.variables.json'))) await writeJson(projectDir, 'project.variables.json', createProjectVariables());
  if (!(await exists(projectDir, 'project.settings.json'))) await writeJson(projectDir, 'project.settings.json', createProjectSettings(manifest.name));

  return { projectDir, charactersDir, inventoryDir };
}

export async function initializeProject(root, name) {
  const manifest = createProjectManifest(name);
  await writeJson(root, 'scemq.project.json', manifest);
  await ensureDirectory(root, ['scenes']);
  await ensureProjectModules(root, manifest);
  return manifest;
}

export async function loadProject(root) {
  let manifest = await readJson(root, 'scemq.project.json');
  if (manifest.kind !== 'scemq-project') throw new Error('This folder does not contain a SCEMQ project.');
  await ensureProjectModules(root, manifest);
  if (manifest.schemaVersion !== '0.2') {
    manifest = { ...manifest, schemaVersion: '0.2', updatedAt: new Date().toISOString() };
    await writeJson(root, 'scemq.project.json', manifest);
  }
  return manifest;
}

export async function saveProject(root, manifest) {
  const next = { ...manifest, schemaVersion: '0.2', updatedAt: new Date().toISOString() };
  await writeJson(root, 'scemq.project.json', next);
  return next;
}

export async function loadProjectBundle(root, manifest) {
  const { projectDir, charactersDir, inventoryDir } = await ensureProjectModules(root, manifest);
  const ui = await readJson(projectDir, 'project.ui.json');
  const variables = await readJson(projectDir, 'project.variables.json');
  const settings = await readJson(projectDir, 'project.settings.json');
  const characters = await scanJsonDirectory(charactersDir, '.character.json');
  const inventory = await scanJsonDirectory(inventoryDir, '.item.json');
  const assetUrls = { ui: {}, characters: {}, inventory: {} };

  for (const character of characters) {
    for (const [slot, path] of Object.entries(character.assets || {})) {
      if (!path) continue;
      try { assetUrls.characters[`${character.id}:${slot}`] = await readProjectAssetUrl(root, 'characters', path); } catch {}
    }
  }
  for (const item of inventory) {
    if (!item.asset) continue;
    try { assetUrls.inventory[item.id] = await readProjectAssetUrl(root, 'inventory', item.asset); } catch {}
  }
  for (const element of ui.elements || []) {
    if (!element.asset) continue;
    try { assetUrls.ui[element.id] = await readProjectAssetUrl(root, 'ui', element.asset); } catch {}
  }
  for (const [verb, path] of Object.entries(ui.cursors || {})) {
    if (!path) continue;
    try { assetUrls.ui[`cursor:${verb}`] = await readProjectAssetUrl(root, 'ui', path); } catch {}
  }

  return { ui, variables, settings, characters, inventory, assetUrls };
}

export async function saveProjectBundle(root, data) {
  const { projectDir, charactersDir, inventoryDir } = await ensureProjectModules(root, { name: data.settings?.title || 'Project' });
  await writeJson(projectDir, 'project.ui.json', data.ui);
  await writeJson(projectDir, 'project.variables.json', data.variables);
  await writeJson(projectDir, 'project.settings.json', data.settings);

  const expectedCharacters = new Set();
  for (const character of data.characters || []) {
    const filename = `${slugify(character.id)}.character.json`;
    expectedCharacters.add(filename);
    await writeJson(charactersDir, filename, character);
  }
  for await (const [name, handle] of charactersDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.character.json') && !expectedCharacters.has(name)) await charactersDir.removeEntry(name);
  }

  const expectedItems = new Set();
  for (const item of data.inventory || []) {
    const filename = `${slugify(item.id)}.item.json`;
    expectedItems.add(filename);
    await writeJson(inventoryDir, filename, item);
  }
  for await (const [name, handle] of inventoryDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.item.json') && !expectedItems.has(name)) await inventoryDir.removeEntry(name);
  }
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

  const nextProject = { ...project, scenes: [...project.scenes, { id: sceneId, name: sceneName, folder: sceneFolder }] };
  return { sceneId, project: await saveProject(root, nextProject) };
}

function migrateVisual(visual) {
  const start = visual.player?.start || visual.playerStart || { x: 220, y: 700 };
  return {
    ...createVisualConfig(visual.sceneId),
    ...visual,
    schemaVersion: '0.2',
    background: { ...createVisualConfig(visual.sceneId).background, ...(visual.background || {}) },
    viewport: {
      ...createVisualConfig(visual.sceneId).viewport,
      ...(visual.viewport || {}),
      bounds: { ...createVisualConfig(visual.sceneId).viewport.bounds, ...(visual.viewport?.bounds || {}), width: visual.viewport?.bounds?.width || visual.canvas?.width || 1600, height: visual.viewport?.bounds?.height || visual.canvas?.height || 900 }
    },
    player: { ...createVisualConfig(visual.sceneId).player, ...(visual.player || {}), start },
    playerStart: start,
    spawnPoints: visual.spawnPoints?.length ? visual.spawnPoints : [{ id: 'default', name: 'Default', x: start.x, y: start.y, facing: visual.player?.facing || 'right' }],
    walkAreas: visual.walkAreas || [],
    depthAreas: visual.depthAreas || []
  };
}

function migrateObject(object) {
  const base = {
    asset: { path: '', state: 'default', states: { default: '' } },
    transform: { flipX: false, locked: false, lockAspect: true, anchor: object.type === 'character' ? 'bottom-center' : 'top-left', anchorX: 0.5, anchorY: object.type === 'character' ? 1 : 0 },
    interactionPoint: { x: (object.transform?.x || 0) + (object.transform?.width || 100) / 2, y: (object.transform?.y || 0) + (object.transform?.height || 100), facing: 'right' },
    notes: ''
  };
  const asset = { ...base.asset, ...(object.asset || {}) };
  if (!asset.states || !Object.keys(asset.states).length) asset.states = { default: asset.path || '' };
  if (!asset.states.default) asset.states.default = asset.path || '';
  const character = object.type === 'character'
    ? { characterId: object.character?.characterId || object.id, displayName: object.character?.displayName || object.name, role: object.character?.role || 'npc', walkSpeed: object.character?.walkSpeed || 180 }
    : null;
  const exit = object.type === 'exit' ? { destinationSceneId: '', spawnPointId: 'default', transition: 'fade', walkFirst: true, ...(object.exit || {}) } : null;
  return { ...object, schemaVersion: '0.2', asset, transform: { ...object.transform, ...base.transform, ...(object.transform || {}) }, interactionPoint: { ...base.interactionPoint, ...(object.interactionPoint || {}) }, character, exit, notes: object.notes || '' };
}

export async function loadSceneBundle(root, sceneRef) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);

  const meta = await readJson(sceneDir, `scene.meta.${sceneId}.json`);
  const visual = migrateVisual(await readJson(sceneDir, `scene.visual.${sceneId}.json`));
  const logic = await readJson(sceneDir, `scene.logic.${sceneId}.json`);
  const scannedObjects = (await scanJsonDirectory(objectsDir, `.object.${sceneId}.json`)).map(migrateObject);
  const objectMap = new Map(scannedObjects.map((object) => [object.id, object]));
  const refs = visual.objectRefs?.length ? visual.objectRefs : scannedObjects.map((object) => object.id);
  const objects = refs.map((id) => objectMap.get(id)).filter(Boolean);
  const dialogues = await scanJsonDirectory(dialoguesDir, `.dialogue.${sceneId}.json`);
  const assetUrls = {};
  const stateAssetUrls = {};

  if (visual.background?.path) {
    try {
      const fileHandle = await assetsDir.getFileHandle(visual.background.path);
      assetUrls.__background = URL.createObjectURL(await fileHandle.getFile());
    } catch {}
  }

  for (const slot of ['music', 'ambient']) {
    const path = meta.audio?.[slot];
    if (!path) continue;
    try {
      const fileHandle = await assetsDir.getFileHandle(path);
      assetUrls[`__${slot}`] = URL.createObjectURL(await fileHandle.getFile());
    } catch {}
  }

  for (const object of objects) {
    const paths = new Set([object.asset?.path, ...Object.values(object.asset?.states || {})].filter(Boolean));
    for (const path of paths) {
      try {
        const fileHandle = await assetsDir.getFileHandle(path);
        const url = URL.createObjectURL(await fileHandle.getFile());
        stateAssetUrls[`${object.id}:${path}`] = url;
        if (path === object.asset?.path || path === object.asset?.states?.[object.asset?.state]) assetUrls[object.id] = url;
      } catch {}
    }
  }

  return { meta, visual, logic: { ...logic, schemaVersion: '0.2' }, objects, dialogues, assetUrls, stateAssetUrls };
}

export async function saveSceneBundle(root, sceneRef, bundle) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);

  await writeJson(sceneDir, `scene.meta.${sceneId}.json`, { ...bundle.meta, schemaVersion: '0.2', updatedAt: new Date().toISOString() });
  await writeJson(sceneDir, `scene.visual.${sceneId}.json`, { ...bundle.visual, schemaVersion: '0.2', playerStart: bundle.visual.player?.start || bundle.visual.playerStart });
  await writeJson(sceneDir, `scene.logic.${sceneId}.json`, { ...bundle.logic, schemaVersion: '0.2' });

  const expectedObjectFiles = new Set();
  for (const object of bundle.objects) {
    const filename = `${slugify(object.id)}.object.${sceneId}.json`;
    expectedObjectFiles.add(filename);
    await writeJson(objectsDir, filename, object);
  }
  for await (const [name, handle] of objectsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith(`.object.${sceneId}.json`) && !expectedObjectFiles.has(name)) await objectsDir.removeEntry(name);
  }

  const expectedDialogueFiles = new Set();
  for (const dialogue of bundle.dialogues) {
    const filename = `${slugify(dialogue.characterId)}.dialogue.${sceneId}.json`;
    expectedDialogueFiles.add(filename);
    await writeJson(dialoguesDir, filename, dialogue);
  }
  for await (const [name, handle] of dialoguesDir.entries()) {
    if (handle.kind === 'file' && name.endsWith(`.dialogue.${sceneId}.json`) && !expectedDialogueFiles.has(name)) await dialoguesDir.removeEntry(name);
  }
}

export async function readSceneAssetUrl(root, sceneRef, assetPath) {
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneRef.id]);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);
  const fileHandle = await assetsDir.getFileHandle(assetPath);
  const savedFile = await fileHandle.getFile();
  if (!savedFile.size) throw new Error(`Asset ${assetPath} was copied as an empty file.`);
  return URL.createObjectURL(savedFile);
}

export async function copyAssetIntoScene(root, sceneRef, file) {
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneRef.id]);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);
  return copyFileToDir(assetsDir, file);
}

async function copyFileToDir(dir, file) {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const bytes = await file.arrayBuffer();
  if (!bytes.byteLength) throw new Error(`The selected image ${file.name} is empty.`);
  const fileHandle = await dir.getFileHandle(cleanName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return cleanName;
}

export async function copyProjectAsset(root, category, file) {
  const dir = await ensureDirectory(root, ['assets', category]);
  return copyFileToDir(dir, file);
}

export async function readProjectAssetUrl(root, category, assetPath) {
  const dir = await ensureDirectory(root, ['assets', category]);
  const handle = await dir.getFileHandle(assetPath);
  return URL.createObjectURL(await handle.getFile());
}

export async function importJsonFiles(fileList) {
  const imported = [];
  for (const file of Array.from(fileList || [])) imported.push(JSON.parse(await file.text()));
  return imported;
}

export function newCharacter(name) { return createCharacterDefinition(name); }
export function newInventoryItem(name) { return createInventoryItem(name); }
