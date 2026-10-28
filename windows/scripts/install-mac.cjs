'use strict';
// install:mac — installa in /Applications/Mascotte.app lo ZIP appena compilato in dist/ (prima installazione o
// aggiornamento da terminale). Chiudi Mascotte e la vecchia app prima di lanciarlo. Sostituisce l'app con backup
// (la vecchia app Swift finisce in «Application Support/Mascotte Electron/backup») e riapre Mascotte.
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const { run } = require('./install-update.cjs');

const archive = path.join(__dirname, '..', 'dist', `Mascotte-Mac-${version}-arm64.zip`);
if (process.platform !== 'darwin') { console.error('install:mac funziona solo su macOS.'); process.exit(1); }
if (!fs.existsSync(archive)) { console.error(`ZIP non trovato: ${archive}\nCompilalo prima con: npm run build:mac`); process.exit(1); }
run(['--archive', archive, '--install-dir', '/Applications/Mascotte.app', '--restart']);
