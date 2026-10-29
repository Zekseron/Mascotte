'use strict';
// B1: le scadenze si elaborano solo dopo che controllo degli stati, finestre e tray esistono. Qui: il pianificatore con
// dipendenze controllate e dati temporanei veri (ReminderStore), più un controllo statico dell'ordine in main.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ReminderStore } = require('../lib/reminders.cjs');
const { createScheduler, MAX_WAIT, MIN_WAIT } = require('../lib/reminder-scheduler.cjs');

const NOW = 1_000_000_000_000;
function setup(initial, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-sched-'));
  const file = path.join(directory, 'reminders.json');
  fs.writeFileSync(file, JSON.stringify(initial));
  const store = new ReminderStore(file);
  const timers = [], cleared = [], fired = [], errors = [];
  let clock = NOW;
  const scheduler = createScheduler({
    store, now: () => clock,
    fire: overrides.fire || (item => { fired.push(item.id); }),
    onError: (item, error) => errors.push([item?.id ?? null, error.message]),
    setTimer: (callback, delay) => { const timer = { callback, delay, id: timers.length }; timers.push(timer); return timer; },
    clearTimer: timer => { cleared.push(timer?.id); }
  });
  return { scheduler, store, file, timers, cleared, fired, errors, advance: ms => { clock += ms; }, saved: () => JSON.parse(fs.readFileSync(file, 'utf8')), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
const item = (id, offset, alarm = true) => ({ id, when: NOW + offset, text: 'x' + id, alarm });

test('nessun timer e nessuna scadenza elaborata prima di start()', () => {
  const t = setup([item('a', -60000)]);
  t.scheduler.reschedule();
  assert.equal(t.timers.length, 0); assert.equal(t.fired.length, 0);
  assert.equal(t.saved().length, 1, 'la sveglia resta nel file finché il pianificatore non è avviato');
  t.cleanup();
});

test('scadenza ad avvio avvenuto: fire una volta, elemento tolto, prossimo timer', () => {
  const t = setup([item('a', -60000), item('b', 30000, false)]);
  t.scheduler.start();
  assert.deepEqual(t.fired, ['a']);
  assert.deepEqual(t.saved().map(entry => entry.id), ['b']);
  assert.equal(t.timers.length, 1); assert.equal(t.timers[0].delay, 30000);
  t.cleanup();
});

test('timer al massimo un\'ora e al minimo un secondo', () => {
  const far = setup([item('a', 5 * 24 * 3600000)]);
  far.scheduler.start(); assert.equal(far.timers[0].delay, MAX_WAIT); assert.equal(MAX_WAIT, 3600000);
  const near = setup([item('a', 10)]);
  near.scheduler.start(); assert.equal(near.timers[0].delay, MIN_WAIT); assert.equal(MIN_WAIT, 1000);
  const empty = setup([]);
  empty.scheduler.start(); assert.equal(empty.timers.length, 0);
  for (const t of [far, near, empty]) t.cleanup();
});

test('fire che lancia: gli altri elementi partono lo stesso, start non lancia, l\'errore è segnalato con l\'elemento', () => {
  const calls = [];
  const t = setup([item('a', -5000), item('b', -4000), item('c', -3000), item('d', 60000)], { fire: element => { calls.push(element.id); if (element.id === 'b') throw new Error('notifica non supportata'); } });
  assert.doesNotThrow(() => t.scheduler.start());
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.deepEqual(t.errors, [['b', 'notifica non supportata']]);
  assert.deepEqual(t.saved().map(entry => entry.id), ['d'], 'gli elementi scaduti sono stati presi anche se uno è fallito');
  assert.equal(t.timers.length, 1, 'il timer del prossimo promemoria è comunque armato');
  t.cleanup();
});

test('errore del salvataggio durante takeDue: segnalato, start non lancia, si riprova più tardi', () => {
  const t = setup([item('a', -1000)]);
  t.store.takeDue = () => { throw new Error('disco pieno'); };
  assert.doesNotThrow(() => t.scheduler.start());
  assert.deepEqual(t.errors, [[null, 'disco pieno']]);
  assert.equal(t.timers.length, 1);
  assert.ok(t.timers[0].delay >= MIN_WAIT && t.timers[0].delay <= MAX_WAIT);
  t.cleanup();
});

test('il timer rielabora le scadenze; reschedule sostituisce il timer precedente', () => {
  const t = setup([item('a', 20000), item('b', 90000)]);
  t.scheduler.start(); assert.equal(t.timers[0].delay, 20000);
  t.advance(20000); t.timers[0].callback();
  assert.deepEqual(t.fired, ['a']); assert.equal(t.timers[1].delay, 70000);
  t.store.add({ when: NOW + 25000, text: 'nuovo', alarm: false });
  t.scheduler.reschedule();
  assert.ok(t.cleared.includes(1), 'il timer precedente è stato cancellato');
  assert.equal(t.timers.at(-1).delay, 5000);
  t.cleanup();
});

test('stop() cancella il timer e rende inerti reschedule e timer già in volo', () => {
  const t = setup([item('a', 20000)]);
  t.scheduler.start(); const pending = t.timers[0];
  t.scheduler.stop();
  assert.ok(t.cleared.includes(pending.id));
  t.advance(30000); pending.callback(); t.scheduler.reschedule();
  assert.equal(t.fired.length, 0); assert.equal(t.timers.length, 1);
  assert.equal(t.saved().length, 1, 'dopo stop() la scadenza non viene presa');
  t.cleanup();
});

test('regressione B1 in main.cjs: il pianificatore parte solo dopo controllo, finestra mascotte e tray', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  const when = source.indexOf('app.whenReady()');
  const start = source.indexOf('reminderScheduler.start()', when);
  assert.ok(start > when, 'reminderScheduler.start() deve essere chiamato dentro whenReady');
  for (const marker of ['selectCharacter(characters.some', "mascot = safeWindow('mascot'", "controller.set('idle')", 'tray = new Tray']) {
    const at = source.indexOf(marker, when); assert.ok(at > 0 && at < start, `${marker} deve precedere reminderScheduler.start()`);
  }
  assert.equal(source.split('reminderScheduler.start()').length - 1, 1);
  assert.doesNotMatch(source.slice(when, start), /scheduleReminders\(\)/, 'nessuna elaborazione prima della fine della preparazione');
  assert.doesNotMatch(source.slice(when, start), /powerMonitor\.on\('resume'/);
});
