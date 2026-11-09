'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function valid(value) {
  return value && /^[a-f0-9]{40,64}$/.test(value.revision) && typeof value.modified === 'boolean'
    ? { revision: value.revision, modified: value.modified } : null;
}
// Git viene consultato solo preparando le risorse, mai nell'app distribuita.
function collect(root, run = execFileSync) {
  try {
    const options = { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 };
    const revision = run('git', ['rev-parse', 'HEAD'], options).trim();
    const modified = Boolean(run('git', ['status', '--porcelain', '--untracked-files=normal'], options).trim());
    return valid({ revision, modified });
  } catch { return null; }
}
function read(file) {
  try { return valid(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; }
}
module.exports = { collect, read };
