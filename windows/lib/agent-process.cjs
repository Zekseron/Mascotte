'use strict';
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
}
function spawnAgent(command, args, cwd, extraEnv = {}) {
  const env = { ...process.env, ...command.env, ...extraEnv };
  // Le credenziali restano quelle della CLI scelta, senza ereditare chiavi di altri servizi.
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key];
  return spawn(command.file, [...command.prefix, ...args], { cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
}
module.exports = { spawnAgent, stopProcess };
