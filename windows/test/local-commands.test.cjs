'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocalCommand, describeNotes, openTargets } = require('../lib/local-commands.cjs');

test('azioni predefinite: Calcolatrice e Download per Mac e Windows, solo frasi esatte', () => {
  const mac = { platform: 'darwin', home: '/Users/prova' }, win = { platform: 'win32', home: 'C:\\Users\\prova', env: { SystemRoot: 'C:\\Windows' } };
  assert.equal(parseLocalCommand('Apri la calcolatrice!', mac).target, '/System/Applications/Calculator.app');
  assert.match(parseLocalCommand('apri calcolatrice', win).target, /calc\.exe$/);
  assert.equal(parseLocalCommand('apri download', mac).target, '/Users/prova/Downloads');
  assert.equal(parseLocalCommand('apri la cartella download', mac).type, 'open');
  assert.equal(parseLocalCommand('apri calcolatrice e poi cancella tutto', mac), null);
  assert.equal(parseLocalCommand('apri calcolatrice', { ...mac, actions: false }), null);
  assert.deepEqual(Object.keys(openTargets('darwin', '/h')), Object.keys(openTargets('win32', 'C:\\h')));
});

test('note: «ricorda» propone il salvataggio con il testo originale, «che note ho» le elenca', () => {
  assert.deepEqual(parseLocalCommand('Ricorda: lo switch del lab è un Cisco 2960'), { type: 'remember', text: 'lo switch del lab è un Cisco 2960' });
  assert.deepEqual(parseLocalCommand('ricordati che la VLAN 10 è Amministrazione.'), { type: 'remember', text: 'la VLAN 10 è Amministrazione.' });
  assert.deepEqual(parseLocalCommand('salva nota: password del wifi in agenda'), { type: 'remember', text: 'password del wifi in agenda' });
  assert.equal(parseLocalCommand('ricorda'), null);
  assert.equal(parseLocalCommand('ricordi cosa sono le VLAN?'), null);
  for (const question of ['Che note ho?', 'ho delle note salvate?', 'mostrami le note', 'quali note ho salvato']) assert.deepEqual(parseLocalCommand(question), { type: 'list-notes' }, question);
  assert.equal(parseLocalCommand('spiegami le VLAN'), null);
  assert.equal(parseLocalCommand('ricorda: ' + 'x'.repeat(2500)).text.length, 2000);
});

test('elenco delle note leggibile e messaggio quando non ce ne sono', () => {
  assert.match(describeNotes([]), /Non hai note salvate.*ricorda:/);
  assert.equal(describeNotes([{ text: 'uno' }, { text: 'due' }]).split('\n').slice(1).join('|'), '1. uno|2. due');
});
