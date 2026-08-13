const INTERACTION_EVENTS = new Set(['onLook','onUse','onPickUp','onTalk','onGive','onOpen','onClose','onPush','onPull','onItemUsed']);

export function ruleEventMatches(rule, { type, targetId = '', targetType = 'object', verb = '', itemId = '' } = {}) {
  const event = rule?.event || {};
  if (event.type !== type) return false;
  const authoredTargetType = event.targetType || 'object';
  if (event.targetId && (event.targetId !== targetId || authoredTargetType !== targetType)) return false;
  if (!INTERACTION_EVENTS.has(type)) return true;
  if (event.verb && event.verb !== verb) return false;
  if (targetType !== 'inventory' && event.itemId && event.itemId !== itemId) return false;
  return true;
}
