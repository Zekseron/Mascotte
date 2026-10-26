'use strict';
// Entry point for Electron's bundled Node runtime; never load the GUI here.
const path = require('node:path');
const { notifyMain } = require('./notify.cjs');

const directory = process.env.MASCOTTE_WINDOWS_DATA_DIR ||
  (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Mascotte'));
if (!directory) process.exit(0);
notifyMain(process.argv.slice(2), path.join(directory, 'events.json'))
  .catch(() => {})
  .finally(() => process.exit(0));
