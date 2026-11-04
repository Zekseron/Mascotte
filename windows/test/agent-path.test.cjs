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

test('CLI senza node vicino (es. Codex nell’app ChatGPT): si aggiunge la prima cartella nota che contiene node', { skip: process.platform === 'win32' }, t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { withNode } = require('../lib/cli.cjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte node ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const app = path.join(base, 'ChatGPT.app'), brew = path.join(base, 'homebrew'), empty = path.join(base, 'vuota');
  for (const dir of [app, brew, empty]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(brew, 'node'), '', { mode: 0o755 });
  const codex = { file: path.join(app, 'codex'), prefix: [], env: {}, pathDirs: [app] };
  assert.deepEqual(withNode(codex, [empty, app, brew], { PATH: '/usr/bin:/bin' }).pathDirs, [app, brew]);
  assert.equal(withNode(codex, [empty, app, brew], { PATH: brew }), codex, 'node già nel PATH: nulla da aggiungere');
  assert.equal(withNode(codex, [empty, app], { PATH: '/usr/bin:/bin' }), codex, 'node assente ovunque: la CLI resta com’è');
});
