import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'index.html',
  'vite.config.js',
  '.github/workflows/deploy.yml',
  'src/main.jsx',
  'src/App.jsx',
  'src/styles.css',
  'src/components/ProjectHub.jsx',
  'src/components/Workspace.jsx',
  'src/components/VisualEditor.jsx',
  'src/components/RuntimePlayer.jsx',
  'src/lib/id.js',
  'src/lib/schema.js',
];

test('repository contains every production entrypoint and baseline module', async () => {
  for (const file of requiredFiles) {
    await assert.doesNotReject(
      access(file, constants.R_OK),
      `Missing required repository file: ${file}`,
    );
  }
});

test('index.html points at the checked-in Vite entry module', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /src=["']\/src\/main\.jsx["']/);
});
