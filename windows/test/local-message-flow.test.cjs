'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
// Esegue il ramo reale dei comandi con dipendenze simulate, senza Electron o modelli.
const start = source.indexOf('        let folderRead = null;');
const end = source.indexOf('        let image = null, imagePath = null', start);
assert.ok(start > 0 && end > start);
function run(text, imageData = null, question = null) {
  const messages = [], events = [];
  const context = { text, imageData, engine: 'locale', notice: '', pendingAction: null,
    store: { get: () => [], set: (_engine, items) => messages.push(...items) },
    broadcast: () => {}, chatSnapshot: () => ({ replied: true }),
    Reminders: require('../lib/reminders.cjs'), reminders: { list: () => [] },
    LocalCommands: { parseLocalCommand: () => question && ({ type: 'folder', folder: { display: 'Prova' }, question }) },
    FolderView: { readFolder: () => { events.push('read'); return {}; }, notice: () => 'Elenco locale', answer: () => 'Due PDF', modelContext: () => 'Dati di prova' },
    can: { localActions: true }, settings: {}, dataDirectory: 'fixture', memory: { list: () => [] }, randomUUID: () => 'proposta' };
  const result = vm.runInNewContext(`(() => { ${source.slice(start, end)}; return { folderRead, delegated: true }; })()`, context);
  return { result, messages, events, pending: context.pendingAction };
}
test('A0: risposta operativa e proposta restano distinte dalla generazione IA', () => {
  const list = run('che promemoria ho?');
  assert.equal(list.result.replied, true); assert.match(list.messages[1].text, /Non hai promemoria/);
  assert.equal(list.messages[1].kind, 'app');
  const proposal = run('ricordami tra 20 minuti di studiare');
  assert.equal(proposal.pending.kind, 'reminder'); assert.match(proposal.messages[1].text, /Posso impostarlo/);
  assert.equal(proposal.messages[1].kind, 'app');
  assert.equal(run('spiegami le VLAN').result.delegated, true);
});
test('A0: cartella diretta risponde dall’app, domanda interpretativa prosegue verso il modello', () => {
  const direct = run('quanti pdf?', null, { kind: 'count' });
  assert.equal(direct.result.replied, true); assert.match(direct.messages[1].text, /Due PDF/);
  const model = run('riassumi la cartella', null, { kind: 'model' });
  assert.equal(model.messages.length, 0); assert.equal(model.result.folderRead.context, 'Dati di prova');
});
test('B-OBS caratterizzato: con immagine il comando va al modello, senza immagine all’app', () => {
  assert.equal(run('che promemoria ho?').result.replied, true);
  const observed = run('che promemoria ho?', 'data:image/jpeg;base64,fixture');
  assert.equal(observed.result.delegated, true); assert.equal(observed.messages.length, 0);
});
