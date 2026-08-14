import { animationGrid } from './animation.js';

export function safeAspectRatio(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function frameAspectRatioFromImage(naturalWidth, naturalHeight, animation = null) {
  const { columns, rows } = animationGrid(animation || {});
  const frameWidth = Number(animation?.frameWidth || 0) || Number(naturalWidth || 0) / columns;
  const frameHeight = Number(animation?.frameHeight || 0) || Number(naturalHeight || 0) / rows;
  if (!(frameWidth > 0) || !(frameHeight > 0)) return 0;
  return frameWidth / frameHeight;
}

export function anchorWorldPoint(transform = {}) {
  const width = Number(transform.width || 0);
  const height = Number(transform.height || 0);
  const anchorX = transform.anchorX ?? 0.5;
  const anchorY = transform.anchorY ?? 1;
  return {
    x: Number(transform.x || 0) + width * anchorX,
    y: Number(transform.y || 0) + height * anchorY
  };
}

export function resizeKeepingAnchor(transform = {}, width, height) {
  const anchor = anchorWorldPoint(transform);
  const w = Math.max(1, Number(width || 1));
  const h = Math.max(1, Number(height || 1));
  const anchorX = transform.anchorX ?? 0.5;
  const anchorY = transform.anchorY ?? 1;
  return {
    ...transform,
    width: w,
    height: h,
    x: anchor.x - w * anchorX,
    y: anchor.y - h * anchorY
  };
}

export function resizeCharacterByWidth(transform = {}, width) {
  const ratio = safeAspectRatio(transform.aspectRatio, Number(transform.width || 1) / Math.max(1, Number(transform.height || 1)));
  const w = Math.max(16, Number(width || 16));
  return resizeKeepingAnchor(transform, w, w / ratio);
}

export function resizeCharacterByHeight(transform = {}, height) {
  const ratio = safeAspectRatio(transform.aspectRatio, Number(transform.width || 1) / Math.max(1, Number(transform.height || 1)));
  const h = Math.max(16, Number(height || 16));
  return resizeKeepingAnchor(transform, h * ratio, h);
}
