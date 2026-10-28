'use strict';
// build:mac — helper Swift, electron-builder (arm64, bundle id local.mascotte.desktop) e firma con l'identità locale.
// Gli argomenti extra (es. --config.directories.output=dist/mascotte-update-…) vanno a electron-builder e alla firma.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build } = require('./mac-helper.cjs');
const { signOutput, outputDirectory } = require('./mac-sign.cjs');

const extra = process.argv.slice(2);
if (!build() && process.platform === 'darwin') process.exit(1);
const builder = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-builder');
const result = spawnSync(builder, ['--mac', '--arm64', '--config.appId=local.mascotte.desktop', ...extra], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
if (result.error || result.status !== 0) { console.error(result.error?.message || 'electron-builder non riuscito.'); process.exit(result.status || 1); }
try { signOutput(outputDirectory(extra)); }
catch (error) { console.error(error.message); process.exit(1); }
