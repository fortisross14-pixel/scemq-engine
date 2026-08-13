export function slugify(value, fallback = 'item') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function uniqueId(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextSceneId(scenes = []) {
  const used = new Set(scenes.map((scene) => scene.id));
  let index = 1;
  while (used.has(`scene${index}`)) index += 1;
  return `scene${index}`;
}
