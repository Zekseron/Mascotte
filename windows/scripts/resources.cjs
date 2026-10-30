'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dest = path.join(root, 'windows/resources');
fs.mkdirSync(dest, { recursive: true });
for (const name of ['characters', 'spec']) {
  fs.rmSync(path.join(dest, name), { recursive: true, force: true });
  fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true });
}
fs.copyFileSync(path.join(root, 'viewer/pack.js'), path.join(dest, 'pack.js'));
require('./mac-helper.cjs').build(); // solo su macOS: compila l'helper dell'aggancio finestre
console.log('Personaggi, spec e parser copiati dalla fonte comune.');
