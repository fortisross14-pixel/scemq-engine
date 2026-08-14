import React,{useEffect,useRef,useState} from 'react';
import { animationGrid, frameIndexAtTime } from '../lib/animation.js';

export default function SpriteStrip({src,animation,playKey='',playing=true,flipX=false,className='',style,onStart,onFrame,onComplete}){
 const [frame,setFrame]=useState(0);const raf=useRef(0);const completed=useRef(false);const started=useRef(false);
 const {columns,rows,frames}=animationGrid(animation);
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
 },[src,playKey,playing,frames,columns,rows,animation?.fps,animation?.loop,animation?.loopDelaySeconds]);
 if(!src)return null;
 const col=frame%columns,row=Math.floor(frame/columns);
 const posX=columns<=1?0:(col/(columns-1))*100;
 const posY=rows<=1?0:(row/(rows-1))*100;
 return <div className={`sprite-strip ${className}`} style={{...style,backgroundImage:`url("${src}")`,backgroundRepeat:'no-repeat',backgroundSize:`${columns*100}% ${rows*100}%`,backgroundPosition:`${posX}% ${posY}%`,transform:flipX?'scaleX(-1)':undefined}}/>;
}
