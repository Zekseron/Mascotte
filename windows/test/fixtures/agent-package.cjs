'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '../..'), packageRoot = path.join(root, 'dist/win-unpacked'), archive = path.join(packageRoot, 'resources/app.asar');
for (const file of ['main.cjs', 'lib/agents.cjs', 'lib/agent-codex.cjs', 'lib/agent-claude.cjs', 'lib/agent-process.cjs', 'renderer/chat.js', 'renderer/chat.html', 'renderer/chat.css']) {
  if (!fs.readFileSync(path.join(root, file)).equals(asar.extractFile(archive, file))) throw new Error('Pacchetto non aggiornato: ' + file);
}
const sdk = require('node:url').pathToFileURL(path.join(archive, 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs')).href;
const result = spawnSync(path.join(packageRoot, 'Mascotte.exe'), ['-e', `import(${JSON.stringify(sdk)}).then(m=>{if(typeof m.query!=='function')throw new Error('query assente');console.log('SDK_CLAUDE_OK')}).catch(e=>{console.error(e);process.exitCode=1})`], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 20000 });
if (result.status !== 0 || !result.stdout?.includes('SDK_CLAUDE_OK')) throw new Error(result.stderr || result.error?.message || 'SDK non caricato');
console.log(JSON.stringify({ sorgentiInclusi: true, sdkClaudeNelPacchetto: true }));
