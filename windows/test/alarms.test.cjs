'use strict';
// Comportamento di promemoria e sveglie quando scadono (lib/alarms.cjs), con notifiche, timer e chat finti.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlarms, ALARM_RING, SNOOZE } = require('../lib/alarms.cjs');

const NOW = new Date(2026, 10, 18, 15, 0).getTime();

function setup({ supported = true, throws = false, addFails = false } = {}) {
  const log = { notifications: [], notices: [], chat: 0, broadcast: 0, waiting: 0, errors: [], added: [] };
  const timers = new Map(); let nextTimer = 1, clock = NOW;
  class Notification {
    static isSupported() { return supported; }
    constructor(options) { this.options = options; }
    show() { if (throws) throw new Error('notifiche bloccate'); log.notifications.push(this.options); }
  }
  const store = { add(item) { if (addFails) throw new Error('Ci sono già troppi promemoria.'); const saved = { id: 'n' + log.added.length, ...item }; log.added.push(saved); return saved; } };
  const alarms = createAlarms({
    store, Notification,
    notify: (text, { info }) => log.notices.push({ text, info }),
    showChat: () => { log.chat++; }, broadcast: () => { log.broadcast++; }, setWaiting: () => { log.waiting++; },
    ErrorLog: { error: (context, error) => log.errors.push(`${context}: ${error.message}`) },
    now: () => clock,
    setTimer: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id),
  });
  const runTimers = () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } };
  return { alarms, log, timers, runTimers, advance: ms => { clock += ms; } };
}

test('promemoria puntuale: solo la notifica di sistema, nessuna sveglia', () => {
  const { alarms, log, timers } = setup();
  alarms.fire({ id: 'a', text: 'Chiamare Marco', when: NOW, alarm: false });
  assert.deepEqual(log.notifications, [{ title: 'Mascotte · promemoria', body: 'Chiamare Marco', silent: false }]);
  assert.deepEqual([log.notices.length, log.chat, timers.size, alarms.active], [0, 0, 0, null]);
});

test('promemoria in ritardo: il testo ricorda l\'orario previsto', () => {
  const { alarms, log, advance } = setup();
  advance(2 * 60 * 1000);
  alarms.fire({ id: 'a', text: 'Pausa', when: NOW, alarm: false });
  assert.match(log.notifications[0].body, /^Pausa \(era per .+\)$/);
});

test('notifica impossibile: il promemoria ricade sull\'avviso in chat e l\'errore va nel registro', () => {
  const { alarms, log } = setup({ throws: true });
  alarms.fire({ id: 'a', text: 'Bere', when: NOW, alarm: false });
  assert.deepEqual(log.notices, [{ text: '⏰ Bere', info: true }]);
  assert.deepEqual([log.chat, log.broadcast], [1, 1]);
  assert.deepEqual(log.errors, ['notifica del promemoria non mostrata: notifiche bloccate']);
});

test('sveglia: suona, mette la mascotte in attesa e si spegne da sola dopo 3 minuti', () => {
  const { alarms, log, timers, runTimers } = setup();
  alarms.fire({ id: 's', text: 'Uscire', when: NOW, alarm: true });
  assert.equal(log.notifications[0].title, 'Mascotte · sveglia');
  assert.deepEqual(alarms.active, { id: 's', text: 'Uscire', when: NOW });
  assert.deepEqual([log.waiting, log.chat, timers.size, [...timers.values()][0].ms], [1, 1, 1, ALARM_RING]);
  runTimers();
  assert.equal(alarms.active, null);
  assert.deepEqual(log.notices.at(-1), { text: 'La sveglia «Uscire» si è spenta da sola dopo 3 minuti.', info: false });
});

test('sveglia senza notifiche di sistema: suona comunque, senza avviso di ripiego', () => {
  const { alarms, log } = setup({ supported: false });
  alarms.fire({ id: 's', text: 'Forno', when: NOW, alarm: true });
  assert.ok(alarms.active);
  assert.equal(log.notices.length, 0);
});

test('sveglia scaduta da oltre 10 minuti: notifica sì, suono no', () => {
  const { alarms, log, timers, advance } = setup();
  advance(11 * 60 * 1000);
  alarms.fire({ id: 's', text: 'Vecchia', when: NOW, alarm: true });
  assert.equal(log.notifications.length, 1);
  assert.deepEqual([alarms.active, timers.size, log.waiting], [null, 0, 0]);
});

test('una nuova sveglia sostituisce quella che suona', () => {
  const { alarms, timers } = setup();
  alarms.fire({ id: 'uno', text: 'Prima', when: NOW, alarm: true });
  alarms.fire({ id: 'due', text: 'Seconda', when: NOW, alarm: true });
  assert.equal(alarms.active.id, 'due');
  assert.equal(timers.size, 1, 'il timer della prima è annullato');
});

test('rimanda: aggiunge una sveglia fra 5 minuti e ferma quella attuale', () => {
  const { alarms, log, timers } = setup();
  alarms.fire({ id: 's', text: 'Uscire', when: NOW, alarm: true });
  const result = alarms.snooze();
  assert.deepEqual(log.added, [{ id: 'n0', when: NOW + SNOOZE, text: 'Uscire', alarm: true }]);
  assert.equal(result.item.when, NOW + SNOOZE);
  assert.deepEqual([alarms.active, timers.size], [null, 0]);
});

test('rimanda con l\'elenco pieno: errore e la sveglia continua a suonare', () => {
  const { alarms, timers } = setup({ addFails: true });
  alarms.fire({ id: 's', text: 'Uscire', when: NOW, alarm: true });
  const result = alarms.snooze();
  assert.equal(result.error, 'Ci sono già troppi promemoria.');
  assert.equal(alarms.active.id, 's');
  assert.equal(timers.size, 1);
});

test('rimanda senza sveglia attiva: errore, nessuna aggiunta', () => {
  const { alarms, log } = setup();
  assert.ok(alarms.snooze().error);
  assert.equal(log.added.length, 0);
});

test('promemoria non mostrato: avviso col testo; un errore di chat finisce nel registro', () => {
  const log = [], errors = [];
  const original = console.error; console.error = () => {};
  try {
    const alarms = createAlarms({
      store: {}, Notification: class {}, notify: text => log.push(text),
      showChat: () => { throw new Error('finestra chiusa'); }, broadcast: () => {}, setWaiting: () => {},
      ErrorLog: { error: (context, error) => errors.push(`${context}: ${error.message}`) },
    });
    alarms.failed({ text: 'Pagare', when: NOW, alarm: false }, new Error('disco pieno'));
    alarms.failed(null, new Error('file illeggibile'));
  } finally { console.error = original; }
  assert.match(log[0], /^Non sono riuscito a mostrare il promemoria «Pagare» \(era per .+\): disco pieno\.$/);
  assert.equal(log[1], 'Non riesco a controllare i promemoria: file illeggibile.');
  assert.deepEqual(errors, ['chat non aperta per un promemoria fallito: finestra chiusa', 'chat non aperta per un promemoria fallito: finestra chiusa']);
});
