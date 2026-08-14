import React,{useEffect,useRef,useState} from 'react';
import { animationGrid, animationSheetGeometry, effectiveAnimationContentBounds, frameIndexAtTime } from '../lib/animation.js';

export default function SpriteStrip({src,animation,playKey='',playing=true,flipX=false,className='',style,onStart,onFrame,onComplete}){
 const [frame,setFrame]=useState(0);const [natural,setNatural]=useState({width:0,height:0});const started=useRef(false);const completed=useRef(false);
 const {columns,rows,frames}=animationGrid(animation);
 useEffect(()=>{if(!src){setNatural({width:0,height:0});return}let cancelled=false;const img=new Image();img.onload=()=>{if(!cancelled)setNatural({width:img.naturalWidth||img.width,height:img.naturalHeight||img.height})};img.src=src;return()=>{cancelled=true}},[src]);
 useEffect(()=>{setFrame(0);started.current=false;completed.current=false;if(!src||!playing)return;let raf=0;const start=performance.now();onStart?.();started.current=true;
  const tick=now=>{const elapsed=now-start;const next=frameIndexAtTime(animation,elapsed);setFrame(prev=>{if(prev!==next)onFrame?.(next);return next});const duration=(frames/Math.max(1,Number(animation?.fps||8)))*1000;if(!animation?.loop&&elapsed>=duration){if(!completed.current){completed.current=true;onComplete?.()}return}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
 },[src,playKey,playing,frames,columns,rows,animation?.fps,animation?.loop,animation?.loopDelaySeconds]);
 const col=frame%columns,row=Math.floor(frame/columns);
 const geometry=animationSheetGeometry(animation,natural.width||animation?.sourceSheetPixelWidth||0,natural.height||animation?.sourceSheetPixelHeight||0);
 let background;
 if(geometry.sourceWidth>0&&geometry.sourceHeight>0&&geometry.frameWidth>0&&geometry.frameHeight>0){
   const bgSizeX=(geometry.sourceWidth/geometry.frameWidth)*100;
   const bgSizeY=(geometry.sourceHeight/geometry.frameHeight)*100;
   const denomX=Math.max(0,geometry.sourceWidth-geometry.frameWidth);
   const denomY=Math.max(0,geometry.sourceHeight-geometry.frameHeight);
   const posX=denomX<=0?0:((geometry.crop.left+col*geometry.frameWidth)/denomX)*100;
   const posY=denomY<=0?0:((geometry.crop.top+row*geometry.frameHeight)/denomY)*100;
   background={backgroundImage:`url("${src}")`,backgroundRepeat:'no-repeat',backgroundSize:`${bgSizeX}% ${bgSizeY}%`,backgroundPosition:`${posX}% ${posY}%`};
 }else{
   const posX=columns<=1?0:(col/(columns-1))*100;const posY=rows<=1?0:(row/(rows-1))*100;
   background={backgroundImage:`url("${src}")`,backgroundRepeat:'no-repeat',backgroundSize:`${columns*100}% ${rows*100}%`,backgroundPosition:`${posX}% ${posY}%`};
 }
 const b=effectiveAnimationContentBounds(animation);
 const cropped=b&&Number(b.width)>0&&Number(b.height)>0&&(b.x>0.0001||b.y>0.0001||b.width<.9999||b.height<.9999);
 if(!cropped)return <div className={`sprite-strip ${className}`} style={{...style,...background,transform:flipX?'scaleX(-1)':undefined}}/>;
 const bw=Math.max(.001,Number(b.width)),bh=Math.max(.001,Number(b.height)),bx=Math.max(0,Number(b.x)),by=Math.max(0,Number(b.y));
 return <div className={`sprite-strip sprite-strip-content ${className}`} style={{...style,overflow:'hidden',position:'relative',backgroundImage:'none',transform:flipX?'scaleX(-1)':undefined}}>
   <div className="sprite-strip-frame" style={{position:'absolute',left:`${-100*bx/bw}%`,top:`${-100*by/bh}%`,width:`${100/bw}%`,height:`${100/bh}%`,...background}}/>
 </div>;
}
