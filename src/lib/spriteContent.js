import { animationGrid, effectiveAnimationContentBounds } from './animation.js';
import { alphaBoundsFromImageData } from './hotspot.js';

export function unionFrameContentBounds(frameBounds = []) {
  const visible = (frameBounds || []).filter(b => b && !b.empty && b.width > 0 && b.height > 0);
  if (!visible.length) return { x: 0, y: 0, width: 1, height: 1, empty: true };
  const minX = Math.min(...visible.map(b => b.x));
  const minY = Math.min(...visible.map(b => b.y));
  const maxX = Math.max(...visible.map(b => b.x + b.width));
  const maxY = Math.max(...visible.map(b => b.y + b.height));
  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.min(1, maxX) - Math.max(0, minX),
    height: Math.min(1, maxY) - Math.max(0, minY),
    empty: false
  };
}

export function contentMetricsForFrame(frameWidth, frameHeight, bounds) {
  if (!bounds || bounds.empty) return { contentPixelWidth: frameWidth, contentPixelHeight: frameHeight, aspectRatio: frameWidth / Math.max(1, frameHeight) };
  const contentPixelWidth = frameWidth * bounds.width;
  const contentPixelHeight = frameHeight * bounds.height;
  return {
    contentPixelWidth,
    contentPixelHeight,
    aspectRatio: contentPixelWidth / Math.max(1, contentPixelHeight)
  };
}

export async function analyzeSpriteSheetContent(url, animation = {}, threshold = 8) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  const { columns, rows } = animationGrid(animation);
  const frameWidth = Math.floor(naturalWidth / columns);
  const frameHeight = Math.floor(naturalHeight / rows);
  if (!(frameWidth > 0) || !(frameHeight > 0)) throw new Error('Invalid sprite sheet frame size');

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bounds = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      ctx.clearRect(0, 0, frameWidth, frameHeight);
      ctx.drawImage(img, col * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      bounds.push(alphaBoundsFromImageData(ctx.getImageData(0, 0, frameWidth, frameHeight), threshold, 0));
    }
  }
  const detectedContentBounds = unionFrameContentBounds(bounds);
  const contentBounds = effectiveAnimationContentBounds({ ...animation, detectedContentBounds, contentBounds: detectedContentBounds, framePixelWidth: frameWidth, framePixelHeight: frameHeight }, frameWidth, frameHeight);
  const metrics = contentMetricsForFrame(frameWidth, frameHeight, contentBounds);
  return {
    detectedContentBounds,
    contentBounds,
    framePixelWidth: frameWidth,
    framePixelHeight: frameHeight,
    contentPixelWidth: metrics.contentPixelWidth,
    contentPixelHeight: metrics.contentPixelHeight,
    contentAspectRatio: metrics.aspectRatio
  };
}
