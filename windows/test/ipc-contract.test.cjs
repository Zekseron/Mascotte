'use strict';
// Contratto STATICO dell'IPC: legge main.cjs come testo (senza avviare Electron) e confronta le azioni `action === '…'`
// del gestore ipcMain.handle('mascotte', …) con un elenco fisso, distinguendo quelle ammesse alla finestra mascotte
// (`if (kitty) {…}`) da quelle della chat (`if (chatting) {…}`). Non prova il comportamento delle azioni né il controllo
// reale del mittente: fallisce solo se un'azione viene aggiunta, tolta, rinominata o spostata di finestra senza aggiornare
// l'elenco qui sotto, o se il controllo del mittente e il rifiuto finale cambiano numero.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

// Solo la finestra mascotte (gestore `if (kitty)`): nessuna azione è comune alle due finestre.
const MASCOT = ['init', 'mask', 'chat', 'menu', 'drag-start', 'drag-move', 'drag-end'];
// Solo la chat (gestore `if (chatting)`).
const CHAT = [
  'snapshot', 'local-scan', 'local-engine', 'local-model', 'local-download-cancel', 'local-managed-remove', 'local-download', 'local-check',
  'memory-add', 'memory-remove', 'pc-action-cancel', 'pc-action-confirm', 'cli-guide', 'release-update', 'character-select', 'character-scale',
  'character-add', 'character-remove', 'folders-add', 'folders-remove', 'repo-select', 'update-run', 'watch-sources', 'watch-permission-settings',
  'watch-enable', 'watch-disable', 'engine', 'reminder-remove', 'alarm-volume', 'alarm-sound-data', 'alarm-sound-remove', 'alarm-sound-choose',
  'alarm-stop', 'alarm-snooze', 'new', 'second-opinion-frame', 'stop', 'setup-preview', 'setup-apply', 'setup-dismiss', 'send'
];

const names = text => [...new Set([...text.matchAll(/action === '([^']+)'/g)].map(match => match[1]))];
const handlerStart = source.indexOf("ipcMain.handle('mascotte'");
const kittyStart = source.indexOf('if (kitty) {', handlerStart), chatStart = source.indexOf('if (chatting) {', handlerStart);
const refusal = source.indexOf("throw new Error('Azione non valida.')", handlerStart);

test('i marcatori del gestore IPC esistono nell\'ordine atteso', () => {
  assert.ok(handlerStart > 0 && kittyStart > handlerStart && chatStart > kittyStart && refusal > chatStart);
});

test('azioni della finestra mascotte: elenco fisso', () => {
  assert.deepEqual(names(source.slice(kittyStart, chatStart)).sort(), [...MASCOT].sort());
});

test('azioni della chat: elenco fisso', () => {
  assert.deepEqual(names(source.slice(chatStart, refusal)).sort(), [...CHAT].sort());
});

test('48 azioni distinte e nessuna in comune tra le due finestre', () => {
  const all = names(source.slice(handlerStart));
  assert.equal(all.length, 48);
  assert.equal(MASCOT.length + CHAT.length, 48);
  assert.deepEqual(all.sort(), [...MASCOT, ...CHAT].sort());
  assert.equal(MASCOT.filter(name => CHAT.includes(name)).length, 0);
});

test('controllo del mittente e rifiuto finale: una sola volta ciascuno', () => {
  const count = text => source.split(text).length - 1;
  assert.equal(count("throw new Error('Interfaccia non autorizzata.')"), 1);
  assert.equal(count("throw new Error('Azione non valida.')"), 1);
  // Il controllo riguarda identità webContents, frame principale e URL esatto, e precede ogni azione.
  const check = source.slice(handlerStart, kittyStart);
  assert.match(check, /event\.senderFrame !== event\.sender\.mainFrame/);
  assert.match(check, /event\.senderFrame\.url !== expected/);
  assert.match(check, /\(!kitty && !chatting\)/);
});
