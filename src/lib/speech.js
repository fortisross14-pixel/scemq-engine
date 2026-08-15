export const DEFAULT_TEXT_SPEED = 55;
export const MIN_SPEECH_MS = 1100;
export const MAX_SPEECH_MS = 9000;
export const DEFAULT_TEXT_COLOR = '#eee9dc';

export function speechDurationMs(text, settings = {}) {
  const perChar = Math.max(5, Number(settings.textSpeed ?? DEFAULT_TEXT_SPEED));
  const length = String(text || '').trim().length;
  const raw = MIN_SPEECH_MS + length * perChar;
  return Math.max(MIN_SPEECH_MS, Math.min(MAX_SPEECH_MS, raw));
}


function normalizedSpeakerKey(value = '') { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }

export function resolveSpeechSpeakerId(speakerId = '', characters = [], objects = [], text = '') {
  const raw = String(speakerId || '');
  if (raw && (characters || []).some(character => character.id === raw)) return raw;
  if (raw) {
    const object = (objects || []).find(candidate => candidate.id === raw && candidate.type === 'character');
    if (object?.character?.characterId) return object.character.characterId;
  }
  // Older/generated rule actions sometimes encode the speaker as a readable
  // prefix ("Mr. Pindle: ...") while leaving targetId empty. Resolve that
  // prefix only for colour/anchor/talk-animation purposes; the authored text is
  // left untouched so existing scene copy does not change during migration.
  const prefix = normalizedSpeakerKey(String(text || '').match(/^\s*([^:]{1,80})\s*:/)?.[1] || '');
  if (prefix) {
    const character = (characters || []).find(candidate => [candidate.id, candidate.name].filter(Boolean).some(value => normalizedSpeakerKey(value) === prefix));
    if (character) return character.id;
    const object = (objects || []).find(candidate => candidate.type === 'character' && [candidate.id, candidate.name, candidate.hotspot?.label].filter(Boolean).some(value => normalizedSpeakerKey(value) === prefix));
    if (object?.character?.characterId) return object.character.characterId;
  }
  return raw;
}

export function speechColorFor(character, settings = {}) {
  return character?.textColor || settings.textDefaultColor || DEFAULT_TEXT_COLOR;
}

export function createSpeechBubble({ id, text, speakerId = '', color = DEFAULT_TEXT_COLOR, durationMs = MIN_SPEECH_MS, anchor = null }) {
  return { id, text: String(text ?? ''), speakerId, color, durationMs, anchor, createdAt: Date.now() };
}

// A speech point is stored on the scene character object as relative coordinates
// inside the actor rectangle. x=.5 is centered; y=0 is the top of the sprite;
// negative y values place the point above the sprite. This keeps the point attached
// to moving/scaling actors while still letting the director drag it visually.
export function speechAnchorForActor(point, transform = {}, scale = 1, speechAnchor = null) {
  const width = Number(transform.width || 0) * (Number(scale) || 1);
  const height = Number(transform.height || 0) * (Number(scale) || 1);
  const anchorX = Number(transform.anchorX ?? 0.5);
  const anchorY = Number(transform.anchorY ?? 1);
  const left = Number(point?.x || 0) - width * anchorX;
  const top = Number(point?.y || 0) - height * anchorY;
  const bubbleX = Number.isFinite(Number(speechAnchor?.x)) ? Number(speechAnchor.x) : 0.5;
  const bubbleY = Number.isFinite(Number(speechAnchor?.y)) ? Number(speechAnchor.y) : -0.04;
  return {
    x: left + width * bubbleX,
    y: top + height * bubbleY
  };
}

export function speechScreenPosition(worldPoint, camera, zoom, viewport, margin = 18) {
  const width = Number(viewport?.width || 0);
  const height = Number(viewport?.height || 0);
  const scale = Math.max(0.01, Number(zoom || 1));
  const rawX = (Number(worldPoint?.x || 0) - Number(camera?.x || 0)) * scale;
  const rawY = (Number(worldPoint?.y || 0) - Number(camera?.y || 0)) * scale;
  // Leave enough horizontal room for the fixed-width bubble and enough top room
  // that translateY(-100%) cannot push the text offscreen.
  const side = Math.min(Math.max(70, width * 0.16), 210);
  return {
    x: Math.max(side, Math.min(Math.max(side, width - side), rawX)),
    y: Math.max(110, Math.min(Math.max(110, height - margin), rawY))
  };
}
