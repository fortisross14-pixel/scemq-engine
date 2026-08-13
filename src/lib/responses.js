export const DEFAULT_VERB_RESPONSES = {
  look: ['There is nothing special about {target}.', "I don't see anything unusual."],
  use: ["I can't use {target}.", 'That accomplishes nothing.'],
  talk: ["{target} isn't much of a conversationalist."],
  pickUp: ["I can't pick {target} up.", 'That is going to stay where it is.'],
  give: ["I don't think {target} wants that."],
  open: ["{target} doesn't open."],
  close: ["{target} doesn't need closing."],
  push: ['Pushing {target} gets me nowhere.'],
  pull: ["{target} won't budge."],
  walk: ["I can't go there."]
};

export function responseLinesFor(settings, verb) {
  const authored = settings?.defaultResponses?.[verb];
  const list = Array.isArray(authored)
    ? authored
    : String(authored || '').split('\n');
  const cleaned = list.map((line) => String(line || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : (DEFAULT_VERB_RESPONSES[verb] || ['Nothing happens.']);
}

// pick is injectable so tests stay deterministic and so a scene can be replayed
// with the same random line if a project ever needs it.
export function fallbackResponse(settings, verb, targetName = 'that', pick = Math.random) {
  const lines = responseLinesFor(settings, verb);
  const index = Math.max(0, Math.min(lines.length - 1, Math.floor(pick() * lines.length)));
  return lines[index].replace(/\{target\}/g, targetName || 'that');
}

export function createDefaultResponses() {
  return Object.fromEntries(Object.entries(DEFAULT_VERB_RESPONSES).map(([verb, lines]) => [verb, lines.join('\n')]));
}
