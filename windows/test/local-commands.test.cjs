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

// Cartelle temporanee con finti .app: nessuna app reale viene toccata o aperta.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { listApps, getApps, clearAppCache, validateTarget } = require('../lib/local-commands.cjs');
function fakeMac() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-apps-'))), apps = path.join(root, 'Applications'), sys = path.join(root, 'System'), outside = path.join(root, 'fuori');
  for (const dir of [apps, sys, outside]) fs.mkdirSync(dir);
  for (const name of ['Safari', 'Google Chrome', 'Google Docs', 'Spotify', 'Visual Studio Code']) fs.mkdirSync(path.join(apps, name + '.app'));
  for (const name of ['Calculator', 'Notes', 'System Settings', 'Terminal', 'Preview', 'Music', 'Mail', 'VoiceMemos']) fs.mkdirSync(path.join(sys, name + '.app'));
  fs.mkdirSync(path.join(outside, 'Intruso.app'));
  fs.symlinkSync(path.join(outside, 'Intruso.app'), path.join(apps, 'Intruso.app'));
  fs.mkdirSync(path.join(apps, 'Cartella', 'Annidata.app'), { recursive: true });
  fs.writeFileSync(path.join(apps, 'File.app'), 'non una cartella');
  return { root, apps, sys, opts: { platform: 'darwin', home: path.join(root, 'home'), appDirs: [apps, sys], appExtras: [] } };
}

test('elenco app: un solo livello, link simbolici fuori cartella e file ignorati, cache di 60 secondi', () => {
  const mac = fakeMac();
  clearAppCache();
  const names = listApps([mac.apps, mac.sys], []).map(app => app.name);
  assert.ok(names.includes('Safari') && names.includes('Notes'));
  for (const hidden of ['Intruso', 'Annidata', 'File']) assert.ok(!names.includes(hidden), hidden);
  const first = getApps([mac.apps], [], { now: 1000 });
  fs.mkdirSync(path.join(mac.apps, 'Nuova.app'));
  assert.equal(getApps([mac.apps], [], { now: 30000 }), first);
  assert.ok(getApps([mac.apps], [], { now: 62000 }).some(app => app.name === 'Nuova'));
});

test('frasi naturali: almeno 10 varianti diventano «open» con il percorso corretto', () => {
  const mac = fakeMac(); clearAppCache();
  const cases = [['puoi aprirmi la calcolatrice?', 'Calculator.app'], ['mi apri i download per favore', 'Downloads'], ['potresti avviare Safari', 'Safari.app'], ['lancia Terminale', 'Terminal.app'],
    ['fai partire Spotify', 'Spotify.app'], ['apri l’app Note', 'Notes.app'], ['Per favore, apri Impostazioni', 'System Settings.app'], ['aprimi Anteprima grazie', 'Preview.app'], ['riesci a lanciare Musica?', 'Music.app'],
    ['ti va di avviare Visual Studio Code', 'Visual Studio Code.app'], ['esegui il programma Posta', 'Mail.app'], ['apri la cartella Documenti', 'Documents'], ['mi apri la scrivania?', 'Desktop'], ['apri Impostazioni di Sistema', 'System Settings.app'],
    ['avviami Memo Vocali', 'VoiceMemos.app'], ['apri vis', 'Visual Studio Code.app'], ['APRI   SAFARI!!', 'Safari.app'], ['apri l\'applicazione Spotify', 'Spotify.app']];
  for (const [phrase, tail] of cases) { const command = parseLocalCommand(phrase, mac.opts); assert.equal(command?.type, 'open', phrase); assert.ok(command.target.endsWith(tail), `${phrase} -> ${command.target}`); }
  assert.equal(parseLocalCommand('apri safari', mac.opts).description, `Aprire l'app Safari (${path.join(mac.apps, 'Safari.app')}).`);
  assert.equal(parseLocalCommand('apri immagini', mac.opts).target, path.join(mac.opts.home, 'Pictures'));
  assert.equal(parseLocalCommand('apri applicazioni', mac.opts).target, '/Applications');
});

test('frasi che non sono comandi vanno al modello (null)', () => {
  const mac = fakeMac(); clearAppCache();
  for (const phrase of ['come si apre una porta trunk?', 'cosa apri di solito?', 'ricordi quando ho aperto Safari?', 'ieri ho aperto Safari e Spotify', 'apri Safari e poi spiegami come funzionano le VLAN', 'secondo te conviene aprire Safari o Chrome per studiare le reti?',
    'perché Safari si apre lentamente?', 'apri una porta trunk su uno switch Cisco', 'apri calcolatrice e poi cancella tutto', 'Safari', 'puoi spiegarmi cos’è una VLAN?']) assert.equal(parseLocalCommand(phrase, mac.opts), null, phrase);
  assert.equal(parseLocalCommand('apri Safari', { ...mac.opts, actions: false }), null);
});

test('ambiguità, app inesistente con suggerimenti e frasi dubbie', () => {
  const mac = fakeMac(); clearAppCache();
  assert.deepEqual(parseLocalCommand('apri google', mac.opts), { type: 'reply', text: 'Ho trovato più app: Google Chrome, Google Docs. Quale?' });
  assert.equal(parseLocalCommand('apri google chrome', mac.opts).type, 'open');
  // Parola intera nel nome: «chrome» e «code» trovano l'app; «google» resta ambiguo.
  assert.ok(parseLocalCommand('puoi aprirmi chrome?', mac.opts).target.endsWith('Google Chrome.app'));
  assert.ok(parseLocalCommand('apri code', mac.opts).target.endsWith('Visual Studio Code.app'));
  assert.equal(parseLocalCommand('apri docs', mac.opts).type, 'open');
  const missing = parseLocalCommand('puoi aprire Whatsapp?', mac.opts);
  assert.deepEqual(missing, { type: 'reply', text: 'Non trovo un\'app chiamata «Whatsapp» sul Mac.' });
  assert.match(parseLocalCommand('apri Spotfy', mac.opts).text, /^Non trovo un'app chiamata «Spotfy» sul Mac\. Forse intendevi: Spotify\?$/);
  assert.match(parseLocalCommand('apri Safary', mac.opts).text, /Safari/);
  assert.equal(parseLocalCommand('apri Intruso', mac.opts).type, 'reply');
  assert.match(parseLocalCommand('apri Intruso', mac.opts).text, /^Non trovo/);
  assert.equal(parseLocalCommand('apri Annidata', mac.opts).type, 'reply');
});

test('Windows: frasi naturali solo per Calcolatrice e cartelle, nessuna app', () => {
  const win = { platform: 'win32', home: 'C:\\Users\\prova', env: { SystemRoot: 'C:\\Windows' } };
  assert.match(parseLocalCommand('puoi aprirmi la calcolatrice?', win).target, /calc\.exe$/);
  assert.match(parseLocalCommand('mi apri i download per favore', win).target, /Downloads$/);
  assert.match(parseLocalCommand('apri la cartella Documenti', win).target, /Documents$/);
  assert.match(parseLocalCommand('apri scrivania', win).target, /Desktop$/);
  assert.match(parseLocalCommand('lancia immagini', win).target, /Pictures$/);
  for (const phrase of ['apri Safari', 'apri applicazioni', 'potresti avviare Spotify']) assert.equal(parseLocalCommand(phrase, win), null, phrase);
});

test('conferma: il percorso viene ricontrollato (esistenza e cartelle ammesse)', () => {
  const mac = fakeMac(); clearAppCache();
  const safari = path.join(mac.apps, 'Safari.app');
  assert.equal(validateTarget(safari, mac.opts), true);
  assert.equal(validateTarget(path.join(mac.opts.home, 'Downloads'), mac.opts), false);
  assert.equal(validateTarget(path.join(mac.apps, 'Intruso.app'), mac.opts), false);
  assert.equal(validateTarget(path.join(mac.root, 'fuori', 'Intruso.app'), mac.opts), false);
  assert.equal(validateTarget(path.join(mac.apps, 'Cartella', 'Annidata.app'), mac.opts), false);
  fs.rmSync(safari, { recursive: true });
  assert.equal(validateTarget(safari, mac.opts), false);
  assert.equal(validateTarget('/System/Applications/Calculator.app', { platform: 'darwin', home: mac.opts.home, appDirs: [] }), fs.existsSync('/System/Applications/Calculator.app'));
  assert.equal(validateTarget(undefined, mac.opts), false);
});
