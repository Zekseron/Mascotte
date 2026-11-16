'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocalCommand, describeNotes, openTargets } = require('../lib/local-commands.cjs');

test('azioni predefinite: Calcolatrice e Download per Mac e Windows, solo frasi esatte', () => {
  const mac = { platform: 'darwin', home: '/Users/prova' }, win = { platform: 'win32', home: 'C:\\Users\\prova', env: { SystemRoot: 'C:\\Windows' } };
  assert.equal(parseLocalCommand('Apri la calcolatrice!', mac).target, '/System/Applications/Calculator.app');
  assert.match(parseLocalCommand('apri calcolatrice', win).target, /calc\.exe$/);
  assert.equal(parseLocalCommand('apri download', mac).target, require('node:path').join(mac.home, 'Downloads'));
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
  fs.symlinkSync(path.join(outside, 'Intruso.app'), path.join(apps, 'Intruso.app'), process.platform === 'win32' ? 'junction' : 'dir');
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
  assert.deepEqual(missing, { type: 'reply', notFound: true, text: 'Non trovo un\'app, una cartella o un file chiamato «Whatsapp» sul Mac.' });
  assert.match(parseLocalCommand('apri Spotfy', mac.opts).text, /^Non trovo un'app, una cartella o un file chiamato «Spotfy» sul Mac\. Forse intendevi: Spotify\?$/);
  assert.match(parseLocalCommand('apri Safary', mac.opts).text, /Safari/);
  assert.equal(parseLocalCommand('apri Intruso', mac.opts).type, 'reply');
  assert.match(parseLocalCommand('apri Intruso', mac.opts).text, /^Non trovo/);
  assert.equal(parseLocalCommand('apri Annidata', mac.opts).type, 'reply');
});

test('Windows: Calcolatrice e cartelle; senza menu Start nessuna app, con risposta «non trovo»', () => {
  const win = { platform: 'win32', home: 'C:\\Users\\prova', env: { SystemRoot: 'C:\\Windows' } };
  assert.match(parseLocalCommand('puoi aprirmi la calcolatrice?', win).target, /calc\.exe$/);
  assert.match(parseLocalCommand('mi apri i download per favore', win).target, /Downloads$/);
  assert.match(parseLocalCommand('apri la cartella Documenti', win).target, /Documents$/);
  assert.match(parseLocalCommand('apri scrivania', win).target, /Desktop$/);
  assert.match(parseLocalCommand('lancia immagini', win).target, /Pictures$/);
  for (const phrase of ['apri Safari', 'potresti avviare Spotify']) assert.match(parseLocalCommand(phrase, win).text, /^Non trovo .* sul PC\.$/, phrase);
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

// Domande sul contenuto delle cartelle conosciute: riconosciute senza modello, la cartella viene sempre da folderEntries.
test('domande sulle cartelle: frasi riconosciute con la cartella e il tipo giusti', () => {
  const mac = { platform: 'darwin', home: '/Users/prova' }, win = { platform: 'win32', home: 'C:\\Users\\prova' };
  const cases = [
    ['quanti file immagine ho in download?', 'Download', 'count', ['immagini']], ['quante immagini ci sono nella scrivania?', 'Scrivania', 'count', ['immagini']],
    ['che file ho in download?', 'Download', 'list', []], ['qual è il pdf più recente nei documenti?', 'Documenti', 'model', ['pdf']],
    ['ci sono file doppi in download?', 'Download', 'duplicates', []], ['quanti pdf ho nei miei documenti', 'Documenti', 'count', ['pdf']],
    ['mostrami i file nella cartella Documenti', 'Documenti', 'list', []], ['elenca i file sul desktop', 'Scrivania', 'list', []],
    ['cosa c\'è in download?', 'Download', 'list', []], ['quanti file ci sono in downloads', 'Download', 'count', []],
    ['dammi i duplicati nelle immagini', 'Immagini', 'duplicates', []], ['quali file posso cancellare in download?', 'Download', 'model', []],
    ['riassumi cosa c\'è nella cartella documenti', 'Documenti', 'model', []], ['ci sono pdf in download?', 'Download', 'count', ['pdf']],
    ['quante foto ho nella cartella Immagini, grazie', 'Immagini', 'count', ['immagini']], ['qual è il file più grande dentro la scrivania?', 'Scrivania', 'model', []],
    // Prova dell'utente: elenco delle cartelle con «che/quali», anche con «ci sono».
    ['che cartelle ci sono in download?', 'Download', 'list', ['cartelle']], ['quali cartelle ho in download?', 'Download', 'list', ['cartelle']],
    ['quante cartelle ci sono in download?', 'Download', 'count', ['cartelle']], ['che video ci sono nei documenti?', 'Documenti', 'list', ['video']]];
  for (const platformOptions of [mac, win]) for (const [text, display, kind, categories] of cases) {
    const result = parseLocalCommand(text, platformOptions);
    assert.equal(result?.type, 'folder', text); assert.equal(result.folder.display, display, text); assert.equal(result.question.kind, kind, text); assert.deepEqual(result.question.categories, categories, text);
  }
  assert.equal(parseLocalCommand('quanti file ci sono in download', mac).folder.target, path.join(mac.home, 'Downloads')); // percorso da folderEntries, non dal testo
  assert.equal(parseLocalCommand('quanti file ci sono in download', { ...mac, actions: false }).type, 'folder'); // la lettura non è un'azione
});

test('domande sulle cartelle: casi che NON scattano', () => {
  const mac = { platform: 'darwin', home: '/Users/prova' };
  assert.equal(parseLocalCommand('apri download', mac).type, 'open');
  assert.equal(parseLocalCommand('apri la cartella download e dimmi quanti file ci sono', mac), null);
  assert.equal(parseLocalCommand('quanti file può contenere una cartella?', mac), null);
  assert.equal(parseLocalCommand('quante immagini ho?', mac), null);
  assert.equal(parseLocalCommand('quanti articoli ci sono nei documenti della Costituzione?', mac), null);
  assert.equal(parseLocalCommand('mostrami una scrivania in legno', mac), null);
  assert.equal(parseLocalCommand('scrivimi una poesia sulla scrivania', mac), null);
  assert.equal(parseLocalCommand('spiegami cos\'è una cartella download', mac), null);
  assert.equal(parseLocalCommand('quanti file ci sono in applicazioni', mac), null); // Applicazioni non è leggibile
  assert.equal(parseLocalCommand('quanti file ci sono in /etc', mac), null);
  assert.equal(parseLocalCommand('ricorda: quanti file in download', mac).type, 'remember');
  assert.deepEqual(parseLocalCommand('che note ho?', mac), { type: 'list-notes' });
});

// --- Apertura di app Windows (menu Start) e di file nelle cartelle note (16 novembre 2026) ---
const { listWindowsApps, findFiles, blockedFile, parseOpenRequest } = require('../lib/local-commands.cjs');
function fakeWindows() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-win-')));
  const common = path.join(root, 'ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), user = path.join(root, 'AppData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  for (const dir of [path.join(common, 'Microsoft Office'), path.join(user, 'Spotify'), path.join(common, 'Strumenti', 'Livello2', 'Livello3', 'Troppo')]) fs.mkdirSync(dir, { recursive: true });
  for (const file of [path.join(common, 'Microsoft Office', 'Word.lnk'), path.join(common, 'Microsoft Office', 'Excel.lnk'), path.join(user, 'Spotify', 'Spotify.lnk'),
    path.join(user, 'Spotify', 'Uninstall Spotify.lnk'), path.join(common, 'Notepad++.lnk'), path.join(common, 'Leggimi.txt'), path.join(common, 'Strumenti', 'Livello2', 'Livello3', 'Troppo', 'Profonda.lnk')]) fs.writeFileSync(file, '');
  const home = path.join(root, 'Users', 'prova');
  return { root, common, user, opts: { platform: 'win32', home, env: { SystemRoot: 'C:\\Windows', ProgramData: path.join(root, 'ProgramData'), APPDATA: path.join(root, 'AppData') } } };
}
function fakeHome(base) {
  const home = path.join(base, 'casa');
  const files = { 'Downloads/fattura.pdf': 'x', 'Downloads/setup.exe': 'x', 'Downloads/script.sh': 'x', 'Documents/fattura.pdf': 'x', 'Documents/Lavoro/relazione finale.docx': 'x',
    'Documents/Lavoro/progetto.key': 'x', 'Desktop/foto mare.jpg': 'x', 'Desktop/.nascosto.txt': 'x', 'Pictures/a/b/c/profondo.png': 'x', 'Documents/node_modules/pacchetto.txt': 'x' };
  for (const [name, content] of Object.entries(files)) { const file = path.join(home, ...name.split('/')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  return home;
}

test('Windows: app dai collegamenti del menu Start, senza disinstallazioni né file non .lnk', () => {
  const win = fakeWindows(); clearAppCache();
  const names = listWindowsApps([win.common, win.user]).map(app => app.name).sort();
  assert.deepEqual(names, ['Excel', 'Notepad++', 'Spotify', 'Word']);
  const word = parseLocalCommand('apri Word', win.opts);
  assert.equal(word.type, 'open'); assert.equal(word.kind, 'app'); assert.equal(word.name, 'Word'); assert.ok(word.target.endsWith('Word.lnk'));
  assert.ok(parseLocalCommand('potresti avviare spotify?', win.opts).target.endsWith('Spotify.lnk'));
  assert.equal(validateTarget(word.target, win.opts), true);
  assert.equal(validateTarget(path.join(win.common, 'Leggimi.txt'), win.opts), false);
  const fuori = path.join(win.root, 'Fuori.lnk'); fs.writeFileSync(fuori, '');
  assert.equal(validateTarget(fuori, win.opts), false);
});

test('file: uno solo si apre, più file si elencano, programmi e script mai', () => {
  const mac = fakeMac(); clearAppCache();
  const opts = { ...mac.opts, home: fakeHome(mac.root) };
  const docx = parseLocalCommand('apri relazione finale.docx', opts);
  assert.equal(docx.type, 'open'); assert.equal(docx.kind, 'file'); assert.equal(docx.name, 'relazione finale.docx');
  assert.equal(validateTarget(docx.target, opts), true);
  assert.equal(parseLocalCommand('apri il file relazione finale', opts).type, 'open');
  assert.equal(parseLocalCommand('apri foto mare', opts).type, 'open'); // nessuna app con quel nome: si cerca tra i file
  const many = parseLocalCommand('apri fattura.pdf', opts);
  assert.equal(many.type, 'reply'); assert.match(many.text, /più file chiamati «fattura\.pdf»/); assert.match(many.text, /in Download/); assert.match(many.text, /in Documenti/);
  const inDocs = parseLocalCommand('apri fattura.pdf in Documenti', opts);
  assert.equal(inDocs.type, 'open'); assert.ok(inDocs.target.includes(`${path.sep}Documents${path.sep}`));
  for (const phrase of ['apri setup.exe', 'esegui script.sh']) { const refused = parseLocalCommand(phrase, opts); assert.equal(refused.type, 'reply', phrase); assert.match(refused.text, /per sicurezza Mascotte non lo apre/, phrase); }
  assert.equal(validateTarget(path.join(opts.home, 'Downloads', 'setup.exe'), opts), false);
  assert.match(parseLocalCommand('apri il file relazion', opts).text, /Forse intendevi:\n- relazione finale\.docx \(in Documenti\)/);
  assert.match(parseLocalCommand('apri nascosto.txt', opts).text, /^Non trovo il file/);
  assert.match(parseLocalCommand('apri pacchetto.txt', opts).text, /^Non trovo il file/); // node_modules ignorata
  assert.match(parseLocalCommand('apri profondo.png', opts).text, /^Non trovo il file/); // oltre tre livelli
  const outside = path.join(mac.root, 'fuori', 'segreto.txt'); fs.writeFileSync(outside, 'x');
  assert.equal(validateTarget(outside, opts), false);
});

test('blockedFile e findFiles: estensioni pericolose e solo nomi', () => {
  for (const name of ['a.exe', 'b.BAT', 'c.ps1', 'd.command', 'e.app', 'f.pkg', 'g.lnk', 'h.py', 'i.msi', 'j.js']) assert.equal(blockedFile(name), true, name);
  for (const name of ['a.pdf', 'b.docx', 'c.jpg', 'd.txt', 'e.key', 'f.xlsx', 'g']) assert.equal(blockedFile(name), false, name);
  const home = fakeHome(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-file-'))));
  const { exact } = findFiles('FATTURA', [{ display: 'Download', target: path.join(home, 'Downloads') }]);
  assert.deepEqual(exact.map(item => item.name), ['fattura.pdf']);
});

test('parseOpenRequest: solo «apri …», niente note, promemoria o domande sulle cartelle', () => {
  const mac = fakeMac(); clearAppCache();
  const opts = { ...mac.opts, home: fakeHome(mac.root) };
  assert.equal(parseOpenRequest('apri Safari', opts).type, 'open');
  assert.equal(parseOpenRequest('apri la calcolatrice', { platform: 'win32', home: opts.home, env: { SystemRoot: 'C:\\Windows' } }).type, 'open');
  for (const text of ['ricorda: comprare il latte', 'che file ho in download?', 'scrivimi una poesia', 'apri la mente e raccontami una storia lunga']) assert.equal(parseOpenRequest(text, opts), null, text);
});

test('Mac: app web dei browser in «Chrome Apps.localized» dentro Applicazioni dell\'utente', () => {
  const { macAppDirs } = require('../lib/local-commands.cjs'); clearAppCache();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-webapp-'))), home = path.join(root, 'casa');
  const web = path.join(home, 'Applications', 'Chrome Apps.localized'); fs.mkdirSync(path.join(web, 'Google Chat.app'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Applications', 'Altro', 'Nascosta.app'), { recursive: true });
  const dirs = macAppDirs(home);
  assert.ok(dirs.includes(web)); assert.ok(!dirs.some(dir => dir.endsWith('Altro')));
  const opts = { platform: 'darwin', home, appDirs: dirs, appExtras: [] };
  const chat = parseLocalCommand('apri google chat', opts);
  assert.equal(chat.type, 'open'); assert.equal(chat.target, path.join(web, 'Google Chat.app'));
  assert.equal(validateTarget(chat.target, opts), true);
  assert.equal(parseLocalCommand('apri nascosta', opts).type, 'reply');
});

// --- Colori delle mascotte: ricolorazione per parti (16 novembre 2026) ---
test('ricolorazione: solo le parti con un colore scelto, luci e ombre conservate', () => {
  const R = require('../renderer/recolor.js');
  const base = '#c86432', target = '#482c59';
  const transforms = R.prepare([{ base, target }, { base: '#eebca3', target: '#eebca3' }]);
  assert.equal(transforms[1], null); // colore uguale all'originale: parte non toccata
  const data = new Uint8ClampedArray([200, 100, 50, 255, 230, 130, 80, 255, 120, 50, 20, 255, 238, 188, 163, 255, 200, 100, 50, 0]);
  const map = new Uint8ClampedArray([1, 0, 0, 255, 1, 0, 0, 255, 1, 0, 0, 255, 2, 0, 0, 255, 1, 0, 0, 255]);
  const out = R.apply(Uint8ClampedArray.from(data), map, transforms);
  assert.deepEqual([...out.slice(0, 3)], R.hexToRgb(target)); // il colore base diventa esattamente quello scelto
  const v = i => R.rgbToHsv(out[i], out[i + 1], out[i + 2])[2];
  assert.ok(v(4) > v(0) && v(0) > v(8), 'la luce resta più chiara e l’ombra più scura');
  assert.deepEqual([...out.slice(12, 16)], [238, 188, 163, 255]); // pelle invariata
  assert.deepEqual([...out.slice(16, 20)], [200, 100, 50, 0]); // pixel trasparente invariato
  const lighter = R.apply(Uint8ClampedArray.from(data.slice(0, 12)), map.slice(0, 12), R.prepare([{ base, target: '#f0f0f0' }]));
  assert.ok(R.rgbToHsv(lighter[4], lighter[5], lighter[6])[2] >= R.rgbToHsv(lighter[0], lighter[1], lighter[2])[2], 'verso il bianco le luci non si invertono');
});

test('ricolorazione: nero, bianco e colori saturi mantengono tre livelli di luminosità', () => {
  const R = require('../renderer/recolor.js');
  const map = Uint8ClampedArray.from([1, 0, 0, 255, 1, 0, 0, 255, 1, 0, 0, 255]);
  const base = '#808080';
  const shades = target => {
    const pixels = Uint8ClampedArray.from([45, 45, 45, 190, 128, 128, 128, 255, 195, 195, 195, 210]);
    R.apply(pixels, map, R.prepare([{ base, target }]));
    assert.deepEqual([pixels[3], pixels[7], pixels[11]], [190, 255, 210]);
    // La luminosità HSL è la media tra il canale più alto e quello più basso.
    return [0, 4, 8].map(i => {
      const rgb = pixels.slice(i, i + 3);
      return (Math.max(...rgb) + Math.min(...rgb)) / 2;
    });
  };
  for (const color of ['#000000', '#ffffff', '#0080ff', '#ff00ff', '#00ff00']) {
    const [shadow, middle, highlight] = shades(color);
    assert.ok(middle - shadow >= 8 && highlight - middle >= 8, color);
  }
  assert.ok(shades('#101010')[1] > shades('#000000')[1]);
  assert.ok(shades('#f0f0f0')[1] < shades('#ffffff')[1]);
});

test('personaggi inclusi: mappa delle parti valida, grande quanto il foglio, colori originali esadecimali', () => {
  const P = require('../../viewer/pack.js'), { loadPack } = require('../lib/characters.cjs');
  for (const folder of ['People/luma', 'Cat/rosso']) {
    const loaded = loadPack(P, path.join(__dirname, '..', '..', 'characters', folder));
    assert.ok(loaded.pack.parts && loaded.parts, folder);
    assert.ok(loaded.pack.parts.list.length >= 4, folder);
    assert.deepEqual(P.pngSize(loaded.parts), P.pngSize(loaded.bytes), folder);
  }
  const broken = P.validatePack({ ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'characters', 'Cat', 'rosso', 'character.json'), 'utf8')), parts: { sheet: '../x.png', list: [] } }, 192, 480);
  assert.equal(broken.pack.parts, undefined); assert.ok(broken.warnings.some(w => w.startsWith('parts:')));
});
