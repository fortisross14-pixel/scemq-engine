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
  INVENTORY_VERBS,
} from './schema.js';
import { nextSceneId, slugify } from './id.js';
import { characterAnimationAssetKey, normalizeCharacterAnimationData } from './animation.js';
import { createSceneManager, normalizeSceneManager } from './sceneManager.js';
import { createStringTable, STRING_TABLE_KIND } from './localization.js';

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
  await ensureDirectory(root, ['assets', 'audio']);

  if (!(await exists(projectDir, 'project.ui.json'))) await writeJson(projectDir, 'project.ui.json', createProjectUi());
  if (!(await exists(projectDir, 'project.variables.json'))) await writeJson(projectDir, 'project.variables.json', createProjectVariables());
  if (!(await exists(projectDir, 'project.settings.json'))) await writeJson(projectDir, 'project.settings.json', createProjectSettings(manifest.name));
  if (!(await exists(projectDir, 'project.scene-manager.json'))) await writeJson(projectDir, 'project.scene-manager.json', createSceneManager(manifest.scenes || []));
  if (!(await exists(projectDir, 'project.strings.json'))) await writeJson(projectDir, 'project.strings.json', createStringTable());

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
  if (manifest.schemaVersion !== '0.4') {
    manifest = { ...manifest, schemaVersion: '0.4', updatedAt: new Date().toISOString() };
    await writeJson(root, 'scemq.project.json', manifest);
  }
  return manifest;
}

export async function saveProject(root, manifest) {
  const next = { ...manifest, schemaVersion: '0.4', updatedAt: new Date().toISOString() };
  await writeJson(root, 'scemq.project.json', next);
  return next;
}

export async function loadProjectBundle(root, manifest) {
  const { projectDir, charactersDir, inventoryDir } = await ensureProjectModules(root, manifest);
  const ui = await readJson(projectDir, 'project.ui.json');
  const variables = await readJson(projectDir, 'project.variables.json');
  const rawSettings = await readJson(projectDir, 'project.settings.json');
  const defaults = createProjectSettings(manifest.name);
  const settings = { ...defaults, ...rawSettings, cursorRoles: { ...(defaults.cursorRoles || {}), ...(rawSettings.cursorRoles || {}) }, defaultActionSounds: { ...(defaults.defaultActionSounds || {}), ...(rawSettings.defaultActionSounds || {}) } };
  const sceneManager = normalizeSceneManager(await readJson(projectDir, 'project.scene-manager.json'), manifest.scenes || []);
  // The string table is authored data, never generated on load: a project with no
  // translations simply carries an empty table and the runtime falls back to source text.
  const strings = { ...createStringTable(), ...(await readJson(projectDir, 'project.strings.json')), kind: STRING_TABLE_KIND };
  const characters = (await scanJsonDirectory(charactersDir, '.character.json')).map(c => normalizeCharacterAnimationData({ ...c, schemaVersion: '0.4' }));
  const inventory = (await scanJsonDirectory(inventoryDir, '.item.json')).map(item => ({
    ...item,
    schemaVersion: '0.4',
    folder: item.folder || '',
    sourceSceneId: item.sourceSceneId || '',
    interactions: { ...Object.fromEntries(INVENTORY_VERBS.map((verb) => [verb, true])), ...(item.interactions || {}) },
    combinations: (item.combinations || []).map(combo => ({ ...combo, bidirectional: combo.bidirectional ?? true }))
  }));
  const assetUrls = { ui: {}, characters: {}, inventory: {}, audio: {} };

  for (const character of characters) {
    for (const [slot, path] of Object.entries(character.assets || {})) {
      if (!path) continue;
      try { assetUrls.characters[`${character.id}:${slot}`] = await readProjectAssetUrl(root, 'characters', path); } catch {}
    }
    for (const [name, animation] of Object.entries(character.animations || {})) {
      if (!animation?.src) continue;
      try { assetUrls.characters[characterAnimationAssetKey(character.id, name)] = await readProjectAssetUrl(root, 'characters', animation.src); } catch {}
    }
  }
  for (const item of inventory) {
    if (!item.asset) continue;
    try { assetUrls.inventory[item.id] = await readProjectAssetUrl(root, 'inventory', item.asset); } catch {}
  }
  for (const path of Object.values(settings.defaultActionSounds || {})) {
    if (!path) continue;
    try { assetUrls.audio[path] = await readProjectAssetUrl(root, 'audio', path); } catch {}
  }
  for (const element of ui.elements || []) {
    if (!element.asset) continue;
    try { assetUrls.ui[element.id] = await readProjectAssetUrl(root, 'ui', element.asset); } catch {}
  }
  if (ui.screen?.asset) {
    try { assetUrls.ui.__screenBackground = await readProjectAssetUrl(root, 'ui', ui.screen.asset); } catch {}
  }
  for (const [role, path] of Object.entries(settings.cursorRoles || {})) {
    if (!path) continue;
    try { assetUrls.ui[`cursorRole:${role}`] = await readProjectAssetUrl(root, 'ui', path); } catch {}
  }
  for (const [verb, path] of Object.entries(ui.cursors || {})) {
    if (!path) continue;
    try { assetUrls.ui[`cursor:${verb}`] = await readProjectAssetUrl(root, 'ui', path); } catch {}
  }

  return { ui, variables, settings, sceneManager, strings, characters, inventory, assetUrls };
}

export async function saveProjectBundle(root, data) {
  const { projectDir, charactersDir, inventoryDir } = await ensureProjectModules(root, { name: data.settings?.title || 'Project' });
  await writeJson(projectDir, 'project.ui.json', { ...data.ui, schemaVersion: '0.4' });
  await writeJson(projectDir, 'project.variables.json', { ...data.variables, schemaVersion: '0.4' });
  await writeJson(projectDir, 'project.settings.json', { ...data.settings, schemaVersion: '0.4' });
  await writeJson(projectDir, 'project.scene-manager.json', { ...data.sceneManager, schemaVersion: '0.4', kind: 'scemq-scene-manager' });
  await writeJson(projectDir, 'project.strings.json', { ...createStringTable(), ...(data.strings || {}), schemaVersion: '0.4', kind: STRING_TABLE_KIND });

  const expectedCharacters = new Set();
  for (const character of data.characters || []) {
    const filename = `${slugify(character.id)}.character.json`;
    expectedCharacters.add(filename);
    await writeJson(charactersDir, filename, { ...character, schemaVersion: '0.4' });
  }
  for await (const [name, handle] of charactersDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.character.json') && !expectedCharacters.has(name)) await charactersDir.removeEntry(name);
  }

  const expectedItems = new Set();
  for (const item of data.inventory || []) {
    const filename = `${slugify(item.id)}.item.json`;
    expectedItems.add(filename);
    await writeJson(inventoryDir, filename, { ...item, schemaVersion: '0.4' });
  }
  for await (const [name, handle] of inventoryDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.item.json') && !expectedItems.has(name)) await inventoryDir.removeEntry(name);
  }
}

export async function createScene(root, project, sceneName, options = {}) {
  const sceneType = options.sceneType === 'title' ? 'title' : 'gameplay';
  const sceneId = options.sceneId || (sceneType === 'title' && !project.scenes.some((scene) => scene.id === 'scene0') ? 'scene0' : nextSceneId(project.scenes));
  const sceneFolder = sceneId;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneFolder]);
  await ensureDirectory(sceneDir, ['objects']);
  await ensureDirectory(sceneDir, ['dialogues']);
  await ensureDirectory(sceneDir, ['assets']);

  const meta = createSceneManifest(sceneId, sceneName, sceneType);
  const visual = createVisualConfig(sceneId);
  if (sceneType === 'title') { visual.canvas = { ...visual.canvas, width: 1280, height: 900 }; visual.titleScreen = { ...visual.titleScreen, title: project.name || sceneName }; }
  const logic = createLogicConfig(sceneId);

  await writeJson(sceneDir, `scene.meta.${sceneId}.json`, meta);
  await writeJson(sceneDir, `scene.visual.${sceneId}.json`, visual);
  await writeJson(sceneDir, `scene.logic.${sceneId}.json`, logic);

  const nextProject = { ...project, scenes: [...project.scenes, { id: sceneId, name: sceneName, folder: sceneFolder, sceneType }] };
  return { sceneId, project: await saveProject(root, nextProject) };
}

function migrateVisual(visual) {
  const base = createVisualConfig(visual.sceneId);
  const start = visual.player?.start || visual.playerStart || base.player.start;
  const oldBounds = visual.viewport?.bounds || {};
  const limits = visual.viewport?.limits || {
    left: Number(oldBounds.x ?? 0),
    top: Number(oldBounds.y ?? 0),
    right: Number((oldBounds.x ?? 0) + (oldBounds.width ?? visual.canvas?.width ?? base.canvas.width)),
    bottom: Number((oldBounds.y ?? 0) + (oldBounds.height ?? visual.canvas?.height ?? base.canvas.height))
  };
  return {
    ...base,
    ...visual,
    schemaVersion: '0.4',
    background: { ...base.background, ...(visual.background || {}) },
    titleScreen: {
      ...base.titleScreen,
      ...(visual.titleScreen || {}),
      titleTransform: { ...base.titleScreen.titleTransform, ...(visual.titleScreen?.titleTransform || {}) },
      titleStyle: { ...base.titleScreen.titleStyle, ...(visual.titleScreen?.titleStyle || {}) },
      newGame: { ...base.titleScreen.newGame, ...(visual.titleScreen?.newGame || {}), transform: { ...base.titleScreen.newGame.transform, ...(visual.titleScreen?.newGame?.transform || {}) }, style: { ...base.titleScreen.newGame.style, ...(visual.titleScreen?.newGame?.style || {}) } },
      loadGame: { ...base.titleScreen.loadGame, ...(visual.titleScreen?.loadGame || {}), transform: { ...base.titleScreen.loadGame.transform, ...(visual.titleScreen?.loadGame?.transform || {}) }, style: { ...base.titleScreen.loadGame.style, ...(visual.titleScreen?.loadGame?.style || {}) } }
    },
    viewport: {
      ...base.viewport,
      ...(visual.viewport || {}),
      followPlayer: visual.viewport?.followPlayer ?? visual.viewport?.cameraMode !== 'fixed',
      limits
    },
    player: { ...base.player, ...(visual.player || {}), start },
    playerStart: start,
    spawnPoints: visual.spawnPoints?.length ? visual.spawnPoints : [{ id: 'default', name: 'Default', x: start.x, y: start.y, facing: visual.player?.facing || 'right' }],
    walkAreas: visual.walkAreas || [],
    depthAreas: visual.depthAreas || []
  };
}

function migrateObject(object) {
  const base = {
    asset: { path: '', state: 'default', states: { default: '' } },
    transform: { flipX: false, locked: false, lockAspect: true, aspectRatio: 0, anchor: object.type === 'character' ? 'bottom-center' : 'top-left', anchorX: 0.5, anchorY: object.type === 'character' ? 1 : 0 },
    interactionPoint: { x: (object.transform?.x || 0) + (object.transform?.width || 100) / 2, y: (object.transform?.y || 0) + (object.transform?.height || 100), facingMode: 'auto', facing: 'right' },
    notes: ''
  };
  const asset = { ...base.asset, ...(object.asset || {}) };
  if (!asset.states || !Object.keys(asset.states).length) asset.states = { default: asset.path || '' };
  if (!asset.states.default) asset.states.default = asset.path || '';
  const character = object.type === 'character'
    ? { characterId: object.character?.characterId || object.id, displayName: object.character?.displayName || object.name, role: object.character?.role || 'npc', walkSpeed: object.character?.walkSpeed || 180 }
    : null;
  const exit = object.type === 'exit' ? { destinationSceneId: '', spawnPointId: 'default', transition: 'fade', walkFirst: true, availabilityRuleId: '', hiddenUntilAvailable: false, blockedMessage: 'You cannot go there yet.', ...(object.exit || {}) } : null;
  const hotspot = { enabled: object.type !== 'scenery', label: object.name, actions: {}, shape: 'visual', bounds: { x: 0, y: 0, width: 1, height: 1 }, alphaThreshold: 8, ...(object.hotspot || {}) };
  hotspot.bounds = { x: 0, y: 0, width: 1, height: 1, ...(object.hotspot?.bounds || {}) };
  const transform = { ...object.transform, ...base.transform, ...(object.transform || {}) }; if (object.type === 'character') transform.lockAspect = true; return { ...object, schemaVersion: '0.4', asset, transform, hotspot, interactionPoint: { ...base.interactionPoint, ...(object.interactionPoint || {}) }, character, exit, notes: object.notes || '' };
}

export async function loadSceneBundle(root, sceneRef) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);
  const assetsDir = await ensureDirectory(sceneDir, ['assets']);

  const rawMeta = await readJson(sceneDir, `scene.meta.${sceneId}.json`);
  const meta = { ...rawMeta, sceneType: rawMeta.sceneType || 'gameplay', audio: { music: '', ambient: '', sfx: [], ...(rawMeta.audio || {}) } };
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
  for (const path of (meta.audio?.sfx || [])) {
    if (!path) continue;
    try {
      const fileHandle = await assetsDir.getFileHandle(path);
      assetUrls[`__sfx:${path}`] = URL.createObjectURL(await fileHandle.getFile());
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

  return { meta, visual, logic: { ...logic, schemaVersion: '0.4' }, objects, dialogues, assetUrls, stateAssetUrls };
}

export async function saveSceneBundle(root, sceneRef, bundle) {
  const sceneId = sceneRef.id;
  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId]);
  const objectsDir = await ensureDirectory(sceneDir, ['objects']);
  const dialoguesDir = await ensureDirectory(sceneDir, ['dialogues']);

  await writeJson(sceneDir, `scene.meta.${sceneId}.json`, { ...bundle.meta, schemaVersion: '0.4', updatedAt: new Date().toISOString() });
  await writeJson(sceneDir, `scene.visual.${sceneId}.json`, { ...bundle.visual, schemaVersion: '0.4', playerStart: bundle.visual.player?.start || bundle.visual.playerStart });
  await writeJson(sceneDir, `scene.logic.${sceneId}.json`, { ...bundle.logic, schemaVersion: '0.4' });

  const expectedObjectFiles = new Set();
  for (const object of bundle.objects) {
    const filename = `${slugify(object.id)}.object.${sceneId}.json`;
    expectedObjectFiles.add(filename);
    await writeJson(objectsDir, filename, { ...object, schemaVersion: '0.4' });
  }
  for await (const [name, handle] of objectsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith(`.object.${sceneId}.json`) && !expectedObjectFiles.has(name)) await objectsDir.removeEntry(name);
  }

  const expectedDialogueFiles = new Set();
  for (const dialogue of bundle.dialogues) {
    const filename = `${slugify(dialogue.characterId)}.dialogue.${sceneId}.json`;
    expectedDialogueFiles.add(filename);
    await writeJson(dialoguesDir, filename, { ...dialogue, schemaVersion: '0.4' });
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

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readAssetAsPackageEntry(dir, path, scope) {
  if (!path) return null;
  try {
    const handle = await dir.getFileHandle(path);
    const file = await handle.getFile();
    return { scope, path, mimeType: file.type || 'application/octet-stream', dataBase64: bytesToBase64(await file.arrayBuffer()) };
  } catch { return null; }
}

export async function embedScenePackageAssets(root, sceneRef, pkg) {
  const entries = [];
  const seen = new Set();
  const push = async (dir, path, scope) => {
    if (!path || seen.has(`${scope}:${path}`)) return;
    seen.add(`${scope}:${path}`);
    const entry = await readAssetAsPackageEntry(dir, path, scope);
    if (entry) entries.push(entry);
  };

  const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneRef.id]);
  const sceneAssets = await ensureDirectory(sceneDir, ['assets']);
  await push(sceneAssets, pkg.scene?.visual?.background?.path, 'scene');
  for (const slot of ['music', 'ambient']) await push(sceneAssets, pkg.scene?.meta?.audio?.[slot], 'scene');
  for (const path of (pkg.scene?.meta?.audio?.sfx || [])) await push(sceneAssets, path, 'scene');
  for (const object of pkg.scene?.objects || []) {
    await push(sceneAssets, object.asset?.path, 'scene');
    for (const path of Object.values(object.asset?.states || {})) await push(sceneAssets, path, 'scene');
  }

  const characterAssets = await ensureDirectory(root, ['assets', 'characters']);
  for (const character of pkg.dependencies?.characters || []) {
    for (const path of Object.values(character.assets || {})) await push(characterAssets, path, 'characters');
    for (const animation of Object.values(character.animations || {})) await push(characterAssets, animation?.src, 'characters');
  }
  const inventoryAssets = await ensureDirectory(root, ['assets', 'inventory']);
  for (const item of pkg.dependencies?.inventory || []) {
    await push(inventoryAssets, item.asset, 'inventory');
    await push(inventoryAssets, item.cursorAsset, 'inventory');
  }
  return { ...pkg, assets: entries };
}

async function writePackageAsset(root, sceneRef, entry) {
  if (!entry?.path || !entry?.dataBase64) return;
  let dir;
  if (entry.scope === 'scene') {
    const sceneDir = await ensureDirectory(root, ['scenes', sceneRef.folder || sceneRef.id]);
    dir = await ensureDirectory(sceneDir, ['assets']);
  } else if (['characters', 'inventory', 'ui'].includes(entry.scope)) {
    dir = await ensureDirectory(root, ['assets', entry.scope]);
  } else return;
  const handle = await dir.getFileHandle(entry.path, { create: true });
  const writable = await handle.createWritable();
  await writable.write(base64ToBytes(entry.dataBase64));
  await writable.close();
}

export async function applyScenePackage(root, project, projectData, pkg, { mode = 'replace', targetSceneId = '' } = {}) {
  const { mergeDependencies, remapScenePackage } = await import('./scenePackage.js');
  const desiredId = targetSceneId || pkg.sceneId;
  const working = remapScenePackage(pkg, desiredId);
  const sceneId = working.sceneId;
  const sceneName = working.scene?.meta?.name || working.name || sceneId;
  const existing = (project.scenes || []).find(scene => scene.id === sceneId);
  if (existing && mode !== 'replace') throw new Error(`Scene ${sceneId} already exists.`);

  let nextProjectData = mergeDependencies(projectData, working);
  const importedType = working.scene?.meta?.sceneType || 'gameplay';
  if (importedType === 'title' && !nextProjectData.settings?.titleSceneId) nextProjectData = { ...nextProjectData, settings: { ...(nextProjectData.settings || {}), titleSceneId: sceneId } };
  if (importedType !== 'title' && !nextProjectData.settings?.defaultSceneId) nextProjectData = { ...nextProjectData, settings: { ...(nextProjectData.settings || {}), defaultSceneId: sceneId } };
  await saveProjectBundle(root, nextProjectData);

  const sceneRef = existing
    ? { ...existing, name: sceneName, sceneType: importedType }
    : { id: sceneId, name: sceneName, folder: sceneId, sceneType: importedType };
  const scenes = existing
    ? project.scenes.map(scene => scene.id === sceneId ? sceneRef : scene)
    : [...(project.scenes || []), sceneRef];
  const nextProject = await saveProject(root, { ...project, scenes });

  await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId, 'objects']);
  await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId, 'dialogues']);
  await ensureDirectory(root, ['scenes', sceneRef.folder || sceneId, 'assets']);
  await saveSceneBundle(root, sceneRef, working.scene);
  for (const entry of working.assets || []) await writePackageAsset(root, sceneRef, entry);

  return { project: nextProject, projectData: nextProjectData, sceneRef };
}
