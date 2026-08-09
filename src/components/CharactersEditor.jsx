import React,{useEffect,useState} from 'react';
import InspectorField from './InspectorField.jsx';
import { createCharacterDefinition } from '../lib/schema.js';
import { slugify } from '../lib/id.js';

export default function CharactersEditor({characters,assetUrls,onChange,onChooseAsset,onImport,onExport}){
 const [selectedId,setSelectedId]=useState(characters[0]?.id||'');
 const [draftName,setDraftName]=useState('');
 const [draftId,setDraftId]=useState('');
 const [idTouched,setIdTouched]=useState(false);
 const selected=characters.find(c=>c.id===selectedId)||null;
 useEffect(()=>{if(selectedId&&!characters.some(c=>c.id===selectedId))setSelectedId(characters[0]?.id||'')},[characters,selectedId]);
 function add(){
  const name=draftName.trim();
  const id=slugify(draftId.trim()||name,'character');
  if(!name){window.alert('Enter a character name first.');return}
  if(characters.some(c=>c.id===id)){window.alert(`Character ID “${id}” already exists.`);return}
  const c={...createCharacterDefinition(name),id,name};
  onChange([...characters,c]);setSelectedId(c.id);setDraftName('');setDraftId('');setIdTouched(false);
 }
 function patch(p){if(!selected)return;onChange(characters.map(c=>c.id===selected.id?{...c,...p}:c))}
 function remove(){if(!selected)return;onChange(characters.filter(c=>c.id!==selected.id));setSelectedId('')}
 return <div className="library-layout"><section className="library-list"><div className="character-create-strip"><div><strong>Create character</strong><small>Choose the permanent ID before placing this character into scenes.</small></div><input value={draftName} onChange={e=>{const next=e.target.value;setDraftName(next);if(!idTouched)setDraftId(slugify(next,'character'))}} placeholder="Display name, e.g. Mr. Pindle"/><input value={draftId} onChange={e=>{setIdTouched(true);setDraftId(slugify(e.target.value,'character'))}} placeholder="Character ID, e.g. mr-pindle"/><button className="primary-soft" onClick={add}>Create character</button></div><div className="toolbar"><div className="toolbar-group"><strong>Characters</strong></div><div className="toolbar-group"><button onClick={onImport}>Import</button>{selected&&<button onClick={()=>onExport(selected)}>Export selected</button>}</div></div><div className="library-scroll">{characters.length===0&&<div className="empty-panel">No project characters yet. Create one above, then place that existing character in any scene.</div>}{characters.map(c=><button className={`library-row ${selectedId===c.id?'active':''}`} key={c.id} onClick={()=>setSelectedId(c.id)}>{assetUrls?.[`${c.id}:idle`]?<img src={assetUrls[`${c.id}:idle`]} alt=""/>:<span className="library-icon">♙</span>}<span><strong>{c.name}</strong><small>{c.playable?'Playable · ':''}{c.id}.character.json</small></span></button>)}</div></section><aside className="inspector"><div className="inspector-title">Character inspector</div>{!selected?<div className="empty-inspector">Select or create a character.</div>:<><div className="object-title-row"><div><strong>{selected.name}</strong><small>{selected.id}.character.json</small></div><button className="danger-ghost" onClick={remove}>Delete</button></div><InspectorField label="ID"><input value={selected.id} readOnly/></InspectorField><div className="linked-note">The ID is permanent after creation so scene/dialogue references stay safe.</div><InspectorField label="Name"><input value={selected.name} onChange={e=>patch({name:e.target.value})}/></InspectorField><label className="checkbox-row"><input type="checkbox" checked={!!selected.playable} onChange={e=>patch({playable:e.target.checked})}/> Can be controlled by player</label><div className="transform-grid"><InspectorField label="Walk speed"><input type="number" value={selected.walkSpeed||180} onChange={e=>patch({walkSpeed:Number(e.target.value)})}/></InspectorField><InspectorField label="Facing"><select value={selected.defaultFacing||'right'} onChange={e=>patch({defaultFacing:e.target.value})}><option>left</option><option>right</option><option>up</option><option>down</option></select></InspectorField></div><InspectorField label="Notes"><textarea rows="3" value={selected.notes||''} onChange={e=>patch({notes:e.target.value})}/></InspectorField><div className="inspector-divider"/><div className="inspector-subtitle">Animation slots</div>{['portrait','idle','walkLeft','walkRight','walkUp','walkDown'].map(slot=><div className="asset-slot-row" key={slot}><span>{slot}</span><code>{selected.assets?.[slot]||'—'}</code><button onClick={()=>onChooseAsset(selected.id,slot)}>Choose</button></div>)}</>}</aside></div>
}
