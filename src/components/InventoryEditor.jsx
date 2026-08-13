import React, { useMemo, useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { createInventoryItem, INVENTORY_VERBS } from '../lib/schema.js';

const VERB_LABELS = {
  look: 'Look', use: 'Use', talk: 'Talk', pickUp: 'Pick up', give: 'Give', open: 'Open', close: 'Close', push: 'Push', pull: 'Pull'
};

function groupLabel(item, mode, scenes) {
  if (mode === 'folder') return item.folder?.trim() || 'Unfiled';
  if (mode === 'scene') {
    if (!item.sourceSceneId) return 'Shared / no scene';
    return scenes.find(scene => scene.id === item.sourceSceneId)?.name || item.sourceSceneId;
  }
  return '';
}

export default function InventoryEditor({ items, scenes = [], assetUrls, onChange, onChooseAsset, onImport, onExport }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id || '');
  const [groupBy, setGroupBy] = useState('none');
  const [search, setSearch] = useState('');
  const selected = items.find(item => item.id === selectedId) || null;

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? items.filter(item => [item.name, item.id, item.folder, item.sourceSceneId].some(value => String(value || '').toLowerCase().includes(query)))
      : items;
    return [...filtered].sort((a, b) => {
      const ga = groupLabel(a, groupBy, scenes);
      const gb = groupLabel(b, groupBy, scenes);
      if (ga !== gb) return ga.localeCompare(gb);
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
  }, [items, groupBy, scenes, search]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', items: visibleItems }];
    const map = new Map();
    for (const item of visibleItems) {
      const label = groupLabel(item, groupBy, scenes);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(item);
    }
    return [...map.entries()].map(([label, groupedItems]) => ({ label, items: groupedItems }));
  }, [visibleItems, groupBy, scenes]);

  function add() {
    const item = createInventoryItem(`Item ${items.length + 1}`);
    onChange([...items, item]);
    setSelectedId(item.id);
  }
  function patch(value) { if (selected) onChange(items.map(item => item.id === selected.id ? { ...item, ...value } : item)); }
  function remove() { if (!selected) return; onChange(items.filter(item => item.id !== selected.id)); setSelectedId(''); }
  function addCombination() { patch({ combinations: [...(selected.combinations || []), { withItemId: '', resultItemId: '', consumeSelf: true, consumeOther: true, bidirectional: true }] }); }
  function updateCombo(index, patchValue) { patch({ combinations: selected.combinations.map((combo, i) => i === index ? { ...combo, ...patchValue } : combo) }); }
  function setInteraction(verb, enabled) { patch({ interactions: { ...(selected.interactions || {}), [verb]: enabled } }); }

  return <div className="library-layout">
    <section className="library-list">
      <div className="toolbar">
        <div className="toolbar-group"><strong>Inventory items</strong><button className="primary-soft" onClick={add}>+ Item</button></div>
        <div className="toolbar-group"><button onClick={onImport}>Import</button>{selected && <button onClick={() => onExport(selected)}>Export selected</button>}</div>
      </div>
      <div className="inventory-library-tools">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory…" />
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
          <option value="none">Sort alphabetically</option>
          <option value="folder">Group by folder</option>
          <option value="scene">Group by source scene</option>
        </select>
      </div>
      <div className="library-scroll">
        {items.length === 0 && <div className="empty-panel">No inventory items yet.</div>}
        {groups.map(group => <React.Fragment key={group.label || 'all'}>
          {groupBy !== 'none' && <div className="inventory-group-heading">{group.label}<span>{group.items.length}</span></div>}
          {group.items.map(item => <button className={`library-row ${selectedId === item.id ? 'active' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
            {assetUrls?.[item.id] ? <img src={assetUrls[item.id]} alt="" /> : <span className="library-icon">◇</span>}
            <span><strong>{item.name}</strong><small>{item.folder ? `${item.folder} · ` : ''}{item.sourceSceneId ? `${item.sourceSceneId} · ` : ''}{item.id}.item.json</small></span>
          </button>)}
        </React.Fragment>)}
      </div>
    </section>

    <aside className="inspector">
      <div className="inspector-title">Inventory inspector</div>
      {!selected ? <div className="empty-inspector">Select or create an item.</div> : <>
        <div className="object-title-row"><div><strong>{selected.name}</strong><small>{selected.id}.item.json</small></div><button className="danger-ghost" onClick={remove}>Delete</button></div>
        <InspectorField label="ID"><input value={selected.id} readOnly /></InspectorField>
        <InspectorField label="Name"><input value={selected.name} onChange={e => patch({ name: e.target.value })} /></InspectorField>
        <div className="transform-grid">
          <InspectorField label="Folder"><input value={selected.folder || ''} onChange={e => patch({ folder: e.target.value })} placeholder="Puzzle tools, Story items…" /></InspectorField>
          <InspectorField label="Source scene"><select value={selected.sourceSceneId || ''} onChange={e => patch({ sourceSceneId: e.target.value })}><option value="">Shared / no scene</option>{scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></InspectorField>
        </div>
        <div className="linked-note">Folders and source scenes are authoring-only organization. They never change runtime inventory behavior.</div>
        <InspectorField label="Description"><textarea rows="4" value={selected.description || ''} onChange={e => patch({ description: e.target.value })} /></InspectorField>
        <InspectorField label="Pickup popup"><input value={selected.pickupMessage || ''} onChange={e => patch({ pickupMessage: e.target.value })} placeholder={`You picked up ${selected.name}.`} /></InspectorField>
        <div className="inspector-divider" />
        <div className="inspector-subtitle">Inventory image</div>
        <div className="asset-path">{selected.asset || 'No PNG assigned'}</div>
        <button className="wide-button" onClick={() => onChooseAsset(selected.id)}>Replace image</button>
        <div className="inspector-divider" />
        {[['initiallyOwned', 'Owned at the start'], ['persistent', 'Persists across scenes'], ['stackable', 'Stackable'], ['critical', 'Story-critical']].map(([key, label]) => <label className="checkbox-row" key={key} title={key === 'critical' ? 'The playability check warns if any rule can remove or consume this item.' : ''}><input type="checkbox" checked={!!selected[key]} onChange={e => patch({ [key]: e.target.checked })} />{label}</label>)}
        <div className="inspector-divider" />
        <div className="inspector-subtitle">Inventory interactions</div>
        <div className="linked-note">These verbs are available when this item is clicked in Play Mode. Their actual behavior is authored per scene in Logic by choosing <strong>Target type → Inventory item</strong>. Use and Give select the item for use on another target; the other verbs act directly on the inventory item.</div>
        <div className="checkbox-grid">{INVENTORY_VERBS.map(verb => <label className="checkbox-row" key={verb}><input type="checkbox" checked={selected.interactions?.[verb] !== false} onChange={e => setInteraction(verb, e.target.checked)} />{VERB_LABELS[verb] || verb}</label>)}</div>
        <div className="inspector-divider" />
        <div className="section-heading-row"><span className="inspector-subtitle">Item combinations</span><button className="small-button" onClick={addCombination}>+ Recipe</button></div>
        {(selected.combinations || []).length === 0 && <div className="linked-note">Recipes are the fast path for inventory crafting. For conditional or story-specific item-on-item behavior, use an <strong>onInventoryCombine</strong> Logic rule instead.</div>}
        {(selected.combinations || []).map((combo, index) => <div className="combination-card" key={index}>
          <div className="choice-head"><strong>Recipe {index + 1}</strong><button className="icon-button" onClick={() => patch({ combinations: selected.combinations.filter((_, i) => i !== index) })}>×</button></div>
          <InspectorField label="Combine with"><select value={combo.withItemId || ''} onChange={e => updateCombo(index, { withItemId: e.target.value })}><option value="">Choose item</option>{items.filter(item => item.id !== selected.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></InspectorField>
          <InspectorField label="Result"><select value={combo.resultItemId || ''} onChange={e => updateCombo(index, { resultItemId: e.target.value })}><option value="">Choose result</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></InspectorField>
          <label className="checkbox-row"><input type="checkbox" checked={combo.bidirectional !== false} onChange={e => updateCombo(index, { bidirectional: e.target.checked })} /> Both directions (A on B = B on A)</label>
          <div className="checkbox-grid"><label className="checkbox-row"><input type="checkbox" checked={combo.consumeSelf !== false} onChange={e => updateCombo(index, { consumeSelf: e.target.checked })} /> Consume this</label><label className="checkbox-row"><input type="checkbox" checked={combo.consumeOther !== false} onChange={e => updateCombo(index, { consumeOther: e.target.checked })} /> Consume other</label></div>
        </div>)}
      </>}
    </aside>
  </div>;
}
