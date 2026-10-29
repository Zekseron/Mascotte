'use strict';
// B4: l'esito lasciato dall'installatore si legge e si toglie senza mai far fallire l'avvio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Updater = require('../lib/updater.cjs');

function withDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-result-'));
  try { return run(directory, path.join(directory, 'update-result.json')); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('esito valido: restituito e file tolto', () => withDirectory((directory, file) => {
  fs.writeFileSync(file, JSON.stringify({ ok: true, message: 'Mascotte aggiornata.' }));
  assert.deepEqual(Updater.takeUpdateResult(file), { ok: true, message: 'Mascotte aggiornata.' });
  assert.equal(fs.existsSync(file), false);
  assert.equal(Updater.takeUpdateResult(file), null, 'senza file non c\'è nessun esito');
}));

test('se il file non si può togliere, l\'esito viene comunque restituito e non si lancia', () => withDirectory((directory, file) => {
  fs.writeFileSync(file, JSON.stringify({ ok: false, message: 'Aggiornamento non riuscito.' }));
  let result;
  assert.doesNotThrow(() => { result = Updater.takeUpdateResult(file, { unlink: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } }); });
  assert.deepEqual(result, { ok: false, message: 'Aggiornamento non riuscito.' });
}));

test('contenuto non valido: nessun esito e il file resta com\'è', () => withDirectory((directory, file) => {
  fs.writeFileSync(file, JSON.stringify({ ok: true }));
  assert.equal(Updater.takeUpdateResult(file), null); assert.equal(fs.existsSync(file), true);
  fs.writeFileSync(file, 'non json');
  assert.equal(Updater.takeUpdateResult(file), null); assert.equal(fs.existsSync(file), true);
}));

test('regressione B4 in main.cjs: nessun unlinkSync non protetto sull\'esito', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  assert.doesNotMatch(source, /fs\.unlinkSync\(resultFile\)/);
  assert.match(source, /Updater\.takeUpdateResult\(resultFile\)/);
});
