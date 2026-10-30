'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Extra = require('../lib/extra-folders.cjs');
const { parseLocalCommand, parseFolderQuestion, validateTarget, folderEntries } = require('../lib/local-commands.cjs');
const FolderView = require('../lib/folder-view.cjs');

const mac = { platform: 'darwin', home: '/Users/prova', dataDir: '/Users/prova/Library/Application Support/Mascotte' };
const win = { platform: 'win32', home: 'C:\\Users\\prova', dataDir: 'C:\\Users\\prova\\AppData\\Roaming\\Mascotte' };

test('validateExtraFolder su Mac: cartelle ammesse e rifiutate', () => {
  for (const ok of ['/Users/prova/siti', '/Users/prova', '/Users/prova/Documents/Lavoro', '/Volumes/Disco/Dati', '/Users/prova/siti/Progetti Personali']) assert.equal(Extra.validateExtraFolder(ok, mac).ok, true, ok);
  for (const bad of ['/', '/System', '/System/Applications', '/Library', '/Library/Fonts', '/private', '/private/tmp', '/usr', '/usr/local', '/bin', '/sbin', '/etc', '/var', '/var/folders', '/Volumes',
    mac.dataDir, mac.dataDir + '/chat', '/Users/prova/Library', '/Users/prova/Library/Mail', '/Users/prova/.claude', '/Users/prova/.claude/projects', '/Users/prova/.codex', '/Users/prova/.ssh', '/Users/prova/.gnupg',
    '/Users/prova/.config', '/Users/prova/siti/.git', 'siti', '', undefined, '/Users/prova/a\0b']) {
    const result = Extra.validateExtraFolder(bad, mac);
    assert.equal(result.ok, false, String(bad)); assert.match(result.reason, /\S/);
  }
  assert.equal(Extra.validateExtraFolder('/Users/prova/Libreria', mac).ok, true); // «Library» è un nome esatto, non un prefisso
  assert.equal(Extra.validateExtraFolder('/Users/prova/', mac).ok, true); // barra finale
});

test('validateExtraFolder su Windows: cartelle ammesse e rifiutate', () => {
  for (const ok of ['C:\\Users\\prova\\siti', 'C:\\Users\\prova', 'D:\\Dati', 'D:\\Progetti\\Mascotte']) assert.equal(Extra.validateExtraFolder(ok, win).ok, true, ok);
  for (const bad of ['C:\\', 'D:\\', 'C:', 'C:\\Windows', 'c:\\windows\\System32', 'C:\\Program Files', 'C:\\Program Files (x86)\\Tool', 'D:\\Windows',
    win.dataDir, win.dataDir + '\\chat', 'C:\\Users\\prova\\AppData', 'c:\\users\\PROVA\\appdata\\Local\\Temp', 'C:\\Users\\prova\\.claude', 'C:\\Users\\prova\\.ssh\\keys', 'C:\\Users\\prova\\.codex', 'C:\\Users\\prova\\.gnupg',
    'C:\\Users\\prova\\siti\\.git', 'relativa\\cartella', '']) assert.equal(Extra.validateExtraFolder(bad, win).ok, false, bad);
});

test('nomi: conflitti con le cartelle predefinite e tra cartelle aggiunte, senza maiuscole né accenti', () => {
  const list = [{ name: 'Siti', path: '/Users/prova/siti' }];
  for (const name of ['Download', 'DOWNLOADS', 'documenti', 'Documents', 'Scrivania', 'desktop', 'Immagini', 'Pictures', 'Applicazioni', 'siti', 'SÍTI']) assert.match(Extra.nameConflict(name, list), new RegExp(`^Esiste già una cartella chiamata ${name}\\.`), name);
  assert.equal(Extra.nameConflict('Progetti', list), '');
  assert.equal(Extra.nameConflict('Perché', [{ name: 'perche', path: '/x' }]).startsWith('Esiste già'), true);
  assert.notEqual(Extra.nameConflict('日本語', list), ''); // nessuna lettera o cifra riconoscibile
});

test('normalizeExtraFolders scarta i valori non validi senza errori', () => {
  assert.deepEqual(Extra.normalizeExtraFolders(undefined, mac), []);
  assert.deepEqual(Extra.normalizeExtraFolders('siti', mac), []);
  assert.deepEqual(Extra.normalizeExtraFolders({ name: 'siti' }, mac), []);
  const good = { name: 'siti', path: '/Users/prova/siti' };
  const raw = [null, 5, 'x', [], {}, { name: 'x' }, { path: '/Users/prova/x' }, { name: 3, path: '/Users/prova/x' }, good, { ...good }, { name: 'Siti', path: '/Users/prova/altro/Siti' },
    { name: 'Download', path: '/Users/prova/Download' }, { name: 'altro', path: '/Users/prova/siti' }, { name: 'etc', path: '/etc' }, { name: 'nascosta', path: '/Users/prova/.nascosta' }, { name: 'ok', path: '/Users/prova/ok' }];
  assert.deepEqual(Extra.normalizeExtraFolders(raw, mac), [good, { name: 'ok', path: '/Users/prova/ok' }]);
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `cartella${i}`, path: `/Users/prova/cartella${i}` }));
  assert.equal(Extra.normalizeExtraFolders(many, mac).length, Extra.MAX_EXTRA);
  assert.equal(Extra.MAX_EXTRA, 20);
});

// Le prove sul disco usano una cartella temporanea dentro windows/ (il temporaneo di sistema è sotto /private, rifiutato per regola).
function sandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(__dirname, '..', 'tmp-extra-')));
  return { root, opts: { home: os.homedir(), dataDir: path.join(root, 'dati') }, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('addExtraFolder: percorso reale, nomi in conflitto e limite', () => {
  const { root, opts, clean } = sandbox();
  try {
    const siti = path.join(root, 'siti'), doc = path.join(root, 'Download'), nested = path.join(root, 'x', 'siti');
    for (const dir of [siti, doc, nested]) fs.mkdirSync(dir, { recursive: true });
    const link = path.join(root, 'collegamento'); fs.symlinkSync(siti, link, process.platform === 'win32' ? 'junction' : 'dir');
    const first = Extra.addExtraFolder([], link, opts);
    assert.equal(first.ok, true); assert.deepEqual(first.list, [{ name: 'siti', path: siti }]); // il link viene risolto
    assert.match(Extra.addExtraFolder(first.list, siti, opts).reason, /già nell’elenco/);
    assert.match(Extra.addExtraFolder(first.list, nested, opts).reason, /^Esiste già una cartella chiamata siti\./);
    assert.match(Extra.addExtraFolder([], doc, opts).reason, /^Esiste già una cartella chiamata Download\./);
    assert.match(Extra.addExtraFolder([], path.join(root, 'inesistente'), opts).reason, /non è disponibile/);
    fs.writeFileSync(path.join(root, 'file.txt'), ''); assert.equal(Extra.addExtraFolder([], path.join(root, 'file.txt'), opts).ok, false);
    assert.equal(Extra.addExtraFolder([], opts.dataDir, opts).ok, false);
    fs.mkdirSync(opts.dataDir); assert.match(Extra.addExtraFolder([], opts.dataDir, opts).reason, /dati di Mascotte/);
    assert.equal(Extra.addExtraFolder(Array.from({ length: 20 }, (_, i) => ({ name: `c${i}`, path: `/x/c${i}` })), nested, opts).ok, false);
  } finally { clean(); }
});

test('cartelle aggiunte: riconosciute in chat per nome, con le stesse regole delle predefinite', () => {
  const extra = [{ name: 'siti', path: '/Users/prova/siti' }, { name: 'Mio Progetto', path: '/Users/prova/Mio Progetto' }, { name: 'Perché', path: '/Users/prova/Perché' }];
  for (const options of [{ ...mac, extraFolders: extra }, { platform: 'win32', home: 'C:\\Users\\prova', extraFolders: extra }]) {
    const cases = [['che file ho in siti?', 'siti', 'list', []], ['quanti pdf ci sono in siti?', 'siti', 'count', ['pdf']], ['ci sono file doppi nella cartella Siti', 'siti', 'duplicates', []],
      ['quanti file ci sono in mio progetto', 'Mio Progetto', 'count', []], ['mostrami i file nella cartella Mio-Progetto, grazie', 'Mio Progetto', 'list', []], ['che file ho in perche?', 'Perché', 'list', []],
      ['qual è il pdf più recente in siti?', 'siti', 'model', ['pdf']], ['che file ho in download?', 'Download', 'list', []]];
    for (const [text, display, kind, categories] of cases) {
      const result = parseLocalCommand(text, options);
      assert.equal(result?.type, 'folder', text); assert.equal(result.folder.display, display, text); assert.equal(result.question.kind, kind, text); assert.deepEqual(result.question.categories, categories, text);
    }
    assert.equal(parseLocalCommand('che file ho in siti?', options).folder.target, extra[0].path);
    assert.equal(parseLocalCommand('che file ho in siti?', options).folder.extra, true);
    assert.equal(parseLocalCommand('che file ho in download?', options).folder.extra, undefined);
  }
  assert.equal(parseFolderQuestion('che file ho in siti?', mac)?.type, 'reply'); // senza l'elenco la cartella non esiste
  const entries = folderEntries('darwin', '/Users/prova', extra);
  assert.deepEqual(entries.slice(-3).map(item => [item.display, item.target, item.extra]), extra.map(item => [item.name, item.path, true]));
  assert.equal(parseLocalCommand('quanti file ci sono in siti?', { ...mac, extraFolders: 'non valido' }).type, 'reply');
});

test('apri <cartella aggiunta>: proposta con conferma, solo per cartelle presenti nell’elenco', () => {
  const extra = [{ name: 'siti', path: '/Users/prova/siti' }, { name: 'Mio Progetto', path: '/Users/prova/Mio Progetto' }];
  const options = { platform: 'darwin', home: '/Users/prova', appDirs: [], extraFolders: extra };
  const siti = parseLocalCommand('apri siti', options);
  assert.equal(siti.type, 'open'); assert.equal(siti.target, '/Users/prova/siti'); assert.equal(siti.extraName, 'siti'); assert.match(siti.description, /\/Users\/prova\/siti/);
  assert.equal(parseLocalCommand('apri la cartella Mio Progetto', options).target, '/Users/prova/Mio Progetto');
  assert.equal(parseLocalCommand('apri download', options).extraName, undefined);
  const missing = parseLocalCommand('apri progetti', options);
  assert.equal(missing.type, 'reply'); assert.match(missing.text, /Non trovo/);
  assert.equal(parseLocalCommand('apri siti', { ...options, extraFolders: [] }).type, 'reply');
});

test('validateTarget accetta le cartelle aggiunte presenti nell’elenco e ancora valide, non altre', () => {
  const { root, opts, clean } = sandbox();
  try {
    const siti = path.join(root, 'siti'), altra = path.join(root, 'altra'), nascosta = path.join(root, '.nascosta');
    for (const dir of [siti, altra, nascosta]) fs.mkdirSync(dir);
    const options = { platform: process.platform, home: opts.home, dataDir: opts.dataDir, appDirs: [], extraFolders: [{ name: 'siti', path: siti }, { name: 'nascosta', path: nascosta }] };
    assert.equal(validateTarget(siti, options), true);
    assert.equal(validateTarget(altra, options), false); // esiste ma non è nell'elenco
    assert.equal(validateTarget(siti, { ...options, extraFolders: [] }), false);
    assert.equal(validateTarget(nascosta, options), false); // in elenco ma non più valida per le regole
    assert.equal(validateTarget(path.join(siti, '..', 'altra'), options), false);
    const link = path.join(root, 'link'); fs.symlinkSync(altra, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(validateTarget(link, options), false);
    fs.rmSync(siti, { recursive: true });
    assert.equal(validateTarget(siti, options), false); // cancellata dopo l'aggiunta
  } finally { clean(); }
});

test('lettura di una cartella aggiunta: un livello, e se sparisce o cambia risponde con il messaggio delle Impostazioni', () => {
  const { root, opts, clean } = sandbox();
  try {
    const siti = path.join(root, 'siti'); fs.mkdirSync(path.join(siti, 'sotto'), { recursive: true });
    fs.writeFileSync(path.join(siti, 'uno.pdf'), 'x'); fs.writeFileSync(path.join(siti, 'sotto', 'due.pdf'), 'x'); fs.writeFileSync(path.join(siti, '.nascosto.pdf'), 'x');
    const extraFolders = [{ name: 'siti', path: siti }], options = { home: opts.home, dataDir: opts.dataDir, extraFolders };
    const command = parseLocalCommand('quanti pdf ci sono in siti?', { home: opts.home, extraFolders });
    assert.equal(command.folder.extra, true);
    const view = FolderView.readFolder(command.folder, options);
    assert.equal(view.counts.pdf, 1); assert.equal(view.counts.cartelle, 1); assert.match(FolderView.answer(view, command.question), /1 PDF/);
    assert.throws(() => FolderView.readFolder(command.folder, { ...options, extraFolders: [] }), /non consultabile/); // non in elenco
    fs.rmSync(siti, { recursive: true });
    assert.throws(() => FolderView.readFolder(command.folder, options), error => error.code === 'GONE' && error.message === 'La cartella siti non è più disponibile: rimuovila o aggiungila di nuovo dalle Impostazioni.');
    const altra = path.join(root, 'altra'); fs.mkdirSync(altra); fs.symlinkSync(altra, siti, process.platform === 'win32' ? 'junction' : 'dir'); // la cartella è stata sostituita da un link: realpath diverso
    assert.throws(() => FolderView.readFolder(command.folder, options), error => error.code === 'GONE');
  } finally { clean(); }
});

test('cartella non presente: risposta senza modello solo con riconoscimento affidabile', () => {
  const reply = parseLocalCommand('che file ho in progetti?', mac);
  assert.equal(reply.type, 'reply'); assert.equal(reply.text, 'Non vedo una cartella chiamata «progetti». Puoi aggiungerla dalle Impostazioni → Cartelle visibili.');
  assert.equal(parseLocalCommand('quanti pdf ci sono nella cartella Lavoro', mac).type, 'reply');
  // casi dubbi: restano al modello (null)
  for (const text of ['quanti file ho in totale?', 'che file ho in /Users/prova/progetti', 'qual è il file più grande in progetti?', 'ci sono errori in progetti?', 'cosa mi consigli in progetti?', 'quanti giorni ci sono in marzo?',
    'che file ho in 2024', 'quanti file ci sono in applicazioni', 'che cosa ho in mente di fare in progetti', 'ho dei file in progetti e non so cosa farne']) assert.equal(parseLocalCommand(text, mac), null, text);
});

test('stesso percorso: su Windows senza distinguere maiuscole, su Mac esatto', () => {
  const { samePath } = require('../lib/extra-folders.cjs');
  assert.equal(samePath('C:\\Users\\Prova\\Siti', 'c:\\users\\prova\\siti', 'win32'), true);
  assert.equal(samePath('/Users/prova/Siti', '/Users/prova/siti', 'darwin'), false);
  assert.equal(samePath('/Users/prova/siti', '/Users/prova/siti', 'darwin'), true);
  assert.equal(samePath(undefined, '/a', 'darwin'), false);
});
