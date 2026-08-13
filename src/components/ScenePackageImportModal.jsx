import React from 'react';

function DependencyGroup({ title, rows = [] }) {
  return <div className="package-dependency-group"><div className="package-dependency-title">{title}</div>{rows.length===0?<div className="package-empty">None</div>:rows.map(row=><div className="package-dependency-row" key={row.id}><span><strong>{row.name||row.id}</strong><small>{row.id}</small></span><span className={`package-status ${row.status}`}>{row.status==='reuse'?'Reuse existing':row.status==='create'?'Create':'Unresolved'}</span></div>)}</div>;
}

export default function ScenePackageImportModal({ pkg, report, newSceneId, busy, onCancel, onImport }) {
  if (!pkg || !report) return null;
  const canImport = report.errors.length === 0 && !busy;
  return <div className="modal-backdrop package-modal-backdrop" onMouseDown={onCancel}><div className="modal package-import-modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="package-modal-head"><div><div className="eyebrow">SCEMQ Scene Package</div><h2>{pkg.name || pkg.scene?.meta?.name || pkg.sceneId}</h2><p className="muted">{pkg.sceneId} · package format {pkg.packageVersion}</p></div><button className="icon-button" onClick={onCancel}>×</button></div>
    {report.errors.length>0&&<div className="package-errors"><strong>Cannot import yet</strong>{report.errors.map((error,index)=><div key={index}>{error}</div>)}</div>}
    <div className="package-summary-grid">
      <DependencyGroup title="Characters" rows={report.dependencies.characters}/>
      <DependencyGroup title="Inventory" rows={report.dependencies.inventory}/>
      <DependencyGroup title="Global variables" rows={report.dependencies.variables}/>
      <DependencyGroup title="Destination scenes" rows={report.softScenes.map(row=>({...row,name:row.id,status:row.status==='resolved'?'reuse':'unresolved'}))}/>
    </div>
    {report.softScenes.some(x=>x.status==='unresolved')&&<div className="package-soft-note">Unresolved destination scenes are allowed. Their IDs stay in the imported scene and resolve automatically when those scenes are added later.</div>}
    {report.sceneConflict&&<div className="package-conflict"><strong>Scene ID conflict</strong><p>This project already contains <code>{pkg.sceneId}</code>. Choose whether to replace that scene or import this package as <code>{newSceneId}</code>.</p></div>}
    <div className="modal-actions package-actions"><button onClick={onCancel} disabled={busy}>Cancel</button>{report.sceneConflict&&<button onClick={()=>onImport('new')} disabled={!canImport}>{busy?'Importing…':`Import as ${newSceneId}`}</button>}<button className="primary" onClick={()=>onImport(report.sceneConflict?'replace':'new')} disabled={!canImport}>{busy?'Importing…':report.sceneConflict?'Replace existing scene':'Import scene'}</button></div>
  </div></div>;
}
