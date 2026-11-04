'use strict';
// L'agente riceve nel PATH le cartelle trovate insieme alla CLI (npm/nvm/Homebrew), come la Chat.
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnAgent } = require('../lib/agent-process.cjs');
test('spawnAgent aggiunge pathDirs al PATH del processo figlio', { skip: process.platform === 'win32' }, async () => {
  const child = spawnAgent({ file: '/bin/sh', prefix: ['-c', 'printf %s "$PATH"'], env: { PATH: '/usr/bin:/bin' }, pathDirs: ['/opt/cli-rilevata/bin'] }, [], '/');
  let out = ''; child.stdout.on('data', d => { out += d; });
  await new Promise(resolve => child.on('close', resolve));
  assert.equal(out, '/usr/bin:/bin:/opt/cli-rilevata/bin');
});
