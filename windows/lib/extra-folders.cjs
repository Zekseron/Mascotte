'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Cartelle in più che l'utente aggiunge da Gestione per la chat locale (sola lettura: nomi, tipo, dimensione e data, un livello).
// Il percorso viene sempre da questo elenco salvato (mai dal testo della chat) e viene ricontrollato a ogni lettura o apertura.
const MAX_EXTRA = 20;
const fold = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Chiave di confronto dei nomi: minuscole, senza accenti né punteggiatura (la stessa che usa il riconoscimento delle frasi).
const nameKey = text => fold(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
// Nomi già occupati dalle cartelle predefinite (italiano e inglese).
const RESERVED = ['download', 'downloads', 'documenti', 'documents', 'scrivania', 'desktop', 'immagini', 'pictures', 'applicazioni', 'applications'];

const pathApi = platform => platform === 'win32' ? path.win32 : path.posix;
const inside = (api, ci, child, parent) => {
  const c = ci ? child.toLowerCase() : child, p = ci ? parent.toLowerCase() : parent;
  return c === p || c.startsWith(p.endsWith(api.sep) ? p : p + api.sep);
};
// Stesso percorso: su Windows senza distinguere maiuscole (realpath può cambiare lettera del disco o maiuscole).
const samePath = (a, b, platform = process.platform) => typeof a === 'string' && typeof b === 'string' && (platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const MAC_SYSTEM = ['/System', '/Library', '/private', '/usr', '/bin', '/sbin', '/etc', '/var', '/dev', '/cores'];
const CONFIG_DIRS = ['.claude', '.codex', '.ssh', '.gnupg'];

// Funzione pura: `realPath` è un percorso già risolto (realpath). Restituisce { ok: true } oppure { ok: false, reason }.
function validateExtraFolder(realPath, { platform = process.platform, home = os.homedir(), dataDir = '' } = {}) {
  const api = pathApi(platform), ci = platform === 'win32';
  if (typeof realPath !== 'string' || !realPath || realPath.includes('\0') || !api.isAbsolute(realPath)) return { ok: false, reason: 'Il percorso non è valido.' };
  const target = api.normalize(realPath).replace(/[\\/]+$/, '') || api.parse(realPath).root;
  const root = api.parse(target).root;
  if (target === root || target === root.replace(/[\\/]+$/, '')) return { ok: false, reason: 'Non posso aggiungere la radice del disco.' };
  const at = base => base && inside(api, ci, target, ci ? api.normalize(base) : base);
  if (platform === 'win32') {
    const first = target.slice(root.length).split(api.sep)[0].toLowerCase();
    if (first === 'windows' || first.startsWith('program files')) return { ok: false, reason: 'Le cartelle di sistema non si possono aggiungere.' };
    if (home && at(api.join(home, 'AppData'))) return { ok: false, reason: 'AppData contiene dati dei programmi e non si può aggiungere.' };
  } else {
    if (MAC_SYSTEM.some(dir => at(dir)) || target === '/Volumes') return { ok: false, reason: 'Le cartelle di sistema non si possono aggiungere.' };
    if (home && at(api.join(home, 'Library'))) return { ok: false, reason: 'La cartella Library contiene dati dei programmi e non si può aggiungere.' };
  }
  if (dataDir && at(dataDir)) return { ok: false, reason: 'La cartella dei dati di Mascotte non si può aggiungere.' };
  if (home && CONFIG_DIRS.some(dir => at(api.join(home, dir)))) return { ok: false, reason: 'Le cartelle di configurazione non si possono aggiungere.' };
  if (target.slice(root.length).split(api.sep).some(part => part.startsWith('.'))) return { ok: false, reason: 'Le cartelle nascoste non si possono aggiungere.' };
  return { ok: true };
}

// Conflitto di nome con le cartelle predefinite o con un'altra cartella aggiunta (senza maiuscole né accenti).
function nameConflict(name, list) {
  const key = nameKey(name);
  if (!key) return 'Il nome della cartella non contiene lettere o cifre che riesco a riconoscere in chat.';
  if (RESERVED.includes(key) || list.some(item => nameKey(item.name) === key)) return `Esiste già una cartella chiamata ${name}.`;
  return '';
}

// Valori letti da settings.json: gli elementi non validi vengono scartati senza errori. Non tocca il disco.
function normalizeExtraFolders(raw, opts = {}) {
  const api = pathApi(opts.platform || process.platform), out = [];
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (out.length >= MAX_EXTRA) break;
    if (!item || typeof item.name !== 'string' || typeof item.path !== 'string' || !validateExtraFolder(item.path, opts).ok) continue;
    if (api.basename(item.path) !== item.name || out.some(other => samePath(other.path, item.path, opts.platform)) || nameConflict(item.name, out)) continue;
    out.push({ name: item.name, path: item.path });
  }
  return out;
}

// Il percorso da controllare è un realpath: home e cartella dati vanno confrontate nella loro forma reale (se esistono).
const realOr = value => { try { return value ? fs.realpathSync(value) : value; } catch { return value; } };
const realOpts = ({ platform = process.platform, home = os.homedir(), dataDir = '' } = {}) => ({ platform, home: realOr(home), dataDir: realOr(dataDir) });

// Aggiunta di una cartella scelta dal selettore: risolve il percorso reale e applica tutte le regole.
function addExtraFolder(list, selected, options = {}) {
  const opts = realOpts(options), api = pathApi(opts.platform || process.platform);
  let resolved;
  try { resolved = fs.realpathSync(selected); if (!fs.statSync(resolved).isDirectory()) throw new Error(); } catch { return { ok: false, reason: 'La cartella scelta non è disponibile.' }; }
  const check = validateExtraFolder(resolved, opts);
  if (!check.ok) return check;
  if (list.length >= MAX_EXTRA) return { ok: false, reason: `Puoi aggiungere al massimo ${MAX_EXTRA} cartelle.` };
  if (list.some(item => samePath(item.path, resolved, opts.platform))) return { ok: false, reason: 'Questa cartella è già nell’elenco.' };
  const name = api.basename(resolved), conflict = nameConflict(name, list);
  if (conflict) return { ok: false, reason: conflict + ' Rinominala o scegli un’altra cartella: i nomi devono essere diversi per poterle citare in chat.' };
  return { ok: true, list: [...list, { name, path: resolved }], name };
}

// Ricontrollo al momento dell'uso: la cartella deve esistere ancora, essere la stessa dell'elenco (realpath uguale) e valida.
function recheckExtraFolder(entry, options = {}) {
  const opts = realOpts(options);
  if (!entry || typeof entry.path !== 'string') return false;
  try {
    const resolved = fs.realpathSync(entry.path);
    return samePath(resolved, entry.path, opts.platform) && fs.statSync(resolved).isDirectory() && validateExtraFolder(resolved, opts).ok;
  } catch { return false; }
}
const goneMessage = name => `La cartella ${name} non è più disponibile: rimuovila o aggiungila di nuovo da Gestione.`;

module.exports = { samePath, MAX_EXTRA, RESERVED, nameKey, validateExtraFolder, nameConflict, realOpts, normalizeExtraFolders, addExtraFolder, recheckExtraFolder, goneMessage };
