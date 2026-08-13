const INTERACTION_EVENTS = new Set(['onLook','onUse','onPickUp','onTalk','onGive','onOpen','onClose','onPush','onPull','onItemUsed']);

export const VERB_EVENT_TYPES = Object.freeze({
  look:'onLook',
  use:'onUse',
  talk:'onTalk',
  pickUp:'onPickUp',
  give:'onGive',
  open:'onOpen',
  close:'onClose',
  push:'onPush',
  pull:'onPull'
});

export function eventTypeForVerb(verb=''){
  return VERB_EVENT_TYPES[verb]||'';
}

// Authoring-time discovery: find every rule that declares itself for this target + verb.
// Conditions and inventory item requirements are intentionally NOT evaluated here; the
// inspector needs to show all conditional variants (e.g. Pindle's several Talk states).
export function authoredRulesForInteraction(rules=[], { targetId='', targetType='object', verb='' } = {}){
  const type=eventTypeForVerb(verb);
  if(!type||!targetId)return [];
  return (rules||[]).filter(rule=>{
    const event=rule?.event||{};
    if(event.type!==type)return false;
    const authoredTargetType=event.targetType||'object';
    if(authoredTargetType!==targetType)return false;
    if(event.targetId!==targetId)return false;
    if(event.verb&&event.verb!==verb)return false;
    return true;
  });
}

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
