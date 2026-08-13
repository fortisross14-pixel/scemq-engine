import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampCamera, clampPointToWalkAreas, depthZAtPoint, findPathInWalkAreas, followCameraForCharacter, lerpPoint, worldViewportForZoom } from '../lib/geometry.js';
import { actorScaleAtPoint, scaledRenderBox } from '../lib/scale.js';
import { findInventoryRecipe, inventoryEventTypeForVerb, inventoryRuleMatches, inventoryVerbEnabled } from '../lib/inventory.js';
import { resolveDialogueStartNode } from '../lib/dialogue.js';
import { alphaHit, hotspotRect } from '../lib/hotspot.js';
import { speechAnchorForActor, speechColorFor, speechDurationMs } from '../lib/speech.js';
import { fallbackResponse } from '../lib/responses.js';
import { ruleEventMatches } from '../lib/interaction.js';
import { delay, parseDurationMs, parsePoint } from '../lib/cutscene.js';
import { AudioEngine } from '../lib/audio.js';
import { AUTOSAVE_SLOT, createSaveRecord, formatPlaytime, listSaves, readSave, writeSave } from '../lib/saves.js';
import { createTranslator, key as stringKey } from '../lib/localization.js';
import SpriteStrip from './SpriteStrip.jsx';
import { characterAnimationAssetKey, horizontalFacingFromDelta, horizontalFacingToward, requestedAnimationForVerb, resolveAnimation, shouldMirror } from '../lib/animation.js';

const VERB_KEYS = { w: 'walk', l: 'look', u: 'use', t: 'talk', p: 'pickUp', g: 'give', o: 'open', c: 'close', s: 'push', y: 'pull' };

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
    inventoriesByCharacter: {},
    sceneVariables: {},
    objectStates: {},
    objectVisibility: {},
    actorPositions: {},
    usedChoices: {},
    activeCharacterId: '',
    playtimeMs: 0
  };
}

function cameraBounds(viewport, canvas) {
  const l=viewport?.limits||{left:0,top:0,right:canvas.width,bottom:canvas.height};
  return {x:Number(l.left||0),y:Number(l.top||0),width:Math.max(0,Number(l.right??canvas.width)-Number(l.left||0)),height:Math.max(0,Number(l.bottom??canvas.height)-Number(l.top||0))};
}

export default function RuntimePlayer({ project, projectData, initialScene, loadScene, onClose }) {
  const ui = projectData.ui;
  const settings = projectData.settings;
  const translate = useMemo(()=>createTranslator(projectData.strings,settings.language),[projectData.strings,settings.language]);
  const [sceneRef, setSceneRef] = useState(initialScene);
  const [bundle, setBundle] = useState(null);
  const [runtime, setRuntime] = useState(() => initialRuntimeState(projectData));
  const [selectedVerb, setSelectedVerb] = useState(settings.defaultVerb || 'walk');
  const [selectedItem, setSelectedItem] = useState('');
  const [hoverText, setHoverText] = useState('');
  const [speech, setSpeech] = useState([]);
  const [pickupQueue, setPickupQueue] = useState([]);
  const [dialogue, setDialogue] = useState(null);
  const [paused, setPaused] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [fade, setFade] = useState(0);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [cameraLocked, setCameraLocked] = useState(false);
  const [actorPositions, setActorPositions] = useState({});
  const [actorFacing, setActorFacing] = useState({});
  const [movingActors, setMovingActors] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [animationOverrides, setAnimationOverrides] = useState({});
  const [savePanel, setSavePanel] = useState('');
  const rafRef = useRef(0);
  const moveQueueRef = useRef([]);
  const runtimeRef = useRef(runtime);
  const bundleRef = useRef(bundle);
  const actorPositionsRef = useRef(actorPositions);
  const cameraRef = useRef(camera);
  const cameraLockedRef = useRef(false);
  const inputEnabledRef = useRef(true);
  const alphaMasksRef = useRef(new Map());
  const animationResolversRef = useRef(new Map());
  const animationCounterRef = useRef(0);
  const speechResolversRef = useRef(new Map());
  const speechCounterRef = useRef(0);
  const npcMoveResolversRef = useRef(new Map());
  const audioRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const basePlaytimeRef = useRef(0);
  useEffect(()=>{runtimeRef.current=runtime},[runtime]);
  useEffect(()=>{bundleRef.current=bundle},[bundle]);
  useEffect(()=>{actorPositionsRef.current=actorPositions},[actorPositions]);
  useEffect(()=>{cameraRef.current=camera},[camera]);
  useEffect(()=>{cameraLockedRef.current=cameraLocked},[cameraLocked]);
  useEffect(()=>{inputEnabledRef.current=inputEnabled},[inputEnabled]);

  if(!audioRef.current) audioRef.current=new AudioEngine();
  useEffect(()=>{audioRef.current.setVolumes(settings)},[settings.musicVolume,settings.ambientVolume,settings.sfxVolume,settings.masterVolume]);
  useEffect(()=>()=>audioRef.current?.dispose?.(),[]);

  const playerObject = useMemo(()=>{
    if(!bundle) return null;
    const active=runtime.activeCharacterId;
    if(active){const match=bundle.objects.find(o=>o.type==='character'&&o.character?.characterId===active);if(match)return match}
    return bundle.objects.find(o=>o.id===bundle.visual.player.characterObjectId) || bundle.objects.find(o=>o.type==='character'&&o.character?.role==='playable') || bundle.objects.find(o=>o.type==='character') || null;
  },[bundle,runtime.activeCharacterId]);

  const playerDefinition = playerObject ? projectData.characters.find(c=>c.id===playerObject.character?.characterId) : null;
  const walkSpeed = playerObject?.character?.walkSpeed || playerDefinition?.walkSpeed || 180;
  const playerId = playerObject?.id || '';
  const playerPos = actorPositions[playerId] || { x: 0, y: 0 };
  const facing = actorFacing[playerId] || 'right';
  const movingTo = movingActors[playerId] || null;

  function playtimeNow(){return basePlaytimeRef.current+(Date.now()-startedAtRef.current)}
  function actorPosition(objectId,obj){return actorPositionsRef.current[objectId]||(obj?{x:obj.transform.x+obj.transform.width*(obj.transform.anchorX??.5),y:obj.transform.y+obj.transform.height*(obj.transform.anchorY??1)}:{x:0,y:0})}
  function setActorPosition(objectId,point){setActorPositions(current=>{const next={...current,[objectId]:point};actorPositionsRef.current=next;return next})}
  function objectById(id,activeBundle=bundleRef.current){return activeBundle?.objects?.find(o=>o.id===id)||null}
  function characterObjectForId(characterId, activeBundle=bundleRef.current){return activeBundle?.objects?.find(o=>o.type==='character'&&o.character?.characterId===characterId)||null}
  function resolveActorObject(targetId, activeBundle=bundleRef.current){return objectById(targetId,activeBundle)||characterObjectForId(targetId,activeBundle)}
  function interactionTargetX(obj){if(!obj)return 0;if(obj.type==='character')return actorPosition(obj.id,obj).x;return Number(obj.transform?.x||0)+Number(obj.transform?.width||0)/2}
  function currentDialogueBeat(){const d=dialogue;if(!d)return null;const node=d.data?.nodes?.find(n=>n.id===d.nodeId);return node?.beats?.[d.beatIndex||0]||null}
  function scaleForPoint(point,activeBundle=bundleRef.current){return actorScaleAtPoint(point,activeBundle?.visual?.scaleAreas||[],1)}

  function resolveCharacterRender(obj,isPlayer=false){
    const characterId=obj?.character?.characterId;const def=projectData.characters.find(c=>c.id===characterId);if(!def)return null;
    const beat=currentDialogueBeat();const speaking=speech.some(s=>s.speakerId===characterId);let requested='';
    const isMoving=!!movingActors[obj.id];
    if(isMoving)requested=requestedAnimationForVerb(def,'walk');
    else if(beat?.speakerId===characterId||speaking)requested=requestedAnimationForVerb(def,'talk');
    else requested=animationOverrides[characterId]?.name||def.defaultAnimation||'idle';
    const actorFacingValue=actorFacing[obj.id]||(isPlayer?facing:(def.defaultFacing||'right'));const resolved=resolveAnimation(def,requested,actorFacingValue);
    if(resolved){const url=projectData.assetUrls.characters?.[characterAnimationAssetKey(characterId,resolved.name)];if(url)return{...resolved,url,playKey:animationOverrides[characterId]?.playKey||`${resolved.name}:implicit`,flipX:shouldMirror(resolved.animation,actorFacingValue,resolved.name)}}
    return null;
  }
  function completeCharacterAnimation(characterId,playKey){
    const resolverKey=`${characterId}:${playKey}`;const resolve=animationResolversRef.current.get(resolverKey);if(resolve){animationResolversRef.current.delete(resolverKey);resolve(true)}
    setAnimationOverrides(current=>current[characterId]?.playKey===playKey?Object.fromEntries(Object.entries(current).filter(([id])=>id!==characterId)):current);
  }
  function playCharacterAnimation(characterId,requestedName,{waitForCompletion=false}={}){
    const def=projectData.characters.find(c=>c.id===characterId);const obj=characterObjectForId(characterId);if(!def||!obj||!requestedName)return Promise.resolve(false);
    const resolved=resolveAnimation(def,requestedName,actorFacing[obj.id]||'right');if(!resolved)return Promise.resolve(false);
    const url=projectData.assetUrls.characters?.[characterAnimationAssetKey(characterId,resolved.name)];if(!url)return Promise.resolve(false);
    const playKey=`${resolved.name}:${++animationCounterRef.current}`;setAnimationOverrides(current=>({...current,[characterId]:{name:resolved.name,playKey}}));
    if(!waitForCompletion||resolved.animation.loop)return Promise.resolve(true);
    return new Promise(resolve=>animationResolversRef.current.set(`${characterId}:${playKey}`,resolve));
  }
  async function playVerbAnimation(verb){const characterId=playerDefinition?.id;if(!characterId||['walk','talk'].includes(verb))return;const name=requestedAnimationForVerb(playerDefinition,verb);if(name)await playCharacterAnimation(characterId,name,{waitForCompletion:true})}

  // --- speech ---------------------------------------------------------------
  function sayLine(text,speakerId='',{await:shouldAwait=true}={}){
    const line=String(text??'');
    if(!line.trim())return Promise.resolve(false);
    const character=projectData.characters.find(c=>c.id===speakerId);
    const id=`speech-${++speechCounterRef.current}`;
    const duration=speechDurationMs(line,settings);
    const bubble={id,text:line,speakerId,color:speechColorFor(character,settings)};
    setSpeech(current=>[...current.filter(s=>s.speakerId!==speakerId||!speakerId),bubble]);
    const finish=()=>{setSpeech(current=>current.filter(s=>s.id!==id));const resolve=speechResolversRef.current.get(id);if(resolve){speechResolversRef.current.delete(id);resolve(true)}};
    const timer=setTimeout(finish,duration);
    speechResolversRef.current.set(id,()=>clearTimeout(timer));
    const promise=new Promise(resolve=>{speechResolversRef.current.set(id,()=>{clearTimeout(timer);resolve(true)})});
    if(!shouldAwait)return Promise.resolve(true);
    return promise;
  }
  function dismissSpeech(){
    if(!speech.length)return false;
    for(const bubble of speech){const resolve=speechResolversRef.current.get(bubble.id);if(resolve){speechResolversRef.current.delete(bubble.id);resolve(true)}}
    setSpeech([]);return true;
  }

  // --- movement -------------------------------------------------------------
  function moveActorAlongPath(objectId,path,speed){
    if(!path.length)return Promise.resolve(false);
    return new Promise(resolve=>{
      npcMoveResolversRef.current.set(objectId,resolve);
      setMovingActors(current=>({...current,[objectId]:{queue:path.slice(1),target:path[0],speed}}));
    });
  }
  function completeActorMove(objectId){
    setMovingActors(current=>{const next={...current};delete next[objectId];return next});
    const resolve=npcMoveResolversRef.current.get(objectId);
    if(resolve){npcMoveResolversRef.current.delete(objectId);resolve(true)}
  }

  useEffect(()=>{
    const active=Object.keys(movingActors);
    if(!active.length||!bundle||paused)return;
    let last=performance.now();
    function frame(now){
      const dt=Math.min(.05,(now-last)/1000);last=now;
      let finished=[];
      setMovingActors(current=>{
        const next={...current};
        for(const [objectId,move] of Object.entries(current)){
          const pos=actorPositionsRef.current[objectId]||move.target;
          const dx=move.target.x-pos.x,dy=move.target.y-pos.y;const dist=Math.hypot(dx,dy);const step=(move.speed||180)*dt;
          setActorFacing(f=>{const nextFacing=horizontalFacingFromDelta(dx,f[objectId]||'right');return f[objectId]===nextFacing?f:{...f,[objectId]:nextFacing}});
          if(dist<=step||dist<2){
            applyActorPosition(objectId,{...move.target});
            if(move.queue?.length){next[objectId]={...move,target:move.queue[0],queue:move.queue.slice(1)}}
            else{delete next[objectId];finished.push(objectId)}
          }else applyActorPosition(objectId,{x:pos.x+dx/dist*step,y:pos.y+dy/dist*step});
        }
        return next;
      });
      for(const objectId of finished){
        const resolve=npcMoveResolversRef.current.get(objectId);
        if(resolve){npcMoveResolversRef.current.delete(objectId);resolve(true)}
        if(objectId===playerId){
          const action=pendingAction;setPendingAction(null);
          if(action){const mode=action.object?.interactionPoint?.facingMode||'auto';const explicit=action.object?.interactionPoint?.facing;const actor=actorPositionsRef.current[playerId]||{x:0,y:0};const targetX=interactionTargetX(action.object);const nextFacing=mode==='manual'&&['left','right'].includes(explicit)?explicit:horizontalFacingToward(actor.x,targetX,actorFacing[playerId]||'right');setActorFacing(f=>({...f,[playerId]:nextFacing}));setTimeout(()=>performInteraction(action.object,action.verb),0)}
        }
      }
      rafRef.current=requestAnimationFrame(frame);
    }
    rafRef.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[movingActors,bundle,paused,pendingAction,playerId]);

  function applyActorPosition(objectId,point,activeBundle=bundleRef.current,{clampToWalk=true}={}){
    if(!activeBundle)return point;
    const safe=clampToWalk?clampPointToWalkAreas(point,activeBundle.visual.walkAreas||[]):{...point};
    setActorPosition(objectId,safe);
    if(objectId===playerId&&!cameraLockedRef.current){const nextCamera=cameraForPoint(safe,activeBundle);if(nextCamera)setCamera(nextCamera)}
    return safe;
  }

  function cameraForPoint(point, activeBundle=bundleRef.current){
    if(!activeBundle||activeBundle.meta?.sceneType==='title'||activeBundle.visual.viewport.followPlayer===false)return null;
    const obj=playerObject||activeBundle.objects?.find(o=>o.type==='character'&&o.character?.role==='playable');
    const worldViewport=worldViewportForZoom(ui.viewport,activeBundle.visual.viewport?.zoom??1);
    return followCameraForCharacter(point,obj?.transform||{},activeBundle.visual.canvas,worldViewport);
  }

  // --- scene lifecycle ------------------------------------------------------
  async function enterScene(ref, spawnPointId = null, { autosave = true } = {}) {
    const loaded = await loadScene(ref);
    if (!runtimeRef.current.sceneVariables?.[ref.id]) {
      const localDefaults = Object.fromEntries((loaded.logic.variables || []).map(v => [v.id, v.initialValue]));
      const nextRuntime = { ...runtimeRef.current, sceneVariables: { ...(runtimeRef.current.sceneVariables || {}), [ref.id]: localDefaults } };
      runtimeRef.current = nextRuntime;
      setRuntime(nextRuntime);
    }
    const spawn = loaded.visual.spawnPoints?.find(s => s.id === (spawnPointId || settings.defaultSpawnPointId || 'default')) || loaded.visual.spawnPoints?.[0] || { ...loaded.visual.player.start, facing:'right' };
    setSceneRef(ref); setBundle(loaded); bundleRef.current=loaded;

    const activeId=runtimeRef.current.activeCharacterId;
    const player=(activeId&&loaded.objects.find(o=>o.type==='character'&&o.character?.characterId===activeId))||loaded.objects.find(o=>o.id===loaded.visual.player.characterObjectId)||loaded.objects.find(o=>o.type==='character'&&o.character?.role==='playable')||null;
    const positions={};const facings={};
    for(const obj of loaded.objects.filter(o=>o.type==='character')){
      positions[obj.id]={x:obj.transform.x+obj.transform.width*(obj.transform.anchorX??.5),y:obj.transform.y+obj.transform.height*(obj.transform.anchorY??1)};
      facings[obj.id]=projectData.characters.find(c=>c.id===obj.character?.characterId)?.defaultFacing==='left'?'left':'right';
    }
    if(player){
      const requested={x:spawn.x,y:spawn.y};
      positions[player.id]=loaded.meta?.sceneType==='title'?requested:clampPointToWalkAreas(requested,loaded.visual.walkAreas||[]);
      facings[player.id]=(spawn.facing||loaded.visual.player.facing)==='left'?'left':'right';
    }
    setActorPositions(positions);actorPositionsRef.current=positions;setActorFacing(facings);

    const viewport=worldViewportForZoom(ui.viewport,loaded.visual.viewport?.zoom??1);
    const centered=player?cameraForPoint(positions[player.id],loaded):null;
    const c=centered||clampCamera({x:loaded.visual.viewport.startX||0,y:loaded.visual.viewport.startY||0},loaded.visual.canvas,viewport,cameraBounds(loaded.visual.viewport,loaded.visual.canvas));
    setCamera(c);setCameraLocked(loaded.visual.viewport.followPlayer===false);
    setMovingActors({}); setPendingAction(null); setDialogue(null); setHoverText(''); setPickupQueue([]); setSpeech([]);
    audioRef.current.play('music',loaded.assetUrls.__music||'');
    audioRef.current.play('ambient',loaded.assetUrls.__ambient||'');
    if(autosave&&settings.autosaveOnSceneChange!==false&&loaded.meta?.sceneType!=='title')setTimeout(()=>writeSaveSlot(AUTOSAVE_SLOT,{silent:true}),0);
    setTimeout(()=>runEvent('onEnterScene','',loaded),0);
  }

  useEffect(()=>{ enterScene(initialScene,null,{autosave:false}); return ()=>cancelAnimationFrame(rafRef.current); },[]);

  // Background rules: onTick fires once a second while the player has control.
  useEffect(()=>{
    const timer=setInterval(()=>{
      if(paused||!inputEnabledRef.current||!bundleRef.current)return;
      if((bundleRef.current.logic?.rules||[]).some(r=>r.event?.type==='onTick'))runEvent('onTick','',bundleRef.current);
    },1000);
    return ()=>clearInterval(timer);
  },[paused]);

  // Keyboard verb shortcuts + skip.
  useEffect(()=>{
    function onKey(e){
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
      if(e.key==='Escape'){if(savePanel){setSavePanel('');return}dismissSpeech();return}
      if(e.key===' '){if(dismissSpeech())e.preventDefault();return}
      if(settings.keyboardShortcuts===false||!inputEnabledRef.current)return;
      const verb=VERB_KEYS[e.key.toLowerCase()];
      if(verb){e.preventDefault();setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}
    }
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[speech,savePanel,settings.keyboardShortcuts]);

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

  // --- action execution -----------------------------------------------------
  async function runActions(actions=[], activeBundle=bundleRef.current, context={ruleId:'',sayIndex:0}){
    for(const action of actions){
      const key=action.targetId||''; const value=parseValue(action.value);
      switch(action.type){
        case 'say':{
          const speakerId=key||playerDefinition?.id||'';
          const text=translate(stringKey.actionSay(activeBundle?.meta?.sceneId||sceneRef.id,context.ruleId||'inline',context.sayIndex++),String(action.value||''));
          if(action.waitForCompletion===false)sayLine(text,speakerId,{await:false});else await sayLine(text,speakerId);
          break;
        }
        case 'wait': await delay(parseDurationMs(action.value,500)); break;
        case 'setFlag': setRuntimePatch(s=>({...s,flags:{...s.flags,[key]:value}})); break;
        case 'setVariable':{
          const sid=activeBundle?.meta?.sceneId||sceneRef.id;const isGlobal=(projectData.variables?.variables||[]).some(v=>v.id===key);
          if(isGlobal)setRuntimePatch(s=>({...s,variables:{...s.variables,[key]:value}}));
          else setRuntimePatch(s=>({...s,sceneVariables:{...s.sceneVariables,[sid]:{...(s.sceneVariables?.[sid]||{}),[key]:value}}}));
          await runEvent('onVariableChanged',key,activeBundle);break;
        }
        case 'giveItem': giveInventoryItem(key||value); break;
        case 'removeItem': setRuntimePatch(s=>({...s,inventory:s.inventory.filter(id=>id!==(key||value))})); break;
        case 'setVisualState':{const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectStates:{...s.objectStates,[scoped]:String(action.value||'default')}}));break}
        case 'showObject':{const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:true}}));break}
        case 'hideObject':{const scoped=`${activeBundle?.meta?.sceneId||sceneRef.id}:${key}`;setRuntimePatch(s=>({...s,objectVisibility:{...s.objectVisibility,[scoped]:false}}));break}
        case 'startDialogue': startDialogue(key||String(value),activeBundle,String(action.value||'')); break;
        case 'stopDialogue': setDialogue(null); break;
        case 'playAnimation': await playCharacterAnimation(key,String(action.value||''),{waitForCompletion:!!action.waitForCompletion}); break;
        case 'playSound': audioRef.current.playSound(activeBundle?.assetUrls?.[`__sfx:${action.value||key}`]||''); break;
        case 'playMusic': audioRef.current.play('music',activeBundle?.assetUrls?.[`__sfx:${action.value||key}`]||activeBundle?.assetUrls?.__music||''); break;
        case 'stopMusic': audioRef.current.play('music',''); break;
        case 'setInputEnabled':{const on=action.value==='' ? true : parseValue(action.value)!==false;setInputEnabled(on);inputEnabledRef.current=on;break}
        case 'fadeOut': setFade(1); await delay(parseDurationMs(action.value,600)); break;
        case 'fadeIn': setFade(0); await delay(parseDurationMs(action.value,600)); break;
        case 'faceCharacter':{
          const obj=resolveActorObject(key,activeBundle);
          if(obj)setActorFacing(f=>({...f,[obj.id]:String(action.value||'right')}));
          break;
        }
        case 'moveCharacterTo':{
          const obj=resolveActorObject(key,activeBundle);const point=parsePoint(action.value);
          if(obj&&point){
            const from=actorPosition(obj.id,obj);
            const safeStart=clampPointToWalkAreas(from,activeBundle.visual.walkAreas||[]);
            if(Math.hypot(safeStart.x-from.x,safeStart.y-from.y)>.5)applyActorPosition(obj.id,safeStart,activeBundle,{clampToWalk:false});
            const path=findPathInWalkAreas(safeStart,point,activeBundle.visual.walkAreas||[]);
            if(!path.length)break;
            const speed=obj.character?.walkSpeed||180;
            const walk=moveActorAlongPath(obj.id,path,speed);
            if(action.waitForCompletion!==false)await walk;
          }
          break;
        }
        case 'cameraPanTo':{
          const point=parsePoint(action.value);
          if(point&&activeBundle){
            setCameraLocked(true);cameraLockedRef.current=true;
            const worldViewport=worldViewportForZoom(ui.viewport,activeBundle.visual.viewport?.zoom??1);
            const target=clampCamera({x:point.x-worldViewport.width/2,y:point.y-worldViewport.height/2},activeBundle.visual.canvas,worldViewport,cameraBounds(activeBundle.visual.viewport,activeBundle.visual.canvas));
            const pan=panCamera(cameraRef.current,target,parseDurationMs(action.targetId,900));
            if(action.waitForCompletion!==false)await pan;
          }
          break;
        }
        case 'cameraFollowPlayer':{
          setCameraLocked(false);cameraLockedRef.current=false;
          const next=cameraForPoint(actorPosition(playerId,playerObject),activeBundle);if(next)setCamera(next);
          break;
        }
        case 'switchPlayerCharacter':{
          const nextId=key||String(value||'');
          if(nextId){
            setRuntimePatch(s=>{
              if(settings.sharedInventory!==false)return {...s,activeCharacterId:nextId};
              const stored={...(s.inventoriesByCharacter||{}),[s.activeCharacterId||playerDefinition?.id||'']:s.inventory};
              return {...s,activeCharacterId:nextId,inventoriesByCharacter:stored,inventory:stored[nextId]||[]};
            });
            setSelectedItem('');
          }
          break;
        }
        case 'changeScene':{
          const nextRef=project.scenes.find(s=>s.id===String(action.value||key));
          if(nextRef){await runEvent('onLeaveScene','',activeBundle);await enterScene(nextRef,action.targetId||'default')}
          break;
        }
        case 'moveCharacter':{
          const obj=resolveActorObject(key,activeBundle);const point=parsePoint(action.value);
          if(obj&&point)applyActorPosition(obj.id,point,activeBundle,{clampToWalk:obj.type==='character'});
          break;
        }
        default: break;
      }
    }
  }

  function panCamera(from,to,duration){
    return new Promise(resolve=>{
      const start=performance.now();
      function step(now){
        const t=Math.min(1,(now-start)/Math.max(1,duration));
        const point=lerpPoint(from,to,t);
        setCamera(point);cameraRef.current=point;
        if(t<1)requestAnimationFrame(step);else resolve(true);
      }
      requestAnimationFrame(step);
    });
  }

  async function executeRule(ruleId, activeBundle=bundleRef.current){const rule=findRule(ruleId,activeBundle);if(rule&&(!rule.event?.itemId||rule.event.itemId===selectedItem)&&rulePass(rule,activeBundle))await runActions(rule.actions,activeBundle,{ruleId:rule.id,sayIndex:0})}
  async function runEvent(type,targetId,activeBundle=bundleRef.current,targetType='object',context={}){const eventVerb=context.verb??selectedVerb;const eventItem=context.itemId??selectedItem;let handled=0;for(const rule of activeBundle?.logic.rules||[]){if(ruleEventMatches(rule,{type,targetId,targetType,verb:eventVerb,itemId:eventItem})&&rulePass(rule,activeBundle)){handled+=1;await runActions(rule.actions,activeBundle,{ruleId:rule.id,sayIndex:0})}}return handled}

  function startDialogue(characterId, activeBundle=bundleRef.current, startNodeId=''){
    const d=activeBundle?.dialogues.find(x=>x.characterId===characterId); if(!d){sayLine('No dialogue is authored for this character.',playerDefinition?.id||'',{await:false});return}
    const npc=characterObjectForId(characterId,activeBundle);const playerPoint=actorPositionsRef.current[playerId];
    if(npc&&npc.id!==playerId&&playerPoint){const npcPoint=actorPosition(npc.id,npc);setActorFacing(f=>({...f,[npc.id]:horizontalFacingToward(npcPoint.x,playerPoint.x,f[npc.id]||'right')}))}
    const nodeId=resolveDialogueStartNode(d,startNodeId);
    setDialogue({data:d,nodeId,beatIndex:0});
  }
  function chooseDialogueChoice(choice){
    if(choice.once)setRuntimePatch(s=>({...s,usedChoices:{...s.usedChoices,[`${dialogue.data.characterId}:${choice.id}`]:true}}));
    if(choice.actions?.length)runActions(choice.actions,bundleRef.current,{ruleId:`choice-${choice.id}`,sayIndex:0});
    if(choice.targetNodeId)setDialogue(d=>({...d,nodeId:choice.targetNodeId,beatIndex:0}));else setDialogue(null);
  }
  function choiceVisible(choice){
    if(choice.once&&runtime.usedChoices?.[`${dialogue?.data?.characterId}:${choice.id}`])return false;
    if(!choice.condition)return true;
    return typeof choice.condition==='string'?(runtime.flags[choice.condition]||runtime.variables[choice.condition]):conditionPass(choice.condition);
  }

  function activeObjectAsset(obj){
    const state=runtime.objectStates[`${sceneRef.id}:${obj.id}`]||obj.asset?.state||'default'; const path=obj.asset?.states?.[state]||obj.asset?.path||'';
    return bundle?.stateAssetUrls?.[`${obj.id}:${path}`] || bundle?.assetUrls?.[obj.id] || (obj.type==='character'&&projectData.assetUrls.characters?.[`${obj.character?.characterId}:idle`]) || '';
  }
  function staticCharacterAsset(obj,isPlayer){
    const def=projectData.characters.find(c=>c.id===obj.character?.characterId);const side=actorFacing[obj.id]==='left'?'left':'right';
    if(def&&movingActors[obj.id]){const primary=side==='left'?'walkLeft':'walkRight',fallback=side==='left'?'walkRight':'walkLeft';return projectData.assetUrls.characters?.[`${def.id}:${primary}`]||projectData.assetUrls.characters?.[`${def.id}:${fallback}`]||activeObjectAsset(obj)||(def?projectData.assetUrls.characters?.[`${def.id}:idle`]:'')||''}
    return activeObjectAsset(obj)||(def?projectData.assetUrls.characters?.[`${def.id}:idle`]:'')||'';
  }
  function staticCharacterFlip(obj){const def=projectData.characters.find(c=>c.id===obj.character?.characterId);const side=actorFacing[obj.id]==='left'?'left':'right';if(!def)return !!obj.transform?.flipX;if(movingActors[obj.id]){const hasLeft=!!projectData.assetUrls.characters?.[`${def.id}:walkLeft`],hasRight=!!projectData.assetUrls.characters?.[`${def.id}:walkRight`];if(side==='left')return !hasLeft&&hasRight;if(side==='right')return hasLeft&&!hasRight}return side==='left'}
  function objectVisible(obj){const base=runtime.objectVisibility[`${sceneRef.id}:${obj.id}`] ?? obj.transform.visible;if(!base)return false;if(obj.type==='exit'&&obj.exit?.hiddenUntilAvailable&&!exitAvailable(obj))return false;return true}
  function objectLabel(obj){return translate(stringKey.objectLabel(sceneRef.id,obj.id),obj.hotspot?.label||obj.name)}
  function interactionLabel(obj,verb){const item=selectedItem?projectData.inventory.find(i=>i.id===selectedItem)?.name:'';const target=objectLabel(obj);if(item&&verb==='use')return `Use ${item} with ${target}`;if(item&&verb==='give')return `Give ${item} to ${target}`;const v=verb==='pickUp'?'Pick up':verb[0].toUpperCase()+verb.slice(1);return `${v} ${target}`}
  function inventoryInteractionLabel(itemId){const item=projectData.inventory.find(i=>i.id===itemId);const name=item?.name||itemId;if(selectedVerb==='use'&&selectedItem&&selectedItem!==itemId){const first=projectData.inventory.find(i=>i.id===selectedItem)?.name||selectedItem;return `Use ${first} with ${name}`}if(selectedVerb==='give'&&selectedItem===itemId)return `Give ${name} to…`;const verb=selectedVerb==='pickUp'?'Pick up':selectedVerb[0]?.toUpperCase()+selectedVerb.slice(1);return `${verb||'Use'} ${name}`}
  function inventoryFallback(item,verb){if(verb==='look'&&item?.description?.trim())return item.description.trim();return fallbackResponse(settings,verb,item?.name||'that')}

  function walkTo(point, action=null){
    if(!bundle||bundle.meta?.sceneType==='title'||!playerObject)return;
    if(playerDefinition?.id)setAnimationOverrides(current=>Object.fromEntries(Object.entries(current).filter(([id])=>id!==playerDefinition.id)));
    const current=actorPosition(playerId,playerObject);
    const safeStart=clampPointToWalkAreas(current,bundle.visual.walkAreas||[]);
    if(Math.hypot(safeStart.x-current.x,safeStart.y-current.y)>0.5)applyActorPosition(playerId,safeStart,bundle,{clampToWalk:false});
    const path=findPathInWalkAreas(safeStart,point,bundle.visual.walkAreas||[]);
    if(!path.length){setPendingAction(null);setMovingActors(c=>{const n={...c};delete n[playerId];return n});sayLine(fallbackResponse(settings,'walk','there'),playerDefinition?.id||'',{await:false});return}
    setPendingAction(action);
    moveActorAlongPath(playerId,path,walkSpeed);
  }
  function worldPointFromEvent(e){
    const rect=e.currentTarget.getBoundingClientRect();const zoom=Math.max(.25,Math.min(3,Number(bundle.visual.viewport?.zoom)||1));
    return{x:((e.clientX-rect.left)*(ui.viewport.width/rect.width))/zoom+camera.x,y:((e.clientY-rect.top)*(ui.viewport.height/rect.height))/zoom+camera.y};
  }
  function clickWorld(e){if(!bundle||!inputEnabled)return;if(dismissSpeech())return;setSelectedVerb(settings.defaultVerb||'walk');setSelectedItem('');walkTo(worldPointFromEvent(e))}
  function clickObject(e,obj,overrideVerb=null){
    e.stopPropagation();if(!inputEnabled)return;if(dismissSpeech())return;
    const verb=overrideVerb||selectedVerb;
    const point=obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height};
    if(verb==='walk'&&obj.type!=='exit'){walkTo(point);return}
    walkTo(point,{object:obj,verb});
  }
  function contextObject(e,obj){
    e.preventDefault();
    if(settings.rightClickVerb==='none')return;
    clickObject(e,obj,settings.rightClickVerb||'look');
  }
  async function performInteraction(obj,verb){
    if(obj.type!=='exit')await playVerbAnimation(verb);
    if(obj.type==='exit'&&verb==='walk'&&obj.exit?.destinationSceneId){
      if(!exitAvailable(obj)){sayLine(obj.exit?.blockedMessage||'You cannot go there yet.',playerDefinition?.id||'',{await:false});return}
      const next=project.scenes.find(s=>s.id===obj.exit.destinationSceneId);
      if(next){
        if(obj.exit.transition!=='instant'){setFade(1);await delay(320)}
        await runEvent('onLeaveScene','',bundleRef.current);
        await enterScene(next,obj.exit.spawnPointId);
        setFade(0);
        return;
      }
    }
    const binding=obj.hotspot?.actions?.[verb];
    if(binding?.ruleId)await executeRule(binding.ruleId);
    if(binding?.dialogueId)startDialogue(binding.dialogueId);
    if(!binding?.ruleId&&!binding?.dialogueId){
      const eventType={look:'onLook',use:'onUse',talk:'onTalk',pickUp:'onPickUp',give:'onGive',open:'onOpen',close:'onClose',push:'onPush',pull:'onPull'}[verb];
      const handled=eventType?await runEvent(eventType,obj.id,bundleRef.current,'object',{verb,itemId:selectedItem}):0;
      if(!handled&&verb==='talk'&&obj.type==='character'&&obj.character?.characterId&&bundleRef.current?.dialogues?.some(d=>d.characterId===obj.character.characterId)){startDialogue(obj.character.characterId,bundleRef.current);return}
      if(!handled)sayLine(fallbackResponse(settings,verb,objectLabel(obj)),playerDefinition?.id||'',{await:false});
    }
  }

  async function interactWithInventoryItem(itemId){
    const item=projectData.inventory.find(i=>i.id===itemId);if(!item||!inputEnabled)return;
    const verb=selectedVerb||settings.defaultVerb||'walk';
    if(verb==='walk'){setSelectedItem(itemId);setSelectedVerb('use');setHoverText(`Use ${item.name} with…`);return}
    if(!inventoryVerbEnabled(item,verb)){sayLine(fallbackResponse(settings,verb,item.name),playerDefinition?.id||'',{await:false});return}
    if(verb==='use'){if(selectedItem&&selectedItem!==itemId){await combineInventoryItems(selectedItem,itemId);return}setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setHoverText(`Use ${item.name} with…`);return}
    if(verb==='give'){setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setHoverText(`Give ${item.name} to…`);return}
    setSelectedItem('');
    await playVerbAnimation(verb);
    const eventType=inventoryEventTypeForVerb(verb);
    if(!eventType){sayLine(inventoryFallback(item,verb),playerDefinition?.id||'',{await:false});return}
    const handled=await runEvent(eventType,itemId,bundleRef.current,'inventory',{verb,itemId:''});
    if(!handled)sayLine(inventoryFallback(item,verb),playerDefinition?.id||'',{await:false});
  }

  async function combineInventoryItems(firstId, secondId){
    if(firstId===secondId){setSelectedItem('');return}
    const combineRules=(bundleRef.current?.logic.rules||[]).filter(r=>r.event?.type==='onInventoryCombine');
    const matching=combineRules.find(r=>inventoryRuleMatches(r,firstId,secondId)&&rulePass(r,bundleRef.current));
    if(matching){await runActions(matching.actions,bundleRef.current,{ruleId:matching.id,sayIndex:0});setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');return}
    const match=findInventoryRecipe(projectData.inventory,firstId,secondId);
    if(!match?.recipe?.resultItemId){sayLine('Those items do not combine.',playerDefinition?.id||'',{await:false});setSelectedItem(secondId);return}
    const {recipe,owner,other}=match;
    const alreadyHadResult=runtimeRef.current.inventory.includes(recipe.resultItemId);
    setRuntimePatch(state=>{let inv=[...state.inventory];if(recipe.consumeSelf!==false)inv=inv.filter(id=>id!==owner.id);if(recipe.consumeOther!==false)inv=inv.filter(id=>id!==other.id);if(!inv.includes(recipe.resultItemId))inv.push(recipe.resultItemId);return{...state,inventory:inv}});
    const result=projectData.inventory.find(i=>i.id===recipe.resultItemId);if(!alreadyHadResult)setPickupQueue(q=>[...q,{id:`${recipe.resultItemId}:${Date.now()}:${q.length}`,itemId:recipe.resultItemId,text:pickupMessageFor(recipe.resultItemId)}]);
    sayLine(`Created ${result?.name||recipe.resultItemId}.`,playerDefinition?.id||'',{await:false});setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');
  }

  function uiAction(el){if(!inputEnabled&&!['pause','openSave','openLoad'].includes(el.action?.type))return;const a=el.action||{};if(a.type==='selectVerb'){const verb=a.value||'walk';setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}if(a.type==='openSave')setSavePanel('save');if(a.type==='openLoad')setSavePanel('load');if(a.type==='toggleHotspots')setRuntimePatch(s=>({...s,showHotspots:!s.showHotspots}));if(a.type==='pause')setPaused(v=>!v);if(a.type==='customRule'&&a.value)executeRule(a.value)}

  async function startNewGame(){
    const fresh=initialRuntimeState(projectData);runtimeRef.current=fresh;setRuntime(fresh);setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');setSpeech([]);
    basePlaytimeRef.current=0;startedAtRef.current=Date.now();
    const target=project.scenes.find(s=>s.id===settings.defaultSceneId)||project.scenes.find(s=>s.id!==settings.titleSceneId&&s.id!=='scene0')||project.scenes.find(s=>s.id!==sceneRef.id);
    if(!target){setHoverText('No gameplay start scene is configured.');return}
    await enterScene(target,settings.defaultSpawnPointId||'default');
  }
  function writeSaveSlot(slot,{silent=false}={}){
    const record=createSaveRecord({
      sceneId:sceneRef.id,sceneName:sceneRef.name,playtimeMs:playtimeNow(),
      playerCharacterId:runtimeRef.current.activeCharacterId||playerDefinition?.id||'',
      playerPos:actorPositionsRef.current[playerId]||{x:0,y:0},
      facing:actorFacing[playerId]||'right',camera:cameraRef.current,runtime:runtimeRef.current
    });
    writeSave(project.id,slot,record);
    if(!silent)setHoverText(slot===AUTOSAVE_SLOT?'Autosaved.':`Saved to slot ${slot}.`);
    return record;
  }
  async function loadSaveSlot(slot){
    const record=readSave(project.id,slot);
    if(!record){setHoverText(`Slot ${slot} is empty.`);return}
    setRuntime(record.runtime);runtimeRef.current=record.runtime;
    basePlaytimeRef.current=record.playtimeMs||0;startedAtRef.current=Date.now();
    const ref=project.scenes.find(s=>s.id===record.sceneId)||sceneRef;
    await enterScene(ref,null,{autosave:false});
    const loadedBundle=bundleRef.current;
    if(loadedBundle?.meta?.sceneType!=='title'&&record.playerPos){
      const active=record.runtime?.activeCharacterId;
      const obj=(active&&loadedBundle.objects.find(o=>o.character?.characterId===active))||loadedBundle.objects.find(o=>o.id===loadedBundle.visual.player.characterObjectId)||loadedBundle.objects.find(o=>o.type==='character'&&o.character?.role==='playable');
      if(obj)applyActorPosition(obj.id,record.playerPos,loadedBundle,{clampToWalk:true});
    }
    if(loadedBundle?.visual?.viewport?.followPlayer===false&&record.camera)setCamera(record.camera);
    setSavePanel('');setHoverText(`Loaded slot ${slot}.`);
  }

  if(!bundle)return <div className="runtime-overlay"><div className="runtime-loading">Loading scene…</div></div>;

  const savePanelNode=savePanel?<div className="runtime-save-backdrop" onClick={()=>setSavePanel('')}><div className="runtime-save-panel" onClick={e=>e.stopPropagation()}>
    <div className="runtime-save-head"><strong>{savePanel==='save'?'Save game':'Load game'}</strong><button onClick={()=>setSavePanel('')}>×</button></div>
    <div className="runtime-save-slots">{listSaves(project.id,settings.saveSlots||3).map(({slot,record})=>{
      const isAuto=slot===AUTOSAVE_SLOT;
      return <button key={slot} className="runtime-save-slot" disabled={savePanel==='save'?isAuto:!record} onClick={()=>savePanel==='save'?(writeSaveSlot(slot),setSavePanel('')):loadSaveSlot(slot)}>
        <strong>{isAuto?'Autosave':`Slot ${slot}`}</strong>
        {record?<small>{record.sceneName||record.sceneId} · {formatPlaytime(record.playtimeMs)} · {new Date(record.savedAt).toLocaleString()}</small>:<small>Empty</small>}
      </button>})}</div>
  </div></div>:null;

  if(bundle.meta?.sceneType==='title'){
    const ts=bundle.visual.titleScreen||{};const tt=ts.titleTransform||{x:160,y:120,width:960,height:110};const ng=ts.newGame||{label:'New Game',transform:{x:490,y:560,width:300,height:64},style:{}};const lg=ts.loadGame||{label:'Load Game',transform:{x:490,y:640,width:300,height:64},style:{}};
    return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div className="runtime-screen runtime-title-screen" style={{width:ui.screen.width,height:ui.screen.height,background:bundle.visual.canvas.backgroundColor}}>{bundle.assetUrls.__background&&<img className={`runtime-title-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}<div className="runtime-title-text" style={{left:tt.x,top:tt.y,width:tt.width,height:tt.height,fontSize:ts.titleStyle?.fontSize||54,color:ts.titleStyle?.color||'#f0dfb0',background:ts.titleStyle?.background||'transparent'}}>{ts.title||settings.title||sceneRef.name}</div><button className="runtime-title-button" style={{left:ng.transform.x,top:ng.transform.y,width:ng.transform.width,height:ng.transform.height,fontSize:ng.style?.fontSize||22,color:ng.style?.color||'#eee9dc',background:ng.style?.background||'#292d35'}} onClick={startNewGame}>{ng.label||'New Game'}</button><button className="runtime-title-button" style={{left:lg.transform.x,top:lg.transform.y,width:lg.transform.width,height:lg.transform.height,fontSize:lg.style?.fontSize||22,color:lg.style?.color||'#eee9dc',background:lg.style?.background||'#292d35'}} onClick={()=>setSavePanel('load')}>{lg.label||'Load Game'}</button>{hoverText&&<div className="runtime-title-message">{hoverText}</div>}{savePanelNode}</div></div></div>
  }

  const runtimeZoom=Math.max(.25,Math.min(3,Number(bundle.visual.viewport?.zoom)||1));
  const playerT=playerObject?.transform||{width:80,height:160,z:30,opacity:1};
  const playerScale=scaleForPoint(playerPos);
  const playerBox=scaledRenderBox(playerPos,playerT,playerScale);
  const playerZ=depthZAtPoint(playerPos,bundle.visual.depthAreas||[],playerT.z||30);
  const viewportObjects=bundle.objects.filter(o=>o.id!==playerObject?.id&&objectVisible(o)).sort((a,b)=>a.transform.z-b.transform.z);
  const dNode=dialogue?.data.nodes.find(n=>n.id===dialogue.nodeId); const dBeat=dNode?.beats?.[dialogue?.beatIndex||0]; const dSpeaker=dBeat?projectData.characters.find(c=>c.id===dBeat.speakerId):null;

  function speechAnchorFor(bubble){
    const obj=bubble.speakerId?characterObjectForId(bubble.speakerId):null;
    if(!obj)return {x:camera.x+worldViewportForZoom(ui.viewport,runtimeZoom).width/2,y:camera.y+60};
    const point=actorPosition(obj.id,obj);
    return speechAnchorForActor(point,obj.transform,scaleForPoint(point));
  }

  return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div className="runtime-screen" style={{width:ui.screen.width,height:ui.screen.height,background:ui.screen.backgroundColor}}>
    <div className={`runtime-viewport ${inputEnabled?'':'input-locked'}`} style={{left:ui.viewport.x,top:ui.viewport.y,width:ui.viewport.width,height:ui.viewport.height,cursor:projectData.assetUrls.ui?.[`cursor:${selectedVerb}`]?`url(${projectData.assetUrls.ui[`cursor:${selectedVerb}`]}), auto`:undefined}} onClick={clickWorld} onContextMenu={e=>{e.preventDefault();if(!inputEnabled)return;if(dismissSpeech())return;const verb=settings.rightClickVerb||'look';setSelectedVerb(verb);setSelectedItem('')}}>
      <div className="runtime-world" style={{width:bundle.visual.canvas.width,height:bundle.visual.canvas.height,transformOrigin:'top left',transform:`translate(${-camera.x*runtimeZoom}px, ${-camera.y*runtimeZoom}px) scale(${runtimeZoom})`,backgroundColor:bundle.visual.canvas.backgroundColor}}>
        {bundle.assetUrls.__background&&<img className={`runtime-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}
        {viewportObjects.map(obj=>{
          const t=obj.transform,url=obj.type==='character'?staticCharacterAsset(obj,false):activeObjectAsset(obj),hr=hotspotRect(obj),anim=obj.type==='character'?resolveCharacterRender(obj,false):null;
          const isActor=obj.type==='character';
          const actorPoint=isActor?actorPosition(obj.id,obj):null;
          const actorScale=isActor?scaleForPoint(actorPoint):1;
          const box=isActor?scaledRenderBox(actorPoint,t,actorScale):null;
          const renderLeft=isActor?box.left:t.x,renderTop=isActor?box.top:t.y;
          const renderWidth=isActor?box.width:t.width,renderHeight=isActor?box.height:t.height;
          const zIndex=isActor?depthZAtPoint(actorPoint,bundle.visual.depthAreas||[],t.z):t.z;
          return <React.Fragment key={obj.id}>
            <div className="runtime-object runtime-visual-object" style={{left:renderLeft,top:renderTop,width:renderWidth,height:renderHeight,zIndex,opacity:t.opacity,transform:!anim&&obj.type==='character'&&staticCharacterFlip(obj)?'scaleX(-1)':(!anim&&t.flipX?'scaleX(-1)':'none')}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(obj.character?.characterId,anim.playKey)}/>:url?<img src={url} alt="" draggable="false" onLoad={e=>obj.hotspot?.shape==='alpha'&&cacheAlphaMask(url,e.currentTarget)}/>:<div className="runtime-placeholder">{obj.name}</div>}</div>
            {obj.hotspot?.enabled&&<div className={`runtime-hotspot-target clickable shape-${obj.hotspot?.shape||'visual'} ${runtime.showHotspots?'debug':''}`} style={{left:isActor?renderLeft:hr.x,top:isActor?renderTop:hr.y,width:isActor?renderWidth:hr.width,height:isActor?renderHeight:hr.height,zIndex}} onMouseMove={e=>{const hit=alphaHotspotHit(e,obj,url);e.currentTarget.style.cursor=hit?'pointer':'default';setHoverText(hit?interactionLabel(obj,selectedVerb):'')}} onMouseLeave={()=>setHoverText('')} onContextMenu={e=>contextObject(e,obj)} onClick={e=>{if(alphaHotspotHit(e,obj,url))clickObject(e,obj)}}>{runtime.showHotspots?<span>{objectLabel(obj)}</span>:null}</div>}
          </React.Fragment>})}
        {playerObject&&(()=>{const anim=resolveCharacterRender(playerObject,true);const box=anim?scaledRenderBox(playerPos,playerT,playerScale):playerBox;const staticUrl=staticCharacterAsset(playerObject,true);return <div className="runtime-object runtime-player" style={{left:box.left,top:box.top,width:box.width,height:box.height,zIndex:playerZ,opacity:playerT.opacity,transform:!anim&&staticCharacterFlip(playerObject)?'scaleX(-1)':(!anim&&playerT.flipX?'scaleX(-1)':'none')}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(playerDefinition?.id,anim.playKey)}/>:staticUrl?<img src={staticUrl} alt="" draggable="false"/>:<div className="runtime-placeholder">{playerObject.name}</div>}</div>})()}
        {settings.floatingSpeech!==false&&speech.map(bubble=>{const anchor=speechAnchorFor(bubble);return <div key={bubble.id} className="runtime-speech" style={{left:anchor.x,top:anchor.y,color:bubble.color,zIndex:9000}} onClick={e=>{e.stopPropagation();dismissSpeech()}}>{bubble.text}</div>})}
      </div>
      {fade>0&&<div className="runtime-fade" style={{opacity:fade}}/>}
    </div>
    {(ui.elements||[]).sort((a,b)=>a.transform.z-b.transform.z).map(el=>{const t=el.transform;const active=el.action?.type==='selectVerb'&&el.action.value===selectedVerb;return <div key={el.id} className={`runtime-ui-element runtime-ui-${el.type} ${active?'active':''} ${inputEnabled?'':'dimmed'}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,background:el.style?.background,color:el.style?.color,fontSize:el.style?.fontSize}} onClick={()=>uiAction(el)}>
      {el.type==='statusText'?<span>{hoverText||(settings.floatingSpeech===false&&speech[0]?.text)||selectedVerb}</span>:null}
      {el.type==='inventory'?<div className={`runtime-inventory direction-${el.inventory?.direction||'horizontal'}`} style={{gridTemplateColumns:`repeat(${el.inventory?.columns||3}, ${el.inventory?.slotWidth||96}px)`,gridAutoRows:`${el.inventory?.slotHeight||54}px`}}>{runtime.inventory.map(id=>{const item=projectData.inventory.find(i=>i.id===id);return <button style={{width:el.inventory?.slotWidth||96,height:el.inventory?.slotHeight||54}} title={item?.description||''} className={selectedItem===id?'active':''} key={id} onMouseEnter={()=>setHoverText(inventoryInteractionLabel(id))} onMouseLeave={()=>setHoverText('')} onClick={(e)=>{e.stopPropagation();interactWithInventoryItem(id)}}>{projectData.assetUrls.inventory?.[id]?<img src={projectData.assetUrls.inventory[id]} alt=""/>:<span>{item?.name||id}</span>}</button>})}</div>:null}
      {el.type==='image'&&projectData.assetUrls.ui?.[el.id]?<img src={projectData.assetUrls.ui[el.id]} alt=""/>:null}
      {!['statusText','inventory','image','panel'].includes(el.type)?<span>{el.label||el.name}</span>:null}
    </div>})}
    {pickupQueue.length>0&&<div className="runtime-pickup-backdrop" onClick={()=>setPickupQueue(q=>q.slice(1))}><div className="runtime-pickup-card" onClick={e=>{e.stopPropagation();setPickupQueue(q=>q.slice(1))}}><strong>{pickupQueue[0].text}</strong><span>Click to continue</span></div></div>}
    {dNode&&dBeat&&<div className="runtime-dialogue">{projectData.assetUrls.characters?.[`${dBeat.speakerId}:portrait`]&&<img className="runtime-dialogue-portrait" src={projectData.assetUrls.characters[`${dBeat.speakerId}:portrait`]} alt=""/>}<div className="runtime-dialogue-speaker">{dSpeaker?.name||dBeat.speakerId}</div><div className="runtime-dialogue-line" style={{color:speechColorFor(dSpeaker,settings)}}>{translate(stringKey.dialogueBeat(sceneRef.id,dialogue.data.characterId,dNode.id,dBeat.id),dBeat.text)}</div><div className="runtime-dialogue-choices">{(dialogue.beatIndex||0)<(dNode.beats?.length||1)-1?<button onClick={()=>setDialogue(d=>({...d,beatIndex:(d.beatIndex||0)+1}))}>Continue</button>:<>{(dNode.choices||[]).filter(choiceVisible).map(c=><button key={c.id} onClick={()=>chooseDialogueChoice(c)}>{translate(stringKey.dialogueChoice(sceneRef.id,dialogue.data.characterId,dNode.id,c.id),c.text)}</button>)}{!(dNode.choices||[]).filter(choiceVisible).length&&<button onClick={()=>setDialogue(null)}>Continue</button>}</>}</div></div>}
    {savePanelNode}
  {paused&&<div className="runtime-paused">PAUSED</div>}</div></div></div>

  function cacheAlphaMask(url,img){if(!url||!img||alphaMasksRef.current.has(url))return;try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);alphaMasksRef.current.set(url,ctx.getImageData(0,0,canvas.width,canvas.height))}catch{alphaMasksRef.current.set(url,null)}}
  function alphaHotspotHit(e,obj,url){if((obj.hotspot?.shape||'visual')!=='alpha')return true;const mask=alphaMasksRef.current.get(url);if(!mask)return true;const hitRect=e.currentTarget.getBoundingClientRect();const b=obj.hotspot?.bounds||{x:0,y:0,width:1,height:1};const rx=hitRect.width?clamp01((e.clientX-hitRect.left)/hitRect.width):0,ry=hitRect.height?clamp01((e.clientY-hitRect.top)/hitRect.height):0;let nx=(b.x||0)+(obj.transform?.flipX?(1-rx):rx)*(b.width||1),ny=(b.y||0)+ry*(b.height||1);return alphaHit(mask,nx,ny,obj.hotspot?.alphaThreshold??8)}
}
