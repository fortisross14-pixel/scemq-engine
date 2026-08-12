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

export function normalizeAnimation(name, animation = {}) {
  return {
    name,
    src: animation.src || '',
    frames: Math.max(1, Number(animation.frames || 1)),
    fps: Math.max(1, Number(animation.fps || 8)),
    loop: animation.loop ?? (name === 'idle' || name === 'walk' || name === 'talk'),
    frameWidth: Number(animation.frameWidth || 0),
    frameHeight: Number(animation.frameHeight || 0),
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

function cap(value=''){return value ? value[0].toUpperCase()+value.slice(1) : ''}

export function resolveAnimation(character, requestedName = '', facing = 'right') {
  if (!character) return null;
  const c = normalizeCharacterAnimationData(character);
  const requested = requestedName || c.defaultAnimation || 'idle';
  const directional = `${requested}${cap(facing)}`;
  let name = c.animations[directional] ? directional : requested;
  if (!c.animations[name] && requested === 'walk') {
    const horizontal = facing === 'left' ? 'walkLeft' : facing === 'right' ? 'walkRight' : facing === 'up' ? 'walkUp' : 'walkDown';
    if (c.animations[horizontal]) name = horizontal;
  }
  if (!c.animations[name]) name = c.animations[c.defaultAnimation] ? c.defaultAnimation : (c.animations.idle ? 'idle' : '');
  if (!name || !c.animations[name]) return null;
  return { name, animation: c.animations[name] };
}

export function requestedAnimationForVerb(character, verb) {
  const c = normalizeCharacterAnimationData(character || {});
  return c.actionAnimations?.[verb] || DEFAULT_ACTION_ANIMATIONS[verb] || '';
}

export function shouldMirror(animation, facing = 'right', animationName = '') {
  if (!animation?.allowHorizontalFlip) return false;
  if (facing !== 'left') return false;
  return !String(animationName).toLowerCase().endsWith('left');
}

export function characterAnimationAssetKey(characterId, animationName) {
  return `${characterId}:animation:${animationName}`;
}
