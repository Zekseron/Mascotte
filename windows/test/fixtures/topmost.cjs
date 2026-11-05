'use strict';
const { app, BrowserWindow } = require('electron');
const { showMascot, keepAboveTaskbar } = require('../../lib/mascot-window.cjs');
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
  let restored = false;
  const timer = setInterval(() => {
    if (!restored && fs.existsSync(restore)) {
      restored = true;
      mascot.hide(); showMascot(mascot);
      mascot.setIgnoreMouseEvents(false); mascot.setIgnoreMouseEvents(true, { forward: true });
      cover.focus(); console.log('restored');
    }
    if (restored && fs.existsSync(path.join(process.env.MASCOTTE_TOPMOST_TEST_PROFILE, 'cover'))) {
      fs.unlinkSync(path.join(process.env.MASCOTTE_TOPMOST_TEST_PROFILE, 'cover'));
      cover.setAlwaysOnTop(true); cover.moveTop(); cover.focus(); console.log('covered');
    }
    if (fs.existsSync(path.join(process.env.MASCOTTE_TOPMOST_TEST_PROFILE, 'reassert'))) {
      clearInterval(timer); keepAboveTaskbar(mascot);
      if (!cover.isFocused()) throw new Error('La mascotte ha sottratto il focus');
      console.log('reasserted');
    }
  }, 50);
});
