'use strict';
// Suono personalizzato della sveglia: un file audio scelto dall'utente, controllato (formato riconosciuto dai primi byte,
// dimensione massima) e copiato nella cartella dati come alarm-sound.<estensione>. Non viene mai eseguito, solo riprodotto.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 10 * 1024 * 1024;
const FORMATS = [
  { ext: 'mp3', mime: 'audio/mpeg', test: b => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { ext: 'wav', mime: 'audio/wav', test: b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' },
  { ext: 'ogg', mime: 'audio/ogg', test: b => b.toString('latin1', 0, 4) === 'OggS' },
  { ext: 'flac', mime: 'audio/flac', test: b => b.toString('latin1', 0, 4) === 'fLaC' },
  { ext: 'm4a', mime: 'audio/mp4', test: b => b.toString('latin1', 4, 8) === 'ftyp' }
];
const NAMES = FORMATS.map(format => `alarm-sound.${format.ext}`);

function detect(bytes) { return bytes.length >= 12 ? FORMATS.find(format => format.test(bytes)) || null : null; }

// Copia il file scelto dopo i controlli. Restituisce { ok, name, ext } oppure { ok: false, reason }.
function importSound(source, dataDir) {
  let bytes;
  try {
    const stat = fs.lstatSync(source);
    if (!stat.isFile()) return { ok: false, reason: 'Scegli un file audio, non una cartella o un collegamento.' };
    if (stat.size > MAX_BYTES) return { ok: false, reason: 'Il file audio supera 10 MB: scegline uno più corto.' };
    bytes = fs.readFileSync(source);
  } catch { return { ok: false, reason: 'Non riesco a leggere il file scelto.' }; }
  const format = detect(bytes);
  if (!format) return { ok: false, reason: 'Formato non riconosciuto: usa un file MP3, WAV, M4A, OGG o FLAC.' };
  const target = path.join(dataDir, `alarm-sound.${format.ext}`), temporary = target + '.part';
  fs.writeFileSync(temporary, bytes, { mode: 0o600 });
  for (const name of NAMES) if (path.join(dataDir, name) !== target) fs.rmSync(path.join(dataDir, name), { force: true });
  fs.renameSync(temporary, target);
  return { ok: true, name: path.basename(source).slice(0, 120), ext: format.ext };
}

// Il suono salvato, ricontrollato a ogni lettura: { mime, base64 } oppure null.
function readSound(dataDir) {
  for (const name of NAMES) {
    const file = path.join(dataDir, name);
    try {
      const stat = fs.lstatSync(file); if (!stat.isFile() || stat.size > MAX_BYTES) continue;
      const bytes = fs.readFileSync(file), format = detect(bytes);
      if (format && name === `alarm-sound.${format.ext}`) return { mime: format.mime, base64: bytes.toString('base64') };
    } catch {}
  }
  return null;
}
function removeSound(dataDir) { for (const name of NAMES) fs.rmSync(path.join(dataDir, name), { force: true }); }
const normalizeVolume = value => Number.isFinite(value) ? Math.min(1, Math.max(0.1, Math.round(value * 10) / 10)) : 0.8;

module.exports = { importSound, readSound, removeSound, detect, normalizeVolume, MAX_BYTES };
