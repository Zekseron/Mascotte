'use strict';
// Contratto STATICO dell'IPC: legge main.cjs come testo (senza avviare Electron) e confronta le azioni `action === '…'`
// del gestore ipcMain.handle('mascotte', …) con un elenco fisso, distinguendo quelle ammesse alla finestra mascotte
// (gruppo `mascotActions`), al fumetto (gruppo `bubbleActions`) e alla chat (gruppi in `CHAT_ACTIONS`). Non prova il comportamento delle azioni né il
// controllo reale del mittente: fallisce se un'azione viene aggiunta, tolta, rinominata o spostata di finestra senza
// aggiornare l'elenco qui sotto, se i gruppi non vengono provati nell'ordine in cui sono scritti (l'ordine decide quale
// `if` scatta per primo), se un gruppo non termina con `return NEXT;`, o se il controllo del mittente e il rifiuto finale
// cambiano numero o posizione.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Su Windows git può scrivere main.cjs con fine riga CRLF: si normalizza per i controlli riga per riga.
const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8').replace(/\r\n/g, '\n');

// Solo la finestra mascotte (gestore `if (kitty)`): nessuna azione è comune alle due finestre.
const MASCOT = ['init', 'mask', 'chat', 'menu', 'drag-start', 'drag-move', 'drag-end'];
// Solo la chat (gestore `if (chatting)`).
const CHAT = [
  'agent-mode', 'agent-workspace', 'agent-answer',
  'snapshot', 'local-scan', 'local-engine', 'local-model', 'local-download-cancel', 'local-managed-remove', 'local-download', 'local-check',
  'memory-add', 'memory-remove', 'open-request', 'pc-action-cancel', 'pc-action-confirm', 'cli-guide', 'release-update', 'character-select', 'character-scale',
  'character-colors', 'character-add', 'character-remove', 'folders-add', 'folders-remove', 'repo-select', 'update-run', 'watch-sources', 'watch-permission-settings',
  'watch-thumbnail', 'watch-enable', 'watch-disable', 'chat-hide', 'engine', 'reminder-remove', 'alarm-volume', 'alarm-sound-data', 'alarm-sound-remove', 'alarm-sound-choose',
  'alarm-stop', 'alarm-snooze', 'notice-style', 'notice-test', 'new', 'second-opinion-frame', 'stop', 'setup-preview', 'setup-apply', 'setup-dismiss', 'send'
];
// Solo il fumetto degli avvisi (gestore `bubbling`).
const BUBBLE = ['bubble-init', 'bubble-size', 'bubble-dismiss', 'bubble-open'];

const names = text => [...new Set([...text.matchAll(/action === '([^']+)'/g)].map(match => match[1]))];
const kittyStart = source.indexOf('  async function mascotActions(action, data) {');
const chatStart = source.indexOf('  async function chatAgentActions(action, data) {');
const groupsEnd = source.indexOf('  const MASCOT_ACTIONS = [mascotActions];');
const bubbleStart = source.indexOf('  async function bubbleActions(action, data) {');
const bubbleEnd = source.indexOf('  const BUBBLE_ACTIONS = [bubbleActions];');
const handlerStart = source.indexOf("ipcMain.handle('mascotte'");
const dispatch = source.indexOf('for (const group of kitty ? MASCOT_ACTIONS : bubbling ? BUBBLE_ACTIONS : CHAT_ACTIONS)', handlerStart);
const refusal = source.indexOf("throw new Error('Azione non valida.')", handlerStart);
const groupNames = [...source.slice(chatStart, groupsEnd).matchAll(/^  async function (\w+)\(action, data\) \{$/gm)].map(match => match[1]);

test('i marcatori del gestore IPC esistono nell\'ordine atteso', () => {
  assert.ok(kittyStart > 0 && chatStart > kittyStart && groupsEnd > chatStart && bubbleStart > groupsEnd && bubbleEnd > bubbleStart && handlerStart > bubbleEnd && dispatch > handlerStart && refusal > dispatch);
});

test('gruppi della chat provati nell\'ordine in cui sono scritti, ognuno chiuso da return NEXT', () => {
  const listed = source.slice(groupsEnd).match(/const CHAT_ACTIONS = \[([^\]]+)\];/)[1].split(',').map(name => name.trim());
  assert.deepEqual(listed, groupNames);
  assert.ok(groupNames.length >= 10);
  const bodies = source.slice(kittyStart, groupsEnd).split(/^  async function \w+\(action, data\) \{$/m).slice(1);
  assert.equal(bodies.length, groupNames.length + 1);
  for (const body of bodies) assert.match(body, /\n      return NEXT;\n  \}\n/);
});

test('azioni della finestra mascotte: elenco fisso', () => {
  assert.deepEqual(names(source.slice(kittyStart, chatStart)).sort(), [...MASCOT].sort());
});

test('azioni della chat: elenco fisso', () => {
  assert.deepEqual(names(source.slice(chatStart, groupsEnd)).sort(), [...CHAT].sort());
});

test('azioni del fumetto: elenco fisso, gruppo chiuso da return NEXT', () => {
  const body = source.slice(bubbleStart, bubbleEnd);
  assert.deepEqual(names(body).sort(), [...BUBBLE].sort());
  assert.match(body, /\n      return NEXT;\n  \}\n/);
});

test('61 azioni distinte e nessuna in comune tra le tre finestre', () => {
  const all = names(source.slice(kittyStart, groupsEnd) + source.slice(bubbleStart, bubbleEnd));
  assert.equal(all.length, 61);
  assert.equal(MASCOT.length + CHAT.length + BUBBLE.length, 61);
  assert.deepEqual(all.sort(), [...MASCOT, ...CHAT, ...BUBBLE].sort());
  assert.equal(MASCOT.filter(name => CHAT.includes(name) || BUBBLE.includes(name)).length, 0);
  assert.equal(CHAT.filter(name => BUBBLE.includes(name)).length, 0);
});

test('controllo del mittente e rifiuto finale: una sola volta ciascuno', () => {
  const count = text => source.split(text).length - 1;
  assert.equal(count("throw new Error('Interfaccia non autorizzata.')"), 1);
  assert.equal(count("throw new Error('Azione non valida.')"), 1);
  // Il controllo riguarda identità webContents, frame principale e URL esatto, e precede ogni azione.
  const check = source.slice(handlerStart, dispatch);
  assert.match(check, /event\.senderFrame !== event\.sender\.mainFrame/);
  assert.match(check, /event\.senderFrame\.url !== expected/);
  assert.match(check, /\(!kitty && !chatting && !bubbling\)/);
  // Le finestre distrutte (all'uscita) non vengono interrogate.
  assert.match(check, /const kitty = alive\(mascot\) && /);
  assert.match(check, /const chatting = alive\(chat\) && /);
  assert.match(check, /const bubbling = alive\(bubbleWindow\) && /);
  assert.match(check, /!win\.isDestroyed\(\)/);
});

test('B5: cambio di motore o modello rifiutato durante risposta, download o aggiornamento, prima dei loro gestori', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main.cjs'), 'utf8');
  const guard = source.indexOf("if ((action === 'local-engine' || action === 'local-model') && (localDownload || currentRun || updates.running)) return chatSnapshot();");
  assert.ok(guard > 0, 'guardia B5 presente');
  assert.ok(guard < source.indexOf("if (action === 'local-engine' && !localDownload"), 'prima del gestore del motore');
  assert.ok(guard < source.indexOf("if ((action === 'local-check' || action === 'local-model' || action === 'local-engine') && !localDownload)"), 'prima del ricontrollo del modello');
});
