'use strict';
// Compila l'helper Swift dell'aggancio finestre (solo su macOS). Rifà la compilazione solo se il sorgente è cambiato.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const source = path.join(__dirname, '..', 'lib', 'mac', 'window-helper.swift');
const output = path.join(__dirname, '..', 'resources', 'mac', 'mascotte-window-helper');
function build({ platform = process.platform, log = console.log } = {}) {
  if (platform !== 'darwin') return false;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const stamp = output + '.sha256';
  if (fs.existsSync(output) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash) return true;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try { execFileSync('swiftc', ['-O', source, '-o', output], { stdio: ['ignore', 'inherit', 'inherit'] }); }
  catch { log('Helper finestre Mac non compilato (serve swiftc): l’aggancio alla finestra resterà disattivato.'); fs.rmSync(output, { force: true }); fs.rmSync(stamp, { force: true }); return false; }
  fs.writeFileSync(stamp, hash); log('Helper finestre Mac compilato.'); return true;
}
module.exports = { build, source, output };
if (require.main === module) { if (!build() && process.platform === 'darwin' && process.argv.includes('--required')) process.exit(1); }
