export const DEFAULT_ACTION_ANIMATIONS = {
  walk: 'walk',
  look: 'look',
  pickUp: 'pickup',
  give: 'give',
  use: 'interact',
  open: 'interact',
  close: 'interact',
  push: 'interact',
  pull: 'interact',
  talk: 'talk'
};

export function normalizeHorizontalFacing(value = 'right') {
  return value === 'left' ? 'left' : 'right';
}

export function horizontalFacingFromDelta(dx, current = 'right', epsilon = 0.5) {
  const n = Number(dx) || 0;
  if (Math.abs(n) <= epsilon) return normalizeHorizontalFacing(current);
  return n < 0 ? 'left' : 'right';
}

export function horizontalFacingToward(fromX, targetX, current = 'right', epsilon = 0.5) {
  return horizontalFacingFromDelta((Number(targetX) || 0) - (Number(fromX) || 0), current, epsilon);
}

export function animationGrid(animation = {}) {
  const legacyFrames = Math.max(1, Number(animation.frames || 1));
  const hasGrid = animation.columns != null || animation.rows != null;
  const columns = Math.max(1, Number(hasGrid ? (animation.columns || 1) : legacyFrames));
  const rows = Math.max(1, Number(hasGrid ? (animation.rows || 1) : 1));
  return { columns, rows, frames: columns * rows };
}

export function animationTrimPixels(animation = {}) {
  const t = animation.trimPixels || {};
  return {
    top: Math.max(0, Number(t.top ?? animation.trimTop ?? 0) || 0),
    right: Math.max(0, Number(t.right ?? animation.trimRight ?? 0) || 0),
    bottom: Math.max(0, Number(t.bottom ?? animation.trimBottom ?? 0) || 0),
    left: Math.max(0, Number(t.left ?? animation.trimLeft ?? 0) || 0)
  };
}

export function trimBoundsForFrame(animation = {}, frameWidth = 0, frameHeight = 0, baseBounds = null) {
  const fw = Math.max(1, Number(frameWidth || animation.framePixelWidth || animation.frameWidth || 1));
  const fh = Math.max(1, Number(frameHeight || animation.framePixelHeight || animation.frameHeight || 1));
  const base = baseBounds && !baseBounds.empty ? baseBounds : { x: 0, y: 0, width: 1, height: 1, empty: false };
  const raw = animationTrimPixels(animation);
  const leftN = raw.left / fw;
  const rightN = raw.right / fw;
  const topN = raw.top / fh;
  const bottomN = raw.bottom / fh;
  const maxWidth = Math.max(0.001, Number(base.width || 1));
  const maxHeight = Math.max(0.001, Number(base.height || 1));
  const left = Math.min(leftN, maxWidth - 0.001);
  const right = Math.min(rightN, Math.max(0, maxWidth - left - 0.001));
  const top = Math.min(topN, maxHeight - 0.001);
  const bottom = Math.min(bottomN, Math.max(0, maxHeight - top - 0.001));
  return {
    x: Number(base.x || 0) + left,
    y: Number(base.y || 0) + top,
    width: maxWidth - left - right,
    height: maxHeight - top - bottom,
    empty: false
  };
}

export function intersectNormalizedBounds(a, b) {
  if (!a || a.empty) return b || null;
  if (!b || b.empty) return a || null;
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  if (x2 <= x1 || y2 <= y1) return { x: x1, y: y1, width: 0.001, height: 0.001, empty: false };
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1, empty: false };
}

export function effectiveAnimationContentBounds(animation = {}, frameWidth = 0, frameHeight = 0) {
  // detectedContentBounds is the raw alpha union. Manual pixel trim is then
  // applied INSIDE that visible box, which makes the controls predictable:
  // Left 10 always removes ten painted-content pixels from the left edge.
  const detected = animation.detectedContentBounds && !animation.detectedContentBounds.empty
    ? animation.detectedContentBounds
    : (animation.contentBounds && !animation.contentBounds.empty ? animation.contentBounds : { x: 0, y: 0, width: 1, height: 1, empty: false });
  return trimBoundsForFrame(animation, frameWidth, frameHeight, detected);
}

export function normalizeAnimation(name, animation = {}) {
  const grid = animationGrid(animation);
  return {
    name,
    src: animation.src || '',
    columns: grid.columns,
    rows: grid.rows,
    frames: grid.frames,
    fps: Math.max(1, Number(animation.fps || 8)),
    loop: animation.loop ?? (name === 'idle' || name === 'walk' || name === 'talk'),
    loopDelaySeconds: Math.max(0, Number(animation.loopDelaySeconds || 0)),
    frameWidth: Number(animation.frameWidth || 0),
    frameHeight: Number(animation.frameHeight || 0),
    // Transparent sprite-sheet padding is not part of the character's visible size.
    // contentBounds is normalized within ONE frame cell and is calculated from the
    // union of non-transparent pixels across all frames.
    detectedContentBounds: animation.detectedContentBounds && !animation.detectedContentBounds.empty ? {
      x: Math.max(0, Math.min(1, Number(animation.detectedContentBounds.x || 0))),
      y: Math.max(0, Math.min(1, Number(animation.detectedContentBounds.y || 0))),
      width: Math.max(0.001, Math.min(1, Number(animation.detectedContentBounds.width || 1))),
      height: Math.max(0.001, Math.min(1, Number(animation.detectedContentBounds.height || 1)))
    } : null,
    contentBounds: animation.contentBounds && !animation.contentBounds.empty ? {
      x: Math.max(0, Math.min(1, Number(animation.contentBounds.x || 0))),
      y: Math.max(0, Math.min(1, Number(animation.contentBounds.y || 0))),
      width: Math.max(0.001, Math.min(1, Number(animation.contentBounds.width || 1))),
      height: Math.max(0.001, Math.min(1, Number(animation.contentBounds.height || 1)))
    } : null,
    contentPixelWidth: Math.max(0, Number(animation.contentPixelWidth || 0)),
    contentPixelHeight: Math.max(0, Number(animation.contentPixelHeight || 0)),
    framePixelWidth: Math.max(0, Number(animation.framePixelWidth || 0)),
    framePixelHeight: Math.max(0, Number(animation.framePixelHeight || 0)),
    trimPixels: animationTrimPixels(animation),
    // Kept for backwards-compatible files. Scene object feet are authoritative
    // at runtime; these values no longer move the actor's world anchor.
    anchorX: Number.isFinite(Number(animation.anchorX)) ? Number(animation.anchorX) : 0.5,
    anchorY: Number.isFinite(Number(animation.anchorY)) ? Number(animation.anchorY) : 1,
    allowHorizontalFlip: animation.allowHorizontalFlip ?? true
  };
}

export function normalizeCharacterAnimationData(character = {}) {
  const animations = {};
  for (const [name, animation] of Object.entries(character.animations || {})) animations[name] = normalizeAnimation(name, animation);
  return {
    ...character,
    defaultFacing: normalizeHorizontalFacing(character.defaultFacing),
    assets: { portrait: '', idle: '', walkLeft: '', walkRight: '', walkUp: '', walkDown: '', ...(character.assets || {}) },
    animations,
    defaultAnimation: character.defaultAnimation || (animations.idle ? 'idle' : ''),
    actionAnimations: { ...DEFAULT_ACTION_ANIMATIONS, ...(character.actionAnimations || {}) },
    idleVariants: Array.isArray(character.idleVariants) ? character.idleVariants.filter(Boolean) : []
  };
}

export function animationDurationMs(animation) {
  const { frames } = animationGrid(animation);
  const fps = Math.max(1, Number(animation?.fps || 8));
  return (frames / fps) * 1000;
}

export function frameIndexAtTime(animation, elapsedMs) {
  const { frames } = animationGrid(animation);
  const fps = Math.max(1, Number(animation?.fps || 8));
  const frameMs = 1000 / fps;
  let localElapsed = Math.max(0, Number(elapsedMs || 0));
  if (animation?.loop) {
    const delayMs = Math.max(0, Number(animation?.loopDelaySeconds || 0)) * 1000;
    const animationMs = frames * frameMs;
    const cycleMs = delayMs + animationMs;
    if (cycleMs > 0) localElapsed %= cycleMs;
    // A looping animation pauses on frame 1 before each playback cycle.
    if (localElapsed < delayMs) return 0;
    localElapsed -= delayMs;
    return Math.min(frames - 1, Math.floor(localElapsed / frameMs));
  }
  return Math.min(frames - 1, Math.floor(localElapsed / frameMs));
}

function compactName(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sourceDirectionFromName(name = '') {
  const compact = compactName(name);
  if (compact.endsWith('left')) return 'left';
  if (compact.endsWith('right')) return 'right';
  // Generic strips are authored facing right and mirrored for left.
  return 'right';
}

function aliasCandidates(requested = '', facing = 'right') {
  const side = normalizeHorizontalFacing(facing);
  const capSide = side === 'left' ? 'Left' : 'Right';
  return [
    requested,
    `${requested}${capSide}`,
    `${requested}-${side}`,
    `${requested}_${side}`,
    `${requested} ${side}`
  ];
}

function findAnimationName(animations, requested, facing) {
  for (const candidate of aliasCandidates(requested, facing)) {
    if (animations[candidate]) return candidate;
    const compact = compactName(candidate);
    const key = Object.keys(animations).find(name => compactName(name) === compact);
    if (key) return key;
  }
  return '';
}

export function resolveAnimation(character, requestedName = '', facing = 'right') {
  if (!character) return null;
  const c = normalizeCharacterAnimationData(character);
  const side = normalizeHorizontalFacing(facing);
  const requested = requestedName || c.defaultAnimation || 'idle';

  // Prefer the generic action strip. This is the simple SCEMQ model: one
  // animation per action, horizontally mirrored when the actor faces left.
  let name = c.animations[requested] ? requested : '';
  if (!name) name = findAnimationName(c.animations, requested, side);

  // Legacy walk slots / names are still accepted.
  if (!name && requested === 'walk') {
    name = findAnimationName(c.animations, side === 'left' ? 'walkLeft' : 'walkRight', side)
      || findAnimationName(c.animations, side === 'left' ? 'walkRight' : 'walkLeft', side);
  }

  if (!name && c.defaultAnimation) name = c.animations[c.defaultAnimation] ? c.defaultAnimation : findAnimationName(c.animations, c.defaultAnimation, side);
  if (!name && c.animations.idle) name = 'idle';
  if (!name) return null;
  return { name, animation: c.animations[name] };
}

export function requestedAnimationForVerb(character, verb) {
  const c = normalizeCharacterAnimationData(character || {});
  return c.actionAnimations?.[verb] || DEFAULT_ACTION_ANIMATIONS[verb] || '';
}

export function shouldMirror(animation, facing = 'right', animationName = '') {
  if (!animation?.allowHorizontalFlip) return false;
  const desired = normalizeHorizontalFacing(facing);
  return sourceDirectionFromName(animationName) !== desired;
}

export function characterAnimationAssetKey(characterId, animationName) {
  return `${characterId}:animation:${animationName}`;
}

export function animationFrameAspectRatio(animation, naturalWidth, naturalHeight) {
  const { columns, rows } = animationGrid(animation);
  const frameWidth = Number(animation?.frameWidth || animation?.framePixelWidth || 0) || (Number(naturalWidth || 0) / columns);
  const frameHeight = Number(animation?.frameHeight || animation?.framePixelHeight || 0) || (Number(naturalHeight || 0) / rows);
  if (!(frameWidth > 0) || !(frameHeight > 0)) return 0;
  const b = effectiveAnimationContentBounds(animation, frameWidth, frameHeight);
  return (frameWidth * Number(b.width || 1)) / Math.max(1, frameHeight * Number(b.height || 1));
}

export function animationContentAspectRatio(animation) {
  const fw = Number(animation?.framePixelWidth || animation?.frameWidth || 0);
  const fh = Number(animation?.framePixelHeight || animation?.frameHeight || 0);
  if (fw > 0 && fh > 0) {
    const b = effectiveAnimationContentBounds(animation, fw, fh);
    return (fw * Number(b.width || 1)) / Math.max(1, fh * Number(b.height || 1));
  }
  const w = Number(animation?.contentPixelWidth || 0);
  const h = Number(animation?.contentPixelHeight || 0);
  return w > 0 && h > 0 ? w / h : 0;
}
