'use strict';
const net = require('node:net');
const { readJSON } = require('./storage.cjs');
const { spawn } = require('node:child_process');

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
function sendEvent(file, state, source, timeout = 200) {
  const endpoint = readJSON(file, {}, 4096);
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || !/^[a-f0-9]{64}$/.test(endpoint.token || '')) return Promise.resolve();
  const body = JSON.stringify({ state, source });
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
    if (state) await sendEvent(endpoint, state, source);
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
module.exports = { hookState, sendEvent, notifyMain };
