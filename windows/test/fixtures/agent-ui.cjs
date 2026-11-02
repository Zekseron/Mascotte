'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const output = path.resolve(__dirname, '../../../work/agent-ui'); fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 440, height: 680, show: false, webPreferences: { preload: path.join(__dirname, 'agent-ui-preload.cjs'), contextIsolation: true, sandbox: true } });
  const errors = []; window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  await window.loadFile(path.resolve(__dirname, '../../renderer/chat.html'));
  const results = [];
  for (const [width, height] of [[400, 600], [440, 680], [720, 820]]) {
    window.setContentSize(width, height); await new Promise(r => setTimeout(r, 200));
    const layout = await window.webContents.executeJavaScript(`({width:innerWidth, scroll:document.documentElement.scrollWidth, mode:document.getElementById('agent-mode').value, requests:document.querySelectorAll('.agent-request').length, composer:document.getElementById('composer').getBoundingClientRect().bottom <= innerHeight})`);
    if (layout.scroll > width || layout.mode !== 'agent' || layout.requests !== 1 || !layout.composer) throw new Error('Layout non valido: ' + JSON.stringify(layout));
    fs.writeFileSync(path.join(output, `${width}x${height}.png`), (await window.webContents.capturePage()).toPNG()); results.push(layout);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(results)); window.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
