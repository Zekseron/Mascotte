'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const toml = require('smol-toml');
const { assertRegularPath, atomicJSON } = require('./storage.cjs');

function isMascotteClaudeHook(value) {
  return value && Array.isArray(value.hooks) && value.hooks.some(hook =>
    hook?.type === 'command' && ((Array.isArray(hook.args) &&
    hook.args.includes('--mascotte-notify') && hook.args.includes('--claude-hook')) ||
    isMascotteCommand(hook.command, '--claude-hook')));
}
// Hook della vecchia app Swift per Mac: script Python «…/tools/mascotte-notify --claude-hook» (scelta dell'utente: vanno sostituiti).
const legacyMacCommand = (command, mode) => new RegExp(`(?:^|[\\s/'"])mascotte-notify['"]?\\s+${mode}(?:\\s|$)`).test(command);
function isMascotteCommand(command, mode) {
  if (typeof command !== 'string') return false;
  const encoded = command.match(/-EncodedCommand\s+([A-Za-z0-9+/=]+)/i)?.[1];
  const decoded = encoded ? Buffer.from(encoded, 'base64').toString('utf16le') : command;
  return (decoded.includes('--mascotte-notify') && decoded.includes(mode)) || legacyMacCommand(decoded, mode);
}
function isMascotteCodexHook(value) {
  return value && value.type === 'command' &&
    [value.command, value.command_windows, value.commandWindows].some(command => isMascotteCommand(command, '--codex-hook'));
}
function removeMascotteClaudeHooks(hooks) {
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    hooks[event] = groups.map(group => ({
      ...group,
      hooks: Array.isArray(group.hooks) ? group.hooks.filter(hook => !isMascotteClaudeHook({ hooks: [hook] })) : group.hooks
    })).filter(group => !Array.isArray(group.hooks) || group.hooks.length > 0);
  }
}
function removeMascotteCodexHooks(hooks) {
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    hooks[event] = groups.map(group => ({
      ...group,
      hooks: Array.isArray(group.hooks) ? group.hooks.filter(hook => !isMascotteCodexHook(hook)) : group.hooks
    })).filter(group => !Array.isArray(group.hooks) || group.hooks.length > 0);
  }
}
function previousNotify(command, computerUseSeen = false, depth = 0) {
  if (depth > 16 || !Array.isArray(command) || !command.every(value => typeof value === 'string')) {
    throw new Error('Catena notify non valida: configurazione originale conservata.');
  }
  // Notify della vecchia app Swift: [python3, …/mascotte-notify, --codex-notify, --forward-command, <JSON del notify precedente>].
  if (/(?:^|[\\/])mascotte-notify$/.test(command[1] || '') && command.includes('--codex-notify')) {
    const forwarded = command.indexOf('--forward-command');
    if (forwarded < 0) return [];
    let previous;
    try { previous = JSON.parse(command[forwarded + 1]); }
    catch { throw new Error('Notify Mascotte precedente illeggibile: configurazione originale conservata.'); }
    return previousNotify(previous, computerUseSeen, depth + 1);
  }
  if (command.includes('--mascotte-notify') && command.includes('--codex-notify')) {
    const forwarded = command.indexOf('--forward-base64');
    if (forwarded < 0) return [];
    let previous;
    try { previous = JSON.parse(Buffer.from(command[forwarded + 1], 'base64').toString('utf8')); }
    catch { throw new Error('Notify Mascotte precedente illeggibile: configurazione originale conservata.'); }
    return previousNotify(previous, computerUseSeen, depth + 1);
  }
  // The desktop host can wrap notify again after installation. Keep the outer
  // (current) helper and any unrelated notifier, removing duplicate old helpers.
  // Helper di Codex Computer Use: codex-computer-use.exe su Windows, SkyComputerUseClient su Mac.
  if (['codex-computer-use.exe', 'skycomputeruseclient'].includes(String(command[0] || '').split(/[\\/]/).pop().toLowerCase()) && command[1] === 'turn-ended') {
    const forwarded = command.indexOf('--previous-notify');
    let previous = [];
    if (forwarded >= 0) {
      try { previous = JSON.parse(command[forwarded + 1]); }
      catch { throw new Error('Notify Codex precedente illeggibile: configurazione originale conservata.'); }
      previous = previousNotify(previous, true, depth + 1);
    }
    if (computerUseSeen) return previous;
    const current = command.slice();
    if (forwarded >= 0) {
      if (previous.length) current[forwarded + 1] = JSON.stringify(previous);
      else current.splice(forwarded, 2);
    }
    return current;
  }
  return command;
}

function hookCommand(executable, bridge, mode) {
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  // Set Node mode explicitly: the same Electron executable works whether or
  // not the host already has ELECTRON_RUN_AS_NODE in its environment.
  // Only the fixed command is encoded; event JSON stays on stdin, never argv.
  // PowerShell's native pipeline can defer writing until after the bridge's
  // input deadline. Write directly to a redirected process pipe instead.
  const script = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; $child = $null; " +
    "try { $utf8 = [System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding = $utf8; " +
    "$payload = [Console]::In.ReadToEnd(); $info = [System.Diagnostics.ProcessStartInfo]::new(); " +
    '$info.FileName = ' + quote(executable) + '; $info.Arguments = ' + quote('"' + bridge + '" --mascotte-notify ' + mode) + '; ' +
    "$info.UseShellExecute = $false; $info.CreateNoWindow = $true; " +
    "$info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true; " +
    "$info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'; " +
    "$child = [System.Diagnostics.Process]::Start($info); " +
    "$output = $child.StandardOutput.ReadToEndAsync(); $errors = $child.StandardError.ReadToEndAsync(); " +
    "$bytes = $utf8.GetBytes($payload); $child.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length); $child.StandardInput.Close(); " +
    "if (!$child.WaitForExit(2000)) { $child.Kill() } " +
    "} catch {} finally { if ($null -ne $child) { $child.Dispose() } }; exit 0";
  return 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ' + Buffer.from(script, 'utf16le').toString('base64');
}
// Mac: comando di shell (Claude e Codex lo eseguono con sh). L'evento arriva su stdin direttamente al ponte,
// eseguito dal Node incluso nell'app; errori e uscita restano silenziosi per non disturbare il lavoro.
function macHookCommand(executable, bridge, mode) {
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
  return `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} ${quote(bridge)} --mascotte-notify ${mode} >/dev/null 2>&1; exit 0`;
}
const defaultBridge = (executable, platform) => platform === 'win32'
  ? path.win32.join(path.win32.dirname(executable), 'resources', 'app.asar', 'lib', 'notify-entry.cjs')
  : path.posix.join(path.posix.dirname(executable), '..', 'Resources', 'app.asar', 'lib', 'notify-entry.cjs');
// La piattaforma si ricava dal percorso dell'app: un percorso con lettera di unità è Windows.
function prepareHooks(claudeText, codexText, executable, bridge, platform = /^[A-Za-z]:[\\/]/.test(executable) ? 'win32' : process.platform) {
  const win = platform === 'win32';
  bridge ||= defaultBridge(executable, platform);
  if ([executable, bridge].some(value => win ? /["\r\n%]/.test(value) : /[\r\n\0]/.test(value))) throw new Error('Percorso app non supportato per gli hook: configura manualmente.');
  const claude = JSON.parse(claudeText), codex = toml.parse(codexText);
  if (!claude || Array.isArray(claude) || typeof claude !== 'object') throw new Error('Configurazione Claude non valida.');
  const command = win ? hookCommand : macHookCommand;
  const codexCommand = command(executable, bridge, '--codex-hook');
  const claudeCommand = command(executable, bridge, '--claude-hook');
  const hooks = claude.hooks || {};
  if (!hooks || Array.isArray(hooks) || typeof hooks !== 'object') throw new Error('Hook Claude non validi.');
  removeMascotteClaudeHooks(hooks);
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop']) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) throw new Error('Hook esistente non valido.');
    const value = { hooks: [{ type: 'command', command: claudeCommand, timeout: 5 }] };
    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'].includes(event)) value.matcher = '.*';
    if (event === 'Notification') value.matcher = 'permission_prompt|idle_prompt|elicitation_dialog';
    hooks[event] = [...(hooks[event] || []), value];
  }
  claude.hooks = hooks;
  const previous = previousNotify(codex.notify || []);
  // Stop already signals completion via stdin, without a second notify call
  // carrying the full answer on the size-limited Windows command line.
  if (previous.length) codex.notify = previous;
  else delete codex.notify;
  codex.features ||= {};
  if (Array.isArray(codex.features) || typeof codex.features !== 'object') throw new Error('Sezione features Codex non valida.');
  codex.features.hooks = true;
  codex.hooks ||= {};
  if (Array.isArray(codex.hooks) || typeof codex.hooks !== 'object') throw new Error('Hook Codex non validi.');
  removeMascotteCodexHooks(codex.hooks);
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Interrupt', 'Stop']) {
    if (codex.hooks[event] !== undefined && !Array.isArray(codex.hooks[event])) throw new Error('Hook Codex non validi.');
    const value = { hooks: [{ type: 'command', command: codexCommand, ...(win ? { command_windows: codexCommand } : {}), timeout: event === 'Interrupt' ? 3 : 5 }] };
    if (['PreToolUse', 'PostToolUse', 'PermissionRequest'].includes(event)) value.matcher = '.*';
    codex.hooks[event] = [...(codex.hooks[event] || []), value];
  }
  return { claude: JSON.stringify(claude, null, 2) + '\n', codex: toml.stringify(codex) };
}
function configPaths(home = os.homedir()) {
  return { claude: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json'), codex: path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'config.toml') };
}
// Gli hook installati puntano a un'app diversa da quella in esecuzione? Sola lettura (Mac: il bundle può essere stato spostato).
function hooksPointElsewhere(recordFile, executable) {
  if (!fs.existsSync(recordFile)) return false;
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  for (const file of Object.values(record.paths || {})) {
    if (typeof file !== 'string' || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('--mascotte-notify') && !text.includes(executable)) return true;
  }
  return false;
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
module.exports = { prepareHooks, configPaths, snapshot, applyHooks, hooksPointElsewhere };
