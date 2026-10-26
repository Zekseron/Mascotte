const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const buildDirectory = path.join(__dirname, '..', 'dist', 'win-unpacked');

if (!fs.existsSync(path.join(buildDirectory, 'Mascotte.exe'))) {
  throw new Error(`Build Windows non trovato: ${buildDirectory}`);
}

fs.cpSync(buildDirectory, repositoryRoot, { recursive: true, force: true });
console.log(`Mascotte.exe e i file necessari sono stati copiati in ${repositoryRoot}`);
