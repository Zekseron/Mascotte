'use strict';
// Suono personalizzato della sveglia: formati riconosciuti dai primi byte, limiti, copia e rimozione.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../lib/alarm-sound.cjs');

const pad = head => Buffer.concat([Buffer.from(head, 'latin1'), Buffer.alloc(64)]);
test('formati riconosciuti e rifiutati', () => {
  assert.equal(A.detect(pad('ID3\u0004\u0000'))?.ext, 'mp3');
  assert.equal(A.detect(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(20)]))?.ext, 'mp3');
  assert.equal(A.detect(pad('RIFF\u0000\u0000\u0000\u0000WAVE'))?.ext, 'wav');
  assert.equal(A.detect(pad('OggS'))?.ext, 'ogg');
  assert.equal(A.detect(pad('fLaC'))?.ext, 'flac');
  assert.equal(A.detect(pad('\u0000\u0000\u0000 ftypM4A '))?.ext, 'm4a');
  assert.equal(A.detect(pad('#!/bin/sh\necho ciao')), null);
  assert.equal(A.detect(Buffer.from('ID3')), null); // troppo corto
  assert.equal(A.normalizeVolume(0.04), 0.1); assert.equal(A.normalizeVolume(2), 1); assert.equal(A.normalizeVolume('x'), 0.8); assert.equal(A.normalizeVolume(0.55), 0.6);
});

test('copia, sostituzione, lettura e rimozione; file non validi non copiati', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte suono ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const data = path.join(base, 'dati'); fs.mkdirSync(data);
  const mp3 = path.join(base, 'Gallo.mp3'), wav = path.join(base, 'campana.wav'), fake = path.join(base, 'virus.mp3');
  fs.writeFileSync(mp3, pad('ID3\u0004')); fs.writeFileSync(wav, pad('RIFF\u0000\u0000\u0000\u0000WAVE')); fs.writeFileSync(fake, 'non sono audio, sono un testo qualsiasi');
  assert.deepEqual(A.importSound(mp3, data), { ok: true, name: 'Gallo.mp3', ext: 'mp3' });
  assert.equal(A.readSound(data).mime, 'audio/mpeg');
  assert.deepEqual(A.importSound(wav, data).ext, 'wav'); // sostituisce il precedente
  assert.deepEqual(fs.readdirSync(data), ['alarm-sound.wav']); assert.equal(A.readSound(data).mime, 'audio/wav');
  assert.match(A.importSound(fake, data).reason, /Formato non riconosciuto/); assert.deepEqual(fs.readdirSync(data), ['alarm-sound.wav']);
  assert.match(A.importSound(base, data).reason, /non una cartella/);
  const big = path.join(base, 'lungo.mp3'); fs.writeFileSync(big, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(A.MAX_BYTES)])); assert.match(A.importSound(big, data).reason, /10 MB/);
  fs.writeFileSync(path.join(data, 'alarm-sound.wav'), 'ID3 cambiato dopo'); assert.equal(A.readSound(data), null); // ricontrollato a ogni lettura
  A.removeSound(data); assert.deepEqual(fs.readdirSync(data), []); assert.equal(A.readSound(data), null);
});

test('un file audio collegato non viene importato', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte audio link '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const mp3 = path.join(base, 'audio.mp3'), link = path.join(base, 'link.mp3'), data = path.join(base, 'dati');
  fs.mkdirSync(data); fs.writeFileSync(mp3, pad('ID3\u0004'));
  try { fs.symlinkSync(mp3, link); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('Windows richiede il privilegio per creare symlink di file');
    throw error;
  }
  assert.match(A.importSound(link, data).reason, /collegamento/);
  assert.deepEqual(fs.readdirSync(data), []);
});
