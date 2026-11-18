'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ErrorLog = require('../lib/error-log.cjs');

function quiet(fn) {
  const original = console.error; console.error = () => {};
  try { return fn(); } finally { console.error = original; }
}

test('registro errori: una riga con etichetta, codice e messaggio su una sola riga', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-log-'));
  try {
    ErrorLog.configure(dir);
    quiet(() => ErrorLog.error('cartella immagini non cancellata', Object.assign(new Error('permesso\nnegato'), { code: 'EPERM' })));
    const text = fs.readFileSync(path.join(dir, ErrorLog.NAME), 'utf8');
    assert.match(text, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z cartella immagini non cancellata \[EPERM\]: permesso negato\n$/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, ErrorLog.NAME)).mode & 0o777, 0o600);
  } finally { ErrorLog.configure(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registro errori: messaggi lunghi tagliati e codici attesi ignorati', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-log-'));
  try {
    ErrorLog.configure(dir);
    quiet(() => {
      ErrorLog.error('file pid', Object.assign(new Error('non esiste'), { code: 'ENOENT' }), { ignore: ['ENOENT'] });
      ErrorLog.error('lungo', new Error('x'.repeat(5000)));
      ErrorLog.error('stringa', 'solo testo');
      ErrorLog.error('vuoto', undefined);
    });
    const lines = fs.readFileSync(path.join(dir, ErrorLog.NAME), 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 3, 'ENOENT ignorato');
    assert.ok(lines[0].endsWith('x'.repeat(ErrorLog.MAX_MESSAGE)) && !lines[0].includes('x'.repeat(ErrorLog.MAX_MESSAGE + 1)));
    assert.match(lines[1], / stringa: solo testo$/);
    assert.match(lines[2], / vuoto: errore sconosciuto$/);
  } finally { ErrorLog.configure(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registro errori: la cartella personale nei percorsi diventa ~', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-log-'));
  try {
    ErrorLog.configure(dir);
    const inside = path.join(os.homedir(), 'Library', 'Mascotte', 'release-update-x');
    quiet(() => ErrorLog.error('percorso', Object.assign(new Error(`ENOTEMPTY, Directory not empty: '${inside}'`), { code: 'ENOTEMPTY' })));
    const text = fs.readFileSync(path.join(dir, ErrorLog.NAME), 'utf8');
    assert.ok(!text.includes(os.homedir()), 'il percorso della cartella personale non deve comparire');
    assert.ok(text.includes(`'~${path.sep}Library${path.sep}Mascotte${path.sep}release-update-x'`));
  } finally { ErrorLog.configure(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registro errori: oltre il limite ruota in errori.log.1 e non cresce senza fine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-log-'));
  try {
    ErrorLog.configure(dir);
    const file = path.join(dir, ErrorLog.NAME);
    fs.writeFileSync(file, 'a'.repeat(ErrorLog.MAX_BYTES - 10));
    quiet(() => ErrorLog.error('dopo il limite', new Error('nuova riga')));
    assert.equal(fs.statSync(file + '.1').size, ErrorLog.MAX_BYTES - 10);
    assert.match(fs.readFileSync(file, 'utf8'), /dopo il limite: nuova riga\n$/);
    assert.ok(fs.statSync(file).size < 1000);
  } finally { ErrorLog.configure(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registro errori: non fa mai fallire chi lo chiama', () => {
  ErrorLog.configure(path.join(os.tmpdir(), 'mascotte-cartella-che-non-esiste', 'sotto'));
  try {
    assert.doesNotThrow(() => quiet(() => ErrorLog.error('cartella mancante', new Error('x'))));
    const circular = {}; circular.self = circular;
    assert.doesNotThrow(() => quiet(() => ErrorLog.error('oggetto strano', { message: { toString() { throw new Error('no'); } } })));
    ErrorLog.configure(null);
    assert.doesNotThrow(() => quiet(() => ErrorLog.error('senza cartella', circular)));
  } finally { ErrorLog.configure(null); }
});
