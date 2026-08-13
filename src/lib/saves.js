export const SAVE_FORMAT = 2;
export const AUTOSAVE_SLOT = 'auto';

export function saveKey(projectId, slot) {
  return `scemq-save:${projectId}:${slot}`;
}

export function createSaveRecord(state = {}) {
  return {
    format: SAVE_FORMAT,
    savedAt: new Date().toISOString(),
    sceneId: state.sceneId || '',
    sceneName: state.sceneName || '',
    playtimeMs: Math.max(0, Number(state.playtimeMs || 0)),
    playerCharacterId: state.playerCharacterId || '',
    playerPos: state.playerPos || { x: 0, y: 0 },
    facing: state.facing || 'right',
    camera: state.camera || { x: 0, y: 0 },
    runtime: state.runtime || {}
  };
}

// v0.5 saves stored a bare {runtime, sceneId, playerPos, camera} blob. Rather
// than discard them, upgrade in place so nobody loses an in-progress playthrough.
export function migrateSaveRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.format === SAVE_FORMAT) return raw;
  return createSaveRecord({
    sceneId: raw.sceneId,
    sceneName: raw.sceneName || '',
    playerPos: raw.playerPos,
    camera: raw.camera,
    runtime: raw.runtime || {}
  });
}

export function formatPlaytime(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function slotIds(saveSlots = 3) {
  const count = Math.max(1, Math.min(20, Number(saveSlots) || 3));
  return [AUTOSAVE_SLOT, ...Array.from({ length: count }, (_, index) => String(index + 1))];
}

function storageOrNull(storage) {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readSave(projectId, slot, storage) {
  const store = storageOrNull(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(saveKey(projectId, slot));
    return raw ? migrateSaveRecord(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function writeSave(projectId, slot, record, storage) {
  const store = storageOrNull(storage);
  if (!store) return false;
  try { store.setItem(saveKey(projectId, slot), JSON.stringify(record)); return true; }
  catch { return false; }
}

export function deleteSave(projectId, slot, storage) {
  const store = storageOrNull(storage);
  if (!store) return false;
  try { store.removeItem(saveKey(projectId, slot)); return true; } catch { return false; }
}

export function listSaves(projectId, saveSlots = 3, storage) {
  return slotIds(saveSlots).map((slot) => ({ slot, record: readSave(projectId, slot, storage) }));
}
