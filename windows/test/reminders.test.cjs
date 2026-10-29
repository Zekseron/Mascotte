'use strict';
// Promemoria e sveglie dalla chat locale: frasi, orari, salvataggio e scadenze.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../lib/reminders.cjs');

const NOW = new Date(2026, 9, 29, 15, 28); // giovedì 29 ottobre 2026, 15:28
const at = (days, hour, minute = 0) => new Date(2026, 9, 29 + days, hour, minute).getTime();

test('frasi riconosciute: orario esatto, relativo, giorno, mattina/sera, testo pulito', () => {
  const cases = [
    ['ricordami alle 15:30 di chiamare Marco', at(0, 15, 30), 'chiamare Marco', false],
    ['Ricordami alle 15.45 che devo uscire!', at(0, 15, 45), 'devo uscire', false],
    ['ricordami alle 14 di uscire', at(1, 14), 'uscire', false], // ora già passata: domani
    ['puoi ricordarmi domani alle 9 della riunione con Luca?', at(1, 9), 'riunione con Luca', false],
    ['ricordami stasera alle 9 di chiamare la nonna', at(0, 21), 'chiamare la nonna', false],
    ['ricordami alle 8 di sera di prendere la medicina', at(0, 20), 'prendere la medicina', false],
    ['mi puoi mettere una sveglia alle 7 e mezza', at(1, 7, 30), 'Sveglia', true],
    ['promemoria dopodomani alle 10: dentista', at(2, 10), 'dentista', false],
    ['Sveglia tra 20 minuti', NOW.getTime() + 20 * 60000, 'Sveglia', true],
    ['promemoria tra 1 ora e 30 minuti: spegnere il forno', NOW.getTime() + 90 * 60000, 'spegnere il forno', false],
    ["avvisami tra mezz'ora", NOW.getTime() + 30 * 60000, 'Promemoria', false],
    ['timer tra cinque minuti', NOW.getTime() + 5 * 60000, 'Sveglia', true]
  ];
  for (const [phrase, when, text, alarm] of cases) {
    const result = R.parseReminder(phrase, NOW);
    assert.equal(result?.when?.getTime(), when, phrase); assert.equal(result.text, text, phrase); assert.equal(result.alarm, alarm, phrase);
  }
});

test('frasi non valide o di altro tipo', () => {
  assert.equal(R.parseReminder('ricorda: sono vegetariano', NOW), null); // è una nota
  assert.equal(R.parseReminder('che ore sono?', NOW), null);
  assert.match(R.parseReminder('ricordami di comprare il latte', NOW).error, /Quando\?/);
  assert.match(R.parseReminder('ricordami oggi alle 10 di uscire', NOW).error, /già passato/);
  assert.match(R.parseReminder('sveglia alle 25', NOW).error, /non è valido/);
  assert.match(R.parseReminder('ricordami tra 40 ore e 0 minuti di x', NOW).when ? 'ok' : 'x', /ok/);
  assert.match(R.parseReminder('ricordami tra 999 ore di x', NOW).error, /un mese/);
  assert.deepEqual(R.parseReminderCommand('che promemoria ho?'), { type: 'reminder-list' });
  assert.deepEqual(R.parseReminderCommand('mostrami le sveglie'), { type: 'reminder-list' });
  assert.deepEqual(R.parseReminderCommand('cancella promemoria 2'), { type: 'reminder-cancel', all: false, index: 2 });
  assert.deepEqual(R.parseReminderCommand('elimina tutte le sveglie'), { type: 'reminder-cancel', all: true, index: null });
  assert.equal(R.parseReminderCommand('cancella la nota'), null);
});

test('salvataggio, ordine, scaduti e limiti', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte promemoria ')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'reminders.json'), store = new R.ReminderStore(file);
  store.add({ when: 3000, text: 'tre' }); store.add({ when: 1000, text: 'uno', alarm: true }); store.add({ when: 2000, text: 'due' });
  assert.deepEqual(store.list().map(item => item.text), ['uno', 'due', 'tre']);
  const reopened = new R.ReminderStore(file); // sopravvivono al riavvio
  assert.deepEqual(reopened.list().map(item => [item.text, item.alarm]), [['uno', true], ['due', false], ['tre', false]]);
  assert.deepEqual(reopened.takeDue(2000).map(item => item.text), ['uno', 'due']); // anche quelli persi ad app chiusa
  assert.deepEqual(new R.ReminderStore(file).list().map(item => item.text), ['tre']);
  assert.equal(reopened.remove(reopened.next().id), true); assert.equal(reopened.next(), null);
  fs.writeFileSync(file, JSON.stringify([{ id: 'a', when: 'x', text: 'no' }, { id: 'b', when: 5, text: 'sì' }, null]));
  assert.deepEqual(new R.ReminderStore(file).list().map(item => item.text), ['sì']);
  const full = new R.ReminderStore(path.join(directory, 'pieno.json'));
  for (let i = 0; i < R.MAX_REMINDERS; i++) full.add({ when: i, text: String(i) });
  assert.throws(() => full.add({ when: 99, text: 'troppi' }), /già 50/);
  assert.match(R.describeReminders([]), /Non hai promemoria/);
  assert.match(R.describeReminders([{ when: at(1, 9), text: 'riunione' }], NOW), /1\. domani alle 09:00 · riunione/);
});
