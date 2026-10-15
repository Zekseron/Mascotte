'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function assertRegularPath(target) {
  let current = path.resolve(target);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Percorso dati con link non consentito.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function prepareDirectory(directory) {
  assertRegularPath(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const who = execFileSync(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' });
    const sid = who.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
    if (!sid) throw new Error('Impossibile verificare l’utente Windows.');
    // Reset elimina ACL esplicite pregresse; rimuovi eredità e concedi solo all'utente.
    for (const args of [[directory, '/reset'], [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]]) {
      execFileSync(path.join(system, 'icacls.exe'), args, { windowsHide: true, stdio: 'pipe' });
    }
  } else fs.chmodSync(directory, 0o700);
}
function atomicJSON(file, value) {
  assertRegularPath(file);
  const temp = path.join(path.dirname(file), '.' + crypto.randomUUID());
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function readJSON(file, fallback, max = 1048576) {
  try {
    assertRegularPath(file);
    if (fs.statSync(file).size > max) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return fallback; }
}
class ChatStore {
  constructor(directory) { this.file = path.join(directory, 'history.json'); this.value = readJSON(this.file, {}); }
  get(engine) {
    const messages = this.value?.[engine];
    return Array.isArray(messages) ? messages.filter(m => ['user', 'assistant', 'notice'].includes(m.role) && typeof m.text === 'string').slice(-60).map(m => ({ role: m.role, text: m.text.slice(0, 8000) })) : [];
  }
  set(engine, messages) {
    this.value = { codex: this.get('codex'), claude: this.get('claude'), [engine]: messages.slice(-60).map(m => ({ role: m.role, text: m.text.slice(0, 8000) })) };
    while (Buffer.byteLength(JSON.stringify(this.value)) > 1048576) {
      const largest = this.value.codex.length >= this.value.claude.length ? 'codex' : 'claude';
      this.value[largest].shift();
    }
    atomicJSON(this.file, this.value);
  }
}
module.exports = { assertRegularPath, prepareDirectory, atomicJSON, readJSON, ChatStore };
