'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Comandi della chat locale gestiti da Mascotte senza il modello: azioni predefinite e note.
// Ogni azione e ogni nota passano da una conferma dell'utente (pendingAction in main.cjs).
function openTargets(platform = process.platform, home = os.homedir(), env = process.env) {
  const calculator = platform === 'darwin'
    ? { description: 'Aprire l’app Calcolatrice del Mac.', target: '/System/Applications/Calculator.app' }
    : { description: 'Aprire la Calcolatrice di Windows.', target: path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'calc.exe') };
  const downloads = { description: 'Aprire la cartella Download del tuo utente.', target: path.join(home, 'Downloads') };
  return { 'apri calcolatrice': calculator, 'apri la calcolatrice': calculator, 'apri download': downloads, 'apri la cartella download': downloads };
}
const normalize = text => text.trim().toLocaleLowerCase('it').replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
// «ricorda: …», «ricordati che …», «salva nota: …»: il testo della nota mantiene maiuscole e punteggiatura originali.
const REMEMBER = /^(?:ricorda(?:ti)?(?:\s+che)?|salva(?:\s+(?:una|la|questa))?\s+nota)\s*[:,]?\s+([\s\S]+)$/i;
const LIST = /^(?:che note ho|quali note ho(?: salvato)?|ho (?:delle )?note(?: salvate)?|mostra(?:mi)? (?:le )?(?:mie )?note|elenca (?:le )?note)$/;

// Confronto: minuscole, senza accenti, spazi singoli.
const fold = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cartelle conosciute (chiave: nome in italiano). Su Windows solo le cartelle utente, su Mac anche Applicazioni.
function folderEntries(platform = process.platform, home = os.homedir()) {
  const list = [['Download', ['download', 'downloads'], 'Downloads'], ['Documenti', ['documenti', 'documents'], 'Documents'], ['Scrivania', ['scrivania', 'desktop'], 'Desktop'], ['Immagini', ['immagini', 'pictures'], 'Pictures']]
    .map(([display, keys, dir]) => ({ display, keys, target: path.join(home, dir), description: `Aprire la cartella ${display} del tuo utente.` }));
  if (platform === 'darwin') list.push({ display: 'Applicazioni', keys: ['applicazioni'], target: '/Applications', description: 'Aprire la cartella Applicazioni (/Applications).' });
  return list;
}

// Elenco delle app installate (solo Mac): un solo livello nelle cartelle ammesse, senza link simbolici che escono dalla cartella.
const macAppDirs = (home = os.homedir()) => ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', path.join(home, 'Applications')];
const MAC_APP_EXTRAS = ['/System/Library/CoreServices/Finder.app'];
const real = target => { try { return fs.realpathSync(target); } catch { return null; } };
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
// Eccezione per le app di sistema aggiornabili (Safari): /Applications/Safari.app è un link a un volume di sistema di sola lettura.
const SYSTEM_APP_VOLUMES = ['/System/Volumes/Preboot/Cryptexes/App/System/Applications', '/System/Cryptexes/App/System/Applications'];
const systemApp = resolved => SYSTEM_APP_VOLUMES.some(volume => path.dirname(resolved) === volume);
function listApps(dirs = macAppDirs(), extras = MAC_APP_EXTRAS) {
  const apps = [], seen = new Set();
  const add = (name, file) => { if (!seen.has(file)) { seen.add(file); apps.push({ name, path: file }); } };
  for (const dir of dirs) {
    const root = real(dir); let names;
    if (!root) continue;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const entry of names.sort()) {
      if (!/\.app$/i.test(entry) || entry.startsWith('.')) continue;
      const file = path.join(dir, entry), resolved = real(file);
      if (!resolved || !(inside(resolved, root) || systemApp(resolved)) || !/\.app$/i.test(resolved)) continue;
      try { if (!fs.statSync(resolved).isDirectory()) continue; } catch { continue; }
      add(entry.replace(/\.app$/i, ''), file);
    }
  }
  for (const file of extras) { if (real(file)) add(path.basename(file).replace(/\.app$/i, ''), file); }
  return apps;
}
// Cache con rilettura al massimo ogni 60 secondi, così un’app appena installata compare.
const appCache = new Map();
function getApps(dirs, extras = [], { ttl = 60000, now = Date.now() } = {}) {
  const key = dirs.join('|') + '||' + extras.join('|'), cached = appCache.get(key);
  if (cached && now - cached.time < ttl && now >= cached.time) return cached.apps;
  const apps = listApps(dirs, extras);
  appCache.set(key, { time: now, apps });
  return apps;
}
const clearAppCache = () => appCache.clear();
// Nomi italiani delle app di sistema; i nomi dei bundle sono quelli reali su disco.
const MAC_ALIASES = [['Calcolatrice', ['Calculator']], ['Impostazioni', ['System Settings']], ['Impostazioni di Sistema', ['System Settings']], ['Preferenze di Sistema', ['System Settings']],
  ['Note', ['Notes']], ['Calendario', ['Calendar']], ['Promemoria', ['Reminders']], ['Musica', ['Music']], ['Foto', ['Photos']], ['Mappe', ['Maps']], ['Messaggi', ['Messages']],
  ['Anteprima', ['Preview']], ['Terminale', ['Terminal']], ['Monitoraggio Attività', ['Activity Monitor']], ['Contatti', ['Contacts']], ['Meteo', ['Weather']], ['Orologio', ['Clock']],
  ['Posta', ['Mail']], ['Mail', ['Mail']], ['Libri', ['Books']], ['Comandi Rapidi', ['Shortcuts']], ['Utility Disco', ['Disk Utility']], ['Cattura Schermo', ['Screenshot']],
  ['Screenshot', ['Screenshot']], ['Dizionario', ['Dictionary']], ['Registratore Vocale', ['VoiceMemos', 'Voice Memos']], ['Memo Vocali', ['VoiceMemos', 'Voice Memos']]];

function buildEntries(platform, home, env, apps) {
  const entries = [];
  for (const folder of folderEntries(platform, home)) for (const key of folder.keys) entries.push({ key, display: folder.display, path: folder.target, description: folder.description });
  const calc = openTargets(platform, home, env)['apri calcolatrice'];
  if (platform === 'darwin') {
    const byName = new Map(apps.map(app => [fold(app.name), app]));
    for (const [alias, bundles] of MAC_ALIASES) {
      const app = bundles.map(name => byName.get(fold(name))).find(Boolean);
      if (app) entries.push({ key: fold(alias), display: alias, path: app.path });
    }
    for (const app of apps) entries.push({ key: fold(app.name), display: app.name, path: app.path });
  }
  // Calcolatrice di base (percorso fisso su Mac, calc.exe su Windows) se l’elenco non l’ha già trovata.
  if (!entries.some(entry => entry.key === 'calcolatrice')) entries.push({ key: 'calcolatrice', display: 'Calcolatrice', path: calc.target, description: calc.description });
  for (const entry of entries) entry.description ||= `Aprire l'app ${entry.display} (${entry.path}).`;
  return entries;
}
// Corrispondenza esatta; poi prefisso (almeno 3 lettere). Più percorsi diversi = ambiguo.
function lookup(entries, query) {
  const unique = list => [...new Map(list.map(entry => [entry.path, entry])).values()];
  const exact = unique(entries.filter(entry => entry.key === query));
  if (exact.length === 1) return { status: 'found', entry: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', matches: exact };
  if (query.length < 3) return { status: 'none' };
  const prefix = unique(entries.filter(entry => entry.key.startsWith(query)));
  if (prefix.length === 1) return { status: 'found', entry: prefix[0] };
  if (prefix.length > 1) return { status: 'ambiguous', matches: prefix };
  // Parole intere dentro il nome: «chrome» → Google Chrome, «word» → Microsoft Word.
  const words = unique(entries.filter(entry => ` ${entry.key} `.includes(` ${query} `)));
  if (words.length === 1) return { status: 'found', entry: words[0] };
  return words.length > 1 ? { status: 'ambiguous', matches: words } : { status: 'none' };
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; }
  return row[b.length];
}
function suggestions(entries, query) {
  const limit = query.length > 6 ? 3 : 2, seen = new Set();
  return entries.filter(entry => entry.key.length >= 3 && (distance(entry.key, query) <= limit || (query.length >= 4 && (entry.key.includes(query) || query.includes(entry.key)))))
    .sort((a, b) => distance(a.key, query) - distance(b.key, query)).filter(entry => !seen.has(entry.path) && seen.add(entry.path)).slice(0, 3).map(entry => entry.display);
}

const COURTESY_START = /^(?:ciao|ehi|scusa|se puoi|puoi|potresti|potrebbe|riesci a|riusciresti a|ti va di|mi|per favore|per piacere|per cortesia)(?=[\s,]|$)[\s,]*/;
const COURTESY_END = /[\s,]+(?:per favore|per piacere|per cortesia|grazie mille|grazie|ciao)$/;
const OPEN_VERB = /^(?:fai partire|aprimi|aprirmi|aprire|apri|avviami|avviarmi|avviare|avvia|lanciami|lanciarmi|lanciare|lancia|esegui)(?=\s|$)\s*/;
const FILLER = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'app', 'applicazione', 'programma', 'cartella', 'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle']);
const NOT_A_NAME = new Set(['e', 'poi', 'che', 'come', 'perche', 'quando', 'se', 'con', 'per', 'ma', 'o', 'cosa', 'quale', 'dove', 'tutto', 'anche', 'si', 'mi', 'ti', 'non']);

// Riconosce «apri X» in forma naturale: il verbo deve essere il comando principale (inizio frase dopo le formule di cortesia).
// Restituisce { raw, name } con l'oggetto così com'è e senza articoli/«app», oppure null.
function parseOpenPhrase(text) {
  let original = text.normalize('NFC').trim().replace(/[’‘`´]/g, "'").replace(/\b(?:l|un)'\s*/gi, '').replace(/[\s.!?…]+$/, '').replace(/\s+/g, ' ');
  let folded = fold(original);
  if (original.length !== folded.length) return null;
  const cut = n => { original = original.slice(n); folded = folded.slice(n); };
  for (let match; (match = folded.match(COURTESY_START));) cut(match[0].length);
  for (let match; (match = folded.match(COURTESY_END));) { original = original.slice(0, -match[0].length); folded = folded.slice(0, -match[0].length); }
  const verb = folded.match(OPEN_VERB);
  if (!verb) return null;
  cut(verb[0].length);
  original = original.replace(/^[\s,:]+|[\s,]+$/g, ''); folded = fold(original);
  if (!original) return null;
  const words = original.split(' ');
  while (words.length > 1 && FILLER.has(fold(words[0]))) words.shift();
  return { raw: original, name: words.join(' ') };
}

function resolveOpen(text, { platform, home, env, appDirs, appExtras }) {
  const phrase = parseOpenPhrase(text);
  if (!phrase) return null;
  const apps = platform === 'darwin' ? getApps(appDirs || macAppDirs(home), appExtras || (appDirs ? [] : MAC_APP_EXTRAS)) : [];
  const entries = buildEntries(platform, home, env, apps);
  let ambiguous = null;
  for (const candidate of new Set([fold(phrase.name), fold(phrase.raw)])) {
    const found = lookup(entries, candidate);
    if (found.status === 'found') return { type: 'open', description: found.entry.description, target: found.entry.path };
    if (found.status === 'ambiguous' && !ambiguous) ambiguous = found.matches;
  }
  if (platform !== 'darwin') return null;
  if (ambiguous) return { type: 'reply', text: `Ho trovato più app: ${ambiguous.slice(0, 5).map(entry => entry.display).join(', ')}. Quale?` };
  const query = fold(phrase.name), tokens = query.split(' ');
  if (tokens.length > 3 || tokens.some(token => NOT_A_NAME.has(token))) return null;
  const similar = suggestions(entries, query);
  return { type: 'reply', text: `Non trovo un'app chiamata «${phrase.name}» sul Mac.` + (similar.length ? ` Forse intendevi: ${similar.join(', ')}?` : '') };
}

// Ricontrollo al momento della conferma: il percorso deve esistere ancora ed essere una cartella o app ammessa.
function validateTarget(target, { platform = process.platform, home = os.homedir(), env = process.env, appDirs, appExtras } = {}) {
  if (typeof target !== 'string' || !target) return false;
  const resolved = real(target);
  if (!resolved) return false;
  const fixed = [...folderEntries(platform, home).map(folder => folder.target), openTargets(platform, home, env)['apri calcolatrice'].target];
  if (fixed.some(item => real(item) === resolved)) return true;
  if (platform !== 'darwin' || !/\.app$/i.test(resolved)) return false;
  if ((appExtras || (appDirs ? [] : MAC_APP_EXTRAS)).some(item => real(item) === resolved)) return true;
  return (appDirs || macAppDirs(home)).some(dir => { const root = real(dir); return systemApp(resolved) || (root && path.dirname(resolved) === root); });
}

function parseLocalCommand(text, { platform = process.platform, home = os.homedir(), env = process.env, actions = true, appDirs, appExtras } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = normalize(text), targets = openTargets(platform, home, env);
  if (actions && Object.hasOwn(targets, normalized)) return { type: 'open', ...targets[normalized] };
  if (LIST.test(normalized)) return { type: 'list-notes' };
  const remember = text.trim().match(REMEMBER);
  if (remember && remember[1].trim()) return { type: 'remember', text: remember[1].trim().slice(0, 2000) };
  if (actions) return resolveOpen(text, { platform, home, env, appDirs, appExtras });
  return null;
}
function describeNotes(notes) {
  if (!notes.length) return 'Non hai note salvate. Per salvarne una scrivi «ricorda: …» oppure usa «Ricorda…» sotto una risposta.';
  return 'Le tue note salvate (le uso come contesto quando la domanda contiene parole in comune):\n' + notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
}
module.exports = { openTargets, parseLocalCommand, describeNotes, listApps, getApps, clearAppCache, validateTarget, macAppDirs };
