'use strict';
const net = require('node:net');
const { readJSON } = require('./storage.cjs');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

function hookState(event) {
  const type = event?.hook_event_name;
  if (type === 'UserPromptSubmit') return 'listening';
  if (type === 'PermissionRequest') return 'waiting';
  if (type === 'Interrupt') return 'idle';
  if (type === 'Stop') return 'done';
  if (type === 'Notification') return ['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(event.notification_type) ? 'waiting' : null;
  if (type === 'PostToolUseFailure') return event.is_interrupt ? null : 'error';
  if (type === 'PostToolUse') return event.tool_response?.isError || (typeof event.tool_response?.exit_code === 'number' && event.tool_response.exit_code !== 0) ? 'error' : 'thinking';
  if (type !== 'PreToolUse') return null;
  const tool = String(event.tool_name || '').toLowerCase();
  if (/bash|exec_command|run_command|powershell/.test(tool)) return 'running';
  if (/edit|write|apply_patch|update|create|delete|remove/.test(tool)) return 'writing';
  if (/read|grep|glob|fetch|search|list|get/.test(tool)) return 'reading';
  return 'working';
}
// Identificatore opaco della sessione per gli avvisi degli agenti (lib/agent-notices.cjs): impronta sha256 di
// «agente:id», 16 caratteri. L'id grezzo e gli altri campi dell'hook non lasciano mai il ponte.
// Solo dove l'id è stato verificato con hook reali su Mac: Claude `session_id` (24 novembre 2026: uguale in tutti gli
// eventi di una sessione, diverso fra sessioni), il vecchio notify di Codex `thread-id` (agent-turn-complete) e gli hook
// di Codex `session_id` (25 novembre 2026, Codex CLI 0.171.0-alpha.13.2: presente e stabile in UserPromptSubmit,
// PreToolUse, PostToolUse, PermissionRequest, Interrupt e Stop della stessa sessione, diverso fra due sessioni; turn_id
// invece cambia a ogni turno e non si usa). Senza un id valido l'evento resta anonimo.
function sessionKey(mode, source, event) {
  const raw = mode === '--claude-hook' || mode === '--codex-hook' ? event?.session_id : mode === '--codex-notify' ? event?.['thread-id'] : null;
  if (typeof raw !== 'string' || !raw || raw.length > 200) return null;
  return crypto.createHash('sha256').update(`${source}:${raw}`).digest('hex').slice(0, 16);
}
function sendEvent(file, state, source, timeout = 200, session = null) {
  const endpoint = readJSON(file, {}, 4096);
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || !/^[a-f0-9]{64}$/.test(endpoint.token || '')) return Promise.resolve();
  const body = JSON.stringify(session ? { state, source, session } : { state, source });
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: endpoint.port });
    const timer = setTimeout(() => socket.destroy(), timeout);
    socket.on('error', () => {});
    socket.on('close', () => { clearTimeout(timer); resolve(); });
    socket.on('data', () => socket.destroy());
    socket.on('connect', () => socket.write(`POST /event HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${endpoint.token}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`));
  });
}
async function stdinLimited() {
  return new Promise(resolve => {
    let data = '', finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(timer); process.stdin.pause(); resolve(data); } };
    const timer = setTimeout(done, 200);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', part => { if (finished) return; data += part; if (Buffer.byteLength(data) > 65536) { data = ''; done(); } });
    process.stdin.on('end', done); process.stdin.on('error', done);
    process.stdin.resume();
  });
}
async function notifyMain(args, endpoint) {
  try {
    let payload;
    if (args.includes('--codex-notify')) payload = args[args.length - 1];
    else payload = await stdinLimited();
    let event; try { if (Buffer.byteLength(payload || '') <= 65536) event = JSON.parse(payload); } catch {}
    const source = args.includes('--claude-hook') ? 'claude' : 'codex';
    const state = args.includes('--codex-notify') ? (event?.type === 'agent-turn-complete' ? 'done' : null) : hookState(event);
    const mode = ['--claude-hook', '--codex-notify', '--codex-hook'].find(flag => args.includes(flag));
    if (state) await sendEvent(endpoint, state, source, 200, sessionKey(mode, source, event));
    const forward = args.indexOf('--forward-base64');
    if (forward >= 0) {
      const command = JSON.parse(Buffer.from(args[forward + 1], 'base64').toString('utf8'));
      if (Array.isArray(command) && command.length && command.every(x => typeof x === 'string')) {
        await new Promise(resolve => {
          // Conserva il notify nativo precedente; wrapper shell richiedono setup manuale.
          const child = spawn(command[0], [...command.slice(1), payload || ''], { shell: false, windowsHide: true, stdio: 'ignore' });
          const timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
          child.once('error', () => { clearTimeout(timer); resolve(); });
          child.once('close', () => { clearTimeout(timer); resolve(); });
        });
      }
    }
  } catch {} // Gli hook non devono bloccare il lavoro o stampare dati.
}
module.exports = { hookState, sendEvent, notifyMain, sessionKey };
