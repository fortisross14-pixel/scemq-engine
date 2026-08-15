import React, { useMemo, useRef, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { UI_ACTION_TYPES, UI_ELEMENT_TYPES, VERBS, createUiElement } from '../lib/schema.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export default function GameUiEditor({ ui, assetUrls, onChange, onChooseAsset, onChooseScreenBackground, onClearScreenBackground, onChooseCursor, onImport, onExport }) {
  const [selectedId, setSelectedId] = useState(ui.elements?.[0]?.id || '');
  const [zoom, setZoom] = useState(0.68);
  const stageRef = useRef(null);
  const selected = ui.elements.find((el) => el.id === selectedId) || null;
  const ordered = useMemo(() => [...(ui.elements || [])].sort((a,b) => (a.transform?.z || 0) - (b.transform?.z || 0)), [ui.elements]);

  function patchElement(id, patch) {
    onChange({ ...ui, elements: ui.elements.map((el) => el.id === id ? { ...el, ...patch } : el) });
  }
  function patchTransform(id, patch) {
    const el = ui.elements.find((item) => item.id === id); if (!el) return;
    patchElement(id, { transform: { ...el.transform, ...patch } });
  }
  function stagePoint(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }
  function beginDrag(event, el) {
    if (event.button !== 0) return; event.preventDefault(); setSelectedId(el.id);
    const start = stagePoint(event); const origin = { x: el.transform.x, y: el.transform.y };
    const move = (ev) => { const p = stagePoint(ev); patchTransform(el.id, { x: Math.round(clamp(origin.x + p.x - start.x, 0, ui.screen.width - el.transform.width)), y: Math.round(clamp(origin.y + p.y - start.y, 0, ui.screen.height - el.transform.height)) }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function beginResize(event, el) {
    event.stopPropagation(); event.preventDefault();
    const start = stagePoint(event); const origin = { width: el.transform.width, height: el.transform.height };
    const move = (ev) => { const p = stagePoint(ev); patchTransform(el.id, { width: Math.max(20, Math.round(origin.width + p.x - start.x)), height: Math.max(20, Math.round(origin.height + p.y - start.y)) }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function add(type) {
    const el = createUiElement(type);
    onChange({ ...ui, elements: [...ui.elements, el] }); setSelectedId(el.id);
  }
  function remove() {
    if (!selected) return;
    onChange({ ...ui, elements: ui.elements.filter((el) => el.id !== selected.id) }); setSelectedId('');
  }

  return <div className="editor-layout ui-editor-layout">
    <section className="editor-main">
      <div className="toolbar">
        <div className="toolbar-group">
          <button onClick={() => add('verbButton')}>+ Verb button</button><button onClick={() => add('inventory')}>+ Inventory</button><button onClick={() => add('statusText')}>+ Status</button><button onClick={() => add('button')}>+ Button</button><button onClick={() => add('panel')}>+ Panel</button><button onClick={() => add('text')}>+ Text</button><button onClick={() => add('image')}>+ Image</button>
        </div>
        <div className="toolbar-group"><button onClick={onImport}>Import UI</button><button onClick={onExport}>Export UI</button><label className="zoom-control">Zoom <input type="range" min="0.35" max="1" step="0.05" value={zoom} onChange={(e)=>setZoom(Number(e.target.value))}/></label></div>
      </div>
      <div className="stage-scroll">
        <div ref={stageRef} className="ui-stage" style={{ width: ui.screen.width, height: ui.screen.height, transform:`scale(${zoom})`, transformOrigin:'top left', backgroundColor:ui.screen.asset?'transparent':ui.screen.backgroundColor, '--stage-zoom':zoom }} onPointerDown={()=>setSelectedId('')}>
          {ui.screen.asset&&assetUrls?.__screenBackground&&((ui.viewport.y||0)+(ui.viewport.height||0)<ui.screen.height)?<div className="ui-bottom-skin-preview" style={{left:0,top:(ui.viewport.y||0)+(ui.viewport.height||0),width:ui.screen.width,height:ui.screen.height-((ui.viewport.y||0)+(ui.viewport.height||0))}}><img src={assetUrls.__screenBackground} alt="" draggable="false" style={{objectFit:ui.screen.assetFit==='cover'?'cover':ui.screen.assetFit==='contain'?'contain':'fill'}}/></div>:null}
          <div className="ui-viewport-frame" style={{ left:ui.viewport.x, top:ui.viewport.y, width:ui.viewport.width, height:ui.viewport.height }}><span>GAME VIEWPORT</span></div>
          {ordered.map((el)=>{
            const t=el.transform; const selectedNow=el.id===selectedId; const assetUrl=el.asset?assetUrls?.[el.id]:'';
            return <div key={el.id} className={`ui-element-preview ${selectedNow?'selected':''} ${assetUrl&&['verbButton','button','panel'].includes(el.type)?'has-skin':''} ui-${el.type}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,background:assetUrl&&['verbButton','button','panel'].includes(el.type)?'transparent':el.style?.background,color:el.style?.color,fontSize:el.style?.fontSize,border:assetUrl&&['verbButton','button','panel'].includes(el.type)&&!selectedNow?'none':undefined}} onPointerDown={(e)=>{e.stopPropagation();beginDrag(e,el)}}>
              {assetUrl && ['verbButton','button','panel'].includes(el.type) ? <img className="ui-skin-image" src={assetUrl} alt="" draggable="false" style={{objectFit:el.assetFit==='cover'?'cover':el.assetFit==='contain'?'contain':'fill'}}/> : null}{el.type==='image' && assetUrl ? <img src={assetUrl} alt="" draggable="false"/> : null}
              {el.type==='inventory' ? <div className="ui-inventory-mock" style={{gridTemplateColumns:`repeat(${el.inventory?.columns||3},1fr)`,gridTemplateRows:`repeat(${el.inventory?.rows||2},1fr)`}}>{Array.from({length:(el.inventory?.rows||2)*(el.inventory?.columns||3)}).map((_,i)=><span key={i}/>)}</div> : null}
              {el.type==='statusText' ? <span>Use key with door</span> : el.type!=='inventory' && el.type!=='image' && el.style?.showLabel!==false ? <span className="ui-skin-label">{el.label || el.name}</span> : null}
              {selectedNow && <button className="resize-handle" onPointerDown={(e)=>beginResize(e,el)} aria-label="Resize"/>}
            </div>
          })}
        </div>
      </div>
    </section>
    <aside className="inspector">
      <div className="inspector-title">Game UI inspector</div>
      {!selected ? <>
        <div className="inspector-subtitle">Game screen</div>
        <div className="transform-grid"><InspectorField label="Width"><input type="number" value={ui.screen.width} onChange={(e)=>onChange({...ui,screen:{...ui.screen,width:Number(e.target.value)}})}/></InspectorField><InspectorField label="Height"><input type="number" value={ui.screen.height} onChange={(e)=>onChange({...ui,screen:{...ui.screen,height:Number(e.target.value)}})}/></InspectorField></div>
        <InspectorField label="Background"><input type="color" value={ui.screen.backgroundColor} onChange={(e)=>onChange({...ui,screen:{...ui.screen,backgroundColor:e.target.value}})}/></InspectorField>
        <div className="inspector-divider"/><div className="inspector-subtitle">Bottom GUI background image</div><div className="asset-path">{ui.screen.asset||'No image assigned'}</div><div className="toolbar-group"><button className="wide-button" onClick={onChooseScreenBackground}>Choose background image</button>{ui.screen.asset&&<button className="icon-button" onClick={onClearScreenBackground}>×</button>}</div><InspectorField label="Image fit"><select value={ui.screen.assetFit||'stretch'} onChange={(e)=>onChange({...ui,screen:{...ui.screen,assetFit:e.target.value}})}><option value="stretch">stretch</option><option value="cover">cover</option><option value="contain">contain</option></select></InspectorField><div className="linked-note">This image is only drawn in the bottom GUI band, starting immediately below the game viewport. It never sits behind or replaces the game screen.</div>
        <div className="inspector-divider"/><div className="inspector-subtitle">Persistent viewport</div>
        <div className="transform-grid">{['x','y','width','height'].map(k=><InspectorField key={k} label={k.toUpperCase()}><input type="number" value={ui.viewport[k]} onChange={(e)=>onChange({...ui,viewport:{...ui.viewport,[k]:Number(e.target.value)}})}/></InspectorField>)}</div>
        <div className="linked-note">This rectangle is the portion of every scene visible during play. UI elements stay fixed outside or on top of it.</div><div className="inspector-divider"/><div className="inspector-subtitle">Legacy per-verb cursors</div><div className="linked-note">Kept for backward compatibility. New projects should use the three semantic cursor roles under Project → Settings.</div><div className="cursor-grid">{Object.keys(ui.cursors||{}).map(verb=><div className="cursor-row" key={verb}><span>{verb}</span><code>{ui.cursors[verb]||'default cursor'}</code><button onClick={()=>onChooseCursor(verb)}>Choose</button></div>)}</div>
      </> : <>
        <div className="object-title-row"><div><strong>{selected.name}</strong><small>{selected.id}</small></div><button className="danger-ghost" onClick={remove}>Delete</button></div>
        <InspectorField label="Name"><input value={selected.name} onChange={(e)=>patchElement(selected.id,{name:e.target.value})}/></InspectorField>
        <InspectorField label="Type"><select value={selected.type} onChange={(e)=>patchElement(selected.id,{type:e.target.value})}>{UI_ELEMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></InspectorField>
        <InspectorField label="Label"><input value={selected.label||''} onChange={(e)=>patchElement(selected.id,{label:e.target.value})}/></InspectorField>
        <div className="transform-grid">{['x','y','width','height','z'].map(k=><InspectorField key={k} label={k.toUpperCase()}><input type="number" value={selected.transform[k]} onChange={(e)=>patchTransform(selected.id,{[k]:Number(e.target.value)})}/></InspectorField>)}</div>
        {(selected.type==='verbButton'||selected.type==='button') && <><div className="inspector-divider"/><div className="inspector-subtitle">Action</div><InspectorField label="Action"><select value={selected.action?.type||'none'} onChange={(e)=>patchElement(selected.id,{action:{...selected.action,type:e.target.value}})}>{UI_ACTION_TYPES.map(a=><option key={a}>{a}</option>)}</select></InspectorField>{selected.action?.type==='selectVerb'&&<InspectorField label="Verb"><select value={selected.action?.value||'walk'} onChange={(e)=>patchElement(selected.id,{action:{...selected.action,value:e.target.value}})}>{VERBS.map(v=><option key={v}>{v}</option>)}</select></InspectorField>}{selected.action?.type==='customRule'&&<InspectorField label="Scene rule ID"><input value={selected.action?.value||''} onChange={(e)=>patchElement(selected.id,{action:{...selected.action,value:e.target.value}})} placeholder="rule-id"/></InspectorField>}</>}
        {selected.type==='inventory' && <><div className="inspector-divider"/><div className="inspector-subtitle">Inventory layout</div><div className="transform-grid">{['rows','columns','slotWidth','slotHeight'].map(k=><InspectorField key={k} label={k}><input type="number" value={selected.inventory?.[k]||0} onChange={(e)=>patchElement(selected.id,{inventory:{...selected.inventory,[k]:Number(e.target.value)}})}/></InspectorField>)}</div><InspectorField label="Scroll"><select value={selected.inventory?.direction||'horizontal'} onChange={(e)=>patchElement(selected.id,{inventory:{...selected.inventory,direction:e.target.value}})}><option>horizontal</option><option>vertical</option></select></InspectorField></>}
        {selected.type==='image' && <><div className="inspector-divider"/><div className="inspector-subtitle">Image</div><div className="asset-path">{selected.asset||'No image assigned'}</div><button className="wide-button" onClick={()=>onChooseAsset(selected.id)}>Replace image</button></>}
        {['verbButton','button','panel'].includes(selected.type) && <><div className="inspector-divider"/><div className="inspector-subtitle">Skin image</div><div className="asset-path">{selected.asset||'No image assigned'}</div><div className="toolbar-group"><button className="wide-button" onClick={()=>onChooseAsset(selected.id)}>{selected.asset?'Replace image':'Choose image'}</button>{selected.asset&&<button className="icon-button" onClick={()=>patchElement(selected.id,{asset:''})}>×</button>}</div><InspectorField label="Image fit"><select value={selected.assetFit||'stretch'} onChange={(e)=>patchElement(selected.id,{assetFit:e.target.value})}><option value="stretch">stretch</option><option value="cover">cover</option><option value="contain">contain</option></select></InspectorField>{['verbButton','button'].includes(selected.type)&&<label className="checkbox-row"><input type="checkbox" checked={selected.style?.showLabel!==false} onChange={(e)=>patchElement(selected.id,{style:{...selected.style,showLabel:e.target.checked}})}/> Show text label over image</label>}<div className="linked-note">The image becomes the visible button/panel. SCEMQ automatically removes the default fill and border behind it; the element still keeps the same action, position and size.</div></>}
        <div className="inspector-divider"/><div className="inspector-subtitle">Style</div><div className="transform-grid"><InspectorField label="Font"><input type="number" value={selected.style?.fontSize||14} onChange={(e)=>patchElement(selected.id,{style:{...selected.style,fontSize:Number(e.target.value)}})}/></InspectorField><InspectorField label="Text"><input type="color" value={selected.style?.color||'#ffffff'} onChange={(e)=>patchElement(selected.id,{style:{...selected.style,color:e.target.value}})}/></InspectorField><InspectorField label="Fill"><input type="color" value={selected.style?.background==='transparent'?'#111111':(selected.style?.background||'#292d35')} onChange={(e)=>patchElement(selected.id,{style:{...selected.style,background:e.target.value}})}/></InspectorField></div>
      </>}
    </aside>
  </div>;
}
