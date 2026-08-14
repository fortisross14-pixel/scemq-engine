import React,{useEffect,useRef,useState} from 'react';
import { animationGrid, effectiveAnimationContentBounds, frameIndexAtTime } from '../lib/animation.js';

export default function SpriteStrip({src,animation,playKey='',playing=true,flipX=false,className='',style,onStart,onFrame,onComplete}){
 const [frame,setFrame]=useState(0);const started=useRef(false);const completed=useRef(false);
 const {columns,rows,frames}=animationGrid(animation);
 useEffect(()=>{setFrame(0);started.current=false;completed.current=false;if(!src||!playing)return;let raf=0;const start=performance.now();onStart?.();started.current=true;
  const tick=now=>{const elapsed=now-start;const next=frameIndexAtTime(animation,elapsed);setFrame(prev=>{if(prev!==next)onFrame?.(next);return next});const duration=(frames/Math.max(1,Number(animation?.fps||8)))*1000;if(!animation?.loop&&elapsed>=duration){if(!completed.current){completed.current=true;onComplete?.()}return}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
 },[src,playKey,playing,frames,columns,rows,animation?.fps,animation?.loop,animation?.loopDelaySeconds]);
 const col=frame%columns,row=Math.floor(frame/columns);const posX=columns<=1?0:(col/(columns-1))*100;const posY=rows<=1?0:(row/(rows-1))*100;
 const background={backgroundImage:`url("${src}")`,backgroundRepeat:'no-repeat',backgroundSize:`${columns*100}% ${rows*100}%`,backgroundPosition:`${posX}% ${posY}%`};
 const b=effectiveAnimationContentBounds(animation,animation?.framePixelWidth||animation?.frameWidth||0,animation?.framePixelHeight||animation?.frameHeight||0);
 const cropped=b&&Number(b.width)>0&&Number(b.height)>0&&(b.x>0.0001||b.y>0.0001||b.width<.9999||b.height<.9999);
 if(!cropped)return <div className={`sprite-strip ${className}`} style={{...style,...background,transform:flipX?'scaleX(-1)':undefined}}/>;
 const bw=Math.max(.001,Number(b.width)),bh=Math.max(.001,Number(b.height)),bx=Math.max(0,Number(b.x)),by=Math.max(0,Number(b.y));
 return <div className={`sprite-strip sprite-strip-content ${className}`} style={{...style,overflow:'hidden',position:'relative',backgroundImage:'none',transform:flipX?'scaleX(-1)':undefined}}>
   <div className="sprite-strip-frame" style={{position:'absolute',left:`${-100*bx/bw}%`,top:`${-100*by/bh}%`,width:`${100/bw}%`,height:`${100/bh}%`,...background}}/>
 </div>;
}
