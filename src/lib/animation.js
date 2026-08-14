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

export function animationSheetCrop(animation = {}) {
  const c = animation.sheetCropPixels || animation.sheetCrop || {};
  return {
    top: Math.max(0, Number(c.top ?? animation.cropTop ?? 0) || 0),
    right: Math.max(0, Number(c.right ?? animation.cropRight ?? 0) || 0),
    bottom: Math.max(0, Number(c.bottom ?? animation.cropBottom ?? 0) || 0),
    left: Math.max(0, Number(c.left ?? animation.cropLeft ?? 0) || 0)
  };
}

export function animationSheetGeometry(animation = {}, naturalWidth = 0, naturalHeight = 0) {
  const sourceWidth = Math.max(0, Number(naturalWidth || animation.sourceSheetPixelWidth || 0));
  const sourceHeight = Math.max(0, Number(naturalHeight || animation.sourceSheetPixelHeight || 0));
  const crop = animationSheetCrop(animation);
  const { columns, rows } = animationGrid(animation);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { sourceWidth, sourceHeight, crop, croppedWidth: 0, croppedHeight: 0, frameWidth: 0, frameHeight: 0, columns, rows };
  }
  const left = Math.min(crop.left, Math.max(0, sourceWidth - 1));
  const right = Math.min(crop.right, Math.max(0, sourceWidth - left - 1));
  const top = Math.min(crop.top, Math.max(0, sourceHeight - 1));
  const bottom = Math.min(crop.bottom, Math.max(0, sourceHeight - top - 1));
  const croppedWidth = Math.max(1, sourceWidth - left - right);
  const croppedHeight = Math.max(1, sourceHeight - top - bottom);
  return {
    sourceWidth,
    sourceHeight,
    crop: { top, right, bottom, left },
    croppedWidth,
    croppedHeight,
    frameWidth: croppedWidth / columns,
    frameHeight: croppedHeight / rows,
    columns,
    rows
  };
}

export function effectiveAnimationContentBounds(animation = {}) {
  const detected = animation.detectedContentBounds && !animation.detectedContentBounds.empty
    ? animation.detectedContentBounds
    : (animation.contentBounds && !animation.contentBounds.empty ? animation.contentBounds : { x: 0, y: 0, width: 1, height: 1, empty: false });
  return detected;
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
    sheetCropPixels: animationSheetCrop(animation),
    sourceSheetPixelWidth: Math.max(0, Number(animation.sourceSheetPixelWidth || 0)),
    sourceSheetPixelHeight: Math.max(0, Number(animation.sourceSheetPixelHeight || 0)),
    croppedSheetPixelWidth: Math.max(0, Number(animation.croppedSheetPixelWidth || 0)),
    croppedSheetPixelHeight: Math.max(0, Number(animation.croppedSheetPixelHeight || 0)),
    // Kept for backwards-compatible files. Scene object feet are authoritative
    // at runtime; these values no longer move the actor's world anchor.
    anchorX: Number.isFinite(Number(animation.anchorX)) ? Number(animation.anchorX) : 0.5,
    anchorY: Number.isFinite(Number(animation.anchorY)) ? Number(animation.anchorY) : 1,
    allowHorizontalFlip: animation.allowHorizontalFlip ?? true,
    sourceFacing: animation.sourceFacing ? normalizeHorizontalFacing(animation.sourceFacing) : ''
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
  // Generic strips are authored facing right and mirrored for left unless
  // the animation explicitly declares a different source orientation.
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
  const authored = animation?.sourceFacing ? normalizeHorizontalFacing(animation.sourceFacing) : sourceDirectionFromName(animationName);
  return authored !== desired;
}

export function characterAnimationAssetKey(characterId, animationName) {
  return `${characterId}:animation:${animationName}`;
}

export function animationFrameAspectRatio(animation, naturalWidth, naturalHeight) {
  const geometry = animationSheetGeometry(animation, naturalWidth, naturalHeight);
  const { columns, rows } = animationGrid(animation);
  const frameWidth = Number(animation?.frameWidth || animation?.framePixelWidth || 0) || geometry.frameWidth || (Number(naturalWidth || 0) / columns);
  const frameHeight = Number(animation?.frameHeight || animation?.framePixelHeight || 0) || geometry.frameHeight || (Number(naturalHeight || 0) / rows);
  if (!(frameWidth > 0) || !(frameHeight > 0)) return 0;
  const b = effectiveAnimationContentBounds(animation);
  return (frameWidth * Number(b.width || 1)) / Math.max(1, frameHeight * Number(b.height || 1));
}

export function animationContentAspectRatio(animation) {
  const fw = Number(animation?.framePixelWidth || animation?.frameWidth || 0);
  const fh = Number(animation?.framePixelHeight || animation?.frameHeight || 0);
  if (fw > 0 && fh > 0) {
    const b = effectiveAnimationContentBounds(animation);
    return (fw * Number(b.width || 1)) / Math.max(1, fh * Number(b.height || 1));
  }
  const w = Number(animation?.contentPixelWidth || 0);
  const h = Number(animation?.contentPixelHeight || 0);
  return w > 0 && h > 0 ? w / h : 0;
}
