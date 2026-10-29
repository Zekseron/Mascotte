'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRegularPath } = require('./storage.cjs');

// Personaggi: quelli inclusi nell'app (resources/characters/index.json) e le mascotte personali dell'utente
// (<cartella dati>/characters/<id>/ con solo character.json e sprites.png). Stesse validazioni per tutti.
const MAX_PNG = 16777216, MAX_SIDE = 8192, MAX_PIXELS = 33554432, MAX_JSON = 262144, MAX_PERSONAL = 30;
const SHEET = 'sprites.png', CATEGORY = 'Personali';
// Il nome della cartella personale coincide con l'id: solo minuscole, cifre e trattini, così non può uscire dalla cartella.
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SCALES = [1, 2, 3, 4, 5, 6];
// Come il menu «Grandezza»: il fotogramma ingrandito non supera 2048 punti per lato.
const allowedScales = pack => SCALES.filter(scale => Math.max(pack.frame.width, pack.frame.height) * scale / (pack.pixelRatio || 1) <= 2048);
const slugOf = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Legge e convalida un pacchetto da una cartella. `strict` (mascotte personali): file normali e non link, foglio chiamato sprites.png.
// Lancia un errore con un messaggio comprensibile; altrimenti restituisce { pack, bytes, json }.
function loadPack(P, folder, { strict = false, folderName } = {}) {
  const read = (name, max, label) => {
    const file = path.join(folder, name);
    let info; try { info = fs.lstatSync(file); } catch { throw new Error(`Manca il file ${name}.`); }
    if (info.isSymbolicLink()) throw new Error(`${name} è un collegamento: sono ammessi solo file veri.`);
    if (!info.isFile()) throw new Error(`${name} non è un file.`);
    if (info.size > max) throw new Error(`${label} è troppo grande (massimo ${Math.round(max / 1048576 * 100) / 100} MB).`);
    return fs.readFileSync(file);
  };
  const bytes = read(SHEET, MAX_PNG, 'sprites.png'), size = P.pngSize(bytes);
  if (!size || size.width > MAX_SIDE || size.height > MAX_SIDE || size.width * size.height > MAX_PIXELS) throw new Error('sprites.png non è un PNG valido o supera 8192 × 8192 pixel.');
  const text = read('character.json', MAX_JSON, 'character.json');
  const parsed = P.parseJson(text.toString('utf8'));
  if (parsed.error) throw new Error(parsed.error);
  const result = P.validatePack(parsed.json, size.width, size.height, folderName ? { folderName } : undefined);
  if (result.errors.length) throw new Error('Personaggio non valido: ' + result.errors.join('; '));
  if (strict && P.normalizePath(result.pack.sheet).toLowerCase() !== SHEET) throw new Error('«sheet» deve valere "sprites.png".');
  return { pack: result.pack, bytes, text };
}
const toCharacter = (loaded, category, personal) => ({ id: loaded.pack.id, name: loaded.pack.name, category, personal, pack: loaded.pack, imageData: 'data:image/png;base64,' + loaded.bytes.toString('base64') });

// Personaggi inclusi nell'app: un errore blocca l'avvio, come prima.
function readIncluded(P, directory) {
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'));
  return index.characters.map(entry => {
    if (typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..')) throw new Error('Percorso personaggio non valido');
    const folder = path.join(directory, entry.path); assertRegularPath(folder);
    return toCharacter(loadPack(P, folder), entry.category || 'Altro', false);
  });
}
// Mascotte personali: ogni pacchetto non valido viene saltato con un avviso. Gli id già usati dai personaggi inclusi sono rifiutati.
function readPersonal(P, userDirectory, includedIds = []) {
  const characters = [], warnings = [];
  let names = [];
  try { assertRegularPath(userDirectory); names = fs.existsSync(userDirectory) ? fs.readdirSync(userDirectory).sort() : []; } catch { return { characters, warnings: ['La cartella delle mascotte personali non è leggibile.'] }; }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    try {
      const folder = path.join(userDirectory, name), info = fs.lstatSync(folder);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('non è una cartella normale');
      if (!ID_PATTERN.test(name)) throw new Error('il nome della cartella non è un id valido');
      if (characters.length >= MAX_PERSONAL) throw new Error(`troppe mascotte personali (massimo ${MAX_PERSONAL})`);
      const loaded = loadPack(P, folder, { strict: true, folderName: name });
      if (loaded.pack.id !== name) throw new Error(`l'id «${loaded.pack.id}» non coincide con il nome della cartella`);
      if (includedIds.includes(loaded.pack.id)) throw new Error(`l'id «${loaded.pack.id}» è già usato da un personaggio incluso`);
      characters.push(toCharacter(loaded, CATEGORY, true));
    } catch (error) { warnings.push(`Mascotte «${name}» saltata: ${error.message}`); }
  }
  return { characters, warnings };
}
// Importa una cartella scelta dall'utente: prima la convalida completa, poi copia solo i due file nella cartella personale.
// Restituisce { ok: true, id, name } oppure { ok: false, reason }. Non esegue nulla e non tocca la cartella di origine.
function importFolder(P, source, userDirectory, { includedIds = [], personalIds = [] } = {}) {
  try {
    if (typeof source !== 'string' || !source || source.includes('\0')) throw new Error('Cartella non valida.');
    const real = fs.realpathSync(source);
    if (!fs.statSync(real).isDirectory()) throw new Error('Scegli una cartella.');
    const folderId = slugOf(path.basename(real)) || 'mascotte';
    const loaded = loadPack(P, real, { strict: true, folderName: folderId });
    const id = loaded.pack.id;
    if (!ID_PATTERN.test(id)) throw new Error(`L'id «${id}» non è valido: usa minuscole, cifre e trattini (massimo 40 caratteri).`);
    if (includedIds.includes(id)) throw new Error(`L'id «${id}» è già usato da un personaggio incluso nell'app: scegline un altro nel file character.json.`);
    if (personalIds.includes(id)) throw new Error(`Hai già una mascotte con id «${id}»: rimuovila prima, oppure cambia l'id.`);
    if (personalIds.length >= MAX_PERSONAL) throw new Error(`Hai già ${MAX_PERSONAL} mascotte personali: rimuovine una.`);
    assertRegularPath(userDirectory);
    fs.mkdirSync(userDirectory, { recursive: true, mode: 0o700 });
    const target = path.join(userDirectory, id);
    if (fs.existsSync(target)) throw new Error(`La cartella «${id}» esiste già tra le mascotte personali.`);
    // Si copia in una cartella temporanea e la si rinomina solo a copia riuscita: niente pacchetti a metà.
    const temp = path.join(userDirectory, '.nuova-' + crypto.randomUUID());
    fs.mkdirSync(temp, { mode: 0o700 });
    try {
      fs.writeFileSync(path.join(temp, SHEET), loaded.bytes, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(temp, 'character.json'), loaded.text, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, target);
    } catch (error) { fs.rmSync(temp, { recursive: true, force: true }); throw error; }
    return { ok: true, id, name: loaded.pack.name };
  } catch (error) { return { ok: false, reason: error.message || 'Non riesco ad aggiungere la mascotte.' }; }
}
// Elimina una mascotte personale (solo una cartella vera dentro quella personale, con id valido).
function removePersonal(userDirectory, id) {
  try {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Mascotte non valida.');
    assertRegularPath(userDirectory);
    const target = path.join(userDirectory, id), info = fs.lstatSync(target);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Mascotte non valida.');
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: true };
  } catch (error) { return { ok: false, reason: error.message || 'Non riesco a rimuovere la mascotte.' }; }
}
module.exports = { MAX_PERSONAL, CATEGORY, ID_PATTERN, allowedScales, loadPack, readIncluded, readPersonal, importFolder, removePersonal };
