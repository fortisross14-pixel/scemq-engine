// SCEMQ v0.6 — sequencing helpers. Speech timing lives in speech.js.
// Kept pure so the runtime stays testable.

export function parsePoint(value) {
  const [x, y] = String(value ?? '').split(',').map((n) => Number(String(n).trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function parseDurationMs(value, fallback = 500) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const seconds = /^[\d.]+\s*s$/i.test(raw);
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(seconds ? n * 1000 : n));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// Actions that take over the screen. While any of these are running the player
// should not be able to click the world or change verbs.
export const BLOCKING_ACTION_TYPES = new Set([
  'wait', 'moveCharacterTo', 'cameraPanTo', 'fadeOut', 'fadeIn', 'say'
]);

export function ruleIsCutscene(rule) {
  return (rule?.actions || []).some(
    (action) => action.type === 'setInputEnabled' || BLOCKING_ACTION_TYPES.has(action.type)
  );
}
