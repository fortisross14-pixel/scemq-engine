import React, { useState } from 'react';
import InspectorField from './InspectorField.jsx';
import { ACTION_TYPES, EVENT_TYPES, createRule } from '../lib/schema.js';

function ConditionEditor({ condition, onChange, onDelete }) {
  return (
    <div className="logic-mini-row">
      <select value={condition.left || 'flag'} onChange={(e) => onChange({ ...condition, left: e.target.value })}>
        <option value="flag">flag</option><option value="variable">variable</option><option value="item">item</option>
      </select>
      <input value={condition.key || ''} onChange={(e) => onChange({ ...condition, key: e.target.value })} placeholder="key" />
      <select value={condition.op || 'equals'} onChange={(e) => onChange({ ...condition, op: e.target.value })}>
        <option value="equals">equals</option><option value="notEquals">not equals</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="has">has</option>
      </select>
      <input value={condition.value ?? 'true'} onChange={(e) => onChange({ ...condition, value: e.target.value })} placeholder="value" />
      <button className="icon-button" onClick={onDelete}>×</button>
    </div>
  );
}

function ActionEditor({ action, onChange, onDelete }) {
  return (
    <div className="logic-mini-row action-row">
      <select value={action.type || 'say'} onChange={(e) => onChange({ ...action, type: e.target.value })}>
        {ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <input value={action.targetId || ''} onChange={(e) => onChange({ ...action, targetId: e.target.value })} placeholder="target / speaker" />
      <input value={action.value ?? ''} onChange={(e) => onChange({ ...action, value: e.target.value })} placeholder="value / text / scene" />
      <button className="icon-button" onClick={onDelete}>×</button>
    </div>
  );
}

export default function LogicEditor({ sceneId, logic, objects, onChange, onImport, onExport }) {
  const [selectedRuleId, setSelectedRuleId] = useState(logic.rules[0]?.id || '');
  const selected = logic.rules.find((rule) => rule.id === selectedRuleId) || null;

  function updateRule(nextRule) {
    onChange({ ...logic, rules: logic.rules.map((rule) => rule.id === nextRule.id ? nextRule : rule) });
  }

  function addRule() {
    const rule = createRule();
    onChange({ ...logic, rules: [...logic.rules, rule] });
    setSelectedRuleId(rule.id);
  }

  function removeRule() {
    if (!selected) return;
    onChange({ ...logic, rules: logic.rules.filter((rule) => rule.id !== selected.id) });
    setSelectedRuleId('');
  }

  return (
    <div className="logic-layout">
      <section className="logic-list-panel">
        <div className="toolbar">
          <div className="toolbar-group"><button className="primary-soft" onClick={addRule}>+ Rule</button></div>
          <div className="toolbar-group"><button onClick={onImport}>Import logic</button><button onClick={onExport}>Export logic</button></div>
        </div>
        <div className="logic-file-label">scene.logic.{sceneId}.json</div>
        <div className="rule-list">
          {logic.rules.length === 0 && <div className="empty-panel">No logic rules yet. Add one or import a scene logic file.</div>}
          {logic.rules.map((rule) => (
            <button key={rule.id} className={`rule-card ${rule.id === selectedRuleId ? 'active' : ''}`} onClick={() => setSelectedRuleId(rule.id)}>
              <span className="rule-event">{rule.event.type}</span>
              <strong>{rule.name}</strong>
              <small>{rule.event.targetId || 'scene-wide'} · {rule.conditions.length} conditions · {rule.actions.length} actions</small>
            </button>
          ))}
        </div>
      </section>

      <aside className="logic-inspector inspector">
        <div className="inspector-title">Rule builder</div>
        {!selected ? <div className="empty-inspector">Select or create a rule.</div> : (
          <>
            <div className="object-title-row">
              <div><strong>{selected.name}</strong><small>{selected.id}</small></div>
              <button className="danger-ghost" onClick={removeRule}>Delete</button>
            </div>
            <InspectorField label="Rule name"><input value={selected.name} onChange={(e) => updateRule({ ...selected, name: e.target.value })} /></InspectorField>
            <div className="inspector-subtitle">When</div>
            <InspectorField label="Event">
              <select value={selected.event.type} onChange={(e) => updateRule({ ...selected, event: { ...selected.event, type: e.target.value } })}>
                {EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </InspectorField>
            <InspectorField label="Target object">
              <select value={selected.event.targetId || ''} onChange={(e) => updateRule({ ...selected, event: { ...selected.event, targetId: e.target.value } })}>
                <option value="">Scene-wide / none</option>
                {objects.map((obj) => <option key={obj.id} value={obj.id}>{obj.name} ({obj.id})</option>)}
              </select>
            </InspectorField>
            <InspectorField label="Verb / item">
              <div className="split-fields">
                <input value={selected.event.verb || ''} onChange={(e) => updateRule({ ...selected, event: { ...selected.event, verb: e.target.value } })} placeholder="verb" />
                <input value={selected.event.itemId || ''} onChange={(e) => updateRule({ ...selected, event: { ...selected.event, itemId: e.target.value } })} placeholder="item id" />
              </div>
            </InspectorField>

            <div className="inspector-divider" />
            <div className="section-heading-row"><span className="inspector-subtitle">Conditions</span><button className="small-button" onClick={() => updateRule({ ...selected, conditions: [...selected.conditions, { left: 'flag', key: '', op: 'equals', value: 'true' }] })}>+ Condition</button></div>
            {selected.conditions.length === 0 && <div className="linked-note">No conditions: this rule can always run when its event fires.</div>}
            {selected.conditions.map((condition, index) => <ConditionEditor key={index} condition={condition} onChange={(next) => updateRule({ ...selected, conditions: selected.conditions.map((c, i) => i === index ? next : c) })} onDelete={() => updateRule({ ...selected, conditions: selected.conditions.filter((_, i) => i !== index) })} />)}

            <div className="inspector-divider" />
            <div className="section-heading-row"><span className="inspector-subtitle">Actions</span><button className="small-button" onClick={() => updateRule({ ...selected, actions: [...selected.actions, { type: 'say', targetId: '', value: '' }] })}>+ Action</button></div>
            {selected.actions.length === 0 && <div className="linked-note">Actions execute from top to bottom.</div>}
            {selected.actions.map((action, index) => <ActionEditor key={index} action={action} onChange={(next) => updateRule({ ...selected, actions: selected.actions.map((a, i) => i === index ? next : a) })} onDelete={() => updateRule({ ...selected, actions: selected.actions.filter((_, i) => i !== index) })} />)}
          </>
        )}
      </aside>
    </div>
  );
}
