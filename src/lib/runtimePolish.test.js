import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeUrl = new URL('../components/RuntimePlayer.jsx', import.meta.url);

test('pending interactions preserve the requested action until walking completes', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /pendingActionRef\s*=\s*useRef/);
  assert.match(source, /const committed=\{\.\.\.action[\s\S]*itemId:/);
  assert.match(source, /rememberPendingAction\(committed\)/);
  assert.match(source, /void walk\.then\(\(\)=>\{if\(pendingActionRef\.current===committed\)void performPendingInteraction\(committed\)\}\)/);
  assert.match(source, /await performInteraction\(obj,action\.verb,action\.itemId/);
  assert.match(source, /interactionBusyRef\s*=\s*useRef/);
  assert.match(source, /setInteractionBusyState\(true\)/);
});


test('action animations have a safety completion clock so gameplay cannot stay locked forever', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /animationDurationMs\(resolved\.animation\)\+500/);
  assert.match(source, /Animation .* did not report completion/);
  assert.match(source, /animationResolversRef\.current\.delete\(resolverKey\)/);
});

test('runtime animation boxes use each active strip aspect while preserving scene-authored height', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /function animationRenderTransform\(baseTransform,animation\)/);
  assert.match(source, /const height=Math\.max\(1,Number\(baseTransform\?\.height\|\|1\)\)/);
  assert.match(source, /width:height\*ratio/);
  assert.match(source, /animationRenderTransform\(playerT,anim\.animation\)/);
});

test('dialogue speech is rendered in viewport space rather than inside the scrolling world', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /speechScreenAnchorFor/);
  assert.match(source, /runtime-dialogue-speech/);
});

test('dialogue is modal and scene clicks advance dialogue instead of gameplay', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /runtime-dialogue-lock/);
  assert.match(source, /if\(dialogue\)\{if\(!dialogue\.awaitingChoice\)advanceDialogueBeat\(\);return\}/);
  assert.match(source, /if\(dialogue\|\|interactionBusyRef\.current\)return/);
});

test('dialogue choices stop click propagation so selecting one cannot move the player', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /onClick=\{e=>\{e\.stopPropagation\(\);chooseDialogueChoice\(c\)\}\}/);
  assert.match(source, /dialogue\?\.awaitingChoice/);
});


test('committed interactions block extra player input until execution finishes', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /interactionBusyRef\.current/);
  assert.match(source, /finally\{[\s\S]*clearPendingAction\(\);[\s\S]*setInteractionBusyState\(false\)/);
  assert.doesNotMatch(source, /const action=pendingActionRef\.current;\s*clearPendingAction\(\);\s*if\(action\)performPendingInteraction/);
});


test('a previous speech bubble does not consume a new object interaction click', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /function clickObject[\s\S]*dismissSpeech\(\);[\s\S]*const verb=overrideVerb\|\|selectedVerb/);
  assert.doesNotMatch(source, /function clickObject[\s\S]{0,300}if\(dismissSpeech\(\)\)return/);
});
