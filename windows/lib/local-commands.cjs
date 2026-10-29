'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Extra = require('./extra-folders.cjs');

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
// Le cartelle aggiunte dalle Impostazioni (`extra`: [{ name, path }]) si accodano a quelle fisse, con il nome come chiave.
function folderEntries(platform = process.platform, home = os.homedir(), extra = []) {
  const list = [['Download', ['download', 'downloads'], 'Downloads'], ['Documenti', ['documenti', 'documents'], 'Documents'], ['Scrivania', ['scrivania', 'desktop'], 'Desktop'], ['Immagini', ['immagini', 'pictures'], 'Pictures']]
    .map(([display, keys, dir]) => ({ display, keys, target: path.join(home, dir), description: `Aprire la cartella ${display} del tuo utente.` }));
  if (platform === 'darwin') list.push({ display: 'Applicazioni', keys: ['applicazioni'], target: '/Applications', description: 'Aprire la cartella Applicazioni (/Applications).' });
  for (const item of Array.isArray(extra) ? extra : []) {
    const key = Extra.nameKey(item.name);
    if (key) list.push({ display: item.name, keys: [key], target: item.path, extra: true, description: `Aprire la cartella ${item.name} (${item.path}).` });
  }
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

function buildEntries(platform, home, env, apps, extra = []) {
  const entries = [];
  for (const folder of folderEntries(platform, home, extra)) for (const key of new Set(folder.extra ? [...folder.keys, fold(folder.display)] : folder.keys)) entries.push({ key, display: folder.display, path: folder.target, description: folder.description, extra: folder.extra ? folder.display : undefined });
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

function resolveOpen(text, { platform, home, env, appDirs, appExtras, extraFolders }) {
  const phrase = parseOpenPhrase(text);
  if (!phrase) return null;
  const apps = platform === 'darwin' ? getApps(appDirs || macAppDirs(home), appExtras || (appDirs ? [] : MAC_APP_EXTRAS)) : [];
  const entries = buildEntries(platform, home, env, apps, extraFolders);
  let ambiguous = null;
  for (const candidate of new Set([fold(phrase.name), fold(phrase.raw)])) {
    const found = lookup(entries, candidate);
    if (found.status === 'found') return { type: 'open', description: found.entry.description, target: found.entry.path, ...(found.entry.extra ? { extraName: found.entry.extra } : {}) };
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
function validateTarget(target, { platform = process.platform, home = os.homedir(), env = process.env, appDirs, appExtras, extraFolders = [], dataDir = '' } = {}) {
  if (typeof target !== 'string' || !target) return false;
  const resolved = real(target);
  if (!resolved) return false;
  const fixed = [...folderEntries(platform, home).map(folder => folder.target), openTargets(platform, home, env)['apri calcolatrice'].target];
  if (fixed.some(item => real(item) === resolved)) return true;
  // Cartelle aggiunte dalle Impostazioni: solo quelle ancora nell'elenco, con lo stesso percorso reale e ancora valide.
  if (Array.isArray(extraFolders) && extraFolders.some(item => item && Extra.samePath(item.path, resolved, platform) && Extra.recheckExtraFolder(item, { platform, home, dataDir }))) return true;
  if (platform !== 'darwin' || !/\.app$/i.test(resolved)) return false;
  if ((appExtras || (appDirs ? [] : MAC_APP_EXTRAS)).some(item => real(item) === resolved)) return true;
  return (appDirs || macAppDirs(home)).some(dir => { const root = real(dir); return systemApp(resolved) || (root && path.dirname(resolved) === root); });
}

// Domande sul contenuto di una cartella conosciuta («quanti pdf ho in download?»). Riconosciute senza modello; la lettura
// vera e propria è in folder-view.cjs. Serve una cartella citata con una preposizione di luogo (in, nella, nei, dentro, sul…)
// o con «della cartella …», in fondo alla frase o seguita da poche parole ammesse, più una parola chiave sul contenuto.
// Applicazioni è esclusa (per le app c'è già l'elenco). «apri …» non scatta mai: resta l'apertura con conferma.
const PLAIN = text => fold(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const FOLDER_AFTER = '(?:ci|c|ce|ho|che|quali|quale|qual|quanti|quante|cosa|sono|adesso|ora|oggi|grazie|ordinati|ordinate|recenti|per favore|per piacere|per cortesia)';
const CATEGORY_WORDS = [['immagini', /\b(?:immagin\w*|foto|fotografi\w*|img)\b/], ['pdf', /\bpdf\b/], ['documenti', /\bdocument[oi]\b/], ['fogli', /\b(?:fogli\w*|excel|spreadsheet|csv)\b/],
  ['presentazioni', /\b(?:presentazion\w*|slide|powerpoint|keynote)\b/], ['archivi', /\b(?:archiv\w*|zip)\b/], ['audio', /\b(?:audio|musica|canzon\w*|mp3)\b/], ['video', /\b(?:video|film|filmati)\b/],
  ['cartelle', /\b(?:cartelle|sottocartelle)\b/], ['installer', /\b(?:installer|dmg|pkg|programmi)\b/], ['codice', /\b(?:codice|script)\b/]];
const MODEL_WORDS = /\b(?:recent\w*|ultim\w*|vecchi\w*|grand\w*|pesant\w*|piccol\w*|occup\w*|spazio|quanto|cancell\w*|elimin\w*|buttar\w*|riassum\w*|riepilog\w*|organizz\w*|ordin\w*|pulir\w*|pulisc\w*|inutil\w*|qual|quale|quali file)\b/;
const NOUNS = /\b(?:file|documenti|immagin\w*|foto|pdf|elementi|cartelle|roba|cose|contenuto)\b/;
// Parole che dopo «in» non sono quasi mai una cartella («quanti file ho in totale?»): non vengono trattate come cartella mancante.
const NOT_A_FOLDER = new Set(['totale', 'tutto', 'tutti', 'tutta', 'generale', 'giro', 'mente', 'comune', 'rete', 'internet', 'cloud', 'pratica', 'sistema', 'computer', 'mac', 'pc', 'memoria', 'disco', 'questa', 'questo', 'quella', 'quello', 'qui', 'qua', 'ordine', 'sostanza', 'breve', 'corso', 'uso', 'modo', 'vista', 'cartella', 'cartelle', 'chat', 'app', 'applicazioni', 'applications', 'locale', 'italiano', 'inglese', 'effetti', 'sintesi', 'realta', 'media', 'qualche', 'ogni', 'ancora', 'poi', 'altro', 'altri', 'altre']);
const folderPattern = keys => new RegExp(`(?:\\b(?:in|nel|nella|nei|nelle|nell|dentro|sul|sulla|sui|sulle|sull|su)|\\b(?:del|della|dal|dalla)(?=\\s+(?:mia\\s+|tua\\s+)?cartella))\\s+(?:(?:il|lo|la|i|gli|le|l|mio|mia|miei|mie|cartella)\\s+)*(${keys})\\b(?=\\s*$|\\s+${FOLDER_AFTER}\\b)`, 'g');
// Tipo di domanda e categorie dal resto della frase (senza la cartella): 'duplicates' | 'model' | 'count' | 'list' | null.
function classifyQuestion(rest) {
  const categories = CATEGORY_WORDS.filter(([, regex]) => regex.test(rest)).map(([category]) => category);
  const duplicates = /\b(?:doppi\w*|doppion\w*|duplicat\w*|copie)\b/.test(rest), isCount = /\bquant[ie]\b/.test(rest), list = /\b(?:che|quali|quale)\s+(?:file|cartell\w*|sottocartell\w*|document\w*|immagin\w*|foto|pdf|video|archivi\w*|fogli|presentazion\w*|progett\w*|cose|elementi|roba)\b|\bcosa c e\b|\bcosa ho\b|\bcosa ce\b/.test(rest) || (/\b(?:elenc\w*|mostr\w*|lista|dimmi|fammi vedere)\b/.test(rest) && NOUNS.test(rest));
  const present = /\bci sono\b/.test(rest) && (categories.length > 0 || NOUNS.test(rest));
  let kind = null;
  if (duplicates) kind = 'duplicates';
  else if (MODEL_WORDS.test(rest)) kind = 'model';
  // «che/quali cartelle ci sono» è un elenco: «ci sono» da solo (es. «ci sono pdf in download?») resta un conteggio.
  else if (isCount) kind = 'count';
  else if (list) kind = 'list';
  else if (present && categories.length) kind = 'count';
  else if (present) kind = 'model';
  return { kind, categories };
}
// `extraFolders`: cartelle aggiunte dalle Impostazioni ([{ name, path }]), passate dal chiamante (nessuna lettura globale).
function parseFolderQuestion(text, { platform = process.platform, home = os.homedir(), extraFolders = [] } = {}) {
  if (typeof text !== 'string' || text.length > 400 || parseOpenPhrase(text)) return null;
  const plain = PLAIN(text);
  const folders = folderEntries(platform, home, extraFolders).filter(folder => folder.display !== 'Applicazioni');
  const keys = folders.flatMap(folder => folder.keys.map(key => [key, folder])).sort((a, b) => b[0].length - a[0].length);
  const escape = key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  let hit = null; for (let match, pattern = folderPattern(keys.map(([key]) => escape(key)).join('|')); (match = pattern.exec(plain));) hit = match;
  if (!hit) return /[\\/~:]/.test(text) ? null : unknownFolder(plain); // con percorsi nel testo («/etc», «C:\\») la frase resta al modello
  const folder = keys.find(([key]) => key === hit[1].replace(/\s+/g, ' '))[1], rest = (plain.slice(0, hit.index) + ' ' + plain.slice(hit.index + hit[0].length)).replace(/\s+/g, ' ');
  const { kind, categories } = classifyQuestion(rest);
  if (!kind) return null;
  return { type: 'folder', folder: { display: folder.display, target: folder.target, ...(folder.extra ? { extra: true } : {}) }, question: { kind, categories, text: text.trim().slice(0, 400) } };
}
// Cartella non presente («che file ho in progetti?»): risposta senza modello solo se il riconoscimento è affidabile, cioè
// preposizione di luogo, UNA sola parola come cartella in fondo alla frase, parola chiave sul contenuto (file, pdf…) e domanda
// di conteggio, elenco o doppi. Con «più recenti», «più grandi» e simili, o in altri casi dubbi, la frase resta al modello.
function unknownFolder(plain) {
  const pattern = folderPattern('[a-z0-9]{3,}');
  let hit = null; for (let match; (match = pattern.exec(plain));) hit = match;
  if (!hit || /^\d+$/.test(hit[1]) || NOT_A_FOLDER.has(hit[1])) return null;
  const rest = (plain.slice(0, hit.index) + ' ' + plain.slice(hit.index + hit[0].length)).replace(/\s+/g, ' ');
  const { kind, categories } = classifyQuestion(rest);
  if (!['count', 'list', 'duplicates'].includes(kind) || !(categories.length || NOUNS.test(rest))) return null;
  return { type: 'reply', text: `Non vedo una cartella chiamata «${hit[1]}». Puoi aggiungerla dalle Impostazioni → Cartelle visibili.` };
}

function parseLocalCommand(text, { platform = process.platform, home = os.homedir(), env = process.env, actions = true, appDirs, appExtras, extraFolders = [] } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = normalize(text), targets = openTargets(platform, home, env);
  if (actions && Object.hasOwn(targets, normalized)) return { type: 'open', ...targets[normalized] };
  if (LIST.test(normalized)) return { type: 'list-notes' };
  const remember = text.trim().match(REMEMBER);
  if (remember && remember[1].trim()) return { type: 'remember', text: remember[1].trim().slice(0, 2000) };
  const folder = parseFolderQuestion(text, { platform, home, extraFolders });
  if (folder) return folder;
  if (actions) return resolveOpen(text, { platform, home, env, appDirs, appExtras, extraFolders });
  return null;
}
function describeNotes(notes) {
  if (!notes.length) return 'Non hai note salvate. Per salvarne una scrivi «ricorda: …» oppure usa «Ricorda…» sotto una risposta.';
  return 'Le tue note salvate (le uso come contesto quando la domanda contiene parole in comune):\n' + notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
}
module.exports = { openTargets, folderEntries, parseFolderQuestion, parseLocalCommand, describeNotes, listApps, getApps, clearAppCache, validateTarget, macAppDirs };
