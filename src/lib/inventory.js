export const INVENTORY_SELF_EVENT_BY_VERB = {
  look: 'onLook',
  talk: 'onTalk',
  pickUp: 'onPickUp',
  open: 'onOpen',
  close: 'onClose',
  push: 'onPush',
  pull: 'onPull'
};

export function findInventoryRecipe(items, firstId, secondId) {
  const first=items.find(i=>i.id===firstId);const second=items.find(i=>i.id===secondId);
  const direct=(first?.combinations||[]).find(c=>c.withItemId===secondId);
  if(direct)return {recipe:direct,owner:first,other:second,direction:'direct'};
  const reverse=(second?.combinations||[]).find(c=>c.withItemId===firstId&&c.bidirectional!==false);
  if(reverse)return {recipe:reverse,owner:second,other:first,direction:'reverse'};
  return null;
}

export function inventoryRuleMatches(rule, firstId, secondId) {
  if(rule?.event?.type!=='onInventoryCombine')return false;
  const direct=rule.event.itemId===firstId&&rule.event.targetId===secondId;
  const reverse=!!rule.event.bothWays&&rule.event.itemId===secondId&&rule.event.targetId===firstId;
  return direct||reverse;
}

export function inventoryVerbEnabled(item, verb) {
  if (!item || !verb || verb === 'walk') return false;
  return item.interactions?.[verb] !== false;
}

export function inventoryEventTypeForVerb(verb) {
  return INVENTORY_SELF_EVENT_BY_VERB[verb] || '';
}
