'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../../viewer/pack.js');
const Characters = require('../lib/characters.cjs');

const rosso = path.join(__dirname, '../../characters/Cat/rosso');
const tmp = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mascotte-pers-'));
// Cartella di origine con un pacchetto valido (copia di Rosso con id e nome cambiati); `edit` modifica il JSON.
function source(root, folder, edit = json => json) {
  const dir = path.join(root, folder); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(rosso, 'sprites.png'), path.join(dir, 'sprites.png'));
  const json = edit(JSON.parse(fs.readFileSync(path.join(rosso, 'character.json'), 'utf8')));
  fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify(json));
  return dir;
}
const named = (id, name) => json => ({ ...json, id, name });

test('unione dei personaggi inclusi e personali, con categoria Personali', () => {
  const work = tmp(), user = path.join(work, 'characters');
  const included = Characters.readIncluded(P, path.join(__dirname, '../../characters'));
  assert.deepEqual(included.map(c => c.id), ['rosso']); assert.equal(included[0].personal, false);
  const one = source(user, 'biscotto', named('biscotto', 'Biscotto'));
  const personal = Characters.readPersonal(P, user, ['rosso']);
  assert.deepEqual(personal.warnings, []);
  assert.equal(personal.characters.length, 1);
  assert.equal(personal.characters[0].category, 'Personali'); assert.equal(personal.characters[0].personal, true);
  assert.match(personal.characters[0].imageData, /^data:image\/png;base64,/);
  assert.equal(personal.characters[0].pack.name, 'Biscotto'); assert.ok(one);
});

test('cartella personale assente: nessun personaggio e nessun avviso', () => {
  const result = Characters.readPersonal(P, path.join(tmp(), 'non-esiste'), ['rosso']);
  assert.deepEqual(result, { characters: [], warnings: [] });
});

test('un pacchetto personale non valido viene saltato con un avviso, gli altri restano', () => {
  const user = path.join(tmp(), 'characters');
  source(user, 'buono', named('buono', 'Buono'));
  source(user, 'rotto', json => ({ ...named('rotto', 'Rotto')(json), frame: { width: 33, height: 32 } })); // 33 non divide 192
  fs.mkdirSync(path.join(user, 'vuoto'));
  source(user, 'Maiuscola', named('Maiuscola', 'M'));
  source(user, 'altro-id', named('diverso', 'Diverso'));
  const result = Characters.readPersonal(P, user, ['rosso']);
  assert.deepEqual(result.characters.map(c => c.id), ['buono']);
  assert.equal(result.warnings.length, 4);
  assert.ok(result.warnings.some(w => /«rotto» saltata.*multiplo/.test(w)));
  assert.ok(result.warnings.some(w => /«vuoto» saltata.*Manca/.test(w)));
});

test('un id personale uguale a uno incluso è rifiutato (lettura e importazione)', () => {
  const work = tmp(), user = path.join(work, 'characters');
  source(user, 'rosso', named('rosso', 'Finto Rosso'));
  const read = Characters.readPersonal(P, user, ['rosso']);
  assert.equal(read.characters.length, 0); assert.match(read.warnings[0], /già usato da un personaggio incluso/);
  const imported = Characters.importFolder(P, source(work, 'origine', named('rosso', 'Finto')), path.join(work, 'nuove'), { includedIds: ['rosso'] });
  assert.equal(imported.ok, false); assert.match(imported.reason, /già usato/);
  assert.equal(fs.existsSync(path.join(work, 'nuove')), false);
});

test('importazione: un pacchetto valido viene copiato (solo i due file) e poi riletto', () => {
  const work = tmp(), user = path.join(work, 'characters');
  const origin = source(work, 'Il Mio Gatto', json => { const { id, ...rest } = json; return { ...rest, name: 'Il mio gatto' }; });
  fs.writeFileSync(path.join(origin, 'note.txt'), 'da ignorare'); fs.writeFileSync(path.join(origin, 'script.sh'), '#!/bin/sh\n');
  const result = Characters.importFolder(P, origin, user, { includedIds: ['rosso'] });
  assert.deepEqual(result, { ok: true, id: 'il-mio-gatto', name: 'Il mio gatto' });
  assert.deepEqual(fs.readdirSync(path.join(user, 'il-mio-gatto')).sort(), ['character.json', 'sprites.png']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(user, 'il-mio-gatto/sprites.png')).mode & 0o077, 0);
  assert.deepEqual(fs.readdirSync(user), ['il-mio-gatto']); // nessuna cartella temporanea rimasta
  assert.equal(Characters.readPersonal(P, user, ['rosso']).characters[0].id, 'il-mio-gatto');
  // lo stesso id una seconda volta: rifiutato
  const again = Characters.importFolder(P, origin, user, { includedIds: ['rosso'], personalIds: ['il-mio-gatto'] });
  assert.equal(again.ok, false); assert.match(again.reason, /rimuovila prima/);
});

test('importazione: un pacchetto non valido è rifiutato senza copiare nulla', () => {
  const work = tmp(), user = path.join(work, 'characters');
  const cases = {
    'senza-json': dir => fs.rmSync(path.join(dir, 'character.json')),
    'senza-png': dir => fs.rmSync(path.join(dir, 'sprites.png')),
    'png-finto': dir => fs.writeFileSync(path.join(dir, 'sprites.png'), 'non sono un PNG'),
    'json-rotto': dir => fs.writeFileSync(path.join(dir, 'character.json'), '{ non json'),
    'foglio-diverso': dir => fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(rosso, 'character.json'), 'utf8')), sheet: 'altro.png' })),
    'foglio-fuori': dir => fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(rosso, 'character.json'), 'utf8')), sheet: '../sprites.png' })),
    'riga-fuori': dir => fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(rosso, 'character.json'), 'utf8')), animations: { idle: { row: 99, frames: 1 } } })),
    'json-enorme': dir => fs.writeFileSync(path.join(dir, 'character.json'), ' '.repeat(300000) + '{}'),
    'id-strano': dir => fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(rosso, 'character.json'), 'utf8')), id: '../fuori' }))
  };
  for (const [name, damage] of Object.entries(cases)) {
    const dir = source(work, name); damage(dir);
    const result = Characters.importFolder(P, dir, user, { includedIds: ['rosso'] });
    assert.equal(result.ok, false, name); assert.match(result.reason, /\S/, name);
  }
  assert.equal(fs.existsSync(user) ? fs.readdirSync(user).length : 0, 0);
  assert.equal(Characters.importFolder(P, path.join(work, 'non-esiste'), user).ok, false);
  assert.equal(Characters.importFolder(P, undefined, user).ok, false);
});

test('importazione: un file che è un link simbolico è rifiutato', { skip: process.platform === 'win32' }, () => {
  const work = tmp(), user = path.join(work, 'characters');
  const other = path.join(work, 'altrove'); fs.mkdirSync(other);
  for (const name of ['sprites.png', 'character.json']) {
    const dir = source(work, 'con-link-' + name.split('.')[0]);
    fs.copyFileSync(path.join(dir, name), path.join(other, name)); fs.rmSync(path.join(dir, name)); fs.symlinkSync(path.join(other, name), path.join(dir, name));
    const result = Characters.importFolder(P, dir, user, { includedIds: ['rosso'] });
    assert.equal(result.ok, false, name); assert.match(result.reason, /collegamento/);
  }
  assert.equal(fs.existsSync(user) ? fs.readdirSync(user).length : 0, 0);
  // una cartella personale che è un link viene saltata alla lettura
  fs.mkdirSync(user, { recursive: true }); fs.symlinkSync(source(work, 'vera', named('vera', 'Vera')), path.join(user, 'vera'));
  const read = Characters.readPersonal(P, user, []);
  assert.equal(read.characters.length, 0); assert.match(read.warnings[0], /non è una cartella normale/);
});

test('rimozione: elimina solo una cartella personale valida', () => {
  const work = tmp(), user = path.join(work, 'characters');
  source(user, 'uno', named('uno', 'Uno')); source(user, 'due', named('due', 'Due'));
  assert.deepEqual(Characters.removePersonal(user, 'uno'), { ok: true });
  assert.deepEqual(fs.readdirSync(user), ['due']);
  assert.equal(Characters.removePersonal(user, 'uno').ok, false); // già rimossa
  for (const bad of ['..', '../', 'a/b', '', '.', undefined, 42, 'Due', 'rosso']) assert.equal(Characters.removePersonal(user, bad).ok, false, String(bad));
  assert.deepEqual(fs.readdirSync(user), ['due']); assert.ok(fs.existsSync(rosso));
});

test('grandezze ammesse: come il menu della mascotte', () => {
  assert.deepEqual(Characters.allowedScales({ frame: { width: 32, height: 32 } }), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Characters.allowedScales({ frame: { width: 512, height: 512 } }), [1, 2, 3, 4]);
  assert.deepEqual(Characters.allowedScales({ frame: { width: 512, height: 400 }, pixelRatio: 2 }), [1, 2, 3, 4, 5, 6]);
});
