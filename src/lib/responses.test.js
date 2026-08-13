import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultResponses, fallbackResponse, responseLinesFor } from './responses.js';

test('authored lines override the built-in ones', () => {
  const settings = { defaultResponses: { look: 'Nothing to see.\nMove along.' } };
  assert.deepEqual(responseLinesFor(settings, 'look'), ['Nothing to see.', 'Move along.']);
});

test('a blank authored response falls back instead of going silent', () => {
  assert.ok(responseLinesFor({ defaultResponses: { look: '   ' } }, 'look').length > 0);
  assert.deepEqual(responseLinesFor({}, 'nonsenseVerb'), ['Nothing happens.']);
});

test('{target} is replaced and the pick is injectable', () => {
  const settings = { defaultResponses: { push: 'I cannot move {target}.\nSecond line.' } };
  assert.equal(fallbackResponse(settings, 'push', 'the crate', () => 0), 'I cannot move the crate.');
  assert.equal(fallbackResponse(settings, 'push', 'the crate', () => 0.99), 'Second line.');
});

test('default responses serialise as editable multi-line text', () => {
  const defaults = createDefaultResponses();
  assert.equal(typeof defaults.look, 'string');
  assert.ok(defaults.look.includes('\n'));
});
