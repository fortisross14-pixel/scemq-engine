import { pointInPolygon } from './geometry.js';

export const MIN_ACTOR_SCALE = 0.05;
export const MAX_ACTOR_SCALE = 4;

export function clampScale(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(MIN_ACTOR_SCALE, Math.min(MAX_ACTOR_SCALE, number));
}

export function polygonYRange(points = []) {
  if (!points.length) return { top: 0, bottom: 0 };
  let top = Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    const y = Number(point.y || 0);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return { top, bottom };
}

// A scale area is a walk-area-shaped polygon that says "a character standing at
// the top edge of this polygon renders at topScale, at the bottom edge at
// bottomScale". Anything between interpolates linearly on Y, which is exactly
// how the classic SCUMM rooms faked perspective.
export function scaleInArea(point, area) {
  const { top, bottom } = polygonYRange(area?.points || []);
  const topScale = clampScale(area?.topScale, 0.6);
  const bottomScale = clampScale(area?.bottomScale, 1);
  if (bottom <= top) return bottomScale;
  const t = Math.max(0, Math.min(1, (Number(point?.y || 0) - top) / (bottom - top)));
  return clampScale(topScale + (bottomScale - topScale) * t, bottomScale);
}

export function actorScaleAtPoint(point, scaleAreas = [], fallback = 1) {
  const enabled = (scaleAreas || []).filter((area) => area?.enabled !== false && area?.points?.length >= 3);
  if (!enabled.length) return clampScale(fallback, 1);
  const matching = enabled.filter((area) => pointInPolygon(point, area.points));
  if (!matching.length) return clampScale(fallback, 1);
  return scaleInArea(point, matching[matching.length - 1]);
}

// Rendering helper: keep the anchor (feet) point pinned while the sprite grows
// or shrinks around it.
export function scaledRenderBox(point, transform = {}, scale = 1) {
  const safeScale = clampScale(scale, 1);
  const width = Number(transform.width || 0) * safeScale;
  const height = Number(transform.height || 0) * safeScale;
  const anchorX = transform.anchorX ?? 0.5;
  const anchorY = transform.anchorY ?? 1;
  return {
    left: Number(point?.x || 0) - width * anchorX,
    top: Number(point?.y || 0) - height * anchorY,
    width,
    height,
    scale: safeScale
  };
}
