'use strict';
// Osservazione di una finestra (lib/watch.cjs) con Electron e helper Mac finti.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWatch, PERMISSION_MESSAGES } = require('../lib/watch.cjs');

const SOURCES = [
  { id: 'window:101:0', name: 'Safari — Notizie' },
  { id: 'window:102:0', name: 'Mascotte' },          // la mascotte stessa
  { id: 'window:103:0', name: '   ' },               // senza titolo
  { id: 'screen:1:0', name: 'Schermo intero' },      // non è una finestra
  { id: 'window:104:0', name: 'x'.repeat(300) },     // titolo lungo
  { id: 'window:105:0', name: 'Anteprima Stage Manager' },
];

function setup({ platform = 'darwin', statuses = ['granted'], macWindows = undefined, getSourcesFails = false } = {}) {
  const calls = { getSources: [], stopped: 0, errors: [] };
  let status = 0;
  const watch = createWatch({
    platform, pid: 42, macHelperPath: '/helper',
    desktopCapturer: { getSources: async options => { calls.getSources.push(options); if (getSourcesFails) throw new Error('negato'); return SOURCES; } },
    systemPreferences: { getMediaAccessStatus: kind => { assert.equal(kind, 'screen'); return statuses[Math.min(status++, statuses.length - 1)]; } },
    Capture: {
      listMacWindows: async (helper, pid) => { assert.deepEqual([helper, pid], ['/helper', 42]); return macWindows; },
      filterMacWindows: (list, windows) => list.filter(item => windows.includes(item.id)),
    },
    ErrorLog: { error: (context, error) => calls.errors.push(`${context}: ${error.message}`) },
    ownWindows: () => [{ getMediaSourceId: () => 'window:102:1' }, null],
    onStop: () => { calls.stopped++; },
  });
  return { watch, calls };
}

test('Windows: nessun permesso richiesto, elenco senza finestre di Mascotte, senza titolo o non finestre', async () => {
  const { watch, calls } = setup({ platform: 'win32', statuses: ['denied'] });
  assert.equal(watch.permission(), 'granted');
  const list = await watch.windowsWithPermission();
  assert.deepEqual(list.map(item => item.id), ['window:101:0', 'window:104:0', 'window:105:0']);
  assert.equal(list[1].name.length, 160, 'titolo tagliato a 160 caratteri');
  assert.deepEqual(calls.getSources[0], { types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
});

test('Mac: l\'helper toglie le finestre di servizio; senza helper resta l\'elenco completo', async () => {
  const filtered = await setup({ macWindows: ['window:101:0'] }).watch.windows();
  assert.deepEqual(filtered.map(item => item.id), ['window:101:0']);
  const full = await setup({ macWindows: null }).watch.windows();
  assert.equal(full.length, 3);
});

test('Mac, prima richiesta: si interroga il sistema per far comparire la domanda, poi si ricontrolla', async () => {
  const { watch, calls } = setup({ statuses: ['not-determined', 'granted'], macWindows: null });
  const list = await watch.windowsWithPermission();
  assert.equal(calls.getSources.length, 2, 'una volta per la domanda di macOS, una per l\'elenco');
  assert.ok(Array.isArray(list));
});

test('Mac, prima richiesta rifiutata o in errore: messaggio con le istruzioni, errore nel registro', async () => {
  const { watch, calls } = setup({ statuses: ['not-determined', 'denied'], getSourcesFails: true });
  assert.deepEqual(await watch.windowsWithPermission(), { permission: 'denied', message: PERMISSION_MESSAGES.missing });
  assert.deepEqual(calls.errors, ['richiesta permesso registrazione schermo: negato']);
});

test('Mac, permesso bloccato da un profilo: messaggio dedicato e nessuna lettura delle finestre', async () => {
  const { watch, calls } = setup({ statuses: ['restricted'] });
  assert.deepEqual(await watch.windowsWithPermission(), { permission: 'restricted', message: PERMISSION_MESSAGES.restricted });
  assert.equal(calls.getSources.length, 0);
});

test('finestra scelta e interruzione', () => {
  const { watch, calls } = setup();
  assert.equal(watch.source, null);
  watch.select({ id: 'window:101:0', name: 'Safari — Notizie' });
  assert.equal(watch.source.name, 'Safari — Notizie');
  watch.stop();
  assert.equal(watch.source, null);
  assert.equal(calls.stopped, 1);
});
