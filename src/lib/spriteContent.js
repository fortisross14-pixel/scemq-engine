import { animationGrid, animationSheetGeometry, effectiveAnimationContentBounds } from './animation.js';
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
  const geometry = animationSheetGeometry(animation, naturalWidth, naturalHeight);
  const sourceFrameWidth = geometry.frameWidth;
  const sourceFrameHeight = geometry.frameHeight;
  if (!(sourceFrameWidth > 0) || !(sourceFrameHeight > 0)) throw new Error('Invalid sprite sheet frame size after sheet crop');

  const canvasWidth = Math.max(1, Math.round(sourceFrameWidth));
  const canvasHeight = Math.max(1, Math.round(sourceFrameHeight));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bounds = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const sx = geometry.crop.left + col * sourceFrameWidth;
      const sy = geometry.crop.top + row * sourceFrameHeight;
      ctx.drawImage(img, sx, sy, sourceFrameWidth, sourceFrameHeight, 0, 0, canvasWidth, canvasHeight);
      bounds.push(alphaBoundsFromImageData(ctx.getImageData(0, 0, canvasWidth, canvasHeight), threshold, 0));
    }
  }
  const detectedContentBounds = unionFrameContentBounds(bounds);
  const contentBounds = effectiveAnimationContentBounds({ ...animation, detectedContentBounds, contentBounds: detectedContentBounds });
  const metrics = contentMetricsForFrame(sourceFrameWidth, sourceFrameHeight, contentBounds);
  return {
    detectedContentBounds,
    contentBounds,
    sourceSheetPixelWidth: naturalWidth,
    sourceSheetPixelHeight: naturalHeight,
    croppedSheetPixelWidth: geometry.croppedWidth,
    croppedSheetPixelHeight: geometry.croppedHeight,
    framePixelWidth: sourceFrameWidth,
    framePixelHeight: sourceFrameHeight,
    contentPixelWidth: metrics.contentPixelWidth,
    contentPixelHeight: metrics.contentPixelHeight,
    contentAspectRatio: metrics.aspectRatio
  };
}
