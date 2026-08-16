export function clampNumber(value, min = 0, max = 9) {
  const low = Number.isFinite(Number(min)) ? Number(min) : 0;
  const high = Number.isFinite(Number(max)) ? Number(max) : low;
  return Math.min(Math.max(Number(value) || 0, Math.min(low, high)), Math.max(low, high));
}

export function stepBoundValue(value, { amount = 1, min = 0, max = 9, wrap = false } = {}) {
  const low = Math.min(Number(min) || 0, Number(max) || 0);
  const high = Math.max(Number(min) || 0, Number(max) || 0);
  const delta = Number(amount) || 0;
  let next = (Number(value) || 0) + delta;
  if (!wrap) return clampNumber(next, low, high);
  if (high <= low) return low;
  // Controls mutate one authored step at a time. Crossing either boundary
  // cycles directly to the opposite bound, which works for integer digits,
  // degree steppers, and arbitrary authored step sizes alike.
  if (next > high) return low;
  if (next < low) return high;
  return next;
}

export function cycleBoundValue(value, values = []) {
  const list = (values || []).map(v => String(v));
  if (!list.length) return value;
  const index = list.indexOf(String(value));
  return list[(index + 1 + list.length) % list.length];
}

export function normalizeCloseUpConfig(config, sceneId = '') {
  const closeUps = (config?.closeUps || []).map(closeUp => ({
    modal: true,
    dimBackground: true,
    closeOnOutsideClick: false,
    pauseWorldInput: true,
    closeOnEscape: true,
    position: 'center',
    transform: { x: 0, y: 0, width: 850, height: 430 },
    style: { background: '#171a20', color: '#f4f0e4', borderColor: '#625b4e', borderRadius: 16 },
    elements: [],
    ...closeUp,
    transform: { x: 0, y: 0, width: 850, height: 430, ...(closeUp.transform || {}) },
    style: { background: '#171a20', color: '#f4f0e4', borderColor: '#625b4e', borderRadius: 16, ...(closeUp.style || {}) },
    elements: closeUp.elements || []
  }));
  return {
    schemaVersion: config?.schemaVersion || '0.4',
    kind: 'scemq-scene-closeups',
    sceneId: sceneId || config?.sceneId || '',
    closeUps
  };
}
