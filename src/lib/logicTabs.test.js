import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Logic editor separates Rules and Variables into subtabs', () => {
  const source = fs.readFileSync(new URL('../components/LogicEditor.jsx', import.meta.url), 'utf8');
  assert.match(source, /setLogicSubtab\('rules'\)/);
  assert.match(source, /setLogicSubtab\('variables'\)/);
  assert.match(source, />Rules <span>/);
  assert.match(source, />Variables <span>/);
  assert.match(source, /logicSubtab==='rules'\?/);
  assert.match(source, /logic-variables-pane/);
});
