'use strict';
// Diagnostica (lib/diagnostics.cjs): dai fatti raccolti agli esiti, resoconto senza dati personali; ripiego quando una
// notifica di sistema fallisce (lib/bubble.cjs, createNoticeRouter con onFailed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, report, MAC_SETTINGS, GUIDE } = require('../lib/diagnostics.cjs');
const { createBubbleQueue, createNoticeRouter } = require('../lib/bubble.cjs');

const GOOD = { signatureTrusted: true, notificationTest: 'ok', lastNotificationFailure: false, notices: 'fumetto', mascotVisible: true, agentNotices: false,
  screenAccess: 'granted', hooks: 'active', cli: { claude: { found: true, login: true }, codex: { found: true, login: true } }, localAvailable: true, eventServer: true, inApplications: true };
const byId = results => Object.fromEntries(results.map(r => [r.id, r]));

test('Mac con tutto a posto: tutti ok, con link alla guida', () => {
  const results = evaluate(GOOD, { platform: 'darwin' });
  assert.deepEqual(results.map(r => r.id), ['firma', 'notifiche', 'fumetto', 'registrazione-schermo', 'hook', 'claude', 'codex', 'ia-locale', 'eventi', 'posizione']);
  assert.ok(results.every(r => r.stato === 'ok'), JSON.stringify(results.filter(r => r.stato !== 'ok')));
  assert.ok(results.every(r => r.help.startsWith(GUIDE + '#')));
});

test('caso della collega: Mac che non si fida della firma, notifiche di sistema che falliscono', () => {
  const r = byId(evaluate({ ...GOOD, signatureTrusted: false, notificationTest: 'failed', lastNotificationFailure: true }, { platform: 'darwin' }));
  assert.equal(r.firma.stato, 'problema');
  assert.match(r.firma.testo, /non si fida della firma.*causa più probabile/);
  // Firma non attendibile ma notifiche già permesse (provato su Mac il 25 novembre con una copia firmata ad hoc): solo avviso.
  assert.equal(byId(evaluate({ ...GOOD, signatureTrusted: false }, { platform: 'darwin' })).firma.stato, 'avviso');
  assert.equal(r.notifiche.stato, 'avviso', 'con il fumetto e la mascotte visibile gli avvisi arrivano comunque');
  assert.equal(r.notifiche.settings, 'notifiche');
  const hidden = byId(evaluate({ ...GOOD, signatureTrusted: false, notificationTest: 'failed', mascotVisible: false }, { platform: 'darwin' }));
  assert.equal(hidden.notifiche.stato, 'problema');
  assert.equal(hidden.fumetto.stato, 'avviso');
});

test('app avviata dai sorgenti: firma e posizione non si controllano', () => {
  const r = byId(evaluate({ ...GOOD, signatureTrusted: null, inApplications: null }, { platform: 'darwin' }));
  assert.equal(r.firma.stato, 'info');
  assert.equal(r.posizione, undefined);
});

test('hook: spostati = problema; mancanti = info, ma avviso se gli avvisi degli agenti sono accesi', () => {
  assert.equal(byId(evaluate({ ...GOOD, hooks: 'moved' })).hook.stato, 'problema');
  assert.equal(byId(evaluate({ ...GOOD, hooks: 'none' })).hook.stato, 'info');
  assert.equal(byId(evaluate({ ...GOOD, hooks: 'none', agentNotices: true })).hook.stato, 'avviso');
});

test('CLI: assente = info, senza accesso = avviso, controllo non riuscito = info', () => {
  const r = byId(evaluate({ ...GOOD, cli: { claude: { found: false }, codex: { found: true, login: false } } }));
  assert.deepEqual([r.claude.stato, r.codex.stato], ['info', 'avviso']);
  assert.equal(byId(evaluate({ ...GOOD, cli: { claude: { found: true, login: null } } })).claude.stato, 'info');
});

test('Windows: niente controlli solo Mac, nessuna pagina di Impostazioni di Sistema', () => {
  const results = evaluate(GOOD, { platform: 'win32' });
  assert.deepEqual(results.map(r => r.id), ['notifiche', 'fumetto', 'hook', 'claude', 'codex', 'ia-locale', 'eventi']);
  assert.ok(results.every(r => r.settings === null));
});

test('server degli eventi spento, registrazione schermo negata, app fuori da Applicazioni', () => {
  const r = byId(evaluate({ ...GOOD, eventServer: false, screenAccess: 'denied', inApplications: false }, { platform: 'darwin' }));
  assert.deepEqual([r.eventi.stato, r['registrazione-schermo'].stato, r.posizione.stato], ['problema', 'avviso', 'avviso']);
});

test('fatti mancanti o un controllo che lancia: nessun crash', () => {
  assert.doesNotThrow(() => evaluate({}, { platform: 'darwin' }));
  assert.doesNotThrow(() => evaluate(null, { platform: 'win32' }));
});

test('resoconto: solo esiti, versione e sistema', () => {
  const text = report(evaluate({ ...GOOD, signatureTrusted: false, notificationTest: 'failed' }, { platform: 'darwin' }), { version: '0.11.0', platform: 'darwin', osVersion: '27.2' });
  assert.match(text, /^Mascotte 0\.11\.0 · macOS 27\.2\n/);
  assert.match(text, /❌ Firma dell’app: /);
  assert.doesNotMatch(text, /\/Users\/|\/Applications\/|@/);
});

test('pagine di Impostazioni di Sistema: solo indirizzi fissi di Apple', () => {
  for (const url of Object.values(MAC_SETTINGS)) assert.match(url, /^x-apple\.systempreferences:com\.apple\./);
});

function router({ mode = 'sistema', ready = false } = {}) {
  const failures = [], shown = [];
  class Notification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; return this; }
    show() { shown.push(this); }
  }
  const queue = createBubbleQueue({ setTimer: () => 0, clearTimer: () => {} });
  const Routed = createNoticeRouter({ Notification, mode: () => mode, bubbleReady: () => ready, queue, onFailed: info => failures.push(info) });
  return { Routed, failures, shown, queue };
}

test('notifica di sistema che fallisce: onFailed riceve titolo, testo e errore (prima si perdeva in silenzio)', () => {
  const { Routed, failures, shown } = router();
  assert.equal(new Routed({ title: 'Mascotte · promemoria', body: 'Bere', silent: false }).show(), 'sistema');
  shown[0].handlers.failed({}, 'Notifications are not allowed for this application');
  assert.deepEqual(failures, [{ title: 'Mascotte · promemoria', body: 'Bere', silent: false, alarm: false, error: 'Notifications are not allowed for this application' }]);
});

test('sveglia via sistema che fallisce: onFailed lo segnala come sveglia (la chat la gestisce già)', () => {
  const { Routed, failures, shown } = router();
  new Routed({ title: 'Mascotte · sveglia', body: 'Uscire', silent: false, alarm: true }).show();
  assert.equal('alarm' in shown[0].options, false, 'l\'opzione alarm non arriva al sistema');
  shown[0].handlers.failed({}, '');
  assert.equal(failures[0].alarm, true);
});
