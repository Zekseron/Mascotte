'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Lettura di sola consultazione delle cartelle conosciute (Download, Documenti, Scrivania, Immagini), per la chat locale.
// Solo nomi, tipo, dimensione e data (lstat): il contenuto dei file non viene mai aperto, un solo livello, nessun link seguito.
// Il percorso viene sempre da folderEntries (mai dal testo dell'utente). Applicazioni è esclusa: per le app c'è già l'elenco app.
const READ_LIMIT = 2000, MODEL_ROWS = 300, MODEL_CHARS = 12000, LIST_ROWS = 30; // righe al modello: al massimo 300 e 12000 caratteri (il contesto è di 8192 token)
const CATEGORY_ORDER = ['immagini', 'pdf', 'documenti', 'fogli', 'presentazioni', 'archivi', 'audio', 'video', 'codice', 'installer', 'altro', 'cartelle', 'link'];
const LABELS = { immagini: 'immagini', pdf: 'PDF', documenti: 'documenti', fogli: 'fogli di calcolo', presentazioni: 'presentazioni', archivi: 'archivi', audio: 'file audio', video: 'video', codice: 'file di codice', installer: 'installer e programmi', altro: 'altri file', cartelle: 'cartelle', link: 'collegamenti' };
// Estensioni per categoria (senza distinguere maiuscole). pkg e dmg sono in «installer» (non in «archivi»): sul Mac sono
// quasi sempre installer di programmi; iso resta tra gli archivi. Una cartella «.app» è un programma, quindi «installer».
const EXTENSIONS = {
  immagini: 'jpg jpeg png gif heic heif webp bmp tiff tif svg raw cr2 nef dng', pdf: 'pdf', documenti: 'doc docx odt rtf txt md pages', fogli: 'xls xlsx ods csv numbers', presentazioni: 'ppt pptx odp key',
  archivi: 'zip rar 7z tar gz tgz iso', audio: 'mp3 wav m4a aac flac ogg aiff aif', video: 'mp4 mov mkv avi webm m4v wmv',
  codice: 'js cjs mjs ts tsx jsx py rb go rs java kt swift c h cpp cs php sh html css json yml yaml xml sql', installer: 'exe msi app pkg dmg'
};
const byExtension = new Map(Object.entries(EXTENSIONS).flatMap(([category, list]) => list.split(' ').map(ext => [ext, category])));

const Extra = require('./extra-folders.cjs');
const viewableFolders = (platform = process.platform, home = os.homedir(), extraFolders = []) => require('./local-commands.cjs').folderEntries(platform, home, extraFolders).filter(folder => folder.display !== 'Applicazioni');
const extensionOf = name => { const i = name.lastIndexOf('.'); return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ''; };
function classify(kind, name) {
  const ext = extensionOf(name);
  if (kind === 'link') return 'link';
  if (kind === 'dir') return ext === 'app' ? 'installer' : 'cartelle';
  return byExtension.get(ext) || 'altro';
}
const fold = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Nome «di base»: senza estensione e senza suffissi da copia: « (1)», « copia», « copy», «-1».
const COPY_SUFFIX = /(?:\s*\(\d+\)|\s+(?:copia|copy)(?:\s*\d+)?|\s*-\s*\d+)+$/;
const baseName = name => { const ext = extensionOf(name), stem = ext ? name.slice(0, -(ext.length + 1)) : name; return fold(stem.replace(COPY_SUFFIX, '').trim()) + (ext ? '.' + ext : ''); };

// Legge la cartella e calcola conteggi e doppi probabili. `folder` deve essere una cartella conosciuta (non Applicazioni).
// Per le cartelle aggiunte da Gestione (`extraFolders`) ricontrolla che esistano ancora, che il realpath sia lo stesso dell'elenco e che siano valide.
function readFolder(folder, { platform = process.platform, home = os.homedir(), limit = READ_LIMIT, extraFolders = [], dataDir = '' } = {}) {
  const known = viewableFolders(platform, home, extraFolders).find(item => folder && item.target === folder.target && item.display === folder.display);
  if (!known) throw new Error('Cartella non consultabile.');
  if (known.extra && !Extra.recheckExtraFolder({ path: known.target }, { platform, home, dataDir })) { const error = new Error(Extra.goneMessage(known.display)); error.code = 'GONE'; throw error; }
  const all = fs.readdirSync(known.target).filter(name => !name.startsWith('.')).sort();
  const names = all.slice(0, limit), entries = [];
  for (const name of names) {
    let stat; try { stat = fs.lstatSync(path.join(known.target, name)); } catch { continue; }
    const kind = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other';
    entries.push({ name, kind, ext: kind === 'file' ? extensionOf(name) : '', category: classify(kind, name), size: kind === 'file' ? stat.size : 0, mtime: stat.mtimeMs });
  }
  const counts = Object.fromEntries(CATEGORY_ORDER.map(category => [category, 0]));
  let totalSize = 0;
  for (const item of entries) { counts[item.category]++; totalSize += item.size; }
  entries.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return { display: known.display, entries, total: entries.length, found: all.length, truncated: all.length > names.length, counts, totalSize, duplicates: findDuplicates(entries) };
}

// Doppi probabili, solo per nome e dimensione (nessun contenuto letto): stesso nome a meno dei suffissi da copia
// e stessa estensione, oppure stessa dimensione (non zero) ed estensione. Solo file veri, mai cartelle o link.
function findDuplicates(entries) {
  const files = entries.filter(item => item.kind === 'file'), groups = [], covered = new Set();
  const group = (key, reason) => {
    const map = new Map();
    for (const item of files) { const k = key(item); if (k) map.set(k, [...(map.get(k) || []), item]); }
    for (const items of map.values()) {
      if (items.length < 2 || items.every(item => covered.has(item.name))) continue;
      groups.push({ reason, items }); items.forEach(item => covered.add(item.name));
    }
  };
  group(item => baseName(item.name), 'nome');
  group(item => item.size > 0 && item.ext ? `${item.size}.${item.ext}` : '', 'dimensione');
  return groups;
}

const noun = n => n === 1 ? '1 elemento' : `${n} elementi`;
// Avviso mostrato in chat prima della risposta.
function notice(view) {
  return `Ho letto l'elenco di ${view.display}: ${noun(view.found)}.` + (view.truncated ? ` Ne ho considerati solo i primi ${view.total} (limite di lettura): conteggi ed elenco sono parziali.` : '');
}
function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB']; let value = bytes / 1024, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 10 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}
const dateText = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
// Nome sicuro da mostrare o passare al modello: senza caratteri di controllo, lunghezza limitata.
const safeName = (name, max = 80) => { const clean = name.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' '); return clean.length > max ? clean.slice(0, max - 1) + '…' : clean; };
const row = item => `${safeName(item.name, 60)} | ${LABELS[item.category]} | ${item.kind === 'file' ? size(item.size) : '-'} | ${dateText(item.mtime)}`;
const partial = view => view.truncated ? ` (parziale: letti solo i primi ${view.total} di ${view.found})` : '';

function describeCounts(view) {
  const parts = CATEGORY_ORDER.filter(category => view.counts[category]).map(category => `${LABELS[category]}: ${view.counts[category]}`);
  return parts.join(', ');
}
// Risposte deterministiche, calcolate dal codice senza il modello. `question`: { kind: 'count'|'list'|'duplicates', categories }.
function answer(view, question) {
  const where = view.display, categories = question.categories || [];
  if (question.kind === 'count') {
    if (!view.total) return `${where} è vuota.`;
    if (!categories.length) {
      const files = view.entries.filter(item => item.kind === 'file').length;
      return `In ${where} ci sono ${noun(view.total)}${partial(view)}: ${describeCounts(view)}. File veri: ${files}, dimensione totale ${size(view.totalSize)}.`;
    }
    return categories.map(category => view.counts[category] ? `In ${where} ci sono ${view.counts[category]} ${LABELS[category]}${partial(view)}.` : `In ${where} non ci sono ${LABELS[category]}${partial(view)}.`).join('\n');
  }
  if (question.kind === 'duplicates') {
    if (!view.duplicates.length) return `In ${where} non vedo file doppi, guardando solo nome e dimensione${partial(view)}.`;
    const lines = view.duplicates.slice(0, 15).map(({ reason, items }) => `- ${reason === 'nome' ? 'stesso nome' : 'stessa dimensione'}: ${items.slice(0, 5).map(item => `«${safeName(item.name, 60)}»`).join(', ')}${items.length > 5 ? ` e altri ${items.length - 5}` : ''}`);
    return `In ${where} ci sono ${view.duplicates.length} gruppi di doppi probabili${partial(view)}, riconosciuti solo da nome e dimensione (non ho letto i contenuti, quindi non sono sicuri):\n` + lines.join('\n') + (view.duplicates.length > 15 ? `\ne altri ${view.duplicates.length - 15} gruppi.` : '');
  }
  const wanted = categories.length ? view.entries.filter(item => categories.includes(item.category)) : view.entries;
  if (!wanted.length) return categories.length ? `In ${where} non ci sono ${categories.map(category => LABELS[category]).join(' né ')}.` : `${where} è vuota.`;
  const shown = wanted.slice(0, LIST_ROWS);
  return `In ${where}, dal più recente${partial(view)}:\n` + shown.map(item => `- ${safeName(item.name, 60)} (${LABELS[item.category]}${item.kind === 'file' ? ', ' + size(item.size) : ''})`).join('\n') + (wanted.length > shown.length ? `\ne altri ${wanted.length - shown.length}.` : '');
}

// Contesto per il modello locale: conteggi esatti calcolati dal codice, fatti già calcolati (più recente, più grande) e al massimo 300 righe compatte.
function modelContext(view) {
  const files = view.entries.filter(item => item.kind === 'file');
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);
  const latestByCategory = CATEGORY_ORDER.map(category => view.entries.find(item => item.category === category)).filter(Boolean).map(item => `${LABELS[item.category]}: ${safeName(item.name)} (${dateText(item.mtime)})`);
  const rows = []; let chars = 0;
  for (const item of view.entries.slice(0, MODEL_ROWS)) { const line = row(item); if (chars + line.length + 1 > MODEL_CHARS) break; rows.push(line); chars += line.length + 1; }
  return [`Cartella: ${view.display} (solo il primo livello, nessun contenuto di file letto, file nascosti esclusi).`,
    `Elementi trovati: ${view.found}${view.truncated ? `; letti solo i primi ${view.total}, quindi i numeri sotto sono parziali` : ''}.`,
    `CONTEGGI ESATTI calcolati da Mascotte (usali, non contare da solo): totale ${view.total}; ${describeCounts(view) || 'nessun elemento'}. Dimensione totale dei file: ${size(view.totalSize)}.`,
    `Più recente per categoria (esatto): ${latestByCategory.join('; ') || 'nessuno'}.`,
    `File più grandi (esatto): ${largest.map(item => `${safeName(item.name)} (${size(item.size)})`).join('; ') || 'nessuno'}.`,
    `Doppi probabili (solo nome e dimensione): ${view.duplicates.length} gruppi.`,
    `Righe «nome | categoria | dimensione | data modifica», dalla più recente${view.total > rows.length ? `; mostrate solo le ${rows.length} più recenti su ${view.total}, quindi per altre domande dillo` : ''}:`,
    ...rows].join('\n');
}
module.exports = { readFolder, viewableFolders, findDuplicates, classify, notice, answer, modelContext, size, safeName, CATEGORY_ORDER, LABELS, READ_LIMIT, MODEL_ROWS, LIST_ROWS };
