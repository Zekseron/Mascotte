'use strict';
// B7: un invio rifiutato da main.cjs deve lasciare un avviso, perché la chat ripristina la bozza solo se lo snapshot ha un `notice`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sendRefusal } = require('../lib/send-guard.cjs');

const idle = { localDownload: null, currentRun: null, updateRunning: false };

test('invio ammesso: nessun rifiuto', () => {
  assert.equal(sendRefusal('ciao', idle), null);
  assert.equal(sendRefusal('x'.repeat(8000), idle), null);
  assert.equal(sendRefusal('è'.repeat(8000), idle), null); // 16000 byte, sotto il limite
});

test('rifiuti per stato occupato: sempre con un avviso che spiega il motivo', () => {
  for (const state of [{ ...idle, localDownload: {} }, { ...idle, currentRun: {} }, { ...idle, updateRunning: true }]) {
    const refusal = sendRefusal('ciao', state);
    assert.equal(typeof refusal, 'string'); assert.ok(refusal.length > 10, JSON.stringify(state));
  }
  assert.match(sendRefusal('ciao', { ...idle, localDownload: {} }), /[Dd]ownload/);
  assert.match(sendRefusal('ciao', { ...idle, currentRun: {} }), /risposta/);
  assert.match(sendRefusal('ciao', { ...idle, updateRunning: true }), /[Aa]ggiornamento/);
});

test('rifiuti per testo: troppo lungo e non valido con avviso, vuoto senza avviso (nulla da perdere)', () => {
  assert.match(sendRefusal('x'.repeat(8001), idle), /troppo lungo/);
  assert.equal(sendRefusal('😀'.repeat(4000), idle), null); // 8000 unità UTF-16, 16000 byte: ammesso
  assert.match(sendRefusal('😀'.repeat(4001), idle), /troppo lungo/);
  assert.match(sendRefusal(undefined, idle), /non è valido/);
  assert.match(sendRefusal(42, idle), /non è valido/);
  assert.equal(sendRefusal('   ', idle), '');
  assert.equal(sendRefusal('', idle), '');
});

test('regressione B7 in main.cjs: l\'invio rifiutato imposta il notice prima di tornare', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  const handler = source.slice(source.indexOf("if (action === 'send') {"), source.indexOf('if (pendingAction) { notice'));
  assert.match(handler, /sendRefusal\(text, \{ localDownload, currentRun, updateRunning \}\)/);
  assert.match(handler, /notice = refusal; broadcast\(\)/);
  assert.doesNotMatch(handler, /\|\| text\.length > 8000/, 'il controllo di lunghezza è ora in sendRefusal');
});
