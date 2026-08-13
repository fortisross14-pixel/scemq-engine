export const STRING_TABLE_KIND = 'scemq-project-strings';

export function createStringTable(defaultLanguage = 'en') {
  return {
    schemaVersion: '0.4',
    kind: STRING_TABLE_KIND,
    defaultLanguage,
    languages: [defaultLanguage],
    entries: {}
  };
}

// Every authored string gets a key derived from where it lives, so the same key
// is computable at runtime without storing it back into the scene files.
export const key = {
  gameTitle: () => 'settings.title',
  verbResponse: (verb) => `settings.response.${verb}`,
  characterName: (characterId) => `character.${characterId}.name`,
  itemName: (itemId) => `item.${itemId}.name`,
  itemDescription: (itemId) => `item.${itemId}.description`,
  itemPickup: (itemId) => `item.${itemId}.pickup`,
  uiLabel: (elementId) => `ui.${elementId}.label`,
  objectLabel: (sceneId, objectId) => `object.${sceneId}.${objectId}.label`,
  exitBlocked: (sceneId, objectId) => `object.${sceneId}.${objectId}.blocked`,
  actionSay: (sceneId, ruleId, index) => `rule.${sceneId}.${ruleId}.say.${index}`,
  dialogueBeat: (sceneId, characterId, nodeId, beatId) => `dialogue.${sceneId}.${characterId}.${nodeId}.beat.${beatId}`,
  dialogueChoice: (sceneId, characterId, nodeId, choiceId) => `dialogue.${sceneId}.${characterId}.${nodeId}.choice.${choiceId}`,
  choiceActionSay: (sceneId, characterId, nodeId, choiceId, index) => `dialogue.${sceneId}.${characterId}.${nodeId}.choice.${choiceId}.say.${index}`,
  titleText: (sceneId) => `scene.${sceneId}.title`,
  titleButton: (sceneId, which) => `scene.${sceneId}.button.${which}`
};

function push(list, entryKey, text, context) {
  const value = String(text ?? '').trim();
  if (!value) return;
  list.push({ key: entryKey, text: value, context });
}

export function extractStrings({ projectData = {}, scenes = [] } = {}) {
  const entries = [];
  const settings = projectData.settings || {};
  push(entries, key.gameTitle(), settings.title, 'Game title');
  for (const [verb, lines] of Object.entries(settings.defaultResponses || {})) {
    push(entries, key.verbResponse(verb), Array.isArray(lines) ? lines.join('\n') : lines, `Default response for ${verb}`);
  }
  for (const character of projectData.characters || []) push(entries, key.characterName(character.id), character.name, 'Character name');
  for (const item of projectData.inventory || []) {
    push(entries, key.itemName(item.id), item.name, 'Inventory item name');
    push(entries, key.itemDescription(item.id), item.description, `Description of ${item.name}`);
    push(entries, key.itemPickup(item.id), item.pickupMessage, `Pickup message for ${item.name}`);
  }
  for (const element of projectData.ui?.elements || []) {
    if (element.type === 'statusText') continue;
    push(entries, key.uiLabel(element.id), element.label, `GUI ${element.type}`);
  }

  for (const { ref, bundle } of scenes) {
    const sceneId = ref.id;
    if (bundle.meta?.sceneType === 'title') {
      push(entries, key.titleText(sceneId), bundle.visual?.titleScreen?.title, 'Title screen heading');
      push(entries, key.titleButton(sceneId, 'newGame'), bundle.visual?.titleScreen?.newGame?.label, 'Title screen button');
      push(entries, key.titleButton(sceneId, 'loadGame'), bundle.visual?.titleScreen?.loadGame?.label, 'Title screen button');
    }
    for (const object of bundle.objects || []) {
      push(entries, key.objectLabel(sceneId, object.id), object.hotspot?.label || object.name, `Hotspot label in ${ref.name}`);
      if (object.type === 'exit') push(entries, key.exitBlocked(sceneId, object.id), object.exit?.blockedMessage, `Blocked exit message in ${ref.name}`);
    }
    for (const rule of bundle.logic?.rules || []) {
      for (const [index, action] of (rule.actions || []).entries()) {
        if (action.type === 'say') push(entries, key.actionSay(sceneId, rule.id, index), action.value, `Line in rule "${rule.name}" (${ref.name})`);
      }
    }
    for (const dialogue of bundle.dialogues || []) {
      for (const node of dialogue.nodes || []) {
        for (const beat of node.beats || []) {
          push(entries, key.dialogueBeat(sceneId, dialogue.characterId, node.id, beat.id), beat.text, `${dialogue.characterId} · ${node.id}`);
        }
        for (const choice of node.choices || []) {
          push(entries, key.dialogueChoice(sceneId, dialogue.characterId, node.id, choice.id), choice.text, `Player choice · ${dialogue.characterId}`);
          for (const [index, action] of (choice.actions || []).entries()) {
            if (action.type === 'say') push(entries, key.choiceActionSay(sceneId, dialogue.characterId, node.id, choice.id, index), action.value, `Line in a choice · ${dialogue.characterId}`);
          }
        }
      }
    }
  }
  return entries;
}

// Merging never throws away an existing translation. It only refreshes the
// source text and flags rows whose source changed since translation.
export function mergeStringTable(table, entries) {
  const base = table && table.entries ? table : createStringTable(table?.defaultLanguage || 'en');
  const next = { ...base, entries: {} };
  const seen = new Set();
  for (const entry of entries) {
    seen.add(entry.key);
    const existing = base.entries[entry.key];
    next.entries[entry.key] = {
      source: entry.text,
      context: entry.context || existing?.context || '',
      translations: existing?.translations || {},
      stale: !!existing && existing.source !== entry.text,
      missing: false
    };
  }
  for (const [entryKey, value] of Object.entries(base.entries)) {
    if (seen.has(entryKey)) continue;
    next.entries[entryKey] = { ...value, missing: true };
  }
  return next;
}

export function addLanguage(table, language) {
  const code = String(language || '').trim().toLowerCase();
  if (!code || table.languages?.includes(code)) return table;
  return { ...table, languages: [...(table.languages || []), code] };
}

export function translationProgress(table, language) {
  const keys = Object.keys(table?.entries || {}).filter((k) => !table.entries[k].missing);
  if (!keys.length) return { total: 0, translated: 0, percent: 100 };
  const translated = keys.filter((k) => String(table.entries[k].translations?.[language] || '').trim()).length;
  return { total: keys.length, translated, percent: Math.round((translated / keys.length) * 100) };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(table, languages = null) {
  const langs = languages || (table.languages || []).filter((l) => l !== table.defaultLanguage);
  const header = ['key', 'context', 'source', ...langs];
  const rows = Object.entries(table.entries || {})
    .filter(([, value]) => !value.missing)
    .map(([entryKey, value]) => [entryKey, value.context || '', value.source || '', ...langs.map((l) => value.translations?.[l] || '')]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text || '').replace(/\r\n/g, '\n');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((value) => String(value).length));
}

export function fromCsv(table, text) {
  const rows = parseCsv(text);
  if (!rows.length) return table;
  const [header, ...body] = rows;
  const languages = header.slice(3).map((l) => String(l).trim().toLowerCase()).filter(Boolean);
  let next = { ...table, entries: { ...table.entries } };
  for (const language of languages) next = addLanguage(next, language);
  for (const row of body) {
    const entryKey = row[0];
    if (!entryKey) continue;
    // A CSV coming back from a translator may arrive before the project has been
    // scanned. Create the row rather than dropping the work on the floor; the next
    // scan marks anything the project no longer uses as missing.
    if (!next.entries[entryKey]) next.entries[entryKey] = { source: row[2] || '', context: row[1] || '', translations: {}, stale: false, missing: true };
    const translations = { ...next.entries[entryKey].translations };
    languages.forEach((language, index) => {
      const value = row[3 + index];
      if (String(value ?? '').trim()) translations[language] = value;
    });
    next.entries[entryKey] = { ...next.entries[entryKey], translations, stale: false };
  }
  return next;
}

// The runtime asks for a key and always gets usable text back: the translation
// when it exists, the authored source otherwise.
export function createTranslator(table, language) {
  const active = language || table?.defaultLanguage || '';
  return function translate(entryKey, fallback = '') {
    if (!table || !active || active === table.defaultLanguage) return fallback;
    const entry = table.entries?.[entryKey];
    const value = entry?.translations?.[active];
    return String(value ?? '').trim() ? value : fallback;
  };
}
