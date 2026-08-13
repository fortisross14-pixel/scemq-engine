export const DEFAULT_TEXT_SPEED = 55;
export const MIN_SPEECH_MS = 1100;
export const MAX_SPEECH_MS = 9000;
export const DEFAULT_TEXT_COLOR = '#eee9dc';

// LucasArts games hold a line roughly as long as it takes to read it, with a
// floor so one-word barks do not flicker and a ceiling so a long speech never
// locks a cutscene forever.
export function speechDurationMs(text, settings = {}) {
  const perChar = Math.max(5, Number(settings.textSpeed ?? DEFAULT_TEXT_SPEED));
  const length = String(text || '').trim().length;
  const raw = MIN_SPEECH_MS + length * perChar;
  return Math.max(MIN_SPEECH_MS, Math.min(MAX_SPEECH_MS, raw));
}

export function speechColorFor(character, settings = {}) {
  return character?.textColor || settings.textDefaultColor || DEFAULT_TEXT_COLOR;
}

export function createSpeechBubble({ id, text, speakerId = '', color = DEFAULT_TEXT_COLOR, durationMs = MIN_SPEECH_MS, anchor = null }) {
  return { id, text: String(text ?? ''), speakerId, color, durationMs, anchor, createdAt: Date.now() };
}

// Speech is anchored above the speaker's head in world space. When there is no
// speaker (narration, a "say" with no character), the caller centres it.
export function speechAnchorForActor(point, transform = {}, scale = 1) {
  const height = Number(transform.height || 0) * (Number(scale) || 1);
  const anchorY = transform.anchorY ?? 1;
  return {
    x: Number(point?.x || 0) + Number(transform.width || 0) * (Number(scale) || 1) * (0.5 - (transform.anchorX ?? 0.5)),
    y: Number(point?.y || 0) - height * anchorY - 12
  };
}
