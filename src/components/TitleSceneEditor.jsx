import React, { useRef, useState } from 'react';
import InspectorField from './InspectorField.jsx';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export default function TitleSceneEditor({ meta, visual, assetUrls, gameUi, onChangeVisual, onChooseBackground, onChangeMeta, onExportScene }) {
  const [zoom, setZoom] = useState(.65);
  const [selected, setSelected] = useState('title');
  const stageRef = useRef(null);
  const ts = visual.titleScreen || {};
  const screen = gameUi?.screen || { width: 1280, height: 900 };
  const titleTransform = ts.titleTransform || { x: 160, y: 120, width: 960, height: 110 };
  const newGame = ts.newGame || { label: 'New Game', transform: { x: 490, y: 560, width: 300, height: 64 }, style: {} };
  const loadGame = ts.loadGame || { label: 'Load Game', transform: { x: 490, y: 640, width: 300, height: 64 }, style: {} };

  function patchTitleScreen(patch) { onChangeVisual({ ...visual, titleScreen: { ...ts, ...patch } }); }
  function patchControl(key, patch) {
    const current = key === 'newGame' ? newGame : loadGame;
    patchTitleScreen({ [key]: { ...current, ...patch } });
  }
  function stagePoint(e) {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }
  function beginDrag(e, key) {
    e.preventDefault(); e.stopPropagation(); setSelected(key);
    const transform = key === 'title' ? titleTransform : (key === 'newGame' ? newGame.transform : loadGame.transform);
    const start = stagePoint(e); const origin = { x: transform.x, y: transform.y };
    const move = (ev) => {
      const p = stagePoint(ev);
      const next = { ...transform, x: Math.round(clamp(origin.x + p.x - start.x, 0, visual.canvas.width - transform.width)), y: Math.round(clamp(origin.y + p.y - start.y, 0, visual.canvas.height - transform.height)) };
      if (key === 'title') patchTitleScreen({ titleTransform: next }); else patchControl(key, { transform: next });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function patchSelectedTransform(field, value) {
    const n = Number(value);
    if (selected === 'title') patchTitleScreen({ titleTransform: { ...titleTransform, [field]: n } });
    else {
      const c = selected === 'newGame' ? newGame : loadGame;
      patchControl(selected, { transform: { ...c.transform, [field]: n } });
    }
  }
  const currentTransform = selected === 'title' ? titleTransform : (selected === 'newGame' ? newGame.transform : loadGame.transform);

  return <div className="editor-layout visual-editor-layout title-scene-editor">
    <section className="editor-main">
      <div className="visual-modebar"><div><strong>Title / Home Screen</strong> <span className="muted tiny">No gameplay HUD is rendered here.</span></div><div className="toolbar-group"><button onClick={onChooseBackground}>Choose background</button><button className="primary-soft" onClick={onExportScene}>Export full scene</button></div></div>
      <div className="toolbar"><div className="toolbar-group"><label className="zoom-control">Zoom <input type="range" min=".3" max="1" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><button onClick={()=>onChangeVisual({...visual,canvas:{...visual.canvas,width:screen.width,height:screen.height}})}>Match game screen {screen.width}×{screen.height}</button></div></div>
      <div className="stage-scroll"><div ref={stageRef} className="scene-stage title-stage" style={{width:visual.canvas.width,height:visual.canvas.height,transform:`scale(${zoom})`,transformOrigin:'top left',backgroundColor:visual.canvas.backgroundColor}}>
        {visual.background?.path&&assetUrls.__background?<img className={`editor-background fit-${visual.background.fit||'stretch'}`} src={assetUrls.__background} alt="" draggable="false"/>:null}
        <div className={`title-editor-element title-text ${selected==='title'?'selected':''}`} style={{left:titleTransform.x,top:titleTransform.y,width:titleTransform.width,height:titleTransform.height,fontSize:ts.titleStyle?.fontSize||54,color:ts.titleStyle?.color||'#f0dfb0',background:ts.titleStyle?.background||'transparent'}} onPointerDown={e=>beginDrag(e,'title')}>{ts.title||meta.name||'Game Title'}</div>
        <button className={`title-editor-element title-button ${selected==='newGame'?'selected':''}`} style={{left:newGame.transform.x,top:newGame.transform.y,width:newGame.transform.width,height:newGame.transform.height,fontSize:newGame.style?.fontSize||22,color:newGame.style?.color||'#eee9dc',background:newGame.style?.background||'#292d35'}} onPointerDown={e=>beginDrag(e,'newGame')}>{newGame.label||'New Game'}</button>
        <button className={`title-editor-element title-button ${selected==='loadGame'?'selected':''}`} style={{left:loadGame.transform.x,top:loadGame.transform.y,width:loadGame.transform.width,height:loadGame.transform.height,fontSize:loadGame.style?.fontSize||22,color:loadGame.style?.color||'#eee9dc',background:loadGame.style?.background||'#292d35'}} onPointerDown={e=>beginDrag(e,'loadGame')}>{loadGame.label||'Load Game'}</button>
      </div></div>
    </section>
    <aside className="inspector"><div className="inspector-title">Title screen inspector</div>
      <InspectorField label="Scene name"><input value={meta.name||''} onChange={e=>onChangeMeta({...meta,name:e.target.value})}/></InspectorField>
      <InspectorField label="Game title"><input value={ts.title||''} placeholder={meta.name||'Game Title'} onChange={e=>patchTitleScreen({title:e.target.value})}/></InspectorField>
      <div className="transform-grid"><InspectorField label="Canvas width"><input type="number" value={visual.canvas.width} onChange={e=>onChangeVisual({...visual,canvas:{...visual.canvas,width:Number(e.target.value)}})}/></InspectorField><InspectorField label="Canvas height"><input type="number" value={visual.canvas.height} onChange={e=>onChangeVisual({...visual,canvas:{...visual.canvas,height:Number(e.target.value)}})}/></InspectorField></div>
      <InspectorField label="Background fit"><select value={visual.background?.fit||'stretch'} onChange={e=>onChangeVisual({...visual,background:{...visual.background,fit:e.target.value}})}><option value="stretch">Stretch</option><option value="cover">Cover</option><option value="contain">Contain</option><option value="native">Native</option></select></InspectorField>
      <div className="inspector-divider"/><div className="inspector-subtitle">Selected element</div>
      <div className="segmented"><button className={selected==='title'?'active':''} onClick={()=>setSelected('title')}>Title</button><button className={selected==='newGame'?'active':''} onClick={()=>setSelected('newGame')}>New Game</button><button className={selected==='loadGame'?'active':''} onClick={()=>setSelected('loadGame')}>Load</button></div>
      {selected==='newGame'&&<InspectorField label="Button text"><input value={newGame.label||''} onChange={e=>patchControl('newGame',{label:e.target.value})}/></InspectorField>}
      {selected==='loadGame'&&<InspectorField label="Button text"><input value={loadGame.label||''} onChange={e=>patchControl('loadGame',{label:e.target.value})}/></InspectorField>}
      <div className="transform-grid">{['x','y','width','height'].map(k=><InspectorField key={k} label={k.toUpperCase()}><input type="number" value={currentTransform[k]} onChange={e=>patchSelectedTransform(k,e.target.value)}/></InspectorField>)}</div>
      {selected==='title'?<><InspectorField label="Font size"><input type="number" value={ts.titleStyle?.fontSize||54} onChange={e=>patchTitleScreen({titleStyle:{...ts.titleStyle,fontSize:Number(e.target.value)}})}/></InspectorField><InspectorField label="Text color"><input type="color" value={ts.titleStyle?.color||'#f0dfb0'} onChange={e=>patchTitleScreen({titleStyle:{...ts.titleStyle,color:e.target.value}})}/></InspectorField></>:<><InspectorField label="Font size"><input type="number" value={(selected==='newGame'?newGame:loadGame).style?.fontSize||22} onChange={e=>{const c=selected==='newGame'?newGame:loadGame;patchControl(selected,{style:{...c.style,fontSize:Number(e.target.value)}})}}/></InspectorField></>}
      <div className="linked-note">New Game starts the project setting “New Game start scene”. Load Game opens the normal SCEMQ save-slot loader. The project Game UI is intentionally hidden on this scene.</div>
    </aside>
  </div>;
}
