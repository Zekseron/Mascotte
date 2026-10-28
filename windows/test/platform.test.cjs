'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertRegularPath } = require('../lib/storage.cjs');
const { capabilities, dataDirectory } = require('../lib/platform.cjs');

test('percorsi sotto i link di sistema di macOS accettati', { skip: process.platform !== 'darwin' && 'link di sistema solo su macOS' }, () => {
  // /var e /tmp sono link di proprietà di root: devono essere ammessi.
  assert.ok(fs.lstatSync('/var').isSymbolicLink());
  assert.doesNotThrow(() => assertRegularPath('/var/folders/prova/dati.json'));
  assert.doesNotThrow(() => assertRegularPath(path.join(os.tmpdir(), 'prova', 'dati.json')));
});

test('link creato dall’utente rifiutato, anche in cartella temporanea', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte link '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const reale = path.join(base, 'reale'), link = path.join(base, 'link');
  fs.mkdirSync(reale); fs.symlinkSync(reale, link, 'dir');
  assert.throws(() => assertRegularPath(path.join(link, 'dati.json')), /link non consentito/);
});

test('link di root ignorato fuori da Windows ma sempre rifiutato su Windows', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte link '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const reale = path.join(base, 'reale'), link = path.join(base, 'link');
  fs.mkdirSync(reale); fs.symlinkSync(reale, link, 'dir');
  const comeRoot = p => { const s = fs.lstatSync(p); return { isSymbolicLink: () => s.isSymbolicLink(), uid: 0 }; };
  assert.doesNotThrow(() => assertRegularPath(path.join(link, 'dati.json'), { platform: 'darwin', lstat: comeRoot }));
  assert.throws(() => assertRegularPath(path.join(link, 'dati.json'), { platform: 'win32', lstat: comeRoot }), /link non consentito/);
});

test('capacità e cartella dati per piattaforma', () => {
  const win = capabilities('win32'), mac = capabilities('darwin', { macHelper: false });
  for (const k of ['windowAttach', 'managedOllama']) { assert.equal(win[k], true, k); assert.equal(mac[k], false, k); }
  assert.equal(win.management, true); assert.equal(mac.management, true); // passo 10: aggiornamenti anche su Mac
  assert.equal(win.packageName, 'Windows'); assert.equal(mac.packageName, 'Mac');
  assert.match(mac.gitGuide, /\/mac$/); assert.match(win.gitGuide, /\/windows$/); assert.equal(mac.nodeGuide, win.nodeGuide);
  assert.equal(win.localActions, true); assert.equal(mac.localActions, true); // passo 6: azioni locali anche su Mac
  assert.equal(win.watch, true); assert.equal(mac.watch, true); // passo 7: osservazione anche su Mac
  assert.equal(win.hooks, true); assert.equal(mac.hooks, true); // passo 8: hook anche su Mac
  assert.equal(capabilities('darwin', { macHelper: true }).windowAttach, true);
  assert.equal(capabilities('win32', { macHelper: false }).windowAttach, true);
  assert.equal(mac.barLabel, 'Aggancia al Dock'); assert.match(win.barLabel, /barra delle applicazioni/);
  assert.equal(mac.hideDock, true); assert.equal(win.hideDock, false);
  assert.match(mac.ollamaGuide, /\/mac$/); assert.match(win.ollamaGuide, /\/windows$/);
  const appData = '/Users/x/Library/Application Support';
  assert.equal(dataDirectory({ env: {}, platform: 'darwin', appData }), path.join(appData, 'Mascotte Electron'));
  assert.equal(dataDirectory({ env: { MASCOTTE_DATA_DIR: '/a' }, platform: 'darwin', appData }), '/a');
  assert.equal(dataDirectory({ env: { MASCOTTE_DATA_DIR: '/a', MASCOTTE_WINDOWS_DATA_DIR: '/b' }, platform: 'darwin', appData }), '/b');
  assert.equal(dataDirectory({ env: { LOCALAPPDATA: 'C:\\L' }, platform: 'win32' }), path.join('C:\\L', 'Mascotte'));
});

test('percorso dell’helper Mac: pacchetto se presente, altrimenti resources/mac', () => {
  const { macHelperPath } = require('../lib/platform.cjs');
  assert.equal(macHelperPath({ resourcesPath: '/App/Contents/Resources', exists: p => p === '/App/Contents/Resources/mascotte-window-helper' }), '/App/Contents/Resources/mascotte-window-helper');
  assert.equal(macHelperPath({ resourcesPath: '/App/Contents/Resources', exists: () => false }), path.join(__dirname, '..', 'resources', 'mac', 'mascotte-window-helper'));
  assert.equal(macHelperPath({ resourcesPath: undefined }), path.join(__dirname, '..', 'resources', 'mac', 'mascotte-window-helper'));
});

test('Mac: elenco finestre senza anteprime di Stage Manager e con il nome dell’app', () => {
  const { filterMacWindows } = require('../lib/capture.cjs');
  const sources = [{ id: 'window:331:0', name: 'Claude' }, { id: 'window:949:0', name: 'zsh' }, { id: 'window:754:0', name: 'Nuova scheda' }, { id: 'window:105:0', name: 'Nuova scheda' }, { id: 'window:9:0', name: 'Sconosciuta' }];
  const windows = [{ id: 331, owner: 'Claude', width: 1200, height: 800 }, { id: 949, owner: 'Terminale', width: 98, height: 112 },
    { id: 754, owner: 'Google Chrome', width: 1252, height: 870 }, { id: 105, owner: 'WindowManager', width: 1400, height: 900 }];
  assert.deepEqual(filterMacWindows(sources, windows), [{ id: 'window:331:0', name: 'Claude' }, { id: 'window:754:0', name: 'Google Chrome · Nuova scheda' }]);
});
