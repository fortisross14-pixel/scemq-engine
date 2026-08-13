import React, { useMemo, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { addLanguage, createStringTable, extractStrings, fromCsv, mergeStringTable, toCsv, translationProgress } from '../lib/localization.js';

function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export default function LocalizationEditor({ project, projectData, table, loadScene, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [onlyUntranslated, setOnlyUntranslated] = useState(false);

  const current = table || createStringTable(projectData?.settings?.language || 'en');
  const targets = (current.languages || []).filter((code) => code !== current.defaultLanguage);
  const active = language && targets.includes(language) ? language : targets[0] || '';
  const progress = active ? translationProgress(current, active) : { total: 0, translated: 0, percent: 0 };

  const rows = useMemo(() => {
    const list = Object.entries(current.entries || {}).map(([key, entry]) => ({ key, ...entry }));
    const needle = search.trim().toLowerCase();
    return list
      .filter((row) => !needle || row.key.toLowerCase().includes(needle) || String(row.source).toLowerCase().includes(needle) || String(row.context).toLowerCase().includes(needle))
      .filter((row) => !onlyUntranslated || !String(row.translations?.[active] || '').trim())
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [current, search, onlyUntranslated, active]);

  async function rescan() {
    setBusy(true);
    setError('');
    try {
      const scenes = [];
      for (const ref of project.scenes || []) scenes.push({ ref, bundle: await loadScene(ref) });
      onChange(mergeStringTable(current, extractStrings({ projectData, scenes })));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function addTargetLanguage() {
    const code = window.prompt('Language code to add (for example: es, fr, pt-br)', 'es');
    if (!code) return;
    const next = addLanguage(current, code);
    onChange(next);
    setLanguage(String(code).trim().toLowerCase());
  }

  function setTranslation(key, value) {
    if (!active) return;
    const entry = current.entries[key];
    onChange({
      ...current,
      entries: {
        ...current.entries,
        [key]: { ...entry, translations: { ...entry.translations, [active]: value }, stale: false }
      }
    });
  }

  async function importCsv() {
    const file = await pickTextFile('.csv,text/csv');
    if (!file) return;
    try {
      onChange(fromCsv(current, await file.text()));
    } catch (e) {
      setError(`That CSV could not be read: ${e.message}`);
    }
  }

  const entryCount = Object.keys(current.entries || {}).length;

  return (
    <div className="report-page">
      <div className="report-head">
        <div>
          <div className="eyebrow">Text &amp; translation</div>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 640, lineHeight: 1.6 }}>
            Every authored line — dialogue, say actions, hotspot labels, item descriptions, blocked-exit messages,
            title screen and GUI buttons — is collected here under a stable key. Translations live in
            <code> project/project.strings.json</code> and never touch your scene files. Pick the runtime language in
            Settings; an untranslated line falls back to the original.
          </p>
        </div>
        <div className="toolbar-group">
          <button onClick={importCsv}>Import CSV</button>
          <button onClick={() => download(`${project.id || 'project'}.strings.csv`, toCsv(current))} disabled={!entryCount}>Export CSV</button>
          <button className="primary-soft" onClick={rescan} disabled={busy}>{busy ? 'Scanning…' : 'Scan project text'}</button>
        </div>
      </div>

      {error && <div className="workspace-error"><span>{error}</span></div>}

      <div className="strings-toolbar">
        <InspectorField label="Translating into">
          <select value={active} onChange={(e) => setLanguage(e.target.value)} disabled={!targets.length}>
            {!targets.length && <option value="">No target language yet</option>}
            {targets.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </InspectorField>
        <button className="small-button" onClick={addTargetLanguage}>+ Language</button>
        <InspectorField label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="key, source text or context" />
        </InspectorField>
        <label className="checkbox-row">
          <input type="checkbox" checked={onlyUntranslated} onChange={(e) => setOnlyUntranslated(e.target.checked)} /> Untranslated only
        </label>
        {active && (
          <div className="strings-progress">
            <span className="tiny muted">{progress.translated} / {progress.total} translated · {progress.percent}%</span>
            <div className="strings-progress-bar"><i style={{ width: `${progress.percent}%` }} /></div>
          </div>
        )}
      </div>

      {!entryCount ? (
        <div className="empty-panel">No strings collected yet. Run <strong>Scan project text</strong> to read every scene.</div>
      ) : (
        <table className="strings-table">
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Key</th>
              <th>Source ({current.defaultLanguage})</th>
              <th>{active || 'translation'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={active && !String(row.translations?.[active] || '').trim() ? 'untranslated' : ''}>
                <td>
                  <code className="string-key">{row.key}</code>
                  {row.context && <div className="tiny muted">{row.context}</div>}
                  {row.stale && <div className="tiny" style={{ color: '#e8c67f' }}>Source changed since translating</div>}
                  {row.missing && <div className="tiny muted">No longer used in the project</div>}
                </td>
                <td className="source">{row.source}</td>
                <td>
                  <textarea
                    rows="2"
                    value={row.translations?.[active] || ''}
                    disabled={!active}
                    placeholder={active ? '' : 'Add a language first'}
                    onChange={(e) => setTranslation(row.key, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
