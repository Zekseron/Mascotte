/*
 * Mascotte: logica pura dei pacchetti personaggio (nessun DOM).
 *
 * Funziona sia nel browser (window.MascottePack, con uno script classico)
 * sia in Node (require). Il formato è descritto in DESIGN.md.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MascottePack = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Copia esatta di spec/states.json (fonte unica). Un test verifica che
  // le due copie restino identiche.
  const STATES = {
    "format": "mascotte-states/1",
    "required": ["idle"],
    "states": {
      "idle":      { "fallback": null,       "description": "Riposo: nessuna attività in corso" },
      "sleep":     { "fallback": "idle",     "description": "Nessuna attività da un po' di tempo" },
      "listening": { "fallback": "thinking", "description": "Hai appena scritto all'IA" },
      "thinking":  { "fallback": "idle",     "description": "L'IA sta ragionando" },
      "working":   { "fallback": "thinking", "description": "L'IA usa uno strumento" },
      "reading":   { "fallback": "working",  "description": "L'IA legge o cerca nei file" },
      "writing":   { "fallback": "working",  "description": "L'IA scrive o modifica file" },
      "running":   { "fallback": "working",  "description": "L'IA esegue un comando" },
      "waiting":   { "fallback": "idle",     "description": "Serve la tua attenzione: permesso o domanda" },
      "done":      { "fallback": "idle",     "description": "L'IA ha finito il turno" },
      "celebrate": { "fallback": "done",     "description": "Successo esplicito, per esempio test passati" },
      "error":     { "fallback": "idle",     "description": "Qualcosa è andato storto" },
      "talk":      { "fallback": "idle",     "description": "Mostra un fumetto con una risposta" },
      "look":      { "fallback": "thinking", "description": "Sta facendo un controllo visivo dello schermo" },
      "drag":      { "fallback": "idle",     "description": "La stai trascinando" }
    }
  };

  const FORMAT = 'mascotte-pack/1';
  const DEFAULTS = { scale: 4, fps: 8, loop: true };
  const FPS_MIN = 1;
  const FPS_MAX = 30;
  const MAX_FRAMES = 1000; // protezione: "frames": 1000000000 non deve riempire la memoria

  const TOP_FIELDS = ['format', 'id', 'name', 'author', 'license', 'sheet', 'frame',
    'scale', 'bubble', 'animations', 'fallbacks', 'perch', 'pixelRatio'];
  const ANIM_FIELDS = ['row', 'frames', 'fps', 'durations', 'loop', 'frameRows'];

  // ------------------------------------------------------------ utilità

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isKnownState = (name) => has(STATES.states, name);

  function kind(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'una lista';
    switch (typeof v) {
      case 'object': return 'un oggetto';
      case 'string': return 'un testo';
      case 'number': return 'un numero';
      case 'boolean': return 'vero/falso';
      default: return 'nessun valore';
    }
  }

  // Come mostrare un valore trovato nel file dentro un messaggio.
  function found(v) {
    if (v === null || typeof v === 'object') return kind(v);
    let s;
    try { s = JSON.stringify(v); } catch (e) { s = undefined; }
    if (s === undefined) s = String(v);
    return s.length > 40 ? s.slice(0, 37) + '…' : s;
  }

  function rangeLabel(n, one, many) {
    if (n <= 0) return 'nessuna ' + one + ' intera';
    if (n === 1) return one + ' 0';
    return many + ' 0-' + (n - 1);
  }

  function slug(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ------------------------------------------------------------ percorsi

  function normalizePath(p) {
    return String(p).replace(/\\/g, '/').split('/')
      .filter((seg) => seg !== '' && seg !== '.').join('/');
  }

  // Cartella di un percorso, con "/" finale ('' se il file è in cima).
  function dirname(p) {
    const n = normalizePath(p);
    const i = n.lastIndexOf('/');
    return i < 0 ? '' : n.slice(0, i + 1);
  }

  // Nome della cartella del pacchetto, da un percorso o dall'indirizzo di una
  // cartella ('../characters/gattino/' → 'gattino'; '.../character.json' → idem).
  function folderName(path) {
    const parts = String(path).split(/[\\/]/).filter((s) => s && s !== '.' && s !== '..');
    if (parts.length && /\.json$/i.test(parts[parts.length - 1])) parts.pop();
    return parts.length ? parts[parts.length - 1] : '';
  }

  // Il foglio deve stare nella cartella del pacchetto: niente indirizzi,
  // percorsi assoluti o "..". Ritorna il problema, o null se va bene.
  function sheetPathProblem(sheet) {
    const s = String(sheet);
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) {
      return 'deve essere un nome di file relativo alla cartella del pacchetto, non un indirizzo';
    }
    if (s.startsWith('/') || s.startsWith('\\')) {
      return 'deve essere un percorso relativo alla cartella del pacchetto, non assoluto';
    }
    if (s.split(/[\\/]/).includes('..')) {
      return 'non può uscire dalla cartella del pacchetto (niente "..")';
    }
    return null;
  }

  // Tra i percorsi (relativi, con "/") trova i character.json, dal più
  // vicino alla radice in poi (a parità, ordine alfabetico).
  function listCharacterJsons(paths) {
    return paths.map(normalizePath)
      .filter((p) => /(^|\/)character\.json$/i.test(p))
      .sort((a, b) => (a.split('/').length - b.split('/').length) || (a < b ? -1 : a > b ? 1 : 0));
  }

  // Trova il percorso del foglio sprite tra i file, partendo dalla cartella
  // del character.json. Prima il percorso esatto, poi senza badare alle
  // maiuscole, poi (se unico) per solo nome del file.
  function resolveSheetPath(paths, jsonPath, sheet) {
    const list = paths.map(normalizePath);
    const want = normalizePath(dirname(jsonPath) + normalizePath(sheet));
    if (list.includes(want)) return want;
    const lower = want.toLowerCase();
    const ci = list.filter((p) => p.toLowerCase() === lower);
    if (ci.length === 1) return ci[0];
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    const dir = dirname(jsonPath).toLowerCase();
    const byName = list.filter((p) => {
      const lp = p.toLowerCase();
      return lp.startsWith(dir) && lp.slice(lp.lastIndexOf('/') + 1) === base;
    });
    return byName.length === 1 ? byName[0] : null;
  }

  // ------------------------------------------------------------ file

  function parseJson(text) {
    const clean = String(text).replace(/^﻿/, '');
    try {
      return { json: JSON.parse(clean), error: null };
    } catch (e) {
      return { json: null, error: 'character.json non è un JSON valido (' + e.message + ')' };
    }
  }

  // Misura di un PNG dall'intestazione IHDR; null se non è un PNG.
  function pngSize(bytes) {
    if (!bytes || bytes.length < 24) return null;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
    const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (type !== 'IHDR') return null;
    const u32 = (o) => ((bytes[o] * 0x1000000) + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3]);
    return { width: u32(16), height: u32(20) };
  }

  // ------------------------------------------------------------ animazioni

  // Un numero N → [0..N-1]; una lista resta com'è.
  function expandFrames(frames) {
    if (Array.isArray(frames)) return frames.slice();
    if (Number.isInteger(frames) && frames >= 1 && frames <= MAX_FRAMES) {
      return Array.from({ length: frames }, (_, i) => i);
    }
    return [];
  }

  // Elenco dei fotogrammi da mostrare, con la durata di ciascuno.
  // `durations` (se ha la lunghezza giusta) prevale su `fps`.
  function frameSchedule(animation) {
    const cols = expandFrames(animation && animation.frames);
    const row = animation && Number.isInteger(animation.row) ? animation.row : 0;
    const fps = animation && Number.isFinite(animation.fps) && animation.fps > 0
      ? animation.fps : DEFAULTS.fps;
    const durations = animation && Array.isArray(animation.durations) &&
      animation.durations.length === cols.length ? animation.durations : null;
    return cols.map((col, i) => {
      const d = durations ? durations[i] : NaN;
      return { col, row: animation.frameRows?.[i] ?? row, ms: Number.isFinite(d) && d > 0 ? d : 1000 / fps };
    });
  }

  // Durata totale (ms) di un elenco di fotogrammi.
  function totalMs(schedule) {
    let t = 0;
    for (const s of schedule) t += s.ms;
    return t;
  }

  // Istante (ms dall'inizio) in cui comincia il fotogramma `index`.
  function frameStart(schedule, index) {
    let t = 0;
    for (let i = 0; i < index && i < schedule.length; i++) t += schedule[i].ms;
    return t;
  }

  // Quale fotogramma si vede dopo `elapsedMs`. Con loop=false si ferma
  // sull'ultimo (finished = true).
  function frameAt(schedule, elapsedMs, loop) {
    const n = schedule.length;
    if (!n) return { index: 0, finished: true };
    const total = totalMs(schedule);
    if (!(total > 0)) return { index: 0, finished: loop === false };
    let t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    if (t >= total) {
      if (loop === false) return { index: n - 1, finished: true };
      t = t % total;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += schedule[i].ms;
      if (t < acc) return { index: i, finished: false };
    }
    return { index: n - 1, finished: loop === false };
  }

  // ------------------------------------------------------------ ripieghi

  function defaultFallback(state) {
    return isKnownState(state) ? STATES.states[state].fallback : null;
  }

  // Segue prima pack.fallbacks, poi i ripieghi di STATES, fino a uno stato
  // presente nel pacchetto (idle in ultima istanza). `cycle` (solo interno)
  // elenca gli stati di un eventuale giro.
  function walk(state, pack) {
    const animations = (pack && pack.animations) || {};
    const own = (pack && pack.fallbacks) || {};
    const chain = [];
    let cycle = null;
    let current = state;
    for (;;) {
      if (chain.includes(current)) { cycle = chain.slice(chain.indexOf(current)); break; }
      chain.push(current);
      if (has(animations, current)) return { used: current, chain, cycle: null };
      const next = has(own, current) && typeof own[current] === 'string' && own[current]
        ? own[current] : defaultFallback(current);
      if (!next) break;
      current = next;
    }
    if (!chain.includes('idle')) chain.push('idle');
    return { used: 'idle', chain, cycle };
  }

  function resolveState(state, pack) {
    const r = walk(state, pack);
    return { used: r.used, chain: r.chain };
  }

  // ------------------------------------------------------------ validazione

  function readFrame(json, errors, warnings) {
    if (!has(json, 'frame')) {
      errors.push('frame: obbligatorio (con width e height in pixel)');
      return null;
    }
    const f = json.frame;
    if (!isObject(f)) {
      errors.push('frame: deve essere un oggetto con width e height (trovato: ' + found(f) + ')');
      return null;
    }
    for (const k of Object.keys(f)) {
      if (k !== 'width' && k !== 'height') warnings.push('frame.' + k + ': campo sconosciuto, ignorato');
    }
    const out = {};
    let ok = true;
    for (const dim of ['width', 'height']) {
      if (!has(f, dim)) {
        errors.push('frame.' + dim + ': obbligatorio');
        ok = false;
      } else if (!Number.isInteger(f[dim]) || f[dim] < 1 || f[dim] > 512) {
        errors.push('frame.' + dim + ': deve essere un intero da 1 a 512 pixel (trovato: ' + found(f[dim]) + ')');
        ok = false;
      } else {
        out[dim] = f[dim];
      }
    }
    return ok ? out : null;
  }

  function readBubble(json, frame, errors, warnings) {
    const fallback = frame ? { x: frame.width / 2, y: 0 } : null;
    if (!has(json, 'bubble')) return fallback;
    const b = json.bubble;
    if (!isObject(b)) {
      errors.push('bubble: deve essere un oggetto con x e y in pixel (trovato: ' + found(b) + ')');
      return fallback;
    }
    for (const k of Object.keys(b)) {
      if (k !== 'x' && k !== 'y') warnings.push('bubble.' + k + ': campo sconosciuto, ignorato');
    }
    const out = {};
    let ok = true;
    for (const axis of ['x', 'y']) {
      if (!has(b, axis)) {
        errors.push('bubble.' + axis + ': obbligatorio se c\'è bubble');
        ok = false;
      } else if (typeof b[axis] !== 'number' || !Number.isFinite(b[axis])) {
        errors.push('bubble.' + axis + ': deve essere un numero di pixel (trovato: ' + found(b[axis]) + ')');
        ok = false;
      } else {
        out[axis] = b[axis];
      }
    }
    if (!ok) return fallback;
    if (frame) {
      if (out.x < 0 || out.x > frame.width) {
        warnings.push('bubble.x: ' + out.x + ' è fuori dal fotogramma (0-' + frame.width + ')');
      }
      if (out.y < 0 || out.y > frame.height) {
        warnings.push('bubble.y: ' + out.y + ' è fuori dal fotogramma (0-' + frame.height + ')');
      }
    }
    return out;
  }

  function readAnimation(state, a, cols, rows, errors, warnings) {
    const path = 'animations.' + state;
    if (!isObject(a)) {
      errors.push(path + ': deve essere un oggetto con row e frames (trovato: ' + found(a) + ')');
      return null;
    }
    for (const k of Object.keys(a)) {
      if (!ANIM_FIELDS.includes(k)) warnings.push(path + '.' + k + ': campo sconosciuto, ignorato');
    }

    // row
    let row = null;
    if (!has(a, 'row')) {
      errors.push(path + '.row: obbligatorio');
    } else if (!Number.isInteger(a.row) || a.row < 0) {
      errors.push(path + '.row: deve essere un intero da 0 in su (trovato: ' + found(a.row) + ')');
    } else {
      row = a.row;
      if (rows !== null && row >= rows) {
        errors.push(path + '.row: riga ' + row + ' fuori dal foglio (' + rangeLabel(rows, 'riga', 'righe') + ')');
      }
    }

    // frames
    let frames = null;
    if (!has(a, 'frames')) {
      errors.push(path + '.frames: obbligatorio (un numero di fotogrammi o una lista di colonne)');
    } else if (typeof a.frames === 'number') {
      if (!Number.isInteger(a.frames) || a.frames < 1) {
        errors.push(path + '.frames: deve essere un intero da 1 in su (trovato: ' + found(a.frames) + ')');
      } else if (a.frames > MAX_FRAMES) {
        errors.push(path + '.frames: troppi fotogrammi (massimo ' + MAX_FRAMES + ')');
      } else {
        frames = expandFrames(a.frames);
        if (cols !== null && a.frames > cols) {
          errors.push(path + '.frames: ' + a.frames + ' fotogrammi richiesti ma il foglio ha ' + cols +
            ' colonne (' + rangeLabel(cols, 'colonna', 'colonne') + ')');
        }
      }
    } else if (Array.isArray(a.frames)) {
      if (a.frames.length === 0) {
        errors.push(path + '.frames: la lista è vuota (serve almeno una colonna)');
      } else if (a.frames.length > MAX_FRAMES) {
        errors.push(path + '.frames: troppe voci (massimo ' + MAX_FRAMES + ')');
      } else {
        let ok = true;
        a.frames.forEach((c, i) => {
          if (!Number.isInteger(c) || c < 0) {
            errors.push(path + '.frames[' + i + ']: deve essere una colonna intera da 0 in su (trovato: ' + found(c) + ')');
            ok = false;
          }
        });
        if (ok) {
          frames = a.frames.slice();
          if (cols !== null) {
            const seen = new Set();
            for (const c of frames) {
              if (c >= cols && !seen.has(c)) {
                seen.add(c);
                errors.push(path + '.frames: colonna ' + c + ' fuori dal foglio (' + rangeLabel(cols, 'colonna', 'colonne') + ')');
              }
            }
          }
        }
      }
    } else {
      errors.push(path + '.frames: deve essere un numero di fotogrammi o una lista di colonne (trovato: ' + found(a.frames) + ')');
    }

    // fps
    let fps = DEFAULTS.fps;
    if (has(a, 'fps')) {
      if (typeof a.fps !== 'number' || !Number.isFinite(a.fps)) {
        errors.push(path + '.fps: deve essere un numero da ' + FPS_MIN + ' a ' + FPS_MAX + ' (trovato: ' + found(a.fps) + ')');
      } else if (a.fps < FPS_MIN || a.fps > FPS_MAX) {
        errors.push(path + '.fps: ' + a.fps + ' fuori dall\'intervallo ' + FPS_MIN + '-' + FPS_MAX);
      } else {
        fps = a.fps;
      }
    }

    // durations
    let durations = null;
    if (has(a, 'durations')) {
      if (!Array.isArray(a.durations)) {
        errors.push(path + '.durations: deve essere una lista di millisecondi (trovato: ' + found(a.durations) + ')');
      } else {
        let ok = true;
        a.durations.forEach((d, i) => {
          if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) {
            errors.push(path + '.durations[' + i + ']: deve essere un numero positivo di millisecondi (trovato: ' + found(d) + ')');
            ok = false;
          }
        });
        if (frames && a.durations.length !== frames.length) {
          errors.push(path + '.durations: ' + a.durations.length + ' valori ma frames ne ha ' +
            frames.length + ' (devono avere la stessa lunghezza)');
          ok = false;
        }
        if (ok) durations = a.durations.slice();
      }
    }

    // loop
    let loop = DEFAULTS.loop;
    if (has(a, 'loop')) {
      if (typeof a.loop !== 'boolean') {
        errors.push(path + '.loop: deve essere true o false (trovato: ' + found(a.loop) + ')');
      } else {
        loop = a.loop;
      }
    }

    if (row === null || frames === null) return null;
    const result = { row, frames, fps, durations, loop };
    if (has(a, 'frameRows')) {
      if (!Array.isArray(a.frameRows) || a.frameRows.length !== frames.length || !a.frameRows.every(r => Number.isInteger(r) && r >= 0 && (rows === null || r < rows))) errors.push(path + '.frameRows: serve una riga valida per ogni fotogramma');
      else result.frameRows = a.frameRows.slice();
    }
    return result;
  }

  function optionalText(json, key, warnings) {
    if (!has(json, key)) return '';
    if (typeof json[key] !== 'string') {
      warnings.push(key + ': deve essere un testo, ignorato (trovato: ' + found(json[key]) + ')');
      return '';
    }
    return json[key].trim();
  }

  // Controlla un character.json già letto (oggetto) rispetto alla misura del
  // foglio PNG e lo normalizza (valori di default, frames sempre come lista).
  // Con sheetWidth/sheetHeight mancanti i controlli sul foglio vengono saltati.
  // options.folderName = nome della cartella, usato come id se manca.
  function validatePack(json, sheetWidth, sheetHeight, options) {
    const errors = [];
    const warnings = [];
    const opts = options || {};

    if (!isObject(json)) {
      errors.push('character.json: deve contenere un oggetto JSON (trovato: ' + found(json) + ')');
      return { errors, warnings, pack: null };
    }

    for (const key of Object.keys(json)) {
      if (!TOP_FIELDS.includes(key)) warnings.push(key + ': campo sconosciuto, ignorato');
    }

    // format
    if (!has(json, 'format')) {
      errors.push('format: obbligatorio (deve essere "' + FORMAT + '")');
    } else if (json.format !== FORMAT) {
      errors.push('format: deve essere "' + FORMAT + '" (trovato: ' + found(json.format) + ')');
    }

    // name, author, license, id
    let name = '';
    if (!has(json, 'name')) {
      errors.push('name: obbligatorio');
    } else if (typeof json.name !== 'string' || !json.name.trim()) {
      errors.push('name: deve essere un testo non vuoto (trovato: ' + found(json.name) + ')');
    } else {
      name = json.name.trim();
    }
    const author = optionalText(json, 'author', warnings);
    const license = optionalText(json, 'license', warnings);
    let id = optionalText(json, 'id', warnings);
    if (!id) id = opts.folderName || slug(name) || 'personaggio';

    // sheet
    let sheet = '';
    if (!has(json, 'sheet')) {
      errors.push('sheet: obbligatorio (nome del PNG, relativo alla cartella)');
    } else if (typeof json.sheet !== 'string' || !json.sheet.trim()) {
      errors.push('sheet: deve essere il nome di un file PNG (trovato: ' + found(json.sheet) + ')');
    } else {
      const problem = sheetPathProblem(json.sheet.trim());
      if (problem) {
        errors.push('sheet: ' + problem);
      } else {
        sheet = json.sheet.trim();
        if (!/\.png$/i.test(sheet)) warnings.push('sheet: "' + sheet + '" non ha l\'estensione .png');
      }
    }

    // frame e misura del foglio
    const frame = readFrame(json, errors, warnings);
    const dimsKnown = Number.isFinite(sheetWidth) && sheetWidth > 0 &&
      Number.isFinite(sheetHeight) && sheetHeight > 0;
    let cols = null;
    let rows = null;
    if (frame && dimsKnown) {
      if (sheetWidth % frame.width !== 0) {
        errors.push('sheet: la larghezza del PNG (' + sheetWidth + ' px) non è un multiplo della larghezza del fotogramma (' + frame.width + ' px)');
      }
      if (sheetHeight % frame.height !== 0) {
        errors.push('sheet: l\'altezza del PNG (' + sheetHeight + ' px) non è un multiplo dell\'altezza del fotogramma (' + frame.height + ' px)');
      }
      cols = Math.floor(sheetWidth / frame.width);
      rows = Math.floor(sheetHeight / frame.height);
    }

    // scale
    let pixelRatio=1;
    if(has(json,'pixelRatio')){
      if(Number.isInteger(json.pixelRatio)&&json.pixelRatio>=1&&json.pixelRatio<=8)pixelRatio=json.pixelRatio;
      else errors.push('pixelRatio: deve essere un intero da 1 a 8');
    }
    let scale = DEFAULTS.scale;
    if (has(json, 'scale')) {
      if (!Number.isInteger(json.scale) || json.scale < 1 || json.scale > 8) {
        errors.push('scale: deve essere un intero da 1 a 8 (trovato: ' + found(json.scale) + ')');
      } else {
        scale = json.scale;
      }
    }

    if (frame && Math.max(frame.width, frame.height) * scale / pixelRatio > 2048) {
      errors.push('scale: il fotogramma ingrandito non può superare 2048 punti per lato');
    }

    const bubble = readBubble(json, frame, errors, warnings);

    // animations
    const animations = {};
    if (!has(json, 'animations')) {
      errors.push('animations: obbligatorio (almeno lo stato idle)');
    } else if (!isObject(json.animations)) {
      errors.push('animations: deve essere un oggetto {stato: animazione} (trovato: ' + found(json.animations) + ')');
    } else {
      for (const key of Object.keys(json.animations)) {
        if (!isKnownState(key)) {
          warnings.push('animations.' + key + ': stato sconosciuto, ignorato');
          continue;
        }
        const anim = readAnimation(key, json.animations[key], cols, rows, errors, warnings);
        if (anim) animations[key] = anim;
      }
      if (!has(json.animations, 'idle')) {
        errors.push('animations.idle: obbligatorio, senza lo stato "idle" il pacchetto non si carica');
      }
    }

    // fallbacks
    const fallbacks = {};
    if (has(json, 'fallbacks')) {
      if (!isObject(json.fallbacks)) {
        errors.push('fallbacks: deve essere un oggetto {stato: stato di ripiego} (trovato: ' + found(json.fallbacks) + ')');
      } else {
        for (const key of Object.keys(json.fallbacks)) {
          const target = json.fallbacks[key];
          if (!isKnownState(key)) {
            warnings.push('fallbacks.' + key + ': stato sconosciuto, ignorato');
          } else if (key === 'idle') {
            warnings.push('fallbacks.idle: "idle" è lo stato di base e non ha ripiego, ignorato');
          } else if (typeof target !== 'string' || !isKnownState(target)) {
            errors.push('fallbacks.' + key + ': ' + found(target) + ' non è uno stato noto');
          } else if (target === key) {
            errors.push('fallbacks.' + key + ': uno stato non può essere il proprio ripiego');
          } else {
            fallbacks[key] = target;
          }
        }
        const reported = new Set();
        for (const key of Object.keys(fallbacks)) {
          if (has(animations, key)) {
            warnings.push('fallbacks.' + key + ': lo stato esiste già nel pacchetto, il ripiego non verrà usato');
            continue;
          }
          const w = walk(key, { animations, fallbacks });
          if (w.cycle) {
            const sig = w.cycle.slice().sort().join(',');
            if (!reported.has(sig)) {
              reported.add(sig);
              warnings.push('fallbacks.' + key + ': ripiego circolare (' +
                w.cycle.concat(w.cycle[0]).join(' → ') + '), si userà idle');
            }
          }
        }
      }
    }

    let perch;
    if (has(json,'perch')) {
      const value=json.perch;
      if (isObject(value) && isObject(value.anchor) && frame && Number.isFinite(value.anchor.x) && Number.isFinite(value.anchor.y) && value.anchor.x >= 0 && value.anchor.x <= frame.width && value.anchor.y >= 0 && value.anchor.y <= frame.height) {
        const animation=readAnimation('idle',value.animation,cols,rows,errors,warnings);
        if(animation) {
          perch={animation,anchor:{...value.anchor}};
          if(has(value,'singing'))perch.singing=readAnimation('perch.singing',value.singing,cols,rows,errors,warnings);
        }
      } else errors.push('perch: animazione o punto di appoggio non valido');
    }
    const pack = {
      format: FORMAT, id, name, author, license, sheet, frame, scale, bubble, animations, fallbacks
    };
    if(perch) pack.perch=perch;
    if(has(json,'pixelRatio'))pack.pixelRatio=pixelRatio;
    return { errors, warnings, pack };
  }

  function displayAnimation(pack,animation,perching,singing=false) {
    return perching && pack.perch ? (singing && pack.perch.singing || pack.perch.animation) : animation;
  }

  return {
    displayAnimation,
    STATES,
    FORMAT,
    DEFAULTS,
    validatePack,
    resolveState,
    frameSchedule,
    expandFrames,
    totalMs,
    frameStart,
    frameAt,
    parseJson,
    pngSize,
    normalizePath,
    dirname,
    folderName,
    sheetPathProblem,
    listCharacterJsons,
    resolveSheetPath
  };
}));
