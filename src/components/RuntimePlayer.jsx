import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clampCamera, clampPointToWalkAreas, depthZAtPoint, findPathInWalkAreas } from '../lib/geometry.js';
import { findInventoryRecipe, inventoryEventTypeForVerb, inventoryRuleMatches, inventoryVerbEnabled } from '../lib/inventory.js';
import { resolveDialogueStartNode } from '../lib/dialogue.js';
import { alphaHit, hotspotRect } from '../lib/hotspot.js';
import SpriteStrip from './SpriteStrip.jsx';
import { characterAnimationAssetKey, requestedAnimationForVerb, resolveAnimation, shouldMirror } from '../lib/animation.js';

function clamp01(value){return Math.max(0,Math.min(1,value))}

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
  const [pickupQueue, setPickupQueue] = useState([]);
  const [dialogue, setDialogue] = useState(null);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState('right');
  const [movingTo, setMovingTo] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [animationOverrides, setAnimationOverrides] = useState({});
  const rafRef = useRef(0);
  const moveQueueRef = useRef([]);
  const runtimeRef = useRef(runtime);
  const bundleRef = useRef(bundle);
  const playerPosRef = useRef(playerPos);
  const alphaMasksRef = useRef(new Map());
  const animationResolversRef = useRef(new Map());
  const animationCounterRef = useRef(0);
  useEffect(()=>{runtimeRef.current=runtime},[runtime]);
  useEffect(()=>{bundleRef.current=bundle},[bundle]);
  useEffect(()=>{playerPosRef.current=playerPos},[playerPos]);

  function characterObjectForId(characterId, activeBundle=bundleRef.current){return activeBundle?.objects?.find(o=>o.type==='character'&&o.character?.characterId===characterId)||null}
  function currentDialogueBeat(){const d=dialogue;if(!d)return null;const node=d.data?.nodes?.find(n=>n.id===d.nodeId);return node?.beats?.[d.beatIndex||0]||null}
  function resolveCharacterRender(obj,isPlayer=false){
    const characterId=obj?.character?.characterId;const def=projectData.characters.find(c=>c.id===characterId);if(!def)return null;
    const beat=currentDialogueBeat();let requested='';
    if(isPlayer&&movingTo)requested=requestedAnimationForVerb(def,'walk');
    else if(beat?.speakerId===characterId)requested=requestedAnimationForVerb(def,'talk');
    else requested=animationOverrides[characterId]?.name||def.defaultAnimation||'idle';
    const actorFacing=isPlayer?facing:(def.defaultFacing||'right');const resolved=resolveAnimation(def,requested,actorFacing);
    if(resolved){const url=projectData.assetUrls.characters?.[characterAnimationAssetKey(characterId,resolved.name)];if(url)return{...resolved,url,playKey:animationOverrides[characterId]?.playKey||`${resolved.name}:implicit`,flipX:shouldMirror(resolved.animation,actorFacing,resolved.name)}}
    return null;
  }
  function completeCharacterAnimation(characterId,playKey){
    const resolverKey=`${characterId}:${playKey}`;const resolve=animationResolversRef.current.get(resolverKey);if(resolve){animationResolversRef.current.delete(resolverKey);resolve(true)}
    setAnimationOverrides(current=>current[characterId]?.playKey===playKey?Object.fromEntries(Object.entries(current).filter(([id])=>id!==characterId)):current);
  }
  function playCharacterAnimation(characterId,requestedName,{waitForCompletion=false}={}){
    const def=projectData.characters.find(c=>c.id===characterId);const obj=characterObjectForId(characterId);if(!def||!obj||!requestedName)return Promise.resolve(false);
    const resolved=resolveAnimation(def,requestedName,facing);if(!resolved)return Promise.resolve(false);
    const url=projectData.assetUrls.characters?.[characterAnimationAssetKey(characterId,resolved.name)];if(!url)return Promise.resolve(false);
    const playKey=`${resolved.name}:${++animationCounterRef.current}`;setAnimationOverrides(current=>({...current,[characterId]:{name:resolved.name,playKey}}));
    if(!waitForCompletion||resolved.animation.loop)return Promise.resolve(true);
    return new Promise(resolve=>animationResolversRef.current.set(`${characterId}:${playKey}`,resolve));
  }
  async function playVerbAnimation(verb){const characterId=playerDefinition?.id;if(!characterId||['walk','talk'].includes(verb))return;const name=requestedAnimationForVerb(playerDefinition,verb);if(name)await playCharacterAnimation(characterId,name,{waitForCompletion:true})}

  function cacheAlphaMask(url,img){if(!url||!img||alphaMasksRef.current.has(url))return;try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);alphaMasksRef.current.set(url,ctx.getImageData(0,0,canvas.width,canvas.height))}catch{alphaMasksRef.current.set(url,null)}}
  function alphaHotspotHit(e,obj,url){if((obj.hotspot?.shape||'visual')!=='alpha')return true;const mask=alphaMasksRef.current.get(url);if(!mask)return true;const hitRect=e.currentTarget.getBoundingClientRect();const b=obj.hotspot?.bounds||{x:0,y:0,width:1,height:1};const rx=hitRect.width?clamp01((e.clientX-hitRect.left)/hitRect.width):0,ry=hitRect.height?clamp01((e.clientY-hitRect.top)/hitRect.height):0;let nx=(b.x||0)+(obj.transform?.flipX?(1-rx):rx)*(b.width||1),ny=(b.y||0)+ry*(b.height||1);return alphaHit(mask,nx,ny,obj.hotspot?.alphaThreshold??8)}

  function cameraForPoint(point, activeBundle=bundleRef.current){
    if(!activeBundle||activeBundle.meta?.sceneType==='title'||activeBundle.visual.viewport.followPlayer===false)return null;
    const vp=ui.viewport;const cfg=activeBundle.visual.viewport;
    return clampCamera({x:point.x-vp.width/2,y:point.y-vp.height/2},activeBundle.visual.canvas,vp,cameraBounds(cfg,activeBundle.visual.canvas));
  }
  function applyPlayerPosition(point,activeBundle=bundleRef.current,{clampToWalk=true}={}){
    if(!activeBundle)return point;
    const safe=clampToWalk?clampPointToWalkAreas(point,activeBundle.visual.walkAreas||[]):{...point};
    setPlayerPos(safe);playerPosRef.current=safe;const nextCamera=cameraForPoint(safe,activeBundle);if(nextCamera)setCamera(nextCamera);return safe;
  }

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
    const requested={x:spawn.x,y:spawn.y};const p=loaded.meta?.sceneType==='title'?requested:clampPointToWalkAreas(requested,loaded.visual.walkAreas||[]);setPlayerPos(p);playerPosRef.current=p;setFacing(spawn.facing||loaded.visual.player.facing||'right');
    const viewport=ui.viewport;const centered=cameraForPoint(p,loaded);const c=centered||clampCamera({x:loaded.visual.viewport.startX||0,y:loaded.visual.viewport.startY||0},loaded.visual.canvas,viewport,cameraBounds(loaded.visual.viewport,loaded.visual.canvas));setCamera(c);
    setMovingTo(null); setPendingAction(null); setDialogue(null); setHoverText(''); setPickupQueue([]);
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
      if(dist<=step||dist<2){next={x:movingTo.x,y:movingTo.y};applyPlayerPosition(next,bundle,{clampToWalk:true});const queued=moveQueueRef.current.shift();if(queued){setMovingTo(queued);return}setMovingTo(null);const action=pendingAction;setPendingAction(null);if(action){if(action.object?.interactionPoint?.facing)setFacing(action.object.interactionPoint.facing);setTimeout(()=>performInteraction(action.object,action.verb),0)}return;}
      next={x:current.x+dx/dist*step,y:current.y+dy/dist*step};applyPlayerPosition(next,bundle,{clampToWalk:true});
      rafRef.current=requestAnimationFrame(frame);
    }
    rafRef.current=requestAnimationFrame(frame); return ()=>cancelAnimationFrame(rafRef.current);
  },[movingTo,bundle,walkSpeed,pendingAction,paused]);

  useEffect(()=>{
    const next=cameraForPoint(playerPos,bundle);if(next&&(next.x!==camera.x||next.y!==camera.y))setCamera(next);
  },[playerPos,bundle]);

  function setRuntimePatch(updater){const current=runtimeRef.current;const next=typeof updater==='function'?updater(current):{...current,...updater};runtimeRef.current=next;setRuntime(next);return next}
  function pickupMessageFor(itemId){const item=projectData.inventory.find(i=>i.id===itemId);return item?.pickupMessage?.trim()||`You picked up ${item?.name||itemId}.`}
  function giveInventoryItem(itemId,{announce=true}={}){if(!itemId)return false;const already=runtimeRef.current.inventory.includes(itemId);if(already)return false;setRuntimePatch(s=>({...s,inventory:[...s.inventory,itemId]}));if(announce)setPickupQueue(q=>[...q,{id:`${itemId}:${Date.now()}:${q.length}`,itemId,text:pickupMessageFor(itemId)}]);return true}
  function exitAvailable(obj,activeBundle=bundleRef.current){const ruleId=obj?.exit?.availabilityRuleId;if(!ruleId)return true;const rule=findRule(ruleId,activeBundle);return !!rule&&rulePass(rule,activeBundle)}
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
      if(action.type==='giveItem')giveInventoryItem(key||value);
      if(action.type==='removeItem')setRuntimePatch(s=>({...s,inventory:s.inventory.filter(id=>id!==(key||value))}));
      if(action.type==='setVisualState'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectStates:{...s.objectStates,[scoped]:String(action.value||'default')}}))}
      if(action.type==='showObject'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:true}}))}
      if(action.type==='hideObject'){const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:false}}))}
      if(action.type==='startDialogue')startDialogue(key||String(value),activeBundle,String(action.value||''));
      if(action.type==='playAnimation')await playCharacterAnimation(key,String(action.value||''),{waitForCompletion:!!action.waitForCompletion});
      if(action.type==='changeScene'){
        const nextRef=project.scenes.find(s=>s.id===String(action.value||key)); if(nextRef){await runEvent('onLeaveScene','',activeBundle);await enterScene(nextRef,action.targetId||'default')}
      }
      if(action.type==='moveCharacter'&&key===playerObject?.id){const [x,y]=String(action.value||'').split(',').map(Number);if(Number.isFinite(x)&&Number.isFinite(y))applyPlayerPosition({x,y},activeBundle,{clampToWalk:true})}
    }
  }
  async function executeRule(ruleId, activeBundle=bundleRef.current){const rule=findRule(ruleId,activeBundle);if(rule&&(!rule.event?.itemId||rule.event.itemId===selectedItem)&&rulePass(rule,activeBundle))await runActions(rule.actions,activeBundle)}
  async function runEvent(type,targetId,activeBundle=bundleRef.current,targetType='object'){const interactionEvent=['onLook','onUse','onPickUp','onTalk','onGive','onOpen','onClose','onPush','onPull','onItemUsed'].includes(type);let handled=0;for(const rule of activeBundle?.logic.rules||[]){const eventTargetType=rule.event?.targetType||'object';const targetMatches=!rule.event.targetId||(rule.event.targetId===targetId&&eventTargetType===targetType);if(rule.event.type===type&&targetMatches&&(!interactionEvent||!rule.event.verb||rule.event.verb===selectedVerb)&&(!interactionEvent||targetType==='inventory'||!rule.event.itemId||rule.event.itemId===selectedItem)&&rulePass(rule,activeBundle)){handled+=1;await runActions(rule.actions,activeBundle)}}return handled}

  function startDialogue(characterId, activeBundle=bundleRef.current, startNodeId=''){
    const d=activeBundle?.dialogues.find(x=>x.characterId===characterId); if(!d){setMessage('No dialogue is authored for this character.');return}
    const nodeId=resolveDialogueStartNode(d,startNodeId);
    setDialogue({data:d,nodeId,beatIndex:0});
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
  function objectVisible(obj){const base=runtime.objectVisibility[`${sceneRef.id}:${obj.id}`] ?? obj.transform.visible;if(!base)return false;if(obj.type==='exit'&&obj.exit?.hiddenUntilAvailable&&!exitAvailable(obj))return false;return true}
  function interactionLabel(obj,verb){const item=selectedItem?projectData.inventory.find(i=>i.id===selectedItem)?.name:'';const target=obj.hotspot?.label||obj.name;if(item&&verb==='use')return `Use ${item} with ${target}`;if(item&&verb==='give')return `Give ${item} to ${target}`;const v=verb==='pickUp'?'Pick up':verb[0].toUpperCase()+verb.slice(1);return `${v} ${target}`}
  function inventoryInteractionLabel(itemId){const item=projectData.inventory.find(i=>i.id===itemId);const name=item?.name||itemId;if(selectedVerb==='use'&&selectedItem&&selectedItem!==itemId){const first=projectData.inventory.find(i=>i.id===selectedItem)?.name||selectedItem;return `Use ${first} with ${name}`}if(selectedVerb==='give'&&selectedItem===itemId)return `Give ${name} to…`;const verb=selectedVerb==='pickUp'?'Pick up':selectedVerb[0]?.toUpperCase()+selectedVerb.slice(1);return `${verb||'Use'} ${name}`}
  function inventoryFallback(item,verb){const name=item?.name||'that';if(verb==='look')return item?.description?.trim()||`There is nothing unusual about ${name}.`;if(verb==='open')return `${name} doesn't open.`;if(verb==='close')return `${name} doesn't need closing.`;if(verb==='talk')return `${name} isn't much of a conversationalist.`;if(verb==='pickUp')return `I already have ${name}.`;if(verb==='push'||verb==='pull')return `That won't help with ${name}.`;return `Nothing happens.`}
  function walkTo(point, action=null){if(!bundle||bundle.meta?.sceneType==='title')return;if(playerDefinition?.id)setAnimationOverrides(current=>Object.fromEntries(Object.entries(current).filter(([id])=>id!==playerDefinition.id)));const safeStart=clampPointToWalkAreas(playerPosRef.current,bundle.visual.walkAreas||[]);if(Math.hypot(safeStart.x-playerPosRef.current.x,safeStart.y-playerPosRef.current.y)>0.5)applyPlayerPosition(safeStart,bundle,{clampToWalk:false});const path=findPathInWalkAreas(safeStart,point,bundle.visual.walkAreas||[]);if(!path.length){setPendingAction(null);moveQueueRef.current=[];setMovingTo(null);setMessage('I cannot walk there.');return}setPendingAction(action);moveQueueRef.current=path.slice(1);setMovingTo(path[0])}
  function clickWorld(e){if(!bundle)return;const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)*(ui.viewport.width/rect.width)+camera.x;const y=(e.clientY-rect.top)*(ui.viewport.height/rect.height)+camera.y;setSelectedVerb(settings.defaultVerb||'walk');setSelectedItem('');walkTo({x,y})}
  function clickObject(e,obj){e.stopPropagation();const verb=selectedVerb;if(verb==='walk'&&obj.type!=='exit'){walkTo(obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height});return}const point=obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height};walkTo(point,{object:obj,verb})}
  async function performInteraction(obj,verb){
    if(obj.type!=='exit')await playVerbAnimation(verb);
    if(obj.type==='exit'&&verb==='walk'&&obj.exit?.destinationSceneId){if(!exitAvailable(obj)){setMessage(obj.exit?.blockedMessage||'You cannot go there yet.');return}const next=project.scenes.find(s=>s.id===obj.exit.destinationSceneId);if(next){await runEvent('onLeaveScene','',bundleRef.current);await enterScene(next,obj.exit.spawnPointId);return}}
    const binding=obj.hotspot?.actions?.[verb];
    if(binding?.ruleId)await executeRule(binding.ruleId);
    if(binding?.dialogueId)startDialogue(binding.dialogueId);
    if(!binding?.ruleId&&!binding?.dialogueId){const eventType={look:'onLook',use:'onUse',talk:'onTalk',pickUp:'onPickUp',give:'onGive',open:'onOpen',close:'onClose',push:'onPush',pull:'onPull'}[verb];if(eventType)await runEvent(eventType,obj.id);else setMessage('Nothing happens.');}
  }

  async function interactWithInventoryItem(itemId){
    const item=projectData.inventory.find(i=>i.id===itemId);if(!item)return;
    const verb=selectedVerb||settings.defaultVerb||'walk';
    if(verb==='walk'){setSelectedItem(itemId);setSelectedVerb('use');setMessage(`Use ${item.name} with…`);return}
    if(!inventoryVerbEnabled(item,verb)){setMessage(`You can't ${verb==='pickUp'?'pick up':verb} ${item.name}.`);return}
    if(verb==='use'){if(selectedItem&&selectedItem!==itemId){await combineInventoryItems(selectedItem,itemId);return}setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setMessage(`Use ${item.name} with…`);return}
    if(verb==='give'){setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setMessage(`Give ${item.name} to…`);return}
    setSelectedItem('');
    await playVerbAnimation(verb);
    const eventType=inventoryEventTypeForVerb(verb);
    if(!eventType){setMessage(inventoryFallback(item,verb));return}
    const handled=await runEvent(eventType,itemId,bundleRef.current,'inventory');
    if(!handled)setMessage(inventoryFallback(item,verb));
  }

  async function combineInventoryItems(firstId, secondId){
    if(firstId===secondId){setSelectedItem('');return}
    const combineRules=(bundleRef.current?.logic.rules||[]).filter(r=>r.event?.type==='onInventoryCombine');
    const matching=combineRules.find(r=>inventoryRuleMatches(r,firstId,secondId)&&rulePass(r,bundleRef.current));
    if(matching){await runActions(matching.actions,bundleRef.current);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');return}
    const match=findInventoryRecipe(projectData.inventory,firstId,secondId);
    if(!match?.recipe?.resultItemId){setMessage(`Those items do not combine.`);setSelectedItem(secondId);return}
    const {recipe,owner,other}=match;
    const alreadyHadResult=runtimeRef.current.inventory.includes(recipe.resultItemId);
    setRuntimePatch(state=>{let inv=[...state.inventory];if(recipe.consumeSelf!==false)inv=inv.filter(id=>id!==owner.id);if(recipe.consumeOther!==false)inv=inv.filter(id=>id!==other.id);if(!inv.includes(recipe.resultItemId))inv.push(recipe.resultItemId);return{...state,inventory:inv}});
    const result=projectData.inventory.find(i=>i.id===recipe.resultItemId);if(!alreadyHadResult)setPickupQueue(q=>[...q,{id:`${recipe.resultItemId}:${Date.now()}:${q.length}`,itemId:recipe.resultItemId,text:pickupMessageFor(recipe.resultItemId)}]);setMessage(`Created ${result?.name||recipe.resultItemId}.`);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');
  }

  function uiAction(el){const a=el.action||{};if(a.type==='selectVerb'){const verb=a.value||'walk';setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}if(a.type==='openSave')saveGame();if(a.type==='openLoad')loadGame();if(a.type==='toggleHotspots')setRuntimePatch(s=>({...s,showHotspots:!s.showHotspots}));if(a.type==='pause')setPaused(v=>!v);if(a.type==='customRule'&&a.value)executeRule(a.value)}
  async function startNewGame(){const fresh=initialRuntimeState(projectData);runtimeRef.current=fresh;setRuntime(fresh);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');setMessage('');const target=project.scenes.find(s=>s.id===settings.defaultSceneId)||project.scenes.find(s=>s.id!==settings.titleSceneId&&s.id!=='scene0')||project.scenes.find(s=>s.id!==sceneRef.id);if(!target){setMessage('No gameplay start scene is configured.');return}await enterScene(target,settings.defaultSpawnPointId||'default')}
  function saveGame(){const slot=window.prompt(`Save slot 1-${settings.saveSlots||3}`,'1');if(!slot)return;localStorage.setItem(`scemq-save:${project.id}:${slot}`,JSON.stringify({runtime:runtimeRef.current,sceneId:sceneRef.id,playerPos:playerPosRef.current,camera}));setMessage(`Saved to slot ${slot}.`)}
  async function loadGame(){const slot=window.prompt(`Load slot 1-${settings.saveSlots||3}`,'1');if(!slot)return;const raw=localStorage.getItem(`scemq-save:${project.id}:${slot}`);if(!raw){setMessage(`Slot ${slot} is empty.`);return}const saved=JSON.parse(raw);setRuntime(saved.runtime);runtimeRef.current=saved.runtime;const ref=project.scenes.find(s=>s.id===saved.sceneId)||sceneRef;await enterScene(ref);const loadedBundle=bundleRef.current;if(loadedBundle?.meta?.sceneType!=='title')applyPlayerPosition(saved.playerPos||loadedBundle.visual.player.start,loadedBundle,{clampToWalk:true});if(loadedBundle?.visual?.viewport?.followPlayer===false&&saved.camera)setCamera(saved.camera);setMessage(`Loaded slot ${slot}.`)}

  if(!bundle)return <div className="runtime-overlay"><div className="runtime-loading">Loading scene…</div></div>;
  if(bundle.meta?.sceneType==='title'){
    const ts=bundle.visual.titleScreen||{};const tt=ts.titleTransform||{x:160,y:120,width:960,height:110};const ng=ts.newGame||{label:'New Game',transform:{x:490,y:560,width:300,height:64},style:{}};const lg=ts.loadGame||{label:'Load Game',transform:{x:490,y:640,width:300,height:64},style:{}};
    return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div className="runtime-screen runtime-title-screen" style={{width:ui.screen.width,height:ui.screen.height,background:bundle.visual.canvas.backgroundColor}}>{bundle.assetUrls.__background&&<img className={`runtime-title-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}<div className="runtime-title-text" style={{left:tt.x,top:tt.y,width:tt.width,height:tt.height,fontSize:ts.titleStyle?.fontSize||54,color:ts.titleStyle?.color||'#f0dfb0',background:ts.titleStyle?.background||'transparent'}}>{ts.title||settings.title||sceneRef.name}</div><button className="runtime-title-button" style={{left:ng.transform.x,top:ng.transform.y,width:ng.transform.width,height:ng.transform.height,fontSize:ng.style?.fontSize||22,color:ng.style?.color||'#eee9dc',background:ng.style?.background||'#292d35'}} onClick={startNewGame}>{ng.label||'New Game'}</button><button className="runtime-title-button" style={{left:lg.transform.x,top:lg.transform.y,width:lg.transform.width,height:lg.transform.height,fontSize:lg.style?.fontSize||22,color:lg.style?.color||'#eee9dc',background:lg.style?.background||'#292d35'}} onClick={loadGame}>{lg.label||'Load Game'}</button>{message&&<div className="runtime-title-message">{message}</div>}</div></div></div>
  }
  const playerT=playerObject?.transform||{width:80,height:160,z:30,opacity:1}; const anchorX=playerT.anchorX??.5,anchorY=playerT.anchorY??1; const playerZ=depthZAtPoint(playerPos,bundle.visual.depthAreas||[],playerT.z||30);
  const viewportObjects=bundle.objects.filter(o=>o.id!==playerObject?.id&&objectVisible(o)).sort((a,b)=>a.transform.z-b.transform.z);
  const dNode=dialogue?.data.nodes.find(n=>n.id===dialogue.nodeId); const dBeat=dNode?.beats?.[dialogue?.beatIndex||0]; const dSpeaker=dBeat?projectData.characters.find(c=>c.id===dBeat.speakerId):null;

  return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div className="runtime-screen" style={{width:ui.screen.width,height:ui.screen.height,background:ui.screen.backgroundColor}}>{bundle.assetUrls.__music&&<audio src={bundle.assetUrls.__music} autoPlay loop/>}{bundle.assetUrls.__ambient&&<audio src={bundle.assetUrls.__ambient} autoPlay loop/>}
    <div className="runtime-viewport" style={{left:ui.viewport.x,top:ui.viewport.y,width:ui.viewport.width,height:ui.viewport.height,cursor:projectData.assetUrls.ui?.[`cursor:${selectedVerb}`]?`url(${projectData.assetUrls.ui[`cursor:${selectedVerb}`]}), auto`:undefined}} onClick={clickWorld}>
      <div className="runtime-world" style={{width:bundle.visual.canvas.width,height:bundle.visual.canvas.height,transform:`translate(${-camera.x}px, ${-camera.y}px)`,backgroundColor:bundle.visual.canvas.backgroundColor}}>
        {bundle.assetUrls.__background&&<img className={`runtime-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}
        {viewportObjects.map(obj=>{const t=obj.transform,url=activeObjectAsset(obj),hr=hotspotRect(obj),anim=obj.type==='character'?resolveCharacterRender(obj,false):null;const worldAnchor={x:t.x+t.width*(t.anchorX??.5),y:t.y+t.height*(t.anchorY??1)};const renderLeft=anim?worldAnchor.x-t.width*(anim.animation.anchorX??.5):t.x,renderTop=anim?worldAnchor.y-t.height*(anim.animation.anchorY??1):t.y;return <React.Fragment key={obj.id}><div className="runtime-object runtime-visual-object" style={{left:renderLeft,top:renderTop,width:t.width,height:t.height,zIndex:t.z,opacity:t.opacity,transform:!anim&&t.flipX?'scaleX(-1)':'none'}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(obj.character?.characterId,anim.playKey)}/>:url?<img src={url} alt="" draggable="false" onLoad={e=>obj.hotspot?.shape==='alpha'&&cacheAlphaMask(url,e.currentTarget)}/>:<div className="runtime-placeholder">{obj.name}</div>}</div>{obj.hotspot?.enabled&&<div className={`runtime-hotspot-target clickable shape-${obj.hotspot?.shape||'visual'} ${runtime.showHotspots?'debug':''}`} style={{left:hr.x,top:hr.y,width:hr.width,height:hr.height,zIndex:t.z}} onMouseMove={e=>{const hit=alphaHotspotHit(e,obj,url);e.currentTarget.style.cursor=hit?'pointer':'default';setHoverText(hit?interactionLabel(obj,selectedVerb):'')}} onMouseLeave={()=>setHoverText('')} onClick={e=>{if(alphaHotspotHit(e,obj,url))clickObject(e,obj)}}>{runtime.showHotspots?<span>{obj.hotspot.label||obj.name}</span>:null}</div>}</React.Fragment>})}
        {playerObject&&(()=>{const anim=resolveCharacterRender(playerObject,true);const ax=anim?.animation?.anchorX??anchorX,ay=anim?.animation?.anchorY??anchorY;const staticUrl=activePlayerAsset();return <div className="runtime-object runtime-player" style={{left:playerPos.x-playerT.width*ax,top:playerPos.y-playerT.height*ay,width:playerT.width,height:playerT.height,zIndex:playerZ,opacity:playerT.opacity,transform:!anim&&playerT.flipX?'scaleX(-1)':'none'}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(playerDefinition?.id,anim.playKey)}/>:staticUrl?<img src={staticUrl} alt="" draggable="false"/>:<div className="runtime-placeholder">{playerObject.name}</div>}</div>})()}
      </div>
    </div>
    {(ui.elements||[]).sort((a,b)=>a.transform.z-b.transform.z).map(el=>{const t=el.transform;const active=el.action?.type==='selectVerb'&&el.action.value===selectedVerb;return <div key={el.id} className={`runtime-ui-element runtime-ui-${el.type} ${active?'active':''}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,background:el.style?.background,color:el.style?.color,fontSize:el.style?.fontSize}} onClick={()=>uiAction(el)}>
      {el.type==='statusText'?<span>{message||hoverText||selectedVerb}</span>:null}
      {el.type==='inventory'?<div className={`runtime-inventory direction-${el.inventory?.direction||'horizontal'}`} style={{gridTemplateColumns:`repeat(${el.inventory?.columns||3}, ${el.inventory?.slotWidth||96}px)`,gridAutoRows:`${el.inventory?.slotHeight||54}px`}}>{runtime.inventory.map(id=>{const item=projectData.inventory.find(i=>i.id===id);return <button style={{width:el.inventory?.slotWidth||96,height:el.inventory?.slotHeight||54}} title={item?.description||''} className={selectedItem===id?'active':''} key={id} onMouseEnter={()=>setHoverText(inventoryInteractionLabel(id))} onMouseLeave={()=>setHoverText('')} onClick={(e)=>{e.stopPropagation();interactWithInventoryItem(id)}}>{projectData.assetUrls.inventory?.[id]?<img src={projectData.assetUrls.inventory[id]} alt=""/>:<span>{item?.name||id}</span>}</button>})}</div>:null}
      {el.type==='image'&&projectData.assetUrls.ui?.[el.id]?<img src={projectData.assetUrls.ui[el.id]} alt=""/>:null}
      {!['statusText','inventory','image','panel'].includes(el.type)?<span>{el.label||el.name}</span>:null}
    </div>})}
    {pickupQueue.length>0&&<div className="runtime-pickup-backdrop" onClick={()=>setPickupQueue(q=>q.slice(1))}><div className="runtime-pickup-card" onClick={e=>{e.stopPropagation();setPickupQueue(q=>q.slice(1))}}><strong>{pickupQueue[0].text}</strong><span>Click to continue</span></div></div>}
    {dNode&&dBeat&&<div className="runtime-dialogue">{projectData.assetUrls.characters?.[`${dBeat.speakerId}:portrait`]&&<img className="runtime-dialogue-portrait" src={projectData.assetUrls.characters[`${dBeat.speakerId}:portrait`]} alt=""/>}<div className="runtime-dialogue-speaker">{dSpeaker?.name||dBeat.speakerId}</div><div className="runtime-dialogue-line">{dBeat.text}</div><div className="runtime-dialogue-choices">{(dialogue.beatIndex||0)<(dNode.beats?.length||1)-1?<button onClick={()=>setDialogue(d=>({...d,beatIndex:(d.beatIndex||0)+1}))}>Continue</button>:<>{(dNode.choices||[]).filter(c=>!c.condition||(typeof c.condition==='string'?(runtime.flags[c.condition]||runtime.variables[c.condition]):conditionPass(c.condition))).map(c=><button key={c.id} onClick={()=>chooseDialogueChoice(c)}>{c.text}</button>)}{(!dNode.choices||dNode.choices.length===0)&&<button onClick={()=>setDialogue(null)}>Continue</button>}</>}</div></div>}
  {paused&&<div className="runtime-paused">PAUSED</div>}</div></div></div>
}
