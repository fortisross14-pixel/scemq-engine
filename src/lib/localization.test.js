import test from 'node:test';
import assert from 'node:assert/strict';
import { addLanguage, createStringTable, createTranslator, extractStrings, fromCsv, key, mergeStringTable, toCsv, translationProgress } from './localization.js';

const projectData = {
  settings: { title: 'Isla Perdida' },
  characters: [{ id: 'mara', name: 'Mara' }],
  inventory: [{ id: 'key', name: 'Rusty key', description: 'It is very rusty.', pickupMessage: '' }],
  ui: { elements: [{ id: 'save-button', type: 'button', label: 'Save' }] }
};

const scenes = [{
  ref: { id: 'scene1', name: 'The Docks' },
  bundle: {
    meta: { sceneType: 'gameplay' },
    objects: [{ id: 'crate', name: 'Crate', hotspot: { label: 'wooden crate', actions: { look: { textResponse: 'A very ordinary crate.' } } } }],
    logic: { rules: [{ id: 'r1', name: 'Look at crate', actions: [{ type: 'say', value: 'It smells of fish.' }, { type: 'setFlag' }] }] },
    dialogues: [{
      characterId: 'mara',
      nodes: [{ id: 'start', beats: [{ id: 'b1', text: 'You again.' }], choices: [{ id: 'c1', text: 'About the key…', actions: [{ type: 'say', value: 'Not now.' }] }] }]
    }]
  }
}];

test('extraction reaches project text and every scene', () => {
  const keys = extractStrings({ projectData, scenes }).map((e) => e.key);
  assert.ok(keys.includes(key.gameTitle()));
  assert.ok(keys.includes(key.itemDescription('key')));
  assert.ok(keys.includes(key.uiLabel('save-button')));
  assert.ok(keys.includes(key.objectLabel('scene1', 'crate')));
  assert.ok(keys.includes(key.objectResponse('scene1', 'crate', 'look')));
  assert.ok(keys.includes(key.actionSay('scene1', 'r1', 0)));
  assert.ok(keys.includes(key.dialogueBeat('scene1', 'mara', 'start', 'b1')));
  assert.ok(keys.includes(key.dialogueChoice('scene1', 'mara', 'start', 'c1')));
  assert.ok(keys.includes(key.choiceActionSay('scene1', 'mara', 'start', 'c1', 0)));
});

test('blank strings are never collected', () => {
  const keys = extractStrings({ projectData, scenes }).map((e) => e.key);
  assert.ok(!keys.includes(key.itemPickup('key')));
});

test('rescanning keeps translations and flags changed sources', () => {
  let table = mergeStringTable(createStringTable('en'), extractStrings({ projectData, scenes }));
  table = addLanguage(table, 'es');
  table.entries[key.gameTitle()].translations.es = 'Isla Perdida';
  const edited = { ...projectData, settings: { title: 'Isla Encontrada' } };
  const next = mergeStringTable(table, extractStrings({ projectData: edited, scenes }));
  assert.equal(next.entries[key.gameTitle()].translations.es, 'Isla Perdida');
  assert.equal(next.entries[key.gameTitle()].stale, true);
});

test('strings that leave the project are marked, not deleted', () => {
  let table = mergeStringTable(createStringTable('en'), extractStrings({ projectData, scenes }));
  table = addLanguage(table, 'es');
  table.entries[key.itemDescription('key')].translations.es = 'Muy oxidada.';
  const next = mergeStringTable(table, extractStrings({ projectData: { ...projectData, inventory: [] }, scenes }));
  assert.equal(next.entries[key.itemDescription('key')].missing, true);
  assert.equal(next.entries[key.itemDescription('key')].translations.es, 'Muy oxidada.');
});

test('CSV survives a round trip, quotes and commas included', () => {
  let table = addLanguage(mergeStringTable(createStringTable('en'), extractStrings({ projectData, scenes })), 'es');
  table.entries[key.actionSay('scene1', 'r1', 0)].translations.es = 'Huele a pescado, mucho.';
  const restored = fromCsv(addLanguage(createStringTable('en'), 'es'), toCsv(table));
  assert.equal(restored.entries[key.actionSay('scene1', 'r1', 0)].translations.es, 'Huele a pescado, mucho.');
});

test('progress counts only strings still in use', () => {
  let table = addLanguage(mergeStringTable(createStringTable('en'), extractStrings({ projectData, scenes })), 'es');
  const before = translationProgress(table, 'es');
  assert.equal(before.translated, 0);
  table.entries[key.gameTitle()].translations.es = 'Isla Perdida';
  assert.equal(translationProgress(table, 'es').translated, 1);
});

test('an untranslated line falls back to the source text', () => {
  let table = addLanguage(mergeStringTable(createStringTable('en'), extractStrings({ projectData, scenes })), 'es');
  table.entries[key.gameTitle()].translations.es = 'Isla Perdida';
  const es = createTranslator(table, 'es');
  assert.equal(es(key.gameTitle(), 'Isla Perdida (source)'), 'Isla Perdida');
  assert.equal(es(key.itemName('key'), 'Rusty key'), 'Rusty key');
  const source = createTranslator(table, 'en');
  assert.equal(source(key.gameTitle(), 'Isla Perdida'), 'Isla Perdida');
});
