import React, { useState } from 'react';
import { validateProject } from '../lib/validate.js';

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };

// Issues are grouped by scene so a fix session stays inside one room at a time.
function groupIssues(issues, project) {
  const names = new Map((project.scenes || []).map((scene) => [scene.id, scene.name]));
  const groups = new Map();
  for (const issue of issues) {
    const id = issue.sceneId || '';
    if (!groups.has(id)) groups.set(id, { sceneId: id, title: id ? `${names.get(id) || id}` : 'Project-wide', issues: [] });
    groups.get(id).issues.push(issue);
  }
  for (const group of groups.values()) group.issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return [...groups.values()].sort((a, b) => (a.sceneId === '' ? -1 : b.sceneId === '' ? 1 : a.sceneId.localeCompare(b.sceneId)));
}

export default function ValidationEditor({ project, projectData, loadScene, onOpenScene }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [checkedAt, setCheckedAt] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const scenes = [];
      for (const ref of project.scenes || []) scenes.push({ ref, bundle: await loadScene(ref) });
      setReport(validateProject({ project, projectData, scenes }));
      setCheckedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const visible = report ? report.issues.filter((issue) => filter === 'all' || issue.level === filter) : [];
  const groups = report ? groupIssues(visible, project) : [];
  const clean = report && !report.counts.error && !report.counts.warning;

  return (
    <div className="report-page">
      <div className="report-head">
        <div>
          <div className="eyebrow">Playability check</div>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 640, lineHeight: 1.6 }}>
            Reads every scene and follows the puzzle graph: items nothing can hand the player, flags nothing ever
            sets, exits gated behind conditions that can never become true, rooms no exit reaches, dialogue nodes
            with no route in, and story-critical items a rule can consume. These are the mistakes that make an
            adventure game unwinnable without ever throwing an error.
          </p>
        </div>
        <div className="toolbar-group">
          {report && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 150 }}>
              <option value="all">All levels</option>
              <option value="error">Errors only</option>
              <option value="warning">Warnings only</option>
              <option value="info">Info only</option>
            </select>
          )}
          <button className="primary-soft" onClick={run} disabled={busy}>
            {busy ? 'Checking…' : report ? 'Check again' : 'Run check'}
          </button>
        </div>
      </div>

      {error && <div className="workspace-error"><span>{error}</span></div>}

      {!report && !busy && (
        <div className="empty-panel">Nothing checked yet. Run the check to scan all {project.scenes?.length || 0} scenes.</div>
      )}

      {report && (
        <>
          <div className="report-counts" style={{ marginBottom: 16 }}>
            <span className={`report-chip ${report.counts.error ? 'error' : 'good'}`}>{report.counts.error} errors</span>
            <span className={`report-chip ${report.counts.warning ? 'warning' : 'good'}`}>{report.counts.warning} warnings</span>
            <span className="report-chip info">{report.counts.info} info</span>
            {checkedAt && <span className="report-chip">Checked {checkedAt}</span>}
          </div>

          {clean && <div className="empty-panel">No errors or warnings. Every item is obtainable, every flag has a source, and every scene can be reached.</div>}

          {groups.map((group) => (
            <div className="report-group" key={group.sceneId || 'project'}>
              <div className="report-group-head">
                <strong>{group.title}</strong>
                <div className="toolbar-group">
                  <span className="muted tiny">{group.issues.length} issue{group.issues.length === 1 ? '' : 's'}</span>
                  {group.sceneId && (
                    <button
                      className="small-button"
                      onClick={() => {
                        const scene = (project.scenes || []).find((s) => s.id === group.sceneId);
                        if (scene) onOpenScene(scene);
                      }}
                    >
                      Open scene
                    </button>
                  )}
                </div>
              </div>
              {group.issues.map((issue, index) => (
                <div className="report-issue" key={`${issue.code}-${index}`}>
                  <span className={`report-level ${issue.level}`}>{issue.level}</span>
                  <div>
                    <p>{issue.message}</p>
                    <code className="report-code">{issue.code}</code>
                  </div>
                  <span className="muted tiny">{issue.ruleName || issue.characterId || issue.itemId || issue.flag || ''}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
