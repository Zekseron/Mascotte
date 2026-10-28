'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readFolder, viewableFolders, notice, answer, modelContext, classify, findDuplicates, safeName } = require('../lib/folder-view.cjs');
const { folderEntries } = require('../lib/local-commands.cjs');

// Home temporanea con file finti: nessun file reale dell'utente viene letto.
function fakeHome() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-folder-'))), dir = path.join(home, 'Downloads');
  fs.mkdirSync(dir);
  const put = (name, content = 'x', time) => { const file = path.join(dir, name); fs.writeFileSync(file, content); if (time) fs.utimesSync(file, time, time); };
  put('foto1.JPG', 'aaaa', 1000); put('foto2.png', 'bbbbb', 2000); put('scatto.HEIC', 'cc', 3000); put('relazione.pdf', 'p'.repeat(2048), 5000); put('relazione (1).pdf', 'q'.repeat(100), 4000);
  put('nota.txt', 'n', 600); put('conti.xlsx', 'c', 700); put('slide.key', 'k', 800); put('backup.zip', 'z', 900); put('installa.pkg', 'i', 1100); put('musica.mp3', 'm', 1200); put('film.mov', 'v', 1300); put('script.py', 's', 1400); put('senza-estensione', 'e', 1500);
  put('.DS_Store', 'h'); put('.localized', ''); put('.nascosto.pdf', 'h');
  put('uguale-a.bin', '12345678', 20); put('uguale-b.bin', '87654321', 30);
  fs.mkdirSync(path.join(dir, 'Progetti')); fs.writeFileSync(path.join(dir, 'Progetti', 'dentro.pdf'), 'non va letto');
  fs.mkdirSync(path.join(dir, 'Programma.app'));
  fs.symlinkSync('/etc/hosts', path.join(dir, 'collegamento'));
  for (const name of ['Progetti', 'Programma.app']) fs.utimesSync(path.join(dir, name), 10, 10);
  fs.lutimesSync(path.join(dir, 'collegamento'), 10, 10); // date fisse: l'ordine per data è prevedibile
  return { home, dir, folder: viewableFolders('darwin', home).find(f => f.display === 'Download'), platform: 'darwin' };
}

test('categorie e conteggi esatti, nascosti ignorati, link non seguiti, sottocartelle non lette', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const view = readFolder(fake.folder, { platform: 'darwin', home: fake.home });
  assert.deepEqual(view.counts, { immagini: 3, pdf: 2, documenti: 1, fogli: 1, presentazioni: 1, archivi: 1, audio: 1, video: 1, codice: 1, installer: 2, altro: 3, cartelle: 1, link: 1 });
  assert.equal(view.total, 19); assert.equal(view.found, 19); assert.equal(view.truncated, false);
  assert.ok(!view.entries.some(item => item.name.startsWith('.')));
  assert.equal(view.entries.find(item => item.name === 'collegamento').kind, 'link');
  assert.equal(view.entries.find(item => item.name === 'collegamento').size, 0);
  assert.ok(!view.entries.some(item => item.name === 'dentro.pdf'));
  assert.equal(view.entries.find(item => item.name === 'Progetti').category, 'cartelle');
  assert.equal(view.entries.find(item => item.name === 'Programma.app').category, 'installer');
  assert.equal(view.totalSize, 2184); // 16 file veri; cartelle e link non contano
  assert.equal(view.entries[0].name, 'relazione.pdf'); // ordinate per data decrescente
  assert.equal(classify('file', 'A.PdF'), 'pdf'); assert.equal(classify('file', 'x.dmg'), 'installer'); assert.equal(classify('file', 'x.iso'), 'archivi');
});

test('limite di lettura rispettato e segnalato', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const view = readFolder(fake.folder, { platform: 'darwin', home: fake.home, limit: 5 });
  assert.equal(view.total, 5); assert.equal(view.found, 19); assert.equal(view.truncated, true);
  assert.match(notice(view), /Ho letto l'elenco di Download: 19 elementi\..*primi 5.*parziali/);
  assert.match(answer(view, { kind: 'count', categories: [] }), /parziale/);
  assert.equal(notice({ display: 'Scrivania', found: 1, total: 1, truncated: false }), "Ho letto l'elenco di Scrivania: 1 elemento.");
});

test('solo cartelle conosciute: Applicazioni e percorsi arbitrari rifiutati', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const apps = folderEntries('darwin', fake.home).find(f => f.display === 'Applicazioni');
  assert.throws(() => readFolder(apps, { platform: 'darwin', home: fake.home }), /non consultabile/);
  assert.throws(() => readFolder({ display: 'Download', target: '/etc' }, { platform: 'darwin', home: fake.home }), /non consultabile/);
  assert.throws(() => readFolder({ display: 'Download', target: fake.dir + '/..' }, { platform: 'darwin', home: fake.home }), /non consultabile/);
  assert.throws(() => readFolder(null, { platform: 'darwin', home: fake.home }), /non consultabile/);
  assert.deepEqual(viewableFolders('darwin', '/h').map(f => f.display), ['Download', 'Documenti', 'Scrivania', 'Immagini']);
  assert.deepEqual(viewableFolders('win32', 'C:\\h').map(f => f.display), ['Download', 'Documenti', 'Scrivania', 'Immagini']);
});

test('doppi probabili: stesso nome a meno dei suffissi, oppure stessa dimensione ed estensione', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const view = readFolder(fake.folder, { platform: 'darwin', home: fake.home });
  const names = view.duplicates.map(group => ({ reason: group.reason, names: group.items.map(item => item.name).sort() }));
  assert.deepEqual(names, [{ reason: 'nome', names: ['relazione (1).pdf', 'relazione.pdf'] }, { reason: 'dimensione', names: ['uguale-a.bin', 'uguale-b.bin'] }]);
  const file = (name, size) => ({ name, kind: 'file', ext: name.split('.').pop(), size });
  assert.equal(findDuplicates([file('a copia.txt', 1), file('a.txt', 2), file('a-1.txt', 3), file('a (2).txt', 4)]).length, 1);
  assert.equal(findDuplicates([file('a.txt', 0), file('b.txt', 0)]).length, 0); // file vuoti: non sono doppi
  assert.equal(findDuplicates([{ name: 'x', kind: 'dir', ext: '', size: 0 }, { name: 'x (1)', kind: 'dir', ext: '', size: 0 }]).length, 0);
});

test('risposte deterministiche: conteggi, elenco e doppi', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const view = readFolder(fake.folder, { platform: 'darwin', home: fake.home });
  assert.equal(answer(view, { kind: 'count', categories: ['immagini'] }), 'In Download ci sono 3 immagini.');
  assert.equal(answer(view, { kind: 'count', categories: ['pdf', 'video'] }), 'In Download ci sono 2 PDF.\nIn Download ci sono 1 video.');
  assert.match(answer(view, { kind: 'count', categories: ['presentazioni'] }), /1 presentazioni/);
  assert.match(answer(view, { kind: 'count', categories: [] }), /19 elementi.*immagini: 3.*PDF: 2/);
  assert.match(answer({ ...view, counts: { ...view.counts, audio: 0 } }, { kind: 'count', categories: ['audio'] }), /non ci sono file audio/);
  const list = answer(view, { kind: 'list', categories: [] }).split('\n');
  assert.match(list[1], /^- relazione\.pdf \(PDF, 2,0 KB\)$/); assert.equal(list.length, 1 + 19); // 19 elementi: nessun «e altri»
  const longer = { ...view, entries: Array.from({ length: 45 }, (_, i) => ({ ...view.entries[0], name: `f${i}.pdf` })) };
  const many = answer(longer, { kind: 'list', categories: [] }).split('\n');
  assert.equal(many.length, 1 + 30 + 1); assert.equal(many.at(-1), 'e altri 15.');
  assert.match(answer(view, { kind: 'list', categories: ['pdf'] }), /relazione \(1\)\.pdf/);
  assert.match(answer(view, { kind: 'duplicates' }), /2 gruppi di doppi probabili.*non sono sicuri[\s\S]*stesso nome: «relazione[\s\S]*stessa dimensione/);
  assert.match(answer({ ...view, duplicates: [] }, { kind: 'duplicates' }), /non vedo file doppi/);
  assert.match(answer({ ...view, entries: [], total: 0 }, { kind: 'count', categories: [] }), /è vuota/);
});

test('contesto per il modello: conteggi esatti, righe limitate, nomi ripuliti', t => {
  const fake = fakeHome(); t.after(() => fs.rmSync(fake.home, { recursive: true, force: true }));
  const view = readFolder(fake.folder, { platform: 'darwin', home: fake.home });
  const context = modelContext(view);
  assert.match(context, /CONTEGGI ESATTI.*totale 19.*immagini: 3.*PDF: 2/);
  assert.match(context, /File più grandi \(esatto\): relazione\.pdf \(2,0 KB\)/);
  assert.match(context, /Doppi probabili.*2 gruppi/);
  assert.match(context, /relazione\.pdf \| PDF \| 2,0 KB \| /);
  assert.ok(!context.includes('dentro.pdf') && !context.includes('.DS_Store'));
  const big = { ...view, total: 500, found: 500, entries: Array.from({ length: 500 }, (_, i) => ({ name: `f${i}.txt`, kind: 'file', category: 'documenti', size: 1, mtime: 1000 - i })) };
  const rows = modelContext(big).split('\n').filter(line => / \| documenti \| 1 B \| /.test(line));
  assert.ok(rows.length > 100 && rows.length <= 300); assert.match(modelContext(big), new RegExp(`mostrate solo le ${rows.length} più recenti su 500`)); // limite di righe e di caratteri
  assert.ok(modelContext(big).length < 12000 + 1500);
  const few = { ...big, total: 40, found: 40, entries: big.entries.slice(0, 40) };
  assert.ok(!/mostrate solo/.test(modelContext(few)));
  assert.equal(safeName('a\nb\u0000c' + 'x'.repeat(100)).includes('\n'), false); assert.ok(safeName('x'.repeat(100)).length <= 80);
});
