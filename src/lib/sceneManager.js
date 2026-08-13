import { uniqueId } from './id.js';

export const SCENE_CONNECTION_KINDS = ['progression', 'return', 'hub', 'newGame', 'custom'];

export function createSceneManager(scenes = []) {
  return {
    schemaVersion: '0.4',
    kind: 'scemq-scene-manager',
    sceneOrder: (scenes || []).map(scene => scene.id),
    connections: [],
    notes: ''
  };
}

export function normalizeSceneManager(manager, scenes = []) {
  const sceneIds = (scenes || []).map(scene => scene.id);
  const validIds = new Set(sceneIds);
  const incomingOrder = Array.isArray(manager?.sceneOrder) ? manager.sceneOrder : [];
  const sceneOrder = [
    ...incomingOrder.filter((id, index) => validIds.has(id) && incomingOrder.indexOf(id) === index),
    ...sceneIds.filter(id => !incomingOrder.includes(id))
  ];
  const connections = (manager?.connections || [])
    .filter(connection => connection && validIds.has(connection.fromSceneId) && validIds.has(connection.toSceneId))
    .map(connection => ({
      id: connection.id || uniqueId('connection'),
      fromSceneId: connection.fromSceneId,
      toSceneId: connection.toSceneId,
      kind: SCENE_CONNECTION_KINDS.includes(connection.kind) ? connection.kind : 'progression',
      label: connection.label || '',
      bidirectional: Boolean(connection.bidirectional),
      enabled: connection.enabled !== false
    }));
  return {
    ...createSceneManager(scenes),
    ...(manager || {}),
    schemaVersion: '0.4',
    kind: 'scemq-scene-manager',
    sceneOrder,
    connections,
    notes: manager?.notes || ''
  };
}

export function orderedScenes(scenes = [], manager = null) {
  const normalized = normalizeSceneManager(manager, scenes);
  const byId = new Map((scenes || []).map(scene => [scene.id, scene]));
  return normalized.sceneOrder.map(id => byId.get(id)).filter(Boolean);
}

export function createSceneConnection(fromSceneId = '', toSceneId = '', kind = 'progression') {
  return {
    id: uniqueId('connection'),
    fromSceneId,
    toSceneId,
    kind: SCENE_CONNECTION_KINDS.includes(kind) ? kind : 'progression',
    label: '',
    bidirectional: false,
    enabled: true
  };
}

export function linkedSceneIds(manager = null) {
  const ids = new Set();
  for (const connection of manager?.connections || []) {
    if (connection.enabled === false) continue;
    if (connection.fromSceneId) ids.add(connection.fromSceneId);
    if (connection.toSceneId) ids.add(connection.toSceneId);
  }
  return ids;
}
