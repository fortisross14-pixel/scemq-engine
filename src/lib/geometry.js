export function pointInPolygon(point, polygon = []) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function nearestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function nearestPointInPolygons(point, polygons = []) {
  const enabled = polygons.filter((area) => area.enabled !== false && area.points?.length >= 3);
  if (!enabled.length) return { ...point };
  if (enabled.some((area) => pointInPolygon(point, area.points))) return { ...point };
  let best = null;
  let bestDist = Infinity;
  for (const area of enabled) {
    const pts = area.points;
    for (let i = 0; i < pts.length; i++) {
      const candidate = nearestPointOnSegment(point, pts[i], pts[(i + 1) % pts.length]);
      const d = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (d < bestDist) { best = candidate; bestDist = d; }
    }
  }
  return best || { ...point };
}

export function depthZAtPoint(point, depthAreas = [], fallback = 30) {
  const matching = depthAreas.filter((area) => area.enabled !== false && area.points?.length >= 3 && pointInPolygon(point, area.points));
  if (!matching.length) return fallback;
  return matching[matching.length - 1].z ?? fallback;
}

export function clampCamera(camera, canvas, viewport, bounds) {
  const b = bounds || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const maxX = Math.max(b.x, b.x + b.width - viewport.width);
  const maxY = Math.max(b.y, b.y + b.height - viewport.height);
  return {
    x: Math.max(b.x, Math.min(maxX, camera.x)),
    y: Math.max(b.y, Math.min(maxY, camera.y))
  };
}

function pointInAny(point, areas) {
  return areas.some((area) => area.enabled !== false && area.points?.length >= 3 && pointInPolygon(point, area.points));
}

export function segmentInsideWalkAreas(a, b, areas = []) {
  const enabled = areas.filter((area) => area.enabled !== false && area.points?.length >= 3);
  if (!enabled.length) return true;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(dist / 12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!pointInAny(p, enabled)) return false;
  }
  return true;
}

export function findPathInWalkAreas(start, requestedTarget, areas = []) {
  const enabled = areas.filter((area) => area.enabled !== false && area.points?.length >= 3);
  const target = nearestPointInPolygons(requestedTarget, enabled);
  if (!enabled.length || segmentInsideWalkAreas(start, target, enabled)) return [target];

  const vertices = enabled.flatMap((area) => area.points.map((point) => ({ x: point.x, y: point.y })));
  const nodes = [start, target, ...vertices];
  const count = nodes.length;
  const graph = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (!segmentInsideWalkAreas(nodes[i], nodes[j], enabled)) continue;
      const weight = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      graph[i].push([j, weight]);
      graph[j].push([i, weight]);
    }
  }

  const dist = Array(count).fill(Infinity);
  const prev = Array(count).fill(-1);
  const visited = Array(count).fill(false);
  dist[0] = 0;
  for (let step = 0; step < count; step++) {
    let u = -1;
    for (let i = 0; i < count; i++) if (!visited[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || !Number.isFinite(dist[u])) break;
    if (u === 1) break;
    visited[u] = true;
    for (const [v, w] of graph[u]) {
      const alt = dist[u] + w;
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[1])) return [target];
  const indices = [];
  for (let at = 1; at !== -1; at = prev[at]) indices.push(at);
  indices.reverse();
  return indices.slice(1).map((index) => nodes[index]);
}
