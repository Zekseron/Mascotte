'use strict';
// Entry point for Electron's bundled Node runtime; never load the GUI here.
const path = require('node:path');
const os = require('node:os');
const { notifyMain } = require('./notify.cjs');
const { dataDirectory } = require('./platform.cjs');

// Stessa cartella dati dell'app: Windows %LOCALAPPDATA%\\Mascotte, Mac «Application Support/Mascotte Electron».
const env = process.env;
const directory = env.MASCOTTE_WINDOWS_DATA_DIR || env.MASCOTTE_DATA_DIR ? dataDirectory({ env }) :
  process.platform === 'win32' ? (env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Mascotte')) :
  process.platform === 'darwin' ? dataDirectory({ env, platform: 'darwin', appData: path.join(os.homedir(), 'Library', 'Application Support') }) : null;
if (!directory) process.exit(0);
notifyMain(process.argv.slice(2), path.join(directory, 'events.json'))
  .catch(() => {})
  .finally(() => process.exit(0));
