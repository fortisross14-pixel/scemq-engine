import React,{useEffect,useRef,useState} from 'react';
import { frameIndexAtTime } from '../lib/animation.js';

export default function SpriteStrip({src,animation,playKey='',playing=true,flipX=false,className='',style,onStart,onFrame,onComplete}){
 const [frame,setFrame]=useState(0);const raf=useRef(0);const completed=useRef(false);const started=useRef(false);
 const frames=Math.max(1,Number(animation?.frames||1));
 useEffect(()=>{
  cancelAnimationFrame(raf.current);setFrame(0);completed.current=false;started.current=false;
  if(!src||!playing)return;
  const start=performance.now();
  if(!started.current){started.current=true;onStart?.()}
  function tick(now){
   const elapsed=now-start;const next=frameIndexAtTime(animation,elapsed);setFrame(prev=>{if(prev!==next)onFrame?.(next);return next});
   const duration=(frames/Math.max(1,Number(animation?.fps||8)))*1000;
   if(!animation?.loop&&elapsed>=duration){if(!completed.current){completed.current=true;onComplete?.()}return}
   raf.current=requestAnimationFrame(tick);
  }
  raf.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf.current);
 },[src,playKey,playing,frames,animation?.fps,animation?.loop]);
 if(!src)return null;
 const pos=frames<=1?0:(frame/(frames-1))*100;
 return <div className={`sprite-strip ${className}`} style={{...style,backgroundImage:`url("${src}")`,backgroundRepeat:'no-repeat',backgroundSize:`${frames*100}% 100%`,backgroundPosition:`${pos}% 0%`,transform:flipX?'scaleX(-1)':undefined}}/>;
}
