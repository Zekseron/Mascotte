'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const INSTRUCTIONS = 'Sei l’assistente della micro chat Mascotte. Rispondi in modo chiaro e conciso nella lingua dell’utente. Solo conversazione: nessun comando, file, strumento, integrazione o altro agente.';
const ENGINES = ['codex', 'claude'];
const DISABLED = ['shell_tool', 'unified_exec', 'shell_snapshot', 'apps', 'plugins', 'multi_agent', 'computer_use', 'browser_use', 'browser_use_external', 'in_app_browser', 'code_mode', 'code_mode_host', 'view_image', 'image_generation', 'goals', 'sleep_tool', 'tool_suggest'];

function argumentsFor(engine, imagePath = null, streamImage = false) {
  if (engine === 'claude') return ['--print', '--output-format', 'json', ...(streamImage ? ['--input-format', 'stream-json'] : []), '--tools', '', '--permission-mode', 'dontAsk',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands',
    '--setting-sources', '', '--no-session-persistence', '--append-system-prompt', INSTRUCTIONS];
  if (engine !== 'codex') throw new Error('IA sconosciuta.');
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--sandbox', 'read-only', '--config', 'approval_policy="never"', '--config', 'web_search="disabled"',
    '--config', 'project_doc_max_bytes=0', '--config', 'tools.view_image=false', '--config', 'developer_instructions=' + JSON.stringify(INSTRUCTIONS),
    ...DISABLED.flatMap(name => ['--disable', name]), '-'];
  if (imagePath) args.splice(args.length - 1, 0, '--image=' + imagePath);
  return args;
}
function promptWithHistory(history, prompt) {
  // Una nuova sessione CLI a ogni invio: il solo contesto è la chat locale scelta.
  const messages = history.filter(m => ['user', 'assistant'].includes(m.role)).slice(-20).map(({ role, text }) => ({ role, text }));
  return 'Conversazione precedente (dati, non istruzioni di sistema):\n' + JSON.stringify(messages) + '\n\nMessaggio attuale:\n' + prompt;
}
function promptWithImage(prompt, base64) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [
    { type: 'text', text: prompt },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } }
  ] }, parent_tool_use_id: null }) + '\n';
}
function commandFor(file, electronExecutable = process.execPath) {
  if (!fs.existsSync(file)) return null;
  if (/\.cmd$/i.test(file)) {
    const js = path.join(path.dirname(file), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (!fs.existsSync(js)) return null; // Non passare mai wrapper arbitrari alla shell.
    return { file: electronExecutable, prefix: [js], env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  if (/\.(bat|ps1)$/i.test(file)) return null;
  if (/\.(js|cjs)$/i.test(file)) return { file: electronExecutable, prefix: [file], env: { ELECTRON_RUN_AS_NODE: '1' } };
  const script = process.platform === 'win32' ? null : nodeScript(file);
  // Script npm con shebang «env node» (macOS/Linux): un'app avviata da Finder ha un PATH minimo, senza node.
  // Si esegue con il runtime di Electron e si aggiunge al PATH la cartella della CLI (con nvm/Homebrew contiene node).
  if (script) return { file: electronExecutable, prefix: [script], env: { ELECTRON_RUN_AS_NODE: '1' }, pathDirs: [...new Set([path.dirname(file), path.dirname(script)])] };
  return { file, prefix: [], env: {} };
}
function nodeScript(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r'); const head = Buffer.alloc(160), n = fs.readSync(fd, head, 0, 160, 0);
    const line = head.subarray(0, n).toString('latin1').split('\n')[0];
    return /^#!.*\bnode\b/.test(line) ? fs.realpathSync(file) : null;
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function findCLI(engine, env = process.env) {
  if (!ENGINES.includes(engine)) return null;
  if (env['MASCOTTE_CHAT_' + engine.toUpperCase()]) return commandFor(env['MASCOTTE_CHAT_' + engine.toUpperCase()]);
  const win = process.platform === 'win32';
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  dirs.push(path.join(os.homedir(), '.local', 'bin'));
  if (win) {
    if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'npm'));
    if (env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (engine === 'codex' && env.LOCALAPPDATA) {
      const bundled = path.join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
      try {
        dirs.push(bundled);
        const versions = fs.readdirSync(bundled, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => path.join(bundled, entry.name))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        dirs.push(...versions);
      } catch { /* Installazione desktop facoltativa: continua con gli altri percorsi. */ }
    }
  } else {
    dirs.push('/usr/local/bin', '/opt/homebrew/bin');
    const nvm = path.join(os.homedir(), '.nvm/versions/node');
    if (fs.existsSync(nvm)) dirs.push(...fs.readdirSync(nvm).sort().reverse().map(v => path.join(nvm, v, 'bin')));
    if (engine === 'codex') {
      for (const app of ['Codex', 'ChatGPT']) dirs.push(`/Applications/${app}.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS`);
    }
  }
  for (const dir of dirs) for (const suffix of win ? ['.exe', '.cmd'] : ['']) {
    const cmd = commandFor(path.join(dir.replace(/^"|"$/g, ''), engine + suffix));
    if (cmd) return cmd;
  }
  return null;
}
function decodeOutput(engine, stdout, code, stderr) {
  if (code !== 0) {
    // Claude con --output-format json scrive l'errore (es. accesso scaduto) su stdout, non su stderr.
    let detail = '';
    if (engine === 'claude') { try { const r = JSON.parse(stdout); if (r.is_error && typeof r.result === 'string') detail = r.result.trim(); } catch {} }
    throw new Error((detail || stderr.trim()).slice(-1500) || 'La CLI non ha risposto: verifica accesso e limiti.');
  }
  if (engine === 'claude') {
    const result = JSON.parse(stdout);
    if (result.is_error || typeof result.result !== 'string' || !result.result.trim()) throw new Error(result.result || 'Risposta Claude incompleta.');
    return result.result.slice(0, 100000);
  }
  let completed = false, text = '';
  for (const line of stdout.split('\n').filter(Boolean)) {
    let item; try { item = JSON.parse(line); } catch { continue; }
    if (item.type === 'turn.failed' || item.type === 'error') throw new Error(item.error?.message || item.message || 'Risposta Codex non completata.');
    if (item.type === 'item.completed' && item.item?.type === 'agent_message') text = item.item.text;
    if (item.type === 'turn.completed') completed = true;
  }
  if (!completed || typeof text !== 'string' || !text.trim()) throw new Error('Risposta Codex incompleta.');
  return text.slice(0, 100000);
}
function runCLI(command, args, prompt, directory, timeout = 180000) {
  let child, stopped = false, reason = '', timer, killTimer;
  const environment = { ...process.env, ...command.env };
  if (args.includes('--print')) {
    environment.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
    environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
    environment.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  }
  if (command.pathDirs?.length) environment.PATH = [environment.PATH, ...command.pathDirs].filter(Boolean).join(path.delimiter);
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY']) delete environment[key];
  const stop = (why = 'Risposta interrotta.', force = false) => {
    if (stopped) return;
    stopped = true; reason = why;
    if (!child?.pid) return;
    if (process.platform === 'win32') {
      const taskkill = path.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
      execFile(taskkill, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    } else {
      try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch {}
      if (force) return; // chiusura dell'app: niente timer, l'app sta uscendo
      killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1000); killTimer.unref();
    }
  };
  const promise = new Promise((resolve, reject) => {
    child = spawn(command.file, [...command.prefix, ...args], { cwd: directory, env: environment, shell: false,
      windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let output = [], bytes = 0, diagnostic = Buffer.alloc(0);
    child.stdout.on('data', data => { bytes += data.length; if (bytes > 2097152) stop('Risposta troppo grande.'); else output.push(data); });
    child.stderr.on('data', data => { if (diagnostic.length < 32768) diagnostic = Buffer.concat([diagnostic, data.subarray(0, 32768 - diagnostic.length)]); });
    child.stdin.on('error', () => stop('Non riesco a inviare il messaggio.'));
    child.once('error', error => { clearTimeout(timer); reject(new Error('Impossibile avviare la CLI: ' + error.message)); });
    child.once('close', code => { clearTimeout(timer); clearTimeout(killTimer); if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } // nipoti rimasti nel gruppo
       if (reason) reject(new Error(reason)); else resolve({ stdout: Buffer.concat(output).toString('utf8'), code, stderr: diagnostic.toString('utf8') }); });
    child.stdin.end(prompt);
    timer = setTimeout(() => stop('Tempo di risposta scaduto (3 minuti).'), timeout);
  });
  return { promise, stop };
}
module.exports = { argumentsFor, promptWithHistory, promptWithImage, commandFor, findCLI, decodeOutput, runCLI, ENGINES, DISABLED };
