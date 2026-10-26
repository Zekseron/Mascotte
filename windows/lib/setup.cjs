'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const toml = require('smol-toml');
const { assertRegularPath, atomicJSON } = require('./storage.cjs');

function prepareHooks(claudeText, codexText, executable) {
  if (/["\r\n%]/.test(executable)) throw new Error('Percorso app non supportato per gli hook: configura manualmente.');
  const claude = JSON.parse(claudeText), codex = toml.parse(codexText);
  if (!claude || Array.isArray(claude) || typeof claude !== 'object') throw new Error('Configurazione Claude non valida.');
  // Codex espone una stringa command: usa PowerShell encoded per evitare
  // interpretazioni diverse di spazi/apostrofi nel percorso tra cmd e PowerShell.
  const script = "$payload = [Console]::In.ReadToEnd(); $payload | & '" + executable.replace(/'/g, "''") + "' --mascotte-notify --codex-hook; exit 0";
  const codexCommand = 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(script, 'utf16le').toString('base64');
  const hooks = claude.hooks || {};
  if (!hooks || Array.isArray(hooks) || typeof hooks !== 'object') throw new Error('Hook Claude non validi.');
  if (JSON.stringify(hooks).includes('--mascotte-notify') || codexText.includes('--mascotte-notify')) throw new Error('Hook Mascotte già presenti: non duplicati.');
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop']) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) throw new Error('Hook esistente non valido.');
    const value = { hooks: [{ type: 'command', command: executable, args: ['--mascotte-notify', '--claude-hook'], timeout: 2 }] };
    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'].includes(event)) value.matcher = '.*';
    if (event === 'Notification') value.matcher = 'permission_prompt|idle_prompt|elicitation_dialog';
    hooks[event] = [...(hooks[event] || []), value];
  }
  claude.hooks = hooks;
  const previous = codex.notify || [];
  if (!Array.isArray(previous) || !previous.every(x => typeof x === 'string') || /\.(cmd|bat|ps1)$/i.test(previous[0] || '')) throw new Error('Notify precedente non nativo: configurazione manuale richiesta per preservarlo.');
  codex.notify = [executable, '--mascotte-notify', '--codex-notify'];
  if (previous.length) codex.notify.push('--forward-base64', Buffer.from(JSON.stringify(previous)).toString('base64'));
  codex.features ||= {};
  if (Array.isArray(codex.features) || typeof codex.features !== 'object') throw new Error('Sezione features Codex non valida.');
  codex.features.hooks = true;
  codex.hooks ||= {};
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Interrupt', 'Stop']) {
    if (codex.hooks[event] !== undefined && !Array.isArray(codex.hooks[event])) throw new Error('Hook Codex non validi.');
    const value = { hooks: [{ type: 'command', command: codexCommand, command_windows: codexCommand, timeout: 2 }] };
    if (['PreToolUse', 'PostToolUse', 'PermissionRequest'].includes(event)) value.matcher = '.*';
    codex.hooks[event] = [...(codex.hooks[event] || []), value];
  }
  return { claude: JSON.stringify(claude, null, 2) + '\n', codex: toml.stringify(codex) };
}
function configPaths(home = os.homedir()) {
  return { claude: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json'), codex: path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'config.toml') };
}
function snapshot(paths) {
  return Object.fromEntries(Object.entries(paths).map(([engine, file]) => {
    assertRegularPath(file);
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (bytes && bytes.length > 1048576) throw new Error('Configurazione troppo grande.');
    return [engine, { text: bytes?.toString('utf8') || (engine === 'claude' ? '{}' : ''),
      hash: bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : null }];
  }));
}
function applyHooks(paths, before, after, recordFile) {
  const fresh = snapshot(paths);
  for (const engine of ['claude', 'codex']) if (fresh[engine].hash !== before[engine].hash) throw new Error('Configurazione cambiata: rileggi l’anteprima.');
  const backups = {}, stamp = Date.now() + '-' + crypto.randomUUID();
  for (const engine of ['claude', 'codex']) {
    const file = paths[engine]; fs.mkdirSync(path.dirname(file), { recursive: true });
    backups[engine] = before[engine].hash ? file + '.before-mascotte-' + stamp : null;
    if (backups[engine]) fs.writeFileSync(backups[engine], fs.readFileSync(file), { flag: 'wx', mode: 0o600 });
  }
  // Backup del record prima delle scritture: recupero possibile anche se una fallisce.
  atomicJSON(recordFile, { paths, backups, originals: Object.fromEntries(Object.entries(before).map(([k,v]) => [k,v.hash])) });
  const written = [];
  try {
    for (const engine of ['claude', 'codex']) {
      if (engine === 'claude') atomicJSON(paths[engine], JSON.parse(after[engine]));
      else {
        const temp = paths[engine] + '.mascotte-' + stamp;
        fs.writeFileSync(temp, after[engine], { flag: 'wx', mode: 0o600 });
        fs.renameSync(temp, paths[engine]);
      }
      written.push(engine);
    }
  } catch (e) {
    for (const engine of written) {
      if (backups[engine]) fs.copyFileSync(backups[engine], paths[engine]);
      else fs.unlinkSync(paths[engine]);
    }
    throw e;
  }
  return backups;
}
module.exports = { prepareHooks, configPaths, snapshot, applyHooks };
