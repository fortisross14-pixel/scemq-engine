import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampCamera, clampPointToWalkAreas, depthZAtPoint, findPathInWalkAreas, followCameraForCharacter, lerpPoint, resolveInteractionApproach, worldViewportForZoom } from '../lib/geometry.js';
import { actorScaleAtPoint, scaledRenderBox } from '../lib/scale.js';
import { findInventoryRecipe, inventoryEventTypeForVerb, inventoryRuleMatches, inventoryVerbEnabled } from '../lib/inventory.js';
import { advanceDialogueRuntimeState, createDialogueRuntimeState, moveDialogueRuntimeToNode, resolveDialogueStartNode } from '../lib/dialogue.js';
import { alphaHit, hotspotRect, runtimeObjectHasVisual } from '../lib/hotspot.js';
import { resolveSpeechSpeakerId, speechAnchorForActor, speechColorFor, speechDurationMs, speechScreenPosition } from '../lib/speech.js';
import { fallbackResponse } from '../lib/responses.js';
import { authoredRulesForInteraction, eventTypeForVerb, ruleEventMatches } from '../lib/interaction.js';
import { delay, parseDurationMs, parsePoint } from '../lib/cutscene.js';
import { cycleBoundValue, stepBoundValue } from '../lib/closeup.js';
import { AudioEngine } from '../lib/audio.js';
import { AUTOSAVE_SLOT, createSaveRecord, formatPlaytime, listSaves, readSave, writeSave } from '../lib/saves.js';
import { createTranslator, key as stringKey } from '../lib/localization.js';
import SpriteStrip from './SpriteStrip.jsx';
import { animationContentAspectRatio, animationDurationMs, characterAnimationAssetKey, horizontalFacingFromDelta, horizontalFacingToward, normalizeCharacterAnimationData, requestedAnimationForVerb, resolveAnimation, shouldMirror } from '../lib/animation.js';

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
    playedCutscenes: {},
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
  const [hoverCursorRole,setHoverCursorRole]=useState('normal');
  const [runtimeCursorPoint,setRuntimeCursorPoint]=useState({x:0,y:0,visible:false});
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
  const pendingActionRef = useRef(null);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const interactionBusyRef = useRef(false);
  const [animationOverrides, setAnimationOverrides] = useState({});
  const [savePanel, setSavePanel] = useState('');
  const [interactionWarning, setInteractionWarning] = useState('');
  const [activeCloseUpId, setActiveCloseUpId] = useState('');
  const [activeCutscene, setActiveCutscene] = useState(null);
  const [cutsceneTime, setCutsceneTime] = useState(0);
  const [cutsceneTextIndex, setCutsceneTextIndex] = useState(0);
  const [cutsceneNeedsGesture, setCutsceneNeedsGesture] = useState(false);
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
  const moveCompletionArmedRef = useRef(new Set());
  const audioRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const interactionWarningTimerRef = useRef(0);
  const viewportRef = useRef(null);
  const runtimeScreenRef = useRef(null);
  const cutsceneVideoRef = useRef(null);
  const cutsceneResolverRef = useRef(null);
  const cutsceneCheckRef = useRef(false);
  const basePlaytimeRef = useRef(0);
  useEffect(()=>{runtimeRef.current=runtime},[runtime]);
  useEffect(()=>{bundleRef.current=bundle},[bundle]);
  useEffect(()=>{actorPositionsRef.current=actorPositions},[actorPositions]);
  useEffect(()=>{cameraRef.current=camera},[camera]);
  useEffect(()=>{cameraLockedRef.current=cameraLocked},[cameraLocked]);
  useEffect(()=>{inputEnabledRef.current=inputEnabled},[inputEnabled]);
  useEffect(()=>{
    const video=cutsceneVideoRef.current;if(!video||!activeCutscene)return;
    if(activeCutscene.phase==='video'){
      video.play().then(()=>setCutsceneNeedsGesture(false)).catch(()=>setCutsceneNeedsGesture(true));
    }else{
      video.pause();
      if(activeCutscene.phase==='before'&&video.currentTime>0.05){try{video.currentTime=0}catch{}}
    }
  },[activeCutscene?.phase,activeCutscene?.cutscene?.id]);
  function rememberPendingAction(action){pendingActionRef.current=action;setPendingAction(action)}
  function clearPendingAction(){pendingActionRef.current=null;setPendingAction(null)}
  function setInteractionBusyState(value){interactionBusyRef.current=!!value;setInteractionBusy(!!value)}

  if(!audioRef.current) audioRef.current=new AudioEngine();
  useEffect(()=>{audioRef.current.setVolumes(settings)},[settings.musicVolume,settings.ambientVolume,settings.sfxVolume,settings.masterVolume]);
  useEffect(()=>()=>{audioRef.current?.dispose?.();clearTimeout(interactionWarningTimerRef.current);cutsceneResolverRef.current?.(false)},[]);

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
  function currentDialogueBeat(){const d=dialogue;if(!d||d.awaitingChoice)return null;const node=d.data?.nodes?.find(n=>n.id===d.nodeId);return node?.beats?.[d.beatIndex||0]||null}
  function scaleForPoint(point,activeBundle=bundleRef.current){return actorScaleAtPoint(point,activeBundle?.visual?.scaleAreas||[],1)}
  function clearInteractionWarning(){clearTimeout(interactionWarningTimerRef.current);setInteractionWarning('')}
  function showInteractionWarning(obj,detail=''){
    const label=obj?objectLabel(obj):'target';
    const message=detail||`Cannot reach interaction point for ${label}.`;
    console.warn(`[SCEMQ] ${message}`,obj||'');
    clearTimeout(interactionWarningTimerRef.current);
    setInteractionWarning(message);
    interactionWarningTimerRef.current=setTimeout(()=>setInteractionWarning(''),3600);
  }
  async function performPendingInteraction(action){
    const obj=objectById(action?.objectId) || action?.object;
    if(!obj){clearPendingAction();setInteractionBusyState(false);return false}
    const mode=obj?.interactionPoint?.facingMode||'auto';
    const explicit=obj?.interactionPoint?.facing;
    const actor=actorPositionsRef.current[playerId]||{x:0,y:0};
    const targetX=interactionTargetX(obj);
    const nextFacing=mode==='manual'&&['left','right'].includes(explicit)?explicit:horizontalFacingToward(actor.x,targetX,actorFacing[playerId]||'right');
    setActorFacing(f=>({...f,[playerId]:nextFacing}));
    try{
      await performInteraction(obj,action.verb,action.itemId||'');
      return true;
    }finally{
      clearPendingAction();
      setInteractionBusyState(false);
    }
  }

  function effectiveCharacterTransform(obj){
    const t=obj?.transform||{};if(obj?.type!=='character')return t;
    const def=projectData.characters.find(c=>c.id===obj.character?.characterId);if(!def)return t;
    const c=normalizeCharacterAnimationData(def);const canonicalName=c.defaultAnimation||(c.animations.idle?'idle':'');const canonical=canonicalName?c.animations[canonicalName]:null;const ratio=animationContentAspectRatio(canonical);
    if(!(ratio>0))return t;
    const height=Math.max(1,Number(t.height||1));return{...t,width:height*ratio,aspectRatio:ratio,lockAspect:true};
  }

  function animationRenderTransform(baseTransform,animation){
    // Keep every animation at the scene-authored character height, but let the
    // active strip use its own visible aspect ratio. This mirrors object-fit:
    // contain semantics and prevents a replacement walk/talk/pickup sheet from
    // being squeezed into the idle strip's width or stretched by PNG padding.
    const ratio=animationContentAspectRatio(animation);
    if(!(ratio>0))return baseTransform;
    const height=Math.max(1,Number(baseTransform?.height||1));
    return{...baseTransform,width:height*ratio,aspectRatio:ratio,lockAspect:true};
  }

  function resolveCharacterRender(obj,isPlayer=false){
    const characterId=obj?.character?.characterId;const def=projectData.characters.find(c=>c.id===characterId);if(!def)return null;
    const beat=currentDialogueBeat();const speaking=speech.some(s=>s.speakerId===characterId);let requested='';
    const isMoving=!!movingActors[obj.id]&&!dialogue;
    if(beat?.speakerId===characterId||speaking)requested=requestedAnimationForVerb(def,'talk');
    else if(isMoving)requested=requestedAnimationForVerb(def,'walk');
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
    // Gameplay must never remain locked because a visual animation failed to
    // dispatch its DOM completion callback. Use the authored animation duration
    // as a safety clock; the normal SpriteStrip callback still completes first.
    return new Promise(resolve=>{
      const resolverKey=`${characterId}:${playKey}`;
      const timeoutMs=Math.max(250,Math.min(15000,animationDurationMs(resolved.animation)+500));
      const timer=setTimeout(()=>{
        if(!animationResolversRef.current.has(resolverKey))return;
        animationResolversRef.current.delete(resolverKey);
        console.warn(`[SCEMQ] Animation “${resolved.name}” did not report completion; continuing interaction after ${Math.round(timeoutMs)}ms.`);
        setAnimationOverrides(current=>current[characterId]?.playKey===playKey?Object.fromEntries(Object.entries(current).filter(([id])=>id!==characterId)):current);
        resolve(true);
      },timeoutMs);
      animationResolversRef.current.set(resolverKey,value=>{clearTimeout(timer);resolve(value)});
    });
  }
  async function playVerbAnimation(verb){const characterId=playerDefinition?.id;if(!characterId||['walk','talk'].includes(verb))return;const name=requestedAnimationForVerb(playerDefinition,verb);if(name)await playCharacterAnimation(characterId,name,{waitForCompletion:true})}

  // --- speech ---------------------------------------------------------------
  function sayLine(text,speakerId='',{await:shouldAwait=true}={}){
    const line=String(text??'');
    if(!line.trim())return Promise.resolve(false);
    const resolvedSpeakerId=resolveSpeechSpeakerId(speakerId,projectData.characters,bundleRef.current?.objects||[],line);
    const character=projectData.characters.find(c=>c.id===resolvedSpeakerId);
    const id=`speech-${++speechCounterRef.current}`;
    const duration=speechDurationMs(line,settings);
    const bubble={id,text:line,speakerId:resolvedSpeakerId,color:speechColorFor(character,settings)};
    setSpeech(current=>[...current.filter(s=>s.speakerId!==resolvedSpeakerId||!resolvedSpeakerId),bubble]);
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
    if(!active.length||!bundle||paused||dialogue)return;
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
      // React may execute the state updater after this callback returns, so
      // resolving from the local `finished` array here can miss completion.
      // A separate committed-state effect below resolves the movement promise.
      rafRef.current=requestAnimationFrame(frame);
    }
    rafRef.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[movingActors,bundle,paused,playerId,dialogue]);

  // A movement promise resolves only after React has committed the actor from
  // moving -> stopped. This prevents the player from visually reaching an
  // interaction point while the pending action waits forever.
  useEffect(()=>{
    for(const objectId of Object.keys(movingActors)){
      if(npcMoveResolversRef.current.has(objectId))moveCompletionArmedRef.current.add(objectId);
    }
    for(const [objectId,resolve] of npcMoveResolversRef.current.entries()){
      if(moveCompletionArmedRef.current.has(objectId)&&!movingActors[objectId]){
        npcMoveResolversRef.current.delete(objectId);
        moveCompletionArmedRef.current.delete(objectId);
        resolve(true);
      }
    }
  },[movingActors]);

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
    clearPendingAction();
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
    setMovingActors({}); clearPendingAction(); setDialogue(null); setActiveCloseUpId(''); setHoverText(''); setPickupQueue([]); setSpeech([]);
    audioRef.current.play('music',loaded.assetUrls.__music||'');
    audioRef.current.play('ambient',loaded.assetUrls.__ambient||'');
    if(autosave&&settings.autosaveOnSceneChange!==false&&loaded.meta?.sceneType!=='title')setTimeout(()=>writeSaveSlot(AUTOSAVE_SLOT,{silent:true}),0);
    setTimeout(async()=>{await runEvent('onEnterScene','',loaded,'object',{skipCutsceneCheck:true});await checkCutscenes(loaded,'enter')},0);
  }

  useEffect(()=>{ enterScene(initialScene,null,{autosave:false}); return ()=>cancelAnimationFrame(rafRef.current); },[]);

  // Background rules: onTick fires once a second while the player has control.
  useEffect(()=>{
    const timer=setInterval(()=>{
      const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);
      if(paused||!inputEnabledRef.current||!bundleRef.current||cutsceneResolverRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;
      if((bundleRef.current.logic?.rules||[]).some(r=>r.event?.type==='onTick'))runEvent('onTick','',bundleRef.current);
    },1000);
    return ()=>clearInterval(timer);
  },[paused,activeCloseUpId]);

  // Keyboard verb shortcuts + skip.
  useEffect(()=>{
    function onKey(e){
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
      if(e.key==='Escape'){if(activeCutscene?.cutscene?.skippable!==false){if(activeCutscene){finishActiveCutscene({skipped:true});return}}const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);if(openPanel&&openPanel.closeOnEscape!==false){setActiveCloseUpId('');return}if(savePanel){setSavePanel('');return}dismissSpeech();return}
      if(e.key===' '){if(activeCloseUpId)return;if(dismissSpeech())e.preventDefault();return}
      const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);
      if(settings.keyboardShortcuts===false||!inputEnabledRef.current||interactionBusyRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;
      const verb=VERB_KEYS[e.key.toLowerCase()];
      if(verb){e.preventDefault();setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}
    }
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[speech,savePanel,settings.keyboardShortcuts,activeCutscene,activeCloseUpId]);

  function setRuntimePatch(updater){const current=runtimeRef.current;const next=typeof updater==='function'?updater(current):{...current,...updater};runtimeRef.current=next;setRuntime(next);return next}
  function isGlobalVariable(variableId){return (projectData.variables?.variables||[]).some(v=>v.id===variableId)}
  function readVariableValue(variableId,activeBundle=bundleRef.current){
    if(!variableId)return undefined;
    if(isGlobalVariable(variableId))return runtimeRef.current.variables?.[variableId] ?? (projectData.variables?.variables||[]).find(v=>v.id===variableId)?.initialValue;
    const sid=activeBundle?.meta?.sceneId||sceneRef.id;
    return runtimeRef.current.sceneVariables?.[sid]?.[variableId] ?? (activeBundle?.logic?.variables||[]).find(v=>v.id===variableId)?.initialValue;
  }
  function writeVariableValue(variableId,value,activeBundle=bundleRef.current,{emit=true}={}){
    if(!variableId)return;
    const sid=activeBundle?.meta?.sceneId||sceneRef.id;
    if(isGlobalVariable(variableId))setRuntimePatch(state=>({...state,variables:{...state.variables,[variableId]:value}}));
    else setRuntimePatch(state=>({...state,sceneVariables:{...state.sceneVariables,[sid]:{...(state.sceneVariables?.[sid]||{}),[variableId]:value}}}));
    if(emit)void runEvent('onVariableChanged',variableId,activeBundle,'object');
  }
  function openCloseUp(closeUpId,activeBundle=bundleRef.current){
    const panel=(activeBundle?.closeUps?.closeUps||[]).find(c=>c.id===closeUpId);
    if(!panel)return false;
    // A close-up is a screen-space interaction mode, not a world movement state.
    // Stop any in-progress player walk so Mara is exactly where she was when the
    // panel opened and cannot continue drifting behind the modal UI.
    clearPendingAction();
    if(playerId)completeActorMove(playerId);
    setInteractionBusyState(false);setHoverText('');setActiveCloseUpId(closeUpId);setHoverCursorRole('gui');return true;
  }
  function closeCloseUp(){setActiveCloseUpId('');setHoverCursorRole('normal')}
  async function activateCloseUpElement(element,activeBundle=bundleRef.current){
    const action=element?.action||{};
    if(action.type==='customRule'&&action.value){await executeRule(action.value,activeBundle);return}
    if(action.type&&action.type!=='none')await runActions([action],activeBundle,{ruleId:`closeup-${element.id}`,sayIndex:0});
  }
  function stepCloseUpNumber(element,direction,activeBundle=bundleRef.current){
    const cfg=element.number||{};const current=Number(readVariableValue(element.variableId,activeBundle)??cfg.min??0);
    const next=stepBoundValue(current,{amount:(Number(cfg.step)||1)*direction,min:Number(cfg.min??0),max:Number(cfg.max??9),wrap:cfg.wrap!==false});
    writeVariableValue(element.variableId,next,activeBundle);
  }
  function cycleCloseUpToggle(element,activeBundle=bundleRef.current){
    const values=element.toggle?.values||[];const current=readVariableValue(element.variableId,activeBundle)??values[0];
    writeVariableValue(element.variableId,cycleBoundValue(current,values),activeBundle);
  }
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

  function cutscenePass(cutscene, activeBundle=bundleRef.current){
    const sid=activeBundle?.meta?.sceneId||sceneRef.id;
    return (cutscene?.conditions||[]).every(c=>conditionPass(c,runtimeRef.current,sid));
  }
  function cutsceneKey(cutscene, activeBundle=bundleRef.current){return `${activeBundle?.meta?.sceneId||sceneRef.id}:${cutscene.id}`}
  function finishActiveCutscene({skipped=false}={}){
    const current=cutsceneResolverRef.current;
    const value=activeCutscene;
    if(!value){current?.(false);cutsceneResolverRef.current=null;return}
    const key=cutsceneKey(value.cutscene,value.bundle);
    setRuntimePatch(state=>({...state,playedCutscenes:{...(state.playedCutscenes||{}),[key]:true}}));
    setActiveCutscene(null);setCutsceneTime(0);setCutsceneTextIndex(0);setCutsceneNeedsGesture(false);
    audioRef.current.setMuted(false);
    cutsceneResolverRef.current=null;
    current?.(!skipped);
  }
  function playVideoCutscene(cutscene, activeBundle=bundleRef.current){
    const url=activeBundle?.assetUrls?.[`__cutscene:${cutscene.id}`];
    if(!url)return Promise.resolve(false);
    audioRef.current.setMuted(true);
    setCutsceneTime(0);setCutsceneTextIndex(0);setCutsceneNeedsGesture(false);
    const phase=(cutscene.beforeText||[]).length?'before':'video';
    return new Promise(resolve=>{
      cutsceneResolverRef.current=resolve;
      setActiveCutscene({cutscene,bundle:activeBundle,url,phase});
    });
  }
  function advanceCutsceneText(){
    if(!activeCutscene||!['before','after'].includes(activeCutscene.phase))return;
    const lines=activeCutscene.phase==='before'?(activeCutscene.cutscene.beforeText||[]):(activeCutscene.cutscene.afterText||[]);
    if(cutsceneTextIndex<lines.length-1){setCutsceneTextIndex(i=>i+1);return}
    if(activeCutscene.phase==='before'){
      setCutsceneTextIndex(0);setCutsceneTime(0);setActiveCutscene(value=>value?{...value,phase:'video'}:value);return;
    }
    finishActiveCutscene();
  }
  function finishCutsceneVideo(){
    if(!activeCutscene)return;
    if((activeCutscene.cutscene.afterText||[]).length){setCutsceneTextIndex(0);setActiveCutscene(value=>value?{...value,phase:'after'}:value);return}
    finishActiveCutscene();
  }
  async function checkCutscenes(activeBundle=bundleRef.current, trigger='condition'){
    if(!activeBundle?.cutscenes?.cutscenes?.length||activeBundle.meta?.sceneType==='title'||cutsceneCheckRef.current)return;
    cutsceneCheckRef.current=true;
    try{
      for(const cutscene of activeBundle.cutscenes.cutscenes){
        if(!cutscene?.video)continue;
        const triggerMatch=cutscene.trigger==='enter'?trigger==='enter':(trigger==='enter'||trigger==='condition');
        if(!triggerMatch)continue;
        const key=cutsceneKey(cutscene,activeBundle);
        if(cutscene.once!==false&&runtimeRef.current.playedCutscenes?.[key])continue;
        if(!cutscenePass(cutscene,activeBundle))continue;
        await playVideoCutscene(cutscene,activeBundle);
      }
    } finally { cutsceneCheckRef.current=false; }
  }

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
        case 'setVariable':{writeVariableValue(key,value,activeBundle,{emit:false});await runEvent('onVariableChanged',key,activeBundle);break}
        case 'incrementVariable':
        case 'decrementVariable':{
          const direction=action.type==='decrementVariable'?-1:1;const current=Number(readVariableValue(key,activeBundle)??0);
          const next=stepBoundValue(current,{amount:(Number(action.amount)||1)*direction,min:Number(action.min??0),max:Number(action.max??9),wrap:!!action.wrap});
          writeVariableValue(key,next,activeBundle,{emit:false});await runEvent('onVariableChanged',key,activeBundle);break;
        }
        case 'openCloseUp': openCloseUp(key||String(value||''),activeBundle); break;
        case 'closeCloseUp': closeCloseUp(); break;
        case 'playCutscene':{
          const cutscene=(activeBundle?.cutscenes?.cutscenes||[]).find(c=>c.id===(key||String(value||'')));
          if(cutscene){const played=runtimeRef.current.playedCutscenes?.[cutsceneKey(cutscene,activeBundle)];if(cutscene.once===false||!played)await playVideoCutscene(cutscene,activeBundle)}
          break;
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

  async function executeRule(ruleId, activeBundle=bundleRef.current, context={}){
    const rule=findRule(ruleId,activeBundle);
    if(!rule)return {executed:false,reason:'missing'};
    const eventItem=context.itemId??selectedItem;
    if(rule.event?.itemId&&rule.event.itemId!==eventItem)return {executed:false,reason:'item'};
    if(!rulePass(rule,activeBundle))return {executed:false,reason:'conditions'};
    await runActions(rule.actions,activeBundle,{ruleId:rule.id,sayIndex:0});
    return {executed:true,reason:''};
  }
  async function runEvent(type,targetId,activeBundle=bundleRef.current,targetType='object',context={}){const eventVerb=context.verb??selectedVerb;const eventItem=context.itemId??selectedItem;let handled=0;for(const rule of activeBundle?.logic.rules||[]){if(ruleEventMatches(rule,{type,targetId,targetType,verb:eventVerb,itemId:eventItem})&&rulePass(rule,activeBundle)){handled+=1;await runActions(rule.actions,activeBundle,{ruleId:rule.id,sayIndex:0})}}if(!context.skipCutsceneCheck)await checkCutscenes(activeBundle,'condition');return handled}

  function startDialogue(characterId, activeBundle=bundleRef.current, startNodeId=''){
    const d=activeBundle?.dialogues.find(x=>x.characterId===characterId); if(!d){sayLine('No dialogue is authored for this character.',playerDefinition?.id||'',{await:false});return}
    const npc=characterObjectForId(characterId,activeBundle);const playerPoint=actorPositionsRef.current[playerId];
    if(npc&&npc.id!==playerId&&playerPoint){const npcPoint=actorPosition(npc.id,npc);setActorFacing(f=>({...f,[npc.id]:horizontalFacingToward(npcPoint.x,playerPoint.x,f[npc.id]||'right')}))}
    const nodeId=resolveDialogueStartNode(d,startNodeId);
    clearPendingAction();
    setHoverText('');
    setDialogue(createDialogueRuntimeState(d,nodeId));
  }
  async function chooseDialogueChoice(choice){
    if(!dialogue?.awaitingChoice)return;
    const activeDialogue=dialogue;
    if(choice.once)setRuntimePatch(s=>({...s,usedChoices:{...s.usedChoices,[`${activeDialogue.data.characterId}:${choice.id}`]:true}}));
    if(choice.actions?.length)await runActions(choice.actions,bundleRef.current,{ruleId:`choice-${choice.id}`,sayIndex:0});
    if(choice.targetNodeId)setDialogue(d=>moveDialogueRuntimeToNode(d,activeDialogue.data,choice.targetNodeId));else setDialogue(null);
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
  
  function playDefaultActionSound(verb){
    const path=settings.defaultActionSounds?.[verb];
    if(!path)return;
    const url=projectData.assetUrls.audio?.[path];
    if(url)audioRef.current.playSound(url);
  }

function inventoryInteractionLabel(itemId){const item=projectData.inventory.find(i=>i.id===itemId);const name=item?.name||itemId;if(selectedVerb==='use'&&selectedItem&&selectedItem!==itemId){const first=projectData.inventory.find(i=>i.id===selectedItem)?.name||selectedItem;return `Use ${first} with ${name}`}if(selectedVerb==='give'&&selectedItem===itemId)return `Give ${name} to…`;const verb=selectedVerb==='pickUp'?'Pick up':selectedVerb[0]?.toUpperCase()+selectedVerb.slice(1);return `${verb||'Use'} ${name}`}
  function inventoryFallback(item,verb){if(verb==='look'&&item?.description?.trim())return item.description.trim();return fallbackResponse(settings,verb,item?.name||'that')}

  function walkTo(point, action=null){
    if(!bundle||bundle.meta?.sceneType==='title'||!playerObject)return false;
    if(playerDefinition?.id)setAnimationOverrides(current=>Object.fromEntries(Object.entries(current).filter(([id])=>id!==playerDefinition.id)));
    const current=actorPosition(playerId,playerObject);
    const safeStart=clampPointToWalkAreas(current,bundle.visual.walkAreas||[]);
    if(Math.hypot(safeStart.x-current.x,safeStart.y-current.y)>0.5)applyActorPosition(playerId,safeStart,bundle,{clampToWalk:false});

    if(action){
      const reach=Math.max(24,Number(settings.interactionReachDistance)||110);
      const approach=resolveInteractionApproach(safeStart,point,bundle.visual.walkAreas||[],reach);
      if(!approach.reachable){
        clearPendingAction();
        setInteractionBusyState(false);
        setMovingActors(c=>{const n={...c};delete n[playerId];return n});
        showInteractionWarning(action.object);
        return false;
      }
      clearInteractionWarning();
      const committed={...action,objectId:action.object?.id||action.objectId||'',itemId:action.itemId??selectedItem};
      rememberPendingAction(committed);
      setInteractionBusyState(true);
      if(approach.immediate){
        setMovingActors(c=>{const n={...c};delete n[playerId];return n});
        void performPendingInteraction(committed);
        return true;
      }
      const walk=moveActorAlongPath(playerId,approach.path,walkSpeed);
      // Interaction completion is chained directly to the movement promise.
      // This is more reliable than hoping a later render/effect still sees the
      // pending action after the actor reaches the final waypoint.
      void walk.then(()=>{if(pendingActionRef.current===committed)void performPendingInteraction(committed)});
      return true;
    }

    const path=findPathInWalkAreas(safeStart,point,bundle.visual.walkAreas||[]);
    if(!path.length){clearPendingAction();setMovingActors(c=>{const n={...c};delete n[playerId];return n});sayLine(fallbackResponse(settings,'walk','there'),playerDefinition?.id||'',{await:false});return false}
    clearInteractionWarning();
    clearPendingAction();
    setInteractionBusyState(false);
    moveActorAlongPath(playerId,path,walkSpeed);
    return true;
  }
  function worldPointFromEvent(e){
    const rect=e.currentTarget.getBoundingClientRect();const zoom=Math.max(.25,Math.min(3,Number(bundle.visual.viewport?.zoom)||1));
    return{x:((e.clientX-rect.left)*(ui.viewport.width/rect.width))/zoom+camera.x,y:((e.clientY-rect.top)*(ui.viewport.height/rect.height))/zoom+camera.y};
  }
  function clickWorld(e){const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);if(!bundle||!inputEnabled||interactionBusyRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;if(dialogue){if(!dialogue.awaitingChoice)advanceDialogueBeat();return}if(dismissSpeech())return;setSelectedVerb(settings.defaultVerb||'walk');setSelectedItem('');walkTo(worldPointFromEvent(e))}
  function clickObject(e,obj,overrideVerb=null){
    e.stopPropagation();const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);if(!inputEnabled||interactionBusyRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;if(dialogue){if(!dialogue.awaitingChoice)advanceDialogueBeat();return}
    // A previous incidental remark must never eat a deliberate hotspot click.
    // Dismiss it, but continue with the newly requested interaction in this same click.
    dismissSpeech();
    const verb=overrideVerb||selectedVerb;
    const point=obj.interactionPoint||{x:obj.transform.x+obj.transform.width/2,y:obj.transform.y+obj.transform.height};
    if(verb==='walk'&&obj.type!=='exit'){walkTo(point);return}
    walkTo(point,{object:obj,objectId:obj.id,verb,itemId:selectedItem});
  }
  function contextObject(e,obj){
    e.preventDefault();
    if(dialogue||interactionBusyRef.current)return;
    if(settings.rightClickVerb==='none')return;
    clickObject(e,obj,settings.rightClickVerb||'look');
  }
  async function performInteraction(obj,verb,itemIdOverride=''){
    if(obj.type!=='exit'&&verb!=='walk')playDefaultActionSound(verb);
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
    const quickText=String(binding?.textResponse||'').trim();
    if(quickText){
      const localized=translate(stringKey.objectResponse(sceneRef.id,obj.id,verb),quickText);
      sayLine(localized,playerDefinition?.id||'',{await:false});
      return;
    }
    if(binding?.openCloseUpId){
      if(openCloseUp(binding.openCloseUpId,bundleRef.current))return;
      showInteractionWarning(obj,`Close-up “${binding.openCloseUpId}” is missing for ${objectLabel(obj)}.`);return;
    }
    let explicitHandled=false;
    if(binding?.ruleId){
      const result=await executeRule(binding.ruleId,bundleRef.current,{itemId:itemIdOverride||selectedItem});
      if(result.executed)explicitHandled=true;
      else if(result.reason==='missing')showInteractionWarning(obj,`Hotspot rule “${binding.ruleId}” is missing for ${objectLabel(obj)}.`);
      else if(result.reason==='item')sayLine(fallbackResponse(settings,verb,objectLabel(obj)),playerDefinition?.id||'',{await:false});
      else if(result.reason==='conditions')sayLine(fallbackResponse(settings,verb,objectLabel(obj)),playerDefinition?.id||'',{await:false});
    }
    if(binding?.dialogueId){startDialogue(binding.dialogueId);explicitHandled=true}
    if(!binding?.ruleId&&!binding?.dialogueId){
      // AUTO BINDING: logic rules are authoritative. A generated scene only needs to
      // declare event.targetId + verb; hotspot.actions is optional and acts as an override.
      const eventType=eventTypeForVerb(verb);
      const authored=authoredRulesForInteraction(bundleRef.current?.logic?.rules||[],{targetId:obj.id,targetType:'object',verb});
      const handled=eventType?await runEvent(eventType,obj.id,bundleRef.current,'object',{verb,itemId:itemIdOverride||selectedItem}):0;
      if(!handled&&verb==='talk'&&obj.type==='character'&&obj.character?.characterId&&bundleRef.current?.dialogues?.some(d=>d.characterId===obj.character.characterId)){startDialogue(obj.character.characterId,bundleRef.current);return}
      if(!handled){
        // If authored rules exist but none currently match their conditions/item requirement,
        // this is a normal puzzle-state miss, not a broken binding. Keep the game response
        // friendly while exposing useful diagnostics in dev/editor consoles.
        if(authored.length)console.info('[SCEMQ] Auto-bound rules found but none passed for interaction',{objectId:obj.id,verb,itemId:itemIdOverride||selectedItem,ruleIds:authored.map(r=>r.id)});
        sayLine(fallbackResponse(settings,verb,objectLabel(obj)),playerDefinition?.id||'',{await:false});
      }
    }
  }

  async function interactWithInventoryItem(itemId){
    const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);if(dialogue||interactionBusyRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;
    const item=projectData.inventory.find(i=>i.id===itemId);if(!item||!inputEnabled)return;
    const verb=selectedVerb||settings.defaultVerb||'walk';
    if(verb==='walk'){setSelectedItem(itemId);setSelectedVerb('use');setHoverText(`Use ${item.name} with…`);return}
    if(!inventoryVerbEnabled(item,verb)){sayLine(fallbackResponse(settings,verb,item.name),playerDefinition?.id||'',{await:false});return}
    if(verb==='use'){if(selectedItem&&selectedItem!==itemId){await combineInventoryItems(selectedItem,itemId);return}setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setHoverText(`Use ${item.name} with…`);return}
    if(verb==='give'){setSelectedItem(selectedItem===itemId?'':itemId);if(selectedItem!==itemId)setHoverText(`Give ${item.name} to…`);return}
    setSelectedItem('');
    playDefaultActionSound(verb);
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
    if(matching){playDefaultActionSound('use');await runActions(matching.actions,bundleRef.current,{ruleId:matching.id,sayIndex:0});setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');return}
    const match=findInventoryRecipe(projectData.inventory,firstId,secondId);
    if(!match?.recipe?.resultItemId){sayLine('Those items do not combine.',playerDefinition?.id||'',{await:false});setSelectedItem(secondId);return}
    const {recipe,owner,other}=match;
    const alreadyHadResult=runtimeRef.current.inventory.includes(recipe.resultItemId);
    setRuntimePatch(state=>{let inv=[...state.inventory];if(recipe.consumeSelf!==false)inv=inv.filter(id=>id!==owner.id);if(recipe.consumeOther!==false)inv=inv.filter(id=>id!==other.id);if(!inv.includes(recipe.resultItemId))inv.push(recipe.resultItemId);return{...state,inventory:inv}});
    const result=projectData.inventory.find(i=>i.id===recipe.resultItemId);if(!alreadyHadResult)setPickupQueue(q=>[...q,{id:`${recipe.resultItemId}:${Date.now()}:${q.length}`,itemId:recipe.resultItemId,text:pickupMessageFor(recipe.resultItemId)}]);
    sayLine(`Created ${result?.name||recipe.resultItemId}.`,playerDefinition?.id||'',{await:false});setSelectedItem('');setSelectedVerb(settings.defaultVerb||'walk');
  }

  function uiAction(el){const openPanel=(bundleRef.current?.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId);if(dialogue||interactionBusyRef.current||(openPanel&&openPanel.pauseWorldInput!==false))return;if(!inputEnabled&&!['pause','openSave','openLoad'].includes(el.action?.type))return;const a=el.action||{};if(a.type==='selectVerb'){const verb=a.value||'walk';setSelectedVerb(verb);if(!['use','give'].includes(verb))setSelectedItem('')}if(a.type==='openSave')setSavePanel('save');if(a.type==='openLoad')setSavePanel('load');if(a.type==='toggleHotspots')setRuntimePatch(s=>({...s,showHotspots:!s.showHotspots}));if(a.type==='pause')setPaused(v=>!v);if(a.type==='customRule'&&a.value)executeRule(a.value)}

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
  const playerT=playerObject?effectiveCharacterTransform(playerObject):{width:80,height:160,z:30,opacity:1};
  const playerScale=scaleForPoint(playerPos);
  const playerBox=scaledRenderBox(playerPos,playerT,playerScale);
  const playerZ=depthZAtPoint(playerPos,bundle.visual.depthAreas||[],playerT.z||30);
  const viewportObjects=bundle.objects.filter(o=>o.id!==playerObject?.id&&objectVisible(o)).sort((a,b)=>a.transform.z-b.transform.z);
  const dNode=dialogue?.data.nodes.find(n=>n.id===dialogue.nodeId); const dBeat=dialogue?.awaitingChoice?null:dNode?.beats?.[dialogue?.beatIndex||0]; const dSpeaker=dBeat?projectData.characters.find(c=>c.id===dBeat.speakerId):null;

  function speechWorldAnchorFor(speakerId=''){
    const obj=speakerId?characterObjectForId(speakerId):null;
    if(!obj)return {x:camera.x+worldViewportForZoom(ui.viewport,runtimeZoom).width/2,y:camera.y+80/runtimeZoom};
    const point=actorPosition(obj.id,obj);
    return speechAnchorForActor(point,effectiveCharacterTransform(obj),scaleForPoint(point),obj.speechAnchor);
  }
  function speechScreenAnchorFor(speakerId=''){
    return speechScreenPosition(speechWorldAnchorFor(speakerId),camera,runtimeZoom,ui.viewport);
  }
  function advanceDialogueBeat(){
    if(!dialogue||!dNode||dialogue.awaitingChoice)return;
    const visibleChoiceCount=(dNode.choices||[]).filter(choiceVisible).length;
    setDialogue(current=>advanceDialogueRuntimeState(current,dNode,visibleChoiceCount));
  }

  function runtimeCursorUrl(){
    const role=hoverCursorRole||'normal';
    const configured=settings.cursorRoles?.[role];
    const roleUrl=configured?projectData.assetUrls.ui?.[`cursorRole:${role}`]:'';
    if(roleUrl)return roleUrl;
    // Backwards compatibility with the older per-verb cursor system.
    return projectData.assetUrls.ui?.[`cursor:${selectedVerb}`]||'';
  }
  function uiScreenStyle(){
    return {width:ui.screen.width,height:ui.screen.height,backgroundColor:ui.screen.backgroundColor};
  }
  function bottomGuiRect(){
    const fallbackTop=Math.max(0,Math.min(ui.screen.height,(ui.viewport?.y||0)+(ui.viewport?.height||0)));
    const authored=ui.screen?.guiBackground;
    if(!authored)return {left:0,top:fallbackTop,width:ui.screen.width,height:Math.max(0,ui.screen.height-fallbackTop)};
    return {left:Number(authored.x||0),top:Number(authored.y??fallbackTop),width:Math.max(0,Number(authored.width??ui.screen.width)),height:Math.max(0,Number(authored.height??(ui.screen.height-fallbackTop)))};
  }
  function updateRuntimeCursorPoint(e,visible=true){
    const rect=runtimeScreenRef.current?.getBoundingClientRect();
    if(!rect)return;
    setRuntimeCursorPoint({x:e.clientX-rect.left,y:e.clientY-rect.top,visible});
  }
  const activeRuntimeCursorUrl=runtimeCursorUrl();
  const runtimeCursorScale=Math.max(1,Math.min(200,Number(settings.cursorScale ?? 100)))/100;
  const guiRect=bottomGuiRect();
  const guiBackgroundUrl=ui.screen?.asset?projectData.assetUrls.ui?.__screenBackground:'';
  const activeCutsceneSubtitle=activeCutscene?.phase==='video'?activeCutscene?.cutscene?.subtitles?.find(subtitle=>cutsceneTime>=Number(subtitle.start||0)&&cutsceneTime<=Number(subtitle.end||0)):null;
  const activeCutsceneText=activeCutscene&&['before','after'].includes(activeCutscene.phase)?((activeCutscene.phase==='before'?activeCutscene.cutscene.beforeText:activeCutscene.cutscene.afterText)||[])[cutsceneTextIndex]:null;
  const activeCutsceneSpeaker=activeCutsceneText?.speakerId==='narrator'?null:projectData.characters.find(c=>c.id===activeCutsceneText?.speakerId);
  const activeCloseUp=(bundle.closeUps?.closeUps||[]).find(c=>c.id===activeCloseUpId)||null;

  function closeUpPanelStyle(panel){
    const t=panel?.transform||{};
    const centered=(panel?.position||'center')==='center';
    return {
      left:centered?'50%':Number(t.x||0),
      top:centered?'50%':Number(t.y||0),
      width:Math.max(80,Number(t.width)||850),
      height:Math.max(80,Number(t.height)||430),
      transform:centered?'translate(-50%, -50%)':'none',
      background:panel?.style?.background||'#171a20',
      color:panel?.style?.color||'#f4f0e4',
      borderColor:panel?.style?.borderColor||'#625b4e',
      borderRadius:Number(panel?.style?.borderRadius??16)
    };
  }
  function closeUpElementStyle(element){
    const t=element?.transform||{};
    return {left:Number(t.x||0),top:Number(t.y||0),width:Math.max(1,Number(t.width)||80),height:Math.max(1,Number(t.height)||40),zIndex:Number(t.z||20),fontSize:Number(element?.style?.fontSize)||18,color:element?.style?.color||'#f4f0e4',background:element?.style?.background||'transparent'};
  }
  function renderCloseUpElement(element){
    const assetUrl=bundle.assetUrls?.[`__closeup:${activeCloseUp?.id}:${element.id}`];
    if(element.type==='image')return assetUrl?<img className="runtime-closeup-image" src={assetUrl} alt="" draggable="false" style={{objectFit:element.assetFit==='cover'?'cover':element.assetFit==='stretch'?'fill':'contain'}}/>:null;
    if(element.type==='text')return <div className="runtime-closeup-text">{element.label||''}</div>;
    if(element.type==='numberStepper'){
      const cfg=element.number||{};const value=readVariableValue(element.variableId,bundle);const shown=String(value??cfg.min??0).padStart(Math.max(0,Number(cfg.pad)||0),'0');
      return <div className="runtime-closeup-number"><button type="button" aria-label={`Increase ${element.name||element.variableId||'value'}`} onClick={e=>{e.stopPropagation();stepCloseUpNumber(element,1,bundle)}}>▲</button><strong>{shown}</strong><button type="button" aria-label={`Decrease ${element.name||element.variableId||'value'}`} onClick={e=>{e.stopPropagation();stepCloseUpNumber(element,-1,bundle)}}>▼</button></div>;
    }
    if(element.type==='toggle'){
      const values=element.toggle?.values||[];const current=readVariableValue(element.variableId,bundle)??values[0]??'';
      if(element.toggle?.segmented)return <div className="runtime-closeup-segments">{values.map(value=><button type="button" key={String(value)} className={String(current)===String(value)?'active':''} onClick={e=>{e.stopPropagation();writeVariableValue(element.variableId,value,bundle)}}>{String(value)}</button>)}</div>;
      return <button type="button" className="runtime-closeup-toggle" onClick={e=>{e.stopPropagation();cycleCloseUpToggle(element,bundle)}}>{String(current)}</button>;
    }
    if(element.type==='closeButton')return <button type="button" className="runtime-closeup-button" onClick={e=>{e.stopPropagation();closeCloseUp()}}>{element.label||'Close'}</button>;
    if(element.type==='button')return <button type="button" className="runtime-closeup-button" onClick={async e=>{e.stopPropagation();await activateCloseUpElement(element,bundle)}}>{element.label||element.name||'Button'}</button>;
    return null;
  }


  return <div className="runtime-overlay" style={{background:settings.runtimeBackground||'#08090b'}}><div className="runtime-topbar"><strong>PLAY MODE</strong><span>{sceneRef.name}</span><button onClick={onClose}>Exit play</button></div><div className="runtime-fit"><div ref={runtimeScreenRef} className={`runtime-screen ${activeRuntimeCursorUrl?'custom-cursor-active':''}`} style={uiScreenStyle()} onMouseMove={e=>updateRuntimeCursorPoint(e,true)} onMouseEnter={e=>updateRuntimeCursorPoint(e,true)} onMouseLeave={()=>setRuntimeCursorPoint(p=>({...p,visible:false}))}>
    {guiBackgroundUrl&&guiRect.height>0?<div className="runtime-gui-background" style={{left:guiRect.left,top:guiRect.top,width:guiRect.width,height:guiRect.height}}><img src={guiBackgroundUrl} alt="" style={{objectFit:ui.screen.assetFit==='cover'?'cover':ui.screen.assetFit==='contain'?'contain':'fill'}}/></div>:null}
    <div ref={viewportRef} className={`runtime-viewport ${inputEnabled&&!dialogue&&!interactionBusy?'':'input-locked'} ${dialogue?'dialogue-locked':''} ${interactionBusy?'interaction-committed':''}`} style={{left:ui.viewport.x,top:ui.viewport.y,width:ui.viewport.width,height:ui.viewport.height}} onMouseMove={e=>{updateRuntimeCursorPoint(e,true);hoverCursorRole!=='normal'&&setHoverCursorRole('normal')}} onClick={clickWorld} onContextMenu={e=>{e.preventDefault();if(!inputEnabled||dialogue||interactionBusyRef.current)return;if(dismissSpeech())return;const verb=settings.rightClickVerb||'look';setSelectedVerb(verb);setSelectedItem('')}}>
      <div className="runtime-world" style={{width:bundle.visual.canvas.width,height:bundle.visual.canvas.height,transformOrigin:'top left',transform:`translate(${-camera.x*runtimeZoom}px, ${-camera.y*runtimeZoom}px) scale(${runtimeZoom})`,backgroundColor:bundle.visual.canvas.backgroundColor}}>
        {bundle.assetUrls.__background&&<img className={`runtime-background fit-${bundle.visual.background.fit||'stretch'}`} src={bundle.assetUrls.__background} alt=""/>}
        {viewportObjects.map(obj=>{
          const t=obj.type==='character'?effectiveCharacterTransform(obj):obj.transform,url=obj.type==='character'?staticCharacterAsset(obj,false):activeObjectAsset(obj),hr=hotspotRect(obj),anim=obj.type==='character'?resolveCharacterRender(obj,false):null;
          const isActor=obj.type==='character';
          const actorPoint=isActor?actorPosition(obj.id,obj):null;
          const actorScale=isActor?scaleForPoint(actorPoint):1;
          const renderTransform=isActor&&anim?animationRenderTransform(t,anim.animation):t;
          const box=isActor?scaledRenderBox(actorPoint,renderTransform,actorScale):null;
          const renderLeft=isActor?box.left:t.x,renderTop=isActor?box.top:t.y;
          const renderWidth=isActor?box.width:t.width,renderHeight=isActor?box.height:t.height;
          const zIndex=isActor?depthZAtPoint(actorPoint,bundle.visual.depthAreas||[],t.z):t.z;
          return <React.Fragment key={obj.id}>
            {runtimeObjectHasVisual(obj,url)&&<div className="runtime-object runtime-visual-object" style={{left:renderLeft,top:renderTop,width:renderWidth,height:renderHeight,zIndex,opacity:t.opacity,transform:!anim&&obj.type==='character'&&staticCharacterFlip(obj)?'scaleX(-1)':(!anim&&t.flipX?'scaleX(-1)':'none')}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(obj.character?.characterId,anim.playKey)}/>:url?<img src={url} alt="" draggable="false" onLoad={e=>obj.hotspot?.shape==='alpha'&&cacheAlphaMask(url,e.currentTarget)}/>:<div className="runtime-placeholder">{obj.name}</div>}</div>}
            {obj.hotspot?.enabled&&<div className={`runtime-hotspot-target clickable shape-${obj.hotspot?.shape||'visual'} ${runtime.showHotspots?'debug':''}`} style={{left:isActor?renderLeft:hr.x,top:isActor?renderTop:hr.y,width:isActor?renderWidth:hr.width,height:isActor?renderHeight:hr.height,zIndex}} onMouseMove={e=>{e.stopPropagation();updateRuntimeCursorPoint(e,true);const hit=alphaHotspotHit(e,obj,url);setHoverCursorRole(hit?(obj.type==='exit'?'exit':'interactive'):'normal');setHoverText(hit?interactionLabel(obj,selectedVerb):'')}} onMouseLeave={()=>{setHoverCursorRole('normal');setHoverText('')}} onContextMenu={e=>contextObject(e,obj)} onClick={e=>{if(alphaHotspotHit(e,obj,url))clickObject(e,obj)}}>{runtime.showHotspots?<span>{objectLabel(obj)}</span>:null}</div>}
          </React.Fragment>})}
        {playerObject&&(()=>{const anim=resolveCharacterRender(playerObject,true);const renderTransform=anim?animationRenderTransform(playerT,anim.animation):playerT;const box=anim?scaledRenderBox(playerPos,renderTransform,playerScale):playerBox;const staticUrl=staticCharacterAsset(playerObject,true);return <div className="runtime-object runtime-player" style={{left:box.left,top:box.top,width:box.width,height:box.height,zIndex:playerZ,opacity:playerT.opacity,transform:!anim&&staticCharacterFlip(playerObject)?'scaleX(-1)':(!anim&&playerT.flipX?'scaleX(-1)':'none')}}>{anim?<SpriteStrip src={anim.url} animation={anim.animation} playKey={anim.playKey} flipX={anim.flipX} onComplete={()=>completeCharacterAnimation(playerDefinition?.id,anim.playKey)}/>:staticUrl?<img src={staticUrl} alt="" draggable="false"/>:<div className="runtime-placeholder">{playerObject.name}</div>}</div>})()}
      </div>
      {dialogue&&<div className={`runtime-dialogue-lock ${dialogue.awaitingChoice?'waiting-choice':'advancing'}`} onClick={e=>{e.stopPropagation();if(!dialogue.awaitingChoice)advanceDialogueBeat()}} onContextMenu={e=>e.preventDefault()} aria-label={dialogue.awaitingChoice?'Choose a dialogue response':'Click to continue dialogue'}/>} 
      {settings.floatingSpeech!==false&&speech.map(bubble=>{const anchor=speechScreenAnchorFor(bubble.speakerId);return <div key={bubble.id} className="runtime-speech runtime-speech-screen" style={{left:anchor.x,top:anchor.y,color:bubble.color,zIndex:9000}} onClick={e=>{e.stopPropagation();dismissSpeech()}}>{bubble.text}</div>})}
      {settings.floatingSpeech!==false&&dNode&&dBeat&&(()=>{const anchor=speechScreenAnchorFor(dBeat.speakerId);const text=translate(stringKey.dialogueBeat(sceneRef.id,dialogue.data.characterId,dNode.id,dBeat.id),dBeat.text);return <div className="runtime-speech runtime-dialogue-speech runtime-speech-screen" style={{left:anchor.x,top:anchor.y,color:speechColorFor(dSpeaker,settings),zIndex:9001}} onClick={e=>{e.stopPropagation();advanceDialogueBeat()}}>{text}</div>})()}
      {settings.floatingSpeech!==false&&dNode&&dialogue?.awaitingChoice&&<div className="runtime-dialogue runtime-dialogue-choice-only runtime-dialogue-choice-in-viewport" onClick={e=>e.stopPropagation()}><div className="runtime-dialogue-choices">{(dNode.choices||[]).filter(choiceVisible).map(c=><button key={c.id} onClick={e=>{e.stopPropagation();chooseDialogueChoice(c)}}>{translate(stringKey.dialogueChoice(sceneRef.id,dialogue.data.characterId,dNode.id,c.id),c.text)}</button>)}</div></div>}
      {fade>0&&<div className="runtime-fade" style={{opacity:fade}}/>}
    </div>
    {(ui.elements||[]).sort((a,b)=>a.transform.z-b.transform.z).map(el=>{const t=el.transform;const active=el.action?.type==='selectVerb'&&el.action.value===selectedVerb;return <div key={el.id} className={`runtime-ui-element runtime-ui-${el.type} ${el.asset&&['verbButton','button','panel'].includes(el.type)?'has-skin':''} ${active?'active':''} ${inputEnabled&&!dialogue&&!interactionBusy?'':'dimmed'}`} style={{left:t.x,top:t.y,width:t.width,height:t.height,zIndex:t.z,background:el.asset&&['verbButton','button','panel'].includes(el.type)?'transparent':el.style?.background,color:el.style?.color,fontSize:el.style?.fontSize,border:el.asset&&['verbButton','button','panel'].includes(el.type)?'none':undefined}} onMouseMove={e=>{updateRuntimeCursorPoint(e,true);hoverCursorRole!=='gui'&&setHoverCursorRole('gui')}} onMouseEnter={()=>setHoverCursorRole('gui')} onMouseLeave={()=>setHoverCursorRole('normal')} onClick={()=>uiAction(el)}>
      {el.asset&&projectData.assetUrls.ui?.[el.id]&&['verbButton','button','panel'].includes(el.type)?<img className="runtime-ui-skin-image" src={projectData.assetUrls.ui[el.id]} alt="" style={{objectFit:el.assetFit==='cover'?'cover':el.assetFit==='contain'?'contain':'fill'}}/>:null}{el.type==='statusText'?<span>{hoverText||(settings.floatingSpeech===false&&speech[0]?.text)||selectedVerb}</span>:null}
      {el.type==='inventory'?<div className={`runtime-inventory direction-${el.inventory?.direction||'horizontal'}`} style={{gridTemplateColumns:`repeat(${el.inventory?.columns||3}, ${el.inventory?.slotWidth||96}px)`,gridAutoRows:`${el.inventory?.slotHeight||54}px`}}>{runtime.inventory.map(id=>{const item=projectData.inventory.find(i=>i.id===id);return <button style={{width:el.inventory?.slotWidth||96,height:el.inventory?.slotHeight||54}} title={item?.description||''} className={selectedItem===id?'active':''} key={id} onMouseEnter={()=>setHoverText(inventoryInteractionLabel(id))} onMouseLeave={()=>setHoverText('')} onClick={(e)=>{e.stopPropagation();interactWithInventoryItem(id)}}>{projectData.assetUrls.inventory?.[id]?<img src={projectData.assetUrls.inventory[id]} alt=""/>:<span>{item?.name||id}</span>}</button>})}</div>:null}
      {el.type==='image'&&projectData.assetUrls.ui?.[el.id]?<img src={projectData.assetUrls.ui[el.id]} alt=""/>:null}
      {!['statusText','inventory','image','panel'].includes(el.type)&&el.style?.showLabel!==false?<span className="runtime-ui-skin-label">{el.label||el.name}</span>:null}
    </div>})}
    {activeCloseUp?<div className={`runtime-closeup-layer ${activeCloseUp.modal!==false?'modal':'non-modal'} ${activeCloseUp.dimBackground!==false?'dimmed':''}`} onMouseMove={e=>{updateRuntimeCursorPoint(e,true);setHoverCursorRole('gui')}} onMouseEnter={()=>setHoverCursorRole('gui')} onMouseLeave={()=>setHoverCursorRole('normal')} onClick={e=>{e.stopPropagation();if(activeCloseUp.closeOnOutsideClick)closeCloseUp()}}>
      <div className="runtime-closeup-panel" style={closeUpPanelStyle(activeCloseUp)} role="dialog" aria-modal={activeCloseUp.modal!==false} aria-label={activeCloseUp.name||'Close-up controls'} onClick={e=>e.stopPropagation()}>
        {[...(activeCloseUp.elements||[])].sort((a,b)=>(a.transform?.z||0)-(b.transform?.z||0)).map(element=><div key={element.id} className={`runtime-closeup-element runtime-closeup-${element.type}`} style={closeUpElementStyle(element)}>{renderCloseUpElement(element)}</div>)}
      </div>
    </div>:null}
    {activeCutscene?<div className={`runtime-cutscene-layer phase-${activeCutscene.phase||'video'}`} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(['before','after'].includes(activeCutscene.phase)){e.stopPropagation();advanceCutsceneText()}}}>
      <video ref={cutsceneVideoRef} className={`runtime-cutscene-video fit-${activeCutscene.cutscene.fit||'contain'}`} src={activeCutscene.url} autoPlay={activeCutscene.phase==='video'} playsInline muted={!!activeCutscene.cutscene.muted} onLoadedData={async e=>{if(activeCutscene.phase!=='video'){e.currentTarget.pause();if(activeCutscene.phase==='before'){try{e.currentTarget.currentTime=0}catch{}}return}try{await e.currentTarget.play();setCutsceneNeedsGesture(false)}catch{setCutsceneNeedsGesture(true)}}} onTimeUpdate={e=>setCutsceneTime(e.currentTarget.currentTime)} onEnded={()=>finishCutsceneVideo()} onError={()=>finishActiveCutscene({skipped:true})}/>
      {activeCutsceneSubtitle?.text?<div className="runtime-cutscene-subtitle">{activeCutsceneSubtitle.text}</div>:null}
      {activeCutsceneText?<div className="runtime-cutscene-subtitle runtime-cutscene-sequence-subtitle"><span className={`runtime-cutscene-sequence-speaker ${activeCutsceneText.speakerId==='narrator'?'narrator':''}`}>{activeCutsceneText.speakerId==='narrator'?'Narrator':(activeCutsceneSpeaker?.name||activeCutsceneText.speakerId||'Narrator')}:</span> {activeCutsceneText.text}</div>:null}
      {activeCutscene.phase==='video'&&cutsceneNeedsGesture?<button className="runtime-cutscene-start" onClick={async e=>{e.stopPropagation();try{await cutsceneVideoRef.current?.play();setCutsceneNeedsGesture(false)}catch{}}}>Play cutscene</button>:null}
      {activeCutscene.cutscene.skippable!==false?<button className="runtime-cutscene-skip" onClick={e=>{e.stopPropagation();finishActiveCutscene({skipped:true})}}>Skip</button>:null}
    </div>:null}
    {!activeCutscene&&activeRuntimeCursorUrl&&runtimeCursorPoint.visible?<img className="runtime-custom-cursor" src={activeRuntimeCursorUrl} alt="" style={{left:runtimeCursorPoint.x,top:runtimeCursorPoint.y,transform:`translate(-50%, -50%) scale(${runtimeCursorScale})`}}/>:null}
    {pickupQueue.length>0&&<div className="runtime-pickup-backdrop" onClick={()=>setPickupQueue(q=>q.slice(1))}><div className="runtime-pickup-card" onClick={e=>{e.stopPropagation();setPickupQueue(q=>q.slice(1))}}><strong>{pickupQueue[0].text}</strong><span>Click to continue</span></div></div>}
    {settings.floatingSpeech===false&&dNode&&dialogue&&!dialogue.awaitingChoice&&dBeat&&<div className="runtime-dialogue" onClick={e=>{e.stopPropagation();advanceDialogueBeat()}}>{projectData.assetUrls.characters?.[`${dBeat.speakerId}:portrait`]&&<img className="runtime-dialogue-portrait" src={projectData.assetUrls.characters[`${dBeat.speakerId}:portrait`]} alt=""/>}<div className="runtime-dialogue-speaker">{dSpeaker?.name||dBeat.speakerId}</div><div className="runtime-dialogue-line" style={{color:speechColorFor(dSpeaker,settings)}}>{translate(stringKey.dialogueBeat(sceneRef.id,dialogue.data.characterId,dNode.id,dBeat.id),dBeat.text)}</div></div>}
    {settings.floatingSpeech===false&&dNode&&dialogue?.awaitingChoice&&<div className="runtime-dialogue" onClick={e=>e.stopPropagation()}><div className="runtime-dialogue-choices">{(dNode.choices||[]).filter(choiceVisible).map(c=><button key={c.id} onClick={e=>{e.stopPropagation();chooseDialogueChoice(c)}}>{translate(stringKey.dialogueChoice(sceneRef.id,dialogue.data.characterId,dNode.id,c.id),c.text)}</button>)}</div></div>}
    {interactionWarning&&<div className="runtime-interaction-warning">{interactionWarning}</div>}
    {savePanelNode}
  {paused&&<div className="runtime-paused">PAUSED</div>}</div></div></div>

  function cacheAlphaMask(url,img){if(!url||!img||alphaMasksRef.current.has(url))return;try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);alphaMasksRef.current.set(url,ctx.getImageData(0,0,canvas.width,canvas.height))}catch{alphaMasksRef.current.set(url,null)}}
  function alphaHotspotHit(e,obj,url){if((obj.hotspot?.shape||'visual')!=='alpha')return true;const mask=alphaMasksRef.current.get(url);if(!mask)return true;const hitRect=e.currentTarget.getBoundingClientRect();const b=obj.hotspot?.bounds||{x:0,y:0,width:1,height:1};const rx=hitRect.width?clamp01((e.clientX-hitRect.left)/hitRect.width):0,ry=hitRect.height?clamp01((e.clientY-hitRect.top)/hitRect.height):0;let nx=(b.x||0)+(obj.transform?.flipX?(1-rx):rx)*(b.width||1),ny=(b.y||0)+ry*(b.height||1);return alphaHit(mask,nx,ny,obj.hotspot?.alphaThreshold??8)}
}
