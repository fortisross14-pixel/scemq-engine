import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const visualEditorUrl = new URL('../components/VisualEditor.jsx', import.meta.url);

test('VisualEditor declares every direct drag handler used by camera markers', async () => {
  const source = await readFile(visualEditorUrl, 'utf8');
  for (const name of ['beginPlayerStartDrag', 'beginSpawnDrag']) {
    assert.match(source, new RegExp(`function\\s+${name}\\s*\\(`));
    assert.match(source, new RegExp(`onPointerDown=\\{(?:e=>)?${name}`));
  }
});
