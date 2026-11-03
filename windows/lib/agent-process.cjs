'use strict';
const { spawn, execFile, execFileSync } = require('node:child_process');
const path = require('node:path');

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else {
    // Le CLI possono avviare comandi in sessioni/gruppi separati. Raccogliere
    // i discendenti prima di uccidere il padre: dopo sarebbero adottati da init.
    let descendants = [];
    try {
      const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000, maxBuffer: 8 * 1024 * 1024 });
      descendants = descendantPids(rows, child.pid);
    } catch { /* Il gruppo della CLI viene comunque terminato. */ }
    for (const pid of descendants.reverse()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { process.kill(child.pid, 'SIGKILL'); } catch {} }
  }
}
function descendantPids(rows, root) {
  const children = new Map();
  for (const line of rows.trim().split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || pid <= 1 || !Number.isInteger(parent)) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(pid);
  }
  const found = [], seen = new Set([root]);
  const queue = [root];
  for (let i = 0; i < queue.length; i++) for (const pid of children.get(queue[i]) || []) {
    if (seen.has(pid)) continue;
    seen.add(pid); found.push(pid); queue.push(pid);
  }
  return found;
}
function spawnAgent(command, args, cwd, extraEnv = {}) {
  const env = { ...process.env, ...command.env, ...extraEnv };
  // Le credenziali restano quelle della CLI scelta, senza ereditare chiavi di altri servizi.
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key];
  return spawn(command.file, [...command.prefix, ...args], { cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
}
module.exports = { spawnAgent, stopProcess, descendantPids };
