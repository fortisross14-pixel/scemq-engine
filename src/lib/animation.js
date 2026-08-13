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

export function normalizeAnimation(name, animation = {}) {
  return {
    name,
    src: animation.src || '',
    frames: Math.max(1, Number(animation.frames || 1)),
    fps: Math.max(1, Number(animation.fps || 8)),
    loop: animation.loop ?? (name === 'idle' || name === 'walk' || name === 'talk'),
    frameWidth: Number(animation.frameWidth || 0),
    frameHeight: Number(animation.frameHeight || 0),
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
  const frames = Math.max(1, Number(animation?.frames || 1));
  const fps = Math.max(1, Number(animation?.fps || 8));
  return (frames / fps) * 1000;
}

export function frameIndexAtTime(animation, elapsedMs) {
  const frames = Math.max(1, Number(animation?.frames || 1));
  const fps = Math.max(1, Number(animation?.fps || 8));
  const raw = Math.floor(Math.max(0, elapsedMs) / (1000 / fps));
  if (animation?.loop) return raw % frames;
  return Math.min(frames - 1, raw);
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
  const frames = Math.max(1, Number(animation?.frames || 1));
  const frameWidth = Number(animation?.frameWidth || 0) || (Number(naturalWidth || 0) / frames);
  const frameHeight = Number(animation?.frameHeight || 0) || Number(naturalHeight || 0);
  if (!(frameWidth > 0) || !(frameHeight > 0)) return 0;
  return frameWidth / frameHeight;
}
