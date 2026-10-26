'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function origin(size, edge, area, fraction = .8, anchor = {x:size.width/2,y:size.height}) {
  const x = edge.x + edge.width * Math.max(0, Math.min(1, fraction)) - anchor.x;
  return { x: Math.round(Math.min(Math.max(x, area.x), Math.max(area.x, area.x + area.width - size.width))),
    y: Math.round(Math.min(Math.max(edge.y - anchor.y, area.y), Math.max(area.y, area.y + area.height - anchor.y))) };
}

// Only the chosen HWND's geometry, PID and visibility leave this local helper.
class WindowFollower {
  constructor(onState, onError) {
    this.onState = onState; this.onError = onError; this.buffer = ''; this.closed = false; this.latest = null;
    const script = fs.readFileSync(path.join(__dirname, 'window-helper.ps1'), 'utf8');
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MASCOTTE_HOST_PID: String(process.pid) } });
    this.child.stdin.on('error', () => {});
    this.child.stderr.on('data', () => {});
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      if (this.buffer.length > 16384) { this.fail(); return; }
      let split;
      while ((split = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, split); this.buffer = this.buffer.slice(split + 1);
        try {
          const state = JSON.parse(line);
          if (!['visible','hidden','closed','unavailable'].includes(state.status)) throw new Error();
          if (state.status === 'visible' && (![state.x,state.y,state.width,state.height].every(Number.isFinite) || state.width <= 0 || state.height <= 0)) throw new Error();
          if (!this.closed) { this.latest = state; this.onState(state); }
        } catch { this.fail(); }
      }
    });
    this.child.on('error', () => this.fail());
    this.child.on('exit', () => { if (!this.closed) this.fail(); });
    this.startup = setTimeout(() => this.fail(), 10000);
    const callback = this.onState;
    this.onState = state => { clearTimeout(this.startup); callback(state); };
  }
  setHandlers(onState, onError) {
    this.onState = onState; this.onError = onError;
    if (this.latest && !this.closed) this.onState(this.latest);
  }
  pause(paused) { if (!this.closed) this.child.stdin.write(paused ? 'pause\n' : 'resume\n'); }
  fail() { if (this.closed) return; this.close(); this.onError(); }
  close() { this.closed = true; clearTimeout(this.startup); this.child.kill(); }
}
module.exports = { origin, WindowFollower };
