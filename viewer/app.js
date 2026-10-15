/*
 * Mascotte, visore dei pacchetti: interfaccia.
 * Script classico (niente moduli): funziona anche aperto con doppio clic da file://.
 * Tutta la logica che non tocca la pagina sta in pack.js (window.MascottePack).
 */
(function () {
  'use strict';

  const P = window.MascottePack;
  const $ = (id) => document.getElementById(id);

  const STATE_NAMES = Object.keys(P.STATES.states);
  const SIM_ORDER = ['idle', 'listening', 'thinking', 'reading', 'writing', 'running',
    'waiting', 'done', 'celebrate', 'idle'];
  const SIM_MS = 2200;          // durata di ogni stato nella sessione simulata
  const THUMB_BOX = 96;         // lato (px) in cui deve stare l'anteprima di una scheda
  const MAX_FILES = 500;        // limiti di sicurezza quando si trascina una cartella
  const MAX_DEPTH = 4;
  const DEFAULT_PACK = '../characters/Cat/rosso/';

  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const state = {
    pack: null,
    image: null,
    sheetUrl: null,
    sheet: { width: 0, height: 0 },
    zoom: 4,
    bg: 'light',
    customBg: '#f4f1ea',
    showBubble: false,
    stageCtx: null,
    stage: null,
    thumbs: [],
    cards: new Map(),
    sim: null,
    raf: 0,
    lastTime: 0,
    loadToken: 0
  };

  // ------------------------------------------------------------ DOM: aiuto

  // Crea un elemento. I testi vanno sempre in textContent (mai innerHTML):
  // nome, autore e messaggi vengono dal file del pacchetto e non sono fidati.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const key of Object.keys(props)) {
        const v = props[key];
        if (v === null || v === undefined || v === false) continue;
        if (key === 'class') node.className = v;
        else if (key === 'text') node.textContent = v;
        else if (key === 'dataset') Object.assign(node.dataset, v);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), v);
        else node.setAttribute(key, v === true ? '' : String(v));
      }
    }
    if (children !== undefined && children !== null) {
      for (const c of [].concat(children)) {
        if (c !== null && c !== undefined) node.append(c);
      }
    }
    return node;
  }

  function plural(n, one, many) {
    return n === 1 ? '1 ' + one : n + ' ' + many;
  }

  function showNotice(kind, text) {
    const n = $('notice');
    n.className = 'notice' + (kind === 'error' ? ' notice--error' : kind === 'warn' ? ' notice--warn' : '');
    n.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    n.textContent = text;
    n.hidden = false;
  }

  function hideNotice() {
    const n = $('notice');
    n.hidden = true;
    n.textContent = '';
  }

  function showIntro() {
    $('intro').hidden = false;
    $('viewer').hidden = true;
  }

  // ------------------------------------------------------------ caricamento: da indirizzo

  class NotFound extends Error {}

  async function fetchBytes(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('risposta ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function loadFromParam(param, quiet) {
    const token = ++state.loadToken;
    if (window.location.protocol === 'file:') {
      // Da file:// il browser non permette di leggere altri file: serve il trascinamento.
      if (!quiet) {
        showNotice('warn', 'Aperta con doppio clic, la pagina non può leggere la cartella «' + param +
          '». Trascina qui il pacchetto, oppure servi la cartella del progetto via http.');
      }
      return;
    }
    let base;
    try {
      base = new URL(param, window.location.href);
    } catch (e) {
      if (!quiet) showNotice('error', 'Il parametro ?pack= non è un percorso valido: ' + param);
      return;
    }
    if (base.origin !== window.location.origin) {
      showNotice('error', 'Per sicurezza ?pack= accetta solo percorsi sullo stesso sito della pagina.');
      return;
    }
    let jsonUrl;
    if (/\.json$/i.test(base.pathname)) {
      jsonUrl = base;
      base = new URL('./', jsonUrl);
    } else {
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      jsonUrl = new URL('character.json', base);
    }
    let text;
    try {
      const res = await fetch(jsonUrl.href, { cache: 'no-store' });
      if (!res.ok) throw new NotFound('risposta ' + res.status);
      text = await res.text();
    } catch (e) {
      if (!quiet) {
        showNotice('warn', 'Non trovo il pacchetto «' + param + '» (cerco ' + jsonUrl.pathname +
          '). Trascina qui un pacchetto, oppure controlla il percorso.');
      }
      return;
    }
    if (token !== state.loadToken) return;
    await openPack({
      text,
      folderName: P.folderName(base.pathname),
      getSheetBytes: (sheet) => {
        const rel = sheet.split('/').map(encodeURIComponent).join('/');
        return fetchBytes(new URL(rel, base).href).catch(() => {
          throw new Error('sheet: non riesco a leggere il foglio «' + sheet + '» accanto al character.json');
        });
      }
    }, token);
  }

  // ------------------------------------------------------------ caricamento: da file

  function readAllEntries(dir) {
    return new Promise((resolve, reject) => {
      const reader = dir.createReader();
      const all = [];
      (function next() {
        reader.readEntries((batch) => {
          if (!batch.length) resolve(all);
          else { all.push.apply(all, batch); next(); }
        }, reject);
      }());
    });
  }

  const fileOfEntry = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

  // Percorre cartelle e file trascinati (con qualche limite di sicurezza).
  async function collectEntries(entries) {
    const list = [];
    let truncated = false;
    async function walk(entry, depth) {
      if (list.length >= MAX_FILES) { truncated = true; return; }
      if (entry.isFile) {
        list.push({ path: String(entry.fullPath || entry.name).replace(/^\/+/, ''), file: await fileOfEntry(entry) });
      } else if (entry.isDirectory) {
        if (depth >= MAX_DEPTH || entry.name.startsWith('.')) return;
        for (const child of await readAllEntries(entry)) await walk(child, depth + 1);
      }
    }
    for (const entry of entries) await walk(entry, 0);
    return { list, truncated };
  }

  function handleDrop(dt) {
    // Le voci vanno lette subito, prima di qualsiasi await: dopo l'evento non sono più valide.
    const items = Array.from(dt.items || []);
    const entries = items.filter((i) => i.kind === 'file')
      .map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null))
      .filter(Boolean);
    const files = Array.from(dt.files || []);
    (async () => {
      try {
        if (entries.length) {
          const res = await collectEntries(entries);
          await loadFromList(res.list, res.truncated
            ? 'Cartella molto grande: ho guardato solo i primi ' + MAX_FILES + ' file.' : '');
        } else {
          await loadFromList(files.map((f) => ({ path: f.webkitRelativePath || f.name, file: f })), '');
        }
      } catch (e) {
        showNotice('error', 'Non riesco a leggere ciò che hai trascinato: ' + e.message);
      }
    })();
  }

  async function loadFromList(rawList, extraNote) {
    const token = ++state.loadToken;
    const list = rawList.map((x) => ({ path: P.normalizePath(x.path), file: x.file }));
    const paths = list.map((x) => x.path);
    const byPath = new Map(list.map((x) => [x.path, x.file]));
    const candidates = P.listCharacterJsons(paths);
    if (!candidates.length) {
      const pngs = paths.filter((p) => /\.png$/i.test(p));
      showNotice('error', 'Non trovo un file character.json tra quelli scelti' +
        (pngs.length ? ' (ho trovato solo: ' + pngs.join(', ') + ')' : '') +
        '. Servono il character.json e il PNG del foglio, oppure la cartella che li contiene.');
      return;
    }
    const jsonPath = candidates[0];
    const text = await byPath.get(jsonPath).text();
    const notes = [];
    if (candidates.length > 1) {
      notes.push('Ho trovato ' + candidates.length + ' pacchetti: mostro «' + jsonPath + '».');
    }
    if (extraNote) notes.push(extraNote);
    await openPack({
      text,
      folderName: P.folderName(jsonPath),
      note: notes.join(' '),
      getSheetBytes: async (sheet) => {
        const found = P.resolveSheetPath(paths, jsonPath, sheet);
        if (!found) {
          const pngs = paths.filter((p) => /\.png$/i.test(p));
          throw new Error('sheet: non trovo «' + sheet + '» tra i file scelti' +
            (pngs.length ? ' (PNG trovati: ' + pngs.join(', ') + ')' : ' (nessun PNG)'));
        }
        return new Uint8Array(await byPath.get(found).arrayBuffer());
      }
    }, token);
  }

  // ------------------------------------------------------------ caricamento: comune

  function decodeImage(bytes) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('il browser non riesce a decodificare il PNG'));
      };
      img.src = url;
    });
  }

  // source: { text, getSheetBytes(nomeFoglio) -> Promise<Uint8Array>, folderName, note? }
  async function openPack(source, token) {
    const parsed = P.parseJson(source.text);
    if (parsed.error) {
      showNotice('error', parsed.error);
      return;
    }
    const json = parsed.json;
    let size = null;
    let bytes = null;
    let sheetProblem = null;
    if (json && typeof json === 'object' && typeof json.sheet === 'string' && json.sheet.trim() &&
        !P.sheetPathProblem(json.sheet.trim())) {
      try {
        bytes = await source.getSheetBytes(json.sheet.trim());
        size = P.pngSize(bytes);
        if (!size) {
          sheetProblem = 'sheet: «' + json.sheet.trim() + '» non è un PNG valido';
          bytes = null;
        }
      } catch (e) {
        sheetProblem = e.message;
      }
    }
    if (token !== state.loadToken) return; // nel frattempo è partito un altro caricamento

    const report = P.validatePack(json, size && size.width, size && size.height,
      { folderName: source.folderName });
    let decoded = null;
    if (bytes && report.pack && report.pack.frame) {
      try {
        decoded = await decodeImage(bytes);
      } catch (e) {
        sheetProblem = 'sheet: ' + e.message;
      }
      if (token !== state.loadToken) {
        if (decoded) URL.revokeObjectURL(decoded.url);
        return;
      }
    }
    if (sheetProblem) report.errors.unshift(sheetProblem);

    hideNotice();
    if (source.note) showNotice('info', source.note);
    applyPack(report, decoded, size);
  }

  // ------------------------------------------------------------ mostrare il pacchetto

  function applyPack(report, decoded, size) {
    stopSim('');
    if (state.sheetUrl) URL.revokeObjectURL(state.sheetUrl);
    state.sheetUrl = decoded ? decoded.url : null;
    state.image = decoded ? decoded.img : null;
    state.sheet = size ? { width: size.width, height: size.height } : { width: 0, height: 0 };
    state.thumbs = [];
    state.cards = new Map();
    $('states-grid').replaceChildren();

    const pack = report.pack;
    const renderable = !!(decoded && pack && pack.frame && size);
    state.pack = renderable ? pack : null;

    $('intro').hidden = true;
    $('viewer').hidden = false;
    renderChecks(report);
    renderInfo(pack, size);
    $('sec-info').hidden = !pack;
    $('sec-stage').hidden = !renderable;
    $('sec-states').hidden = !renderable;
    document.title = (pack && pack.name ? pack.name + ' · ' : '') + 'Mascotte, visore';

    if (!renderable) {
      state.stage = null;
      return;
    }

    state.zoom = Math.min(8, Math.max(1, pack.scale));
    $('zoom').value = String(state.zoom);
    $('zoom-out').textContent = '×' + state.zoom;
    state.stage = {
      requested: 'idle', used: 'idle', chain: ['idle'], schedule: [], loop: true,
      elapsed: 0, index: -1, finished: false, paused: reduceMotion, dirty: true, label: ''
    };
    setupStageCanvas();
    buildCards();
    updatePauseButton();
    updateSimUi('');
    setStageState('idle');

    if (!state.raf) {
      state.lastTime = 0;
      state.raf = requestAnimationFrame(tick);
    }
  }

  function renderChecks(report) {
    const e = report.errors.length;
    const w = report.warnings.length;
    const summary = $('checks-summary');
    let text;
    let cls = 'badge';
    if (e) {
      text = plural(e, 'errore', 'errori') + (w ? ' e ' + plural(w, 'avviso', 'avvisi') : '');
      cls += ' badge--error';
    } else if (w) {
      text = 'Pacchetto valido, con ' + plural(w, 'avviso', 'avvisi');
      cls += ' badge--warn';
    } else {
      text = 'Pacchetto valido';
    }
    summary.className = cls;
    summary.textContent = text;
    const list = $('checks-list');
    list.replaceChildren();
    const item = (cls2, tag, msg) => el('li', { class: cls2 }, [
      el('span', { class: 'check-tag', text: tag }),
      el('span', { class: 'check-text', text: msg })
    ]);
    for (const msg of report.errors) list.append(item('check check--error', 'Errore', msg));
    for (const msg of report.warnings) list.append(item('check check--warn', 'Avviso', msg));
  }

  function renderInfo(pack, size) {
    const meta = $('pack-meta');
    meta.replaceChildren();
    if (!pack) {
      $('pack-name').textContent = '';
      return;
    }
    $('pack-name').textContent = pack.name || 'Pacchetto senza nome';
    const add = (label, value, muted) => meta.append(el('div', null, [
      el('dt', { text: label }),
      el('dd', { class: muted ? 'muted' : null, text: value })
    ]));
    add('Autore', pack.author || 'non indicato', !pack.author);
    add('Licenza', pack.license || 'non indicata', !pack.license);
    add('Fotogramma', pack.frame ? pack.frame.width + ' × ' + pack.frame.height + ' px' : 'non valido', !pack.frame);
    add('Foglio', size ? size.width + ' × ' + size.height + ' px' : 'non letto', !size);
    add('Animazioni', String(Object.keys(pack.animations).length));
    add('Identificativo', pack.id);
  }

  function describeAnim(anim) {
    const n = anim.frames.length;
    const parts = [plural(n, 'fotogramma', 'fotogrammi')];
    if (anim.durations) {
      const d = anim.durations;
      parts.push('durate ' + (d.length > 6 ? d.slice(0, 6).join(' · ') + ' …' : d.join(' · ')) + ' ms');
    } else {
      parts.push((Number.isInteger(anim.fps) ? String(anim.fps) : anim.fps.toFixed(1)) + ' fps');
    }
    parts.push(anim.loop ? 'loop' : 'una volta');
    return parts;
  }

  function buildCards() {
    const grid = $('states-grid');
    const { width: fw, height: fh } = state.pack.frame;
    const zoom = Math.min(THUMB_BOX/Math.max(fw,fh),Math.max(1,Math.floor(THUMB_BOX/Math.max(fw,fh))));
    for (const name of STATE_NAMES) {
      const res = P.resolveState(name, state.pack);
      const present = Object.prototype.hasOwnProperty.call(state.pack.animations, name);
      const anim = state.pack.animations[res.used] || null;
      const canvas = el('canvas', { class: 'px', width: fw * zoom, height: fh * zoom, 'aria-hidden': 'true' });
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const thumb = {
        ctx, zoom, elapsed: 0, index: -1,
        schedule: anim ? P.frameSchedule(anim) : [],
        loop: anim ? anim.loop : true
      };
      state.thumbs.push(thumb);
      // Le animazioni che suonano una volta si fermano sull'ultimo fotogramma:
      // passando col mouse o col focus sulla scheda ripartono.
      const replay = () => { if (!thumb.loop) { thumb.elapsed = 0; thumb.index = -1; } };
      const card = el('button', {
        type: 'button',
        class: 'card' + (present ? '' : ' is-missing'),
        'aria-pressed': 'false',
        dataset: { state: name },
        onclick: () => selectState(name),
        onmouseenter: replay,
        onfocus: replay
      }, [
        el('span', { class: 'thumb' }, canvas),
        el('span', { class: 'card-name' }, [
          el('strong', { text: name }),
          present ? null : el('span', { class: 'pill', text: 'ripiego → ' + res.used })
        ]),
        el('span', { class: 'card-desc', text: P.STATES.states[name].description }),
        anim
          ? el('span', { class: 'card-data' }, describeAnim(anim).map((t) => el('span', { text: t })))
          : el('span', { class: 'card-desc', text: 'Nessuna animazione disponibile' }),
        !present && res.chain.length > 2
          ? el('span', { class: 'card-chain', text: 'Catena: ' + res.chain.join(' → ') })
          : null
      ]);
      state.cards.set(name, card);
      grid.append(card);
    }
    for (const t of state.thumbs) updateThumb(t, 0);
  }

  // ------------------------------------------------------------ palco

  function setupStageCanvas() {
    const { width: fw, height: fh } = state.pack.frame;
    const canvas = $('stage-canvas');
    const zoom=state.zoom/(state.pack.pixelRatio||1);
    canvas.width = fw * zoom;     // cambiare la misura azzera il contesto
    canvas.height = fh * zoom;
    state.stageCtx = canvas.getContext('2d');
    state.stageCtx.imageSmoothingEnabled = false;
    const dot = $('bubble-dot');
    dot.style.left = (state.pack.bubble.x * zoom) + 'px';
    dot.style.top = (state.pack.bubble.y * zoom) + 'px';
    dot.hidden = !state.showBubble;
    state.stage.dirty = true;
  }

  // Disegna un fotogramma ingrandito di un numero intero di volte, senza sfumature.
  // Ritorna false se il fotogramma cade fuori dal foglio.
  function drawStep(ctx, step, zoom) {
    const { width: fw, height: fh } = state.pack.frame;
    ctx.clearRect(0, 0, fw * zoom, fh * zoom);
    if (!step) return true;
    const sx = step.col * fw;
    const sy = step.row * fh;
    if (sx + fw > state.sheet.width || sy + fh > state.sheet.height) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.image, sx, sy, fw, fh, 0, 0, fw * zoom, fh * zoom);
    return true;
  }

  function setStageState(name, fromSim) {
    if (!state.pack) return;
    if (!fromSim) stopSim('');
    const res = P.resolveState(name, state.pack);
    const anim = state.pack.animations[res.used] || null;
    const s = state.stage;
    s.requested = name;
    s.used = res.used;
    s.chain = res.chain;
    s.schedule = anim ? P.frameSchedule(anim) : [];
    s.loop = anim ? anim.loop : true;
    s.elapsed = 0;
    s.index = -1;
    s.finished = false;
    s.dirty = true;
    s.label = '';
    $('stage-requested').textContent = name;
    $('stage-used').textContent = res.used;
    const chain = $('stage-chain');
    chain.hidden = name === res.used;
    chain.textContent = name === res.used ? '' : 'Ripiego: ' + res.chain.join(' → ');
    $('stage-desc').textContent = P.STATES.states[name].description;
    for (const [key, card] of state.cards) card.setAttribute('aria-pressed', key === name ? 'true' : 'false');
  }

  function selectState(name) {
    setStageState(name);
    if (state.stage) state.stage.paused = reduceMotion;  // con movimento ridotto si riprende solo a mano
    updatePauseButton();
  }

  function updateStageFrame() {
    const s = state.stage;
    const f = P.frameAt(s.schedule, s.elapsed, s.loop);
    if (f.index === s.index && f.finished === s.finished && !s.dirty) return;
    s.index = f.index;
    s.finished = f.finished;
    s.dirty = false;
    const total = s.schedule.length;
    let label = 'Nessun fotogramma da mostrare.';
    if (total) {
      const step = s.schedule[f.index];
      const drawn = drawStep(state.stageCtx, step, state.zoom/(state.pack.pixelRatio||1));
      label = 'Fotogramma ' + (f.index + 1) + ' di ' + total + ' (colonna ' + step.col + ', riga ' + step.row + ')';
      if (!drawn) label += ' · fuori dal foglio, non disegnato';
      if (!s.loop) label += f.finished ? ' · animazione finita: clic sul palco per riavviarla' : ' · si ferma sull\'ultimo fotogramma';
    } else {
      drawStep(state.stageCtx, null, state.zoom/(state.pack.pixelRatio||1));
    }
    if (label !== s.label) {
      s.label = label;
      $('stage-frame').textContent = label;
    }
  }

  function updateThumb(t, dt) {
    if (!t.schedule.length) {
      if (t.index !== 0) { t.index = 0; drawStep(t.ctx, null, t.zoom); }
      return;
    }
    if (!reduceMotion) t.elapsed += dt;
    const f = P.frameAt(t.schedule, t.elapsed, t.loop);
    if (f.index !== t.index) {
      t.index = f.index;
      drawStep(t.ctx, t.schedule[f.index], t.zoom);
    }
  }

  function updatePauseButton() {
    const paused = !!(state.stage && state.stage.paused);
    $('btn-pause').textContent = paused ? 'Riprendi' : 'Pausa';
  }

  function togglePause() {
    if (!state.stage) return;
    state.stage.paused = !state.stage.paused;
    updatePauseButton();
  }

  function stepFrame() {
    const s = state.stage;
    if (!s) return;
    stopSim('');
    s.paused = true;
    updatePauseButton();
    if (!s.schedule.length) return;
    const cur = P.frameAt(s.schedule, s.elapsed, s.loop).index;
    s.elapsed = P.frameStart(s.schedule, (cur + 1) % s.schedule.length);
    s.dirty = true;
  }

  function restartStage() {
    const s = state.stage;
    if (!s) return;
    s.elapsed = 0;
    s.paused = false;
    s.dirty = true;
    updatePauseButton();
  }

  // ------------------------------------------------------------ sessione simulata

  function updateSimUi(message) {
    $('btn-sim').textContent = state.sim ? 'Ferma la simulazione' : 'Simula una sessione';
    if (state.sim) {
      $('sim-status').textContent = 'Simulazione in corso: passo ' + (state.sim.i + 1) + ' di ' +
        SIM_ORDER.length + ' (' + SIM_ORDER[state.sim.i] + ')';
    } else {
      $('sim-status').textContent = message || '';
    }
  }

  function startSim() {
    if (!state.pack) return;
    state.sim = { i: 0, t: 0 };
    state.stage.paused = false;
    updatePauseButton();
    setStageState(SIM_ORDER[0], true);
    updateSimUi('');
  }

  function stopSim(message) {
    if (!state.sim) {
      if (message === '') updateSimUi('');
      return;
    }
    state.sim = null;
    updateSimUi(message);
  }

  function advanceSim(dt) {
    const sim = state.sim;
    if (!sim || state.stage.paused) return;
    sim.t += dt;
    if (sim.t < SIM_MS) return;
    sim.t = 0;
    sim.i += 1;
    if (sim.i >= SIM_ORDER.length) {
      state.sim = null;
      updateSimUi('Simulazione terminata.');
      return;
    }
    setStageState(SIM_ORDER[sim.i], true);
    updateSimUi('');
  }

  // ------------------------------------------------------------ un solo ciclo di animazione

  function tick(now) {
    state.raf = requestAnimationFrame(tick);
    const dt = state.lastTime ? Math.min(Math.max(now - state.lastTime, 0), 250) : 0;
    state.lastTime = now;
    if (!state.pack || !state.stage) return;
    advanceSim(dt);
    if (!state.stage.paused) state.stage.elapsed += dt;
    updateStageFrame();
    for (const t of state.thumbs) updateThumb(t, dt);
  }

  // ------------------------------------------------------------ controlli

  function applyBackground() {
    const viewer = $('viewer');
    viewer.dataset.bg = state.bg;
    if (state.bg === 'custom') viewer.style.setProperty('--preview-bg', state.customBg);
    else viewer.style.removeProperty('--preview-bg');
  }

  function wire() {
    $('open-btn').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const input = e.target;
      const files = Array.from(input.files || []);
      input.value = '';  // permette di riscegliere gli stessi file
      if (!files.length) return;
      loadFromList(files.map((f) => ({ path: f.webkitRelativePath || f.name, file: f })), '')
        .catch((err) => showNotice('error', 'Non riesco a leggere i file scelti: ' + err.message));
    });

    $('zoom').addEventListener('input', (e) => {
      state.zoom = Math.min(8, Math.max(1, parseInt(e.target.value, 10) || 1));
      $('zoom-out').textContent = '×' + state.zoom;
      if (state.pack) setupStageCanvas();
    });

    for (const radio of document.querySelectorAll('input[name="bg"]')) {
      radio.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        state.bg = e.target.value;
        applyBackground();
      });
    }
    $('bg-color').addEventListener('input', (e) => {
      state.customBg = e.target.value;
      state.bg = 'custom';
      $('bg-custom').checked = true;
      applyBackground();
    });

    $('show-bubble').addEventListener('change', (e) => {
      state.showBubble = e.target.checked;
      $('bubble-dot').hidden = !state.showBubble;
    });

    $('btn-pause').addEventListener('click', togglePause);
    $('btn-step').addEventListener('click', stepFrame);
    $('btn-restart').addEventListener('click', restartStage);
    $('stage-hit').addEventListener('click', restartStage);
    $('btn-sim').addEventListener('click', () => {
      if (state.sim) stopSim('Simulazione fermata.');
      else startSim();
    });

    // Trascinamento di cartelle o file su tutta la pagina.
    let depth = 0;
    const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      $('drop-overlay').hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) $('drop-overlay').hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      $('drop-overlay').hidden = true;
      handleDrop(e.dataTransfer);
    });
  }

  function init() {
    wire();
    applyBackground();
    showIntro();
    const param = new URLSearchParams(window.location.search).get('pack');
    const start = param ? loadFromParam(param, false) : loadFromParam(DEFAULT_PACK, true);
    start.catch((err) => showNotice('error', 'Non riesco a caricare il pacchetto: ' + err.message));
  }

  init();
}());
