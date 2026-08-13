import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOSAVE_SLOT, createSaveRecord, deleteSave, formatPlaytime, listSaves, migrateSaveRecord, readSave, saveKey, slotIds, writeSave } from './saves.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test('slots always include the autosave slot', () => {
  const ids = slotIds(3);
  assert.ok(ids.includes(AUTOSAVE_SLOT));
  assert.equal(ids.filter((id) => id !== AUTOSAVE_SLOT).length, 3);
});

test('a save round-trips through storage', () => {
  const storage = memoryStorage();
  const record = createSaveRecord({ sceneId: 'scene2', sceneName: 'The Docks', runtime: { flags: { metGuard: true } } });
  writeSave('proj', '1', record, storage);
  const read = readSave('proj', '1', storage);
  assert.equal(read.sceneId, 'scene2');
  assert.equal(read.runtime.flags.metGuard, true);
  assert.ok(storage.getItem(saveKey('proj', '1')));
});

test('an empty slot reads as null rather than throwing', () => {
  assert.equal(readSave('proj', '9', memoryStorage()), null);
});

test('deleting a slot empties it', () => {
  const storage = memoryStorage();
  writeSave('proj', '1', createSaveRecord({ sceneId: 'scene1' }), storage);
  deleteSave('proj', '1', storage);
  assert.equal(readSave('proj', '1', storage), null);
});

test('listSaves reports every slot, filled or not', () => {
  const storage = memoryStorage();
  writeSave('proj', '2', createSaveRecord({ sceneId: 'scene1' }), storage);
  const list = listSaves('proj', 3, storage);
  assert.equal(list.length, slotIds(3).length);
  assert.ok(list.find((entry) => entry.slot === '2').record);
  assert.equal(list.find((entry) => entry.slot === '1').record, null);
});

test('a pre-v0.6 save is migrated instead of rejected', () => {
  const legacy = { runtime: { flags: {} }, sceneId: 'scene1', playerPos: { x: 10, y: 20 } };
  const migrated = migrateSaveRecord(legacy);
  assert.equal(migrated.sceneId, 'scene1');
  assert.deepEqual(migrated.playerPos, { x: 10, y: 20 });
});

test('playtime reads as a clock, not milliseconds', () => {
  assert.equal(typeof formatPlaytime(0), 'string');
  assert.match(formatPlaytime(3_723_000), /1/);
});
