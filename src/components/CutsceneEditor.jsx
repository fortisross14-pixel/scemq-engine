import React, { useEffect, useMemo, useRef, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { createCutscene } from '../lib/schema.js';

function StateSelect({ objectId, value, objects, onChange }) {
  const object = objects.find(o => o.id === objectId);
  const states = Object.keys(object?.asset?.states || {});
  return <select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Choose state</option>{states.map(state => <option key={state} value={state}>{state}</option>)}</select>;
}

function ConditionEditor({ condition, onChange, onDelete, items, variables, objects }) {
  const left = condition.left || 'flag';
  return <div className="logic-mini-row logic-condition-row">
    <select value={left} onChange={e => onChange({ ...condition, left:e.target.value, key:'', value:e.target.value === 'item' ? 'true' : '' })}>
      <option value="flag">flag</option><option value="variable">variable</option><option value="item">inventory item</option><option value="state">object state</option>
    </select>
    {left === 'item' ? <select value={condition.key || ''} onChange={e => onChange({ ...condition, key:e.target.value })}><option value="">Choose item</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
      : left === 'variable' ? <select value={condition.key || ''} onChange={e => onChange({ ...condition, key:e.target.value })}><option value="">Choose variable</option>{variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      : left === 'state' ? <select value={condition.key || ''} onChange={e => onChange({ ...condition, key:e.target.value, value:'' })}><option value="">Choose object</option>{objects.filter(o => Object.keys(o.asset?.states || {}).length).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      : <input value={condition.key || ''} onChange={e => onChange({ ...condition, key:e.target.value })} placeholder="flag name"/>}
    <select value={condition.op || 'equals'} onChange={e => onChange({ ...condition, op:e.target.value })}>
      <option value="equals">equals</option><option value="notEquals">not equals</option>{left !== 'state' && <option value="gt">&gt;</option>}{left !== 'state' && <option value="lt">&lt;</option>}{left === 'item' && <option value="has">has</option>}
    </select>
    {left === 'state' ? <StateSelect objectId={condition.key} value={condition.value} objects={objects} onChange={value => onChange({ ...condition, value })}/>
      : left === 'item' ? <select value={String(condition.value ?? 'true')} onChange={e => onChange({ ...condition, value:e.target.value })}><option value="true">owned</option><option value="false">not owned</option></select>
      : <input value={condition.value ?? 'true'} onChange={e => onChange({ ...condition, value:e.target.value })} placeholder="value"/>}
    <button className="icon-button" onClick={onDelete}>×</button>
  </div>;
}

function secondsValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function CutsceneEditor({ sceneId, cutscenes, assetUrls, items = [], globalVariables = [], sceneVariables = [], objects = [], onChange, onChooseVideo, onClearVideo, onImport, onExport }) {
  const list = cutscenes?.cutscenes || [];
  const [selectedId, setSelectedId] = useState(list[0]?.id || '');
  const selected = list.find(c => c.id === selectedId) || null;
  const variables = useMemo(() => [...globalVariables, ...sceneVariables], [globalVariables, sceneVariables]);
  const previewRef = useRef(null);
  const [previewTime, setPreviewTime] = useState(0);

  useEffect(() => { if (selectedId && !list.some(c => c.id === selectedId)) setSelectedId(list[0]?.id || ''); }, [list, selectedId]);
  useEffect(() => { setPreviewTime(0); if (previewRef.current) previewRef.current.currentTime = 0; }, [selectedId]);

  function update(next) { onChange({ ...cutscenes, cutscenes:list.map(c => c.id === next.id ? next : c) }); }
  function add() { const value = createCutscene(); onChange({ ...cutscenes, cutscenes:[...list, value] }); setSelectedId(value.id); }
  function remove() { if (!selected) return; onChange({ ...cutscenes, cutscenes:list.filter(c => c.id !== selected.id) }); setSelectedId(''); }
  function addSubtitle() {
    if (!selected) return;
    const last = selected.subtitles?.[selected.subtitles.length - 1];
    const start = last ? secondsValue(last.end) : 0;
    update({ ...selected, subtitles:[...(selected.subtitles || []), { id:`subtitle-${Date.now()}`, start, end:start + 3, text:'New subtitle' }] });
  }
  const currentSubtitle = selected?.subtitles?.find(s => previewTime >= secondsValue(s.start) && previewTime <= secondsValue(s.end));
  const videoUrl = selected?.video ? assetUrls?.[`__cutscene:${selected.id}`] : '';

  return <div className="cutscene-editor-layout">
    <section className="cutscene-list-panel">
      <div className="toolbar"><div className="toolbar-group"><button className="primary-soft" onClick={add}>+ Cutscene</button></div><div className="toolbar-group"><button onClick={onImport}>Import</button><button onClick={onExport}>Export</button></div></div>
      <div className="logic-file-label">scene.cutscenes.{sceneId}.json</div>
      <div className="rule-list">{!list.length && <div className="empty-panel">No cutscenes yet. Add one, choose a video, then define when it should play.</div>}{list.map(c => <button key={c.id} className={`rule-card ${c.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}><span className="rule-event">{c.trigger === 'enter' ? 'scene enter' : 'condition'}</span><strong>{c.name}</strong><small>{c.video || 'No video'} · {(c.conditions || []).length} condition{(c.conditions || []).length === 1 ? '' : 's'}</small></button>)}</div>
    </section>

    <section className="cutscene-preview-panel">
      <div className="cutscene-preview-head"><strong>Preview</strong><small>Runtime playback covers the entire game screen, including the bottom GUI.</small></div>
      {!selected ? <div className="empty-panel centered">Select or create a cutscene.</div> : videoUrl ? <div className="cutscene-preview-stage">
        <video ref={previewRef} src={videoUrl} controls preload="metadata" onTimeUpdate={e => setPreviewTime(e.currentTarget.currentTime)} />
        {currentSubtitle?.text && <div className="cutscene-preview-subtitle">{currentSubtitle.text}</div>}
      </div> : <div className="empty-panel centered">Choose an MP4 or WebM video for this cutscene.</div>}
    </section>

    <aside className="inspector cutscene-inspector">
      <div className="inspector-title">Cutscene inspector</div>
      {!selected ? <div className="empty-inspector">Select or create a cutscene.</div> : <>
        <div className="object-title-row"><div><strong>{selected.name}</strong><small>{selected.id}</small></div><button className="danger-ghost" onClick={remove}>Delete</button></div>
        <InspectorField label="Name"><input value={selected.name || ''} onChange={e => update({ ...selected, name:e.target.value })}/></InspectorField>
        <div className="inspector-divider"/><div className="inspector-subtitle">Video</div>
        <div className="asset-path">{selected.video || 'No video assigned'}</div><div className="toolbar-group"><button className="wide-button" onClick={() => onChooseVideo(selected.id)}>{selected.video ? 'Replace video' : 'Choose video'}</button>{selected.video && <button className="icon-button" onClick={() => onClearVideo(selected.id)}>×</button>}</div>
        <InspectorField label="Fit"><select value={selected.fit || 'contain'} onChange={e => update({ ...selected, fit:e.target.value })}><option value="contain">contain</option><option value="cover">cover</option><option value="stretch">stretch</option></select></InspectorField>
        <label className="checkbox-row"><input type="checkbox" checked={selected.skippable !== false} onChange={e => update({ ...selected, skippable:e.target.checked })}/> Allow Skip / Esc</label>
        <label className="checkbox-row"><input type="checkbox" checked={!!selected.muted} onChange={e => update({ ...selected, muted:e.target.checked })}/> Mute video audio</label>

        <div className="inspector-divider"/><div className="inspector-subtitle">When it runs</div>
        <InspectorField label="Trigger"><select value={selected.trigger || 'enter'} onChange={e => update({ ...selected, trigger:e.target.value })}><option value="enter">When scene is entered</option><option value="condition">When conditions are true</option></select></InspectorField>
        <label className="checkbox-row"><input type="checkbox" checked={selected.once !== false} onChange={e => update({ ...selected, once:e.target.checked })}/> Play only once per save</label>
        <div className="section-heading-row"><span className="inspector-subtitle">Conditions</span><button className="small-button" onClick={() => update({ ...selected, conditions:[...(selected.conditions || []), { left:'flag', key:'', op:'equals', value:'true' }] })}>+ Condition</button></div>
        {!(selected.conditions || []).length && <div className="linked-note">No conditions: the cutscene is eligible whenever its trigger is checked. “When conditions are true” without conditions will therefore play immediately.</div>}
        {(selected.conditions || []).map((condition, index) => <ConditionEditor key={index} condition={condition} items={items} variables={variables} objects={objects} onChange={next => update({ ...selected, conditions:selected.conditions.map((c, i) => i === index ? next : c) })} onDelete={() => update({ ...selected, conditions:selected.conditions.filter((_, i) => i !== index) })}/>) }

        <div className="inspector-divider"/><div className="section-heading-row"><span className="inspector-subtitle">Subtitles</span><button className="small-button" onClick={addSubtitle}>+ Subtitle</button></div>
        {!(selected.subtitles || []).length && <div className="linked-note">Optional. Times are seconds from the beginning of the video.</div>}
        {(selected.subtitles || []).map((subtitle, index) => <div className="cutscene-subtitle-row" key={subtitle.id || index}>
          <input type="number" min="0" step="0.1" value={subtitle.start ?? 0} title="Start seconds" onChange={e => update({ ...selected, subtitles:selected.subtitles.map((s, i) => i === index ? { ...s, start:secondsValue(e.target.value) } : s) })}/>
          <input type="number" min="0" step="0.1" value={subtitle.end ?? 3} title="End seconds" onChange={e => update({ ...selected, subtitles:selected.subtitles.map((s, i) => i === index ? { ...s, end:secondsValue(e.target.value) } : s) })}/>
          <textarea rows="2" value={subtitle.text || ''} onChange={e => update({ ...selected, subtitles:selected.subtitles.map((s, i) => i === index ? { ...s, text:e.target.value } : s) })}/>
          <button className="icon-button" onClick={() => update({ ...selected, subtitles:selected.subtitles.filter((_, i) => i !== index) })}>×</button>
        </div>)}
      </>}
    </aside>
  </div>;
}
