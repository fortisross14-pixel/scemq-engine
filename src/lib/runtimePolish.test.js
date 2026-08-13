import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeUrl = new URL('../components/RuntimePlayer.jsx', import.meta.url);

test('pending interactions preserve the requested action until walking completes', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /pendingActionRef\s*=\s*useRef/);
  assert.match(source, /rememberPendingAction\(\{\.\.\.action[\s\S]*itemId:/);
  assert.match(source, /const action=pendingActionRef\.current/);
  assert.match(source, /performInteraction\(obj,action\.verb,action\.itemId/);
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
  assert.match(source, /if\(dialogue\)return;if\(!inputEnabled/);
});

test('dialogue choices stop click propagation so selecting one cannot move the player', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /onClick=\{e=>\{e\.stopPropagation\(\);chooseDialogueChoice\(c\)\}\}/);
  assert.match(source, /dialogue\?\.awaitingChoice/);
});
