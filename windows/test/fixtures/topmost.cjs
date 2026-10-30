'use strict';
const { app, BrowserWindow } = require('electron');
const { showMascot } = require('../../lib/mascot-window.cjs');
const fs = require('node:fs'), path = require('node:path');
app.setPath('userData', process.env.MASCOTTE_TOPMOST_TEST_PROFILE);
let mascot, cover;
app.whenReady().then(async () => {
  mascot = new BrowserWindow({ width: 100, height: 120, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false });
  mascot.setIgnoreMouseEvents(true, { forward: true });
  await mascot.loadURL('data:text/html,<title>Mascotte topmost fixture</title><body style="background:orange">Mascotte</body>');
  showMascot(mascot);
  cover = new BrowserWindow({ width: 180, height: 160, show: false });
  await cover.loadURL('data:text/html,<title>Mascotte cover fixture</title><body>Finestra normale</body>');
  cover.show(); cover.focus();
  console.log('ready');
  const restore = path.join(process.env.MASCOTTE_TOPMOST_TEST_PROFILE, 'restore');
  const timer = setInterval(() => {
    if (fs.existsSync(restore)) {
      clearInterval(timer);
      mascot.hide(); showMascot(mascot);
      mascot.setIgnoreMouseEvents(false); mascot.setIgnoreMouseEvents(true, { forward: true });
      cover.focus(); console.log('restored');
    }
  }, 50);
});
