export function normalizeHotspotBounds(bounds = {}) {
  const x = clamp01(Number(bounds.x ?? 0));
  const y = clamp01(Number(bounds.y ?? 0));
  const width = Math.max(0.01, Math.min(1 - x, Number(bounds.width ?? 1)));
  const height = Math.max(0.01, Math.min(1 - y, Number(bounds.height ?? 1)));
  return { x, y, width, height };
}

export function hotspotRect(object) {
  const t = object?.transform || { x: 0, y: 0, width: 1, height: 1 };
  const hotspot = object?.hotspot || {};
  const mode = hotspot.shape || 'visual';
  const bounds = mode === 'visual' ? { x: 0, y: 0, width: 1, height: 1 } : normalizeHotspotBounds(hotspot.bounds);
  const bx = t.flipX ? 1 - bounds.x - bounds.width : bounds.x;
  return {
    x: t.x + bx * t.width,
    y: t.y + bounds.y * t.height,
    width: bounds.width * t.width,
    height: bounds.height * t.height,
    bounds,
    mode
  };
}

export function alphaBoundsFromImageData(imageData, threshold = 8, padding = 2) {
  if (!imageData?.data || !imageData.width || !imageData.height) return { x: 0, y: 0, width: 1, height: 1, empty: true };
  const { data, width, height } = imageData;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const alphaThreshold = Math.max(0, Math.min(255, Number(threshold) || 0));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 1, height: 1, empty: true };
  minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding); maxY = Math.min(height - 1, maxY + padding);
  return normalizeHotspotBounds({
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height
  });
}

export function alphaHit(mask, normalizedX, normalizedY, threshold = 8) {
  if (!mask?.data || !mask.width || !mask.height) return true;
  const x = Math.max(0, Math.min(mask.width - 1, Math.floor(normalizedX * mask.width)));
  const y = Math.max(0, Math.min(mask.height - 1, Math.floor(normalizedY * mask.height)));
  return mask.data[(y * mask.width + x) * 4 + 3] > Math.max(0, Math.min(255, Number(threshold) || 0));
}

function clamp01(value) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
