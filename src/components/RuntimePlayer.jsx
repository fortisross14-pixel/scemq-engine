import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clampCamera, depthZAtPoint, findPathInWalkAreas } from '../lib/geometry.js';
import { findInventoryRecipe, inventoryRuleMatches } from '../lib/inventory.js';

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && value != null && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function initialRuntimeState(projectData) {
  return {
    flags: {},
    variables: Object.fromEntries((projectData.variables?.variables || []).map(v => [v.id, v.initialValue])),
    inventory: (projectData.inventory || []).filter(i => i.initiallyOwned).map(i => i.id),
    sceneVariables: {},
    objectStates: {},
    objectVisibility: {}
  };
}

function cameraBounds(viewport, canvas) {
  const l=viewport?.limits||{left:0,top:0,right:canvas.width,bottom:canvas.height};
  return {x:Number(l.left||0),y:Number(l.top||0),width:Math.max(0,Number(l.right??canvas.width)-Number(l.left||0)),height:Math.max(0,Number(l.bottom??canvas.height)-Number(l.top||0))};
}

export default function RuntimePlayer({ project, projectData, initialScene, loadScene, onClose }) {
  const ui = projectData.ui;
  const settings = projectData.settings;
  const [sceneRef, setSceneRef] = useState(initialScene);
  const [bundle, setBundle] = useState(null);
  const [runtime, setRuntime] = useState(() => initialRuntimeState(projectData));
  const [selectedVerb, setSelectedVerb] = useState(settings.defaultVerb || 'walk');
  const [selectedItem, setSelectedItem] = useState('');
  const [hoverText, setHoverText] = useState('');
  const [message, setMessage] = useState('');
  const [dialogue, setDialogue] = useState(null);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState('right');
  const [movingTo, setMovingTo] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const rafRef = useRef(0);
  const moveQueueRef = useRef([]);
  const runtimeRef = useRef(runtime);
  const bundleRef = useRef(bundle);
  const playerPosRef = useRef(playerPos);
  useEffect(()=>{runtimeRef.current=runtime},[runtime]);
  useEffect(()=>{bundleRef.current=bundle},[bundle]);
  useEffect(()=>{playerPosRef.current=playerPos},[playerPos]);

  async function enterScene(ref, spawnPointId = null) {
    const loaded = await loadScene(ref);
    if (!runtimeRef.current.sceneVariables?.[ref.id]) {
      const localDefaults = Object.fromEntries((loaded.logic.variables || []).map(v => [v.id, v.initialValue]));
      const nextRuntime = { ...runtimeRef.current, sceneVariables: { ...(runtimeRef.current.sceneVariables || {}), [ref.id]: localDefaults } };
      runtimeRef.current = nextRuntime;
      setRuntime(nextRuntime);
    }
    const spawn = loaded.visual.spawnPoints?.find(s => s.id === (spawnPointId || settings.defaultSpawnPointId || 'default')) || loaded.visual.spawnPoints?.[0] || { ...loaded.visual.player.start, facing:'right' };
    setSceneRef(ref); setBundle(loaded); bundleRef.current=loaded;
    const p={x:spawn.x,y:spawn.y}; setPlayerPos(p); playerPosRef.current=p; setFacing(spawn.facing||loaded.visual.player.facing||'right');
    const viewport=ui.viewport; const c=clampCamera({x:loaded.visual.viewport.startX||0,y:loaded.visual.viewport.startY||0},loaded.visual.canvas,viewport,cameraBounds(loaded.visual.viewport,loaded.visual.canvas)); setCamera(c);
    setMovingTo(null); setPendingAction(null); setDialogue(null); setHoverText('');
    setTimeout(()=>runEvent('onEnterScene','',loaded),0);
  }

  useEffect(()=>{ enterScene(initialScene); return ()=>cancelAnimationFrame(rafRef.current); },[]);

  const playerObject = useMemo(()=>{
    if(!bundle) return null;
    return bundle.objects.find(o=>o.id===bundle.visual.player.characterObjectId) || bundle.objects.find(o=>o.type==='character'&&o.character?.role==='playable') || bundle.objects.find(o=>o.type==='character') || null;
  },[bundle]);

  const playerDefinition = playerObject ? projectData.characters.find(c=>c.id===playerObject.character?.characterId) : null;
  const walkSpeed = playerObject?.character?.walkSpeed || playerDefinition?.walkSpeed || 180;

  useEffect(()=>{
    if(!movingTo || !bundle || paused) return;
    let last=performance.now();
    function frame(now){
      const dt=Math.min(.05,(now-last)/1000);last=now;
      const current=playerPosRef.current; const dx=movingTo.x-current.x,dy=movingTo.y-current.y; const dist=Math.hypot(dx,dy); const step=walkSpeed*dt;if(Math.abs(dx)>Math.abs(dy))setFacing(dx<0?'left':'right');else if(Math.abs(dy)>1)setFacing(dy<0?'up':'down');
      let next;
      if(dist<=step||dist<2){next={x:movingTo.x,y:movingTo.y};setPlayerPos(next);playerPosRef.current=next;const queued=moveQueueRef.current.shift();if(queued){setMovingTo(queued);return}setMovingTo(null);const action=pendingAction;setPendingAction(null);if(action){if(action.object?.interactionPoint?.facing)setFacing(action.object.interactionPoint.facing);setTimeout(()=>performInteraction(action.object,action.verb),0)}return;}
      next={x:current.x+dx/dist*step,y:current.y+dy/dist*step};setPlayerPos(next);playerPosRef.current=next;
      rafRef.current=requestAnimationFrame(frame);
    }
    rafRef.current=requestAnimationFrame(frame); return ()=>cancelAnimationFrame(rafRef.current);
  },[movingTo,bundle,walkSpeed,pendingAction,paused]);

  useEffect(()=>{
    if(!bundle || bundle.visual.viewport.followPlayer===false) return;
    const vp=ui.viewport; const cfg=bundle.visual.viewport;
    const desired={x:playerPos.x-vp.width/2,y:playerPos.y-vp.height/2};
    const next=clampCamera(desired,bundle.visual.canvas,vp,cameraBounds(cfg,bundle.visual.canvas));
    if(next.x!==camera.x||next.y!==camera.y)setCamera(next);
  },[playerPos,bundle]);

  function setRuntimePatch(updater){const current=runtimeRef.current;const next=typeof updater==='function'?updater(current):{...current,...updater};runtimeRef.current=next;setRuntime(next);return next}
  function conditionPass(c, state=runtimeRef.current, activeSceneId=sceneRef.id){
    const expected=parseValue(c.value); let actual;
    if(c.left==='item') actual=state.inventory.includes(c.key);
    else if(c.left==='variable') actual=state.variables[c.key] ?? state.sceneVariables?.[activeSceneId]?.[c.key];
    else if(c.left==='state'){const obj=bundleRef.current?.meta?.sceneId===activeSceneId?bundleRef.current.objects.find(o=>o.id===c.key):null;actual=state.objectStates[`${activeSceneId}:${c.key}`] ?? obj?.asset?.state ?? 'default';}
    else actual=state.flags[c.key];
    if(c.op==='has') return c.left==='item'?actual===true:Boolean(actual);
    if(c.op==='notEquals') return actual!==expected; if(c.op==='gt')return Number(actual)>Number(expected); if(c.op==='lt')return Number(actual)<Number(expected); return actual===expected;
  }
  function findRule(ruleId, activeBundle=bundleRef.current){return activeBundle?.logic.rules?.find(r=>r.id===ruleId)}
  function rulePass(rule, activeBundle=bundleRef.current){const sid=activeBundle?.meta?.sceneId||sceneRef.id;return (rule?.conditions||[]).every(c=>conditionPass(c,runtimeRef.current,sid))}

  async function runActions(actions=[], activeBundle=bundleRef.current){
    for(const action of actions){
      const key=action.targetId||''; const value=parseValue(action.value);
      if(action.type==='say'){setMessage(String(action.value||''));setTimeout(()=>setMessage(''),2400)}
      if(action.type==='setFlag')setRuntimePatch(s=>({...s,flags:{...s.flags,[key]:value}}));
      if(action.type==='setVariable'){const sid=activeBundle?.meta?.sceneId||sceneRef.id;const isGlobal=(projectData.variables?.variables||[]).some(v=>v.id===key);if(isGlobal)setRuntimePatch(s=>({...s,variables:{...s.variables,[key]:value}}));else setRuntimePatch(s=>({...s,sceneVariables:{...s.sceneVariables,[sid]:{...(s.sceneVariables?.[sid]||{}),[key]:value}}}));await runEvent('onVariableChanged',key,activeBundle)}
      if(action.type==='giveItem')setRuntimePatch(s=>({...s,inventory:s.inventory.includes(key||value)?s.inventory:[...s.inventory,key||value]}));
      if(action.type==='removeItem')setRuntimePatch(s=>({...s,inventory:s.inventory.filter(id=>id!==(key||value))}));
      if(action.type==='setVisualState'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectStates:{...s.objectStates,[scoped]:String(action.value||'default')}}))}
      if(action.type==='showObject'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:true}}))}
      if(action.type==='hideObject'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:false}}))}
      if(action.type==='startDialogue')startDialogue(key||String(value),activeBundle);
      if(action.type==='changeScene'){
        const nextRef=project.scenes.find(s=>s.id===String(action.value||key)); if(nextRef){await runEvent('onLeaveScene','',activeBundle);await enterScene(nextRef,action.targetId||'default')}
      }
      if(action.type==='moveCharacter'&&key===playerObject?.id){const [x,y]=String(action.value||'').split(',').map(Number);if(Number.isFinite(x)&&Number.isFinite(y)){setPlayerPos({x,y});playerPosRef.current={x,y}}}
    }
  }
  async function executeRule(ruleId, activeBundle=bundleRef.current){const rule=findRule(ruleId,activeBundle);if(rule&&(!rule.event?.itemId||rule.event.itemId===selectedItem)&&rulePass(rule,activeBundle))await runActions(rule.actions,activeBundle)}
  async function runEvent(type,targetId,activeBundle=bundleRef.current){const interactionEvent=['onLook','onUse','onPickUp','onTalk','onGive','onOpen','onClose','onPush','onPull','onItemUsed'].includes(type);for(const rule of activeBundle?.logic.rules||[]){if(rule.event.type===type&&(!rule.event.targetId||rule.event.targetId===targetId)&&(!interactionEvent||!rule.event.verb||rule.event.verb===selectedVerb)&&(!interactionEvent||!rule.event.itemId||rule.event.itemId===selectedItem)&&rulePass(rule,activeBundle))await runActions(rule.actions,activeBundle)}}

  function startDialogue(characterId, activeBundle=bundleRef.current){
    const d=activeBundle?.dialogues.find(x=>x.characterId===characterId); if(!d){setMessage('No dialogue is authored for this character.');return}
    setDialogue({data:d,nodeId:d.entryNodeId,beatIndex:0});
  }
  function chooseDialogueChoice(choice){
    if(choice.actions?.length)runActions(choice.actions);
    if(choice.targetNodeId)setDialogue(d=>({...d,nodeId:choice.targetNodeId,beatIndex:0}));else setDialogue(null);
  }

  function activeObjectAsset(obj){
    const state=runtime.objectStates[`${sceneRef.id}:${obj.id}`]||obj.asset?.state||'default'; const path=obj.asset?.states?.[state]||obj.asset?.path||'';
    return bundle?.stateAssetUrls?.[`${obj.id}:${path}`] || bundle?.assetUrls?.[obj.id] || (obj.type==='character'&&projectData.assetUrls.characters?.[`${obj.character?.characterId}:idle`]) || '';
  }
  function activePlayerAsset(){
    if(!playerObject)return '';
    if(movingTo&&playerDefinition){const slot={left:'walkLeft',right:'walkRight',up:'walkUp',down:'walkDown'}[facing]||'walkRight';const animated=projectData.assetUrls.characters?.[`${playerDefinition.id}:${slot}`];if(animated)return animated;}
    return activeObjectAsset(playerObject) || (playerDefinition?projectData.assetUrls.characters?.[`${playerDefinition.id}:idle`]: '') || '';
  }
  function objectVisible(obj){return runtime.objectVisibility[`${sceneRef.id}:${obj.id}`] ?? obj.transform.visible}
  function interactionLabel(obj,verb){const item=selectedItem?projectData.inventory.find(i=>i.id===selectedItem)?.name:'';const target=obj.hotspot?.label||obj.name;if(item&&verb==='use')return `Use ${item} with ${target}`;if(item&&verb==='give')return `Give ${item} to ${target}`;const v=verb==='pickUp'?'Pick up':verb[0].toUpperCase()+verb.slice(1);return `${v} ${target}`}
  function walkTo(point, action=null){if(!bundle)return;const path=findPathInWalkAreas(playerPosRef.current,point,bundle.visual.walkAreas||[]);if(!path.length)return;setPendingAction(action);moveQueueRef.current=path.slice(1);setMovingTo(path[0])}
  function clickWorld(e){if(selectedVerb!=='walk'||!bundle)return;const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)*(ui.viewport.width/rect.width)+camera.x;const y=(e.clientY-rect.top)*(ui.viewport.height/rect.height)+camera.y;walkTo({x,y})}
  function clickObject(e,obj){e.stopPropagation();const verb=selectedVerb;if(verb==='walk'&&obj.type!=='exit'){walkTo(obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height});return}const point=obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height};walkTo(point,{object:obj,verb})}
  async function performInteraction(obj,verb){
    if(obj.type==='exit'&&verb==='walk'&&obj.exit?.destinationSceneId){const next=project.scenes.find(s=>s.id===obj.exit.destinationSceneId);if(next){await runEvent('onLeaveScene','',bundleRef.current);await enterScene(next,obj.exit.spawnPointId);return}}
    const binding=obj.hotspot?.actions?.[verb];
    if(binding?.ruleId)await executeRule(binding.ruleId);
    if(binding?.dialogueId)startDialogue(binding.dialogueId);
    if(!binding?.ruleId&&!binding?.dialogueId){const eventType={look:'onLook',use:'onUse',talk:'onTalk',pickUp:'onPickUp',give:'onGive',open:'onOpen',close:'onClose',push:'onPush',pull:'onPull'}[verb];if(eventType)await runEvent(eventType,obj.id);else setMessage('Nothing happens.');}
  }
  async function combineInventoryItems(firstId, secondId){
    if(firstId===secondId){setSelectedItem('');return}
    const combineRules=(bundleRef.current?.logic.rules||[]).filter(r=>r.event?.type==='onInventoryCombine');
    const matching=combineRules.find(r=>inventoryRuleMatches(r,firstId,secondId)&&rulePass(r,bundleRef.current));
    if(matching){await runActions(matching.actions,bundleRef.current);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');return}
    const match=findInventoryRecipe(projectData.inventory,firstId,secondId);
    if(!match?.recipe?.resultItemId){setMessage(`Those items do not combine.`);setSelectedItem(secondId);return}
    const {recipe,owner,other}=match;
    setRuntimePatch(state=>{let inv=[...state.inventory];if(recipe.consumeSelf!==false)inv=inv.filter(id=>id!==owner.id);if(recipe.consumeOther!==false)inv=inv.filter(id=>id!==other.id);if(!inv.includes(recipe.resultItemId))inv.push(recipe.resultItemId);return{...state,inventory:inv}});
    const result=projectData.inventory.find(i=>i.id===recipe.resultItemId);setMessage(`Created ${result?.name||recipe.resultItemId}.`);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');
  }

  function uiAction(el){const a=el.action||{};if(a.type==='selectVerb'){const verb=a.value||'walk';setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}if(a.type==='openSave')saveGame();if(a.type==='openLoad')loadGame();if(a.type==='toggleHotspots')setRuntimePatch(s=>({...s,showHotspots:!s.showHotspots}));if(a.type==='pause')setPaused(v=>!v);if(a.type==='customRule'&&a.value)executeRule(a.value)}
  function saveGame(){const slot=window.prompt(`Save slot 1-${settings.saveSlots||3}`,'1');if(!slot)return;localStorage.setItem(`scemq-save:${project.id}:${slot}`,JSON.stringify({runtime:runtimeRef.current,sceneId:sceneRef.id,playerPos:playerPosRef.current,camera}));setMessage(`Saved to slot ${slot}.`)}
  async function loadGame(){const slot=window.prompt(`Load slot 1-${settings.saveSlots||3}`,'1');if(!slot)return;const raw=localStorage.getItem(`scemq-save:${project.id}:${slot}`);if(!raw){setMessage(`Slot ${slot} is empty.`);return}const saved=JSON.parse(raw);setRuntime(saved.runtime);runtimeRef.current=saved.runtime;const ref=project.scenes.find(s=>s.id===saved.sceneId)||sceneRef;await enterScene(ref);setPlayerPos(saved.playerPos);playerPosRef.current=saved.playerPos;setCamera(saved.camera||{x:0,y:0});setMessage(`Loaded slot ${slot}.`)}

  if(!bundle)return <div className="runtime-overlay"><div className="runtime-loading">Loading scene…</div></div>;
  const playerT=playerObject?.transform||{width:80,height:160,z:30,opacity:1}; const anchorX=playerT.anchorX??.5,anchorY=playerT.anchorY??1; const playerZ=depthZAtPoint(playerPos,bundle.visual.depthAreas||[],playerT.z||30);
  const viewportObjects=bundle.objects.filter(o=>o.id!==playerObject?.id&&objectVisible(o)).sort((a,b)=>a.transform.z-b.transform.z);
  const dNode=dialogue?.data.nodes.find(n=>n.id===dialogue.nodeId); const dBeat=dNode?.beats?.[dialogue?.beatIndex||0]; const dSpeaker=dBeat?projectData.characters.find(c=>c.id===dBeat.speakerId):null;

  return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div className="runtime-screen" style={{width:ui.screen.width,height:ui.screen.height,background:ui.screen.backgroundColor}}>{bundle.assetUrls.__music&&<audio src={bundle.assetUrls.__music} autoPlay loop/>}{bundle.assetUrls.__ambient&&<audio src={bundle.assetUrls.__ambient} autoPlay loop/>}
    <div className="runtime-viewport" style={{left:ui.viewport.x,top:ui.viewport.y,width:ui.viewport.width,height:ui.viewport.height,cursor:projectData.assetUrls.ui?.[`cursor:${selectedVerb}`]?`url(${projectData.assetUrls.ui[`cursor:${selectedVerb}`]}), auto`:undefined}} onClick={clickWorld}>
      <div className="runtime-world" style={{width:bundle.visual.canvas.width,height:bundle.visual.canvas.height,transform:`translate(${-camera.x}px, ${-camera.y}px)`,backgroundColor:bundle.visual.canvas.backgroundColor}}>
        {bundle.assetUrls.__background&&<img className={`runtime-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}
        {viewportObjects.map(obj=>{const t=obj.transform;const url=activeObjectAsset(obj);return <div key={obj.id} className={`runtime-object ${obj.hotspot?.enabled?'clickable':''}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,opacity:t.opacity,transform:t.flipX?'scaleX(-1)':'none'}} onMouseEnter={()=>obj.hotspot?.enabled&&setHoverText(interactionLabel(obj,selectedVerb))} onMouseLeave={()=>setHoverText('')} onClick={(e)=>obj.hotspot?.enabled&&clickObject(e,obj)}>{url?<img src={url} alt="" draggable="false"/>:<div className="runtime-placeholder">{obj.name}</div>}{runtime.showHotspots&&obj.hotspot?.enabled?<div className="runtime-hotspot-debug"/>:null}</div>})}
        {playerObject&&<div className="runtime-object runtime-player" style={{left:playerPos.x-playerT.width*anchorX,top:playerPos.y-playerT.height*anchorY,width:playerT.width,height:playerT.height,zIndex:playerZ,opacity:playerT.opacity,transform:playerT.flipX?'scaleX(-1)':'none'}}>{activePlayerAsset()?<img src={activePlayerAsset()} alt="" draggable="false"/>:<div className="runtime-placeholder">{playerObject.name}</div>}</div>}
      </div>
    </div>
    {(ui.elements||[]).sort((a,b)=>a.transform.z-b.transform.z).map(el=>{const t=el.transform;const active=el.action?.type==='selectVerb'&&el.action.value===selectedVerb;return <div key={el.id} className={`runtime-ui-element runtime-ui-${el.type} ${active?'active':''}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,background:el.style?.background,color:el.style?.color,fontSize:el.style?.fontSize}} onClick={()=>uiAction(el)}>
      {el.type==='statusText'?<span>{message||hoverText||selectedVerb}</span>:null}
      {el.type==='inventory'?<div className={`runtime-inventory direction-${el.inventory?.direction||'horizontal'}`} style={{gridTemplateColumns:`repeat(${el.inventory?.columns||3}, ${el.inventory?.slotWidth||96}px)`,gridAutoRows:`${el.inventory?.slotHeight||54}px`}}>{runtime.inventory.map(id=>{const item=projectData.inventory.find(i=>i.id===id);return <button style={{width:el.inventory?.slotWidth||96,height:el.inventory?.slotHeight||54}} title={item?.description||''} className={selectedItem===id?'active':''} key={id} onClick={(e)=>{e.stopPropagation();if(selectedItem&&selectedItem!==id)combineInventoryItems(selectedItem,id);else{setSelectedItem(selectedItem===id?'':id);setSelectedVerb('use')}}}>{projectData.assetUrls.inventory?.[id]?<img src={projectData.assetUrls.inventory[id]} alt=""/>:<span>{item?.name||id}</span>}</button>})}</div>:null}
      {el.type==='image'&&projectData.assetUrls.ui?.[el.id]?<img src={projectData.assetUrls.ui[el.id]} alt=""/>:null}
      {!['statusText','inventory','image','panel'].includes(el.type)?<span>{el.label||el.name}</span>:null}
    </div>})}
    {dNode&&dBeat&&<div className="runtime-dialogue">{projectData.assetUrls.characters?.[`${dBeat.speakerId}:portrait`]&&<img className="runtime-dialogue-portrait" src={projectData.assetUrls.characters[`${dBeat.speakerId}:portrait`]} alt=""/>}<div className="runtime-dialogue-speaker">{dSpeaker?.name||dBeat.speakerId}</div><div className="runtime-dialogue-line">{dBeat.text}</div><div className="runtime-dialogue-choices">{(dialogue.beatIndex||0)<(dNode.beats?.length||1)-1?<button onClick={()=>setDialogue(d=>({...d,beatIndex:(d.beatIndex||0)+1}))}>Continue</button>:<>{(dNode.choices||[]).filter(c=>!c.condition||(typeof c.condition==='string'?(runtime.flags[c.condition]||runtime.variables[c.condition]):conditionPass(c.condition))).map(c=><button key={c.id} onClick={()=>chooseDialogueChoice(c)}>{c.text}</button>)}{(!dNode.choices||dNode.choices.length===0)&&<button onClick={()=>setDialogue(null)}>Continue</button>}</>}</div></div>}
  {paused&&<div className="runtime-paused">PAUSED</div>}</div></div></div>
}
