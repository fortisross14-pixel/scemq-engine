import React from 'react';
import InspectorField from './InspectorField.jsx';
import { VERBS } from '../lib/schema.js';
import { createDefaultResponses, DEFAULT_VERB_RESPONSES } from '../lib/responses.js';
import { DEFAULT_TEXT_COLOR, DEFAULT_TEXT_SPEED } from '../lib/speech.js';

function VolumeRow({ label, value, onChange }) {
  return (
    <div className="animation-map-row">
      <span>{label}</span>
      <input type="range" min="0" max="100" step="5" value={Math.round((value ?? 1) * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <span className="tiny muted" style={{ width: 38, textAlign: 'right' }}>{Math.round((value ?? 1) * 100)}%</span>
    </div>
  );
}

export default function SettingsEditor({ settings, scenes, strings, assetUrls = {}, cursorAssetUrls = {}, onChooseCursorRole, onClearCursorRole, onChooseActionSound, onClearActionSound, onChange, onImport, onExport }) {
  const titleScenes = scenes.filter((s) => s.sceneType === 'title' || s.id === 'scene0');
  const gameplayScenes = scenes.filter((s) => !(s.sceneType === 'title' || s.id === 'scene0'));
  const languages = strings?.languages || [];
  const patch = (p) => onChange({ ...settings, ...p });

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="section-heading-row">
          <div className="inspector-title">Runtime settings</div>
          <div className="toolbar-group"><button onClick={onImport}>Import</button><button onClick={onExport}>Export</button></div>
        </div>

        <InspectorField label="Game title"><input value={settings.title || ''} onChange={(e) => patch({ title: e.target.value })} /></InspectorField>
        <InspectorField label="Title / Home scene">
          <select value={settings.titleSceneId || ''} onChange={(e) => patch({ titleSceneId: e.target.value })}>
            <option value="">No title screen</option>
            {titleScenes.map((s) => <option value={s.id} key={s.id}>{s.name} ({s.id})</option>)}
          </select>
        </InspectorField>
        <InspectorField label="New Game start scene">
          <select value={settings.defaultSceneId || ''} onChange={(e) => patch({ defaultSceneId: e.target.value })}>
            <option value="">First gameplay scene</option>
            {gameplayScenes.map((s) => <option value={s.id} key={s.id}>{s.name} ({s.id})</option>)}
          </select>
        </InspectorField>
        <InspectorField label="Default spawn point"><input value={settings.defaultSpawnPointId || 'default'} onChange={(e) => patch({ defaultSpawnPointId: e.target.value })} /></InspectorField>
        <InspectorField label="Runtime backdrop"><input type="color" value={settings.runtimeBackground || '#08090b'} onChange={(e) => patch({ runtimeBackground: e.target.value })} /></InspectorField>

        <div className="inspector-divider" />
        <div className="inspector-subtitle">Controls</div>
        <div className="transform-grid">
          <InspectorField label="Default verb">
            <select value={settings.defaultVerb || 'walk'} onChange={(e) => patch({ defaultVerb: e.target.value })}>{VERBS.map((v) => <option key={v}>{v}</option>)}</select>
          </InspectorField>
          <InspectorField label="Right-click verb">
            <select value={settings.rightClickVerb || ''} onChange={(e) => patch({ rightClickVerb: e.target.value })}>
              <option value="">Off</option>
              {VERBS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </InspectorField>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={settings.keyboardShortcuts !== false} onChange={(e) => patch({ keyboardShortcuts: e.target.checked })} /> Keyboard verb shortcuts (W L U T P G O C S Y)</label>
        <label className="checkbox-row"><input type="checkbox" checked={settings.showStatusLine !== false} onChange={(e) => patch({ showStatusLine: e.target.checked })} /> Show the interaction status line</label>
        <div className="linked-note">Right-click fires the chosen verb straight away, the way a LucasArts player expects Look to work without a trip to the verb bar.</div>
        <div className="inspector-divider" />
        <div className="inspector-subtitle">Mouse cursors</div>
        <div className="linked-note">SCEMQ automatically swaps between these three cursor roles while the player moves around the scene. PNG images with transparency work best; keep them small so the pointer remains precise.</div>
        {[['normal','Normal / Walk'],['interactive','Interactive object'],['exit','Exit']].map(([role,label]) => {
          const path = settings.cursorRoles?.[role] || '';
          return <div className="cursor-row settings-cursor-row" key={role}><span>{label}</span><code>{path || 'browser default'}</code><div className="toolbar-group"><button onClick={() => onChooseCursorRole?.(role)}>Choose</button>{path ? <button className="icon-button" onClick={() => onClearCursorRole?.(role)}>×</button> : null}</div></div>;
        })}
        <div className="linked-note">Normal / Walk is used over empty scene space. Interactive is used over ordinary hotspots and characters. Exit is used over exit hotspots.</div>

        <div className="inspector-divider" />
        <div className="inspector-subtitle">Speech</div>
        <label className="checkbox-row"><input type="checkbox" checked={settings.floatingSpeech !== false} onChange={(e) => patch({ floatingSpeech: e.target.checked })} /> Float lines above the speaker instead of the status line</label>
        <div className="transform-grid">
          <InspectorField label="Text speed (ms per character)" hint="Lower is faster. Every line also has a minimum hold.">
            <input type="number" min="5" max="200" value={settings.textSpeed ?? DEFAULT_TEXT_SPEED} onChange={(e) => patch({ textSpeed: Number(e.target.value) })} />
          </InspectorField>
          <InspectorField label="Default text colour">
            <input type="color" value={settings.textDefaultColor || DEFAULT_TEXT_COLOR} onChange={(e) => patch({ textDefaultColor: e.target.value })} />
          </InspectorField>
        </div>
        <div className="linked-note">Give each character their own colour in the Characters panel. Clicking a line dismisses it early.</div>

        <div className="inspector-divider" />
        <div className="inspector-subtitle">Audio</div>
        <VolumeRow label="Master" value={settings.masterVolume} onChange={(v) => patch({ masterVolume: v })} />
        <VolumeRow label="Music" value={settings.musicVolume} onChange={(v) => patch({ musicVolume: v })} />
        <VolumeRow label="Ambient" value={settings.ambientVolume} onChange={(v) => patch({ ambientVolume: v })} />
        <VolumeRow label="Sound effects" value={settings.sfxVolume} onChange={(v) => patch({ sfxVolume: v })} />
        <div className="linked-note">Music keeps playing across a scene change when both scenes use the same track, and crossfades when they do not.</div>
        <div className="inspector-divider" />
        <div className="section-heading-row"><span className="inspector-subtitle">Default action sound effects</span></div>
        <div className="linked-note">These are reusable project-level sound effects. SCEMQ plays them automatically when the player performs the matching verb. Good defaults are Pick up, Use, and Open.</div>
        <div className="audio-default-grid">
          {['pickUp','use','open','close','talk','give','look','push','pull'].map((verb) => {
            const path = settings.defaultActionSounds?.[verb] || '';
            const label = verb === 'pickUp' ? 'Pick up' : verb[0].toUpperCase() + verb.slice(1);
            return <div className="audio-row audio-default-row" key={verb}><span>{label}</span><code>{path || '—'}</code><div className="toolbar-group"><button onClick={() => onChooseActionSound?.(verb)}>Choose</button>{path ? <button className="icon-button" onClick={() => onClearActionSound?.(verb)}>×</button> : null}</div></div>;
          })}
        </div>
        <div className="linked-note">Files are stored once in the project audio folder and can be reused across every scene. Scene-specific sounds for scripted moments still belong in Visual Config → Scene audio.</div>

        <div className="inspector-divider" />
        <div className="inspector-subtitle">Saves</div>
        <div className="transform-grid">
          <InspectorField label="Save slots"><input type="number" min="1" max="20" value={settings.saveSlots || 3} onChange={(e) => patch({ saveSlots: Number(e.target.value) })} /></InspectorField>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={settings.autosaveOnSceneChange !== false} onChange={(e) => patch({ autosaveOnSceneChange: e.target.checked })} /> Autosave on every scene change</label>
        <label className="checkbox-row"><input type="checkbox" checked={settings.sharedInventory !== false} onChange={(e) => patch({ sharedInventory: e.target.checked })} /> One shared inventory for all playable characters</label>
        <div className="linked-note">Turn the shared inventory off for a Day of the Tentacle structure, where each character carries their own things and has to hand them over.</div>

        <div className="inspector-divider" />
        <div className="inspector-subtitle">Language</div>
        <InspectorField label="Runtime language">
          <select value={settings.language || ''} onChange={(e) => patch({ language: e.target.value })}>
            <option value="">Source text</option>
            {languages.filter((code) => code !== strings?.defaultLanguage).map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </InspectorField>
        <div className="linked-note">Add languages and translate in the Text &amp; Translation panel. Anything untranslated falls back to the original line.</div>

        <div className="inspector-divider" />
        <div className="section-heading-row">
          <span className="inspector-subtitle">Default verb responses</span>
          <button className="small-button" onClick={() => patch({ defaultResponses: createDefaultResponses() })}>Reset to defaults</button>
        </div>
        <div className="linked-note">What the player character says when a verb has no authored rule. One line per row; SCEMQ picks at random so repeated clicking does not feel robotic. Use {'{target}'} for the thing being clicked.</div>
        {VERBS.map((verb) => (
          <InspectorField key={verb} label={verb === 'pickUp' ? 'Pick up' : verb}>
            <textarea
              rows="2"
              value={settings.defaultResponses?.[verb] ?? (DEFAULT_VERB_RESPONSES[verb] || []).join('\n')}
              onChange={(e) => patch({ defaultResponses: { ...settings.defaultResponses, [verb]: e.target.value } })}
            />
          </InspectorField>
        ))}
      </div>
    </div>
  );
}
