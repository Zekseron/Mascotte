'use strict';
// Motore «llama.cpp (Mascotte)»: a differenza del preset `llamacpp` (server avviato dall'utente), qui Mascotte scarica runtime e modello
// (catalogo fisso in lib/llama-runtime.cjs), avvia llama-server solo su 127.0.0.1 quando serve e lo chiude dopo inattività e all'uscita.
// Un solo server alla volta. La chat passa dal motore compatibile OpenAI già esistente, puntato sulla porta scelta per questa esecuzione.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const Runtime = require('../llama-runtime.cjs');
const OpenAICompatible = require('./openai-compatible.cjs');
const LocalAI = require('../local-ai.cjs');

const ID = 'llamacpp-mascotte', LABEL = 'llama.cpp (Mascotte)';
const IDLE_MS = 120000, START_TIMEOUT = 240000, LOG_CAP = 256 * 1024, TAIL = 4000;
const fail = (message, code) => Object.assign(new Error(message), { code });
const NOT_READY = `${LABEL} non è pronto: scarica runtime e modello da Impostazioni › IA locale.`;
const gb = bytes => (bytes / 1e9).toFixed(1).replace('.', ',') + ' GB';

// Ambiente minimo: niente variabili dell'utente (chiavi, proxy, percorsi di librerie).
function cleanEnv(platform, server) {
  const keep = platform === 'win32' ? ['SystemRoot', 'windir', 'TEMP', 'TMP', 'ProgramData', 'ProgramFiles', 'LOCALAPPDATA', 'USERPROFILE'] : ['HOME', 'TMPDIR'];
  const env = Object.fromEntries(keep.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.PATH = platform === 'win32' ? [path.dirname(server), path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')].join(';') : '/usr/bin:/bin';
  if (platform !== 'win32') env.LANG = 'en_US.UTF-8';
  return env;
}
function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
}
function health(port, timeout = 2000) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', agent: false, timeout }, response => { response.resume(); resolve(response.statusCode); });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(0));
  });
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
// Chiude il processo e i suoi figli: su Mac/Linux il gruppo (il server è avviato `detached`), su Windows taskkill /T.
function killTree(pid, { force = false } = {}) {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T', '/F', '/FI', 'IMAGENAME eq llama-server.exe'];
    execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), args, { windowsHide: true }, () => {});
    return;
  }
  for (const target of [-pid, pid]) { try { process.kill(target, force ? 'SIGKILL' : 'SIGTERM'); return; } catch {} }
}
// Un pid rimasto nel file è nostro solo se il programma si chiama ancora llama-server (il numero potrebbe essere stato riusato).
const defaultIsOurs = pid => new Promise(resolve => {
  if (process.platform === 'win32') { resolve(true); return; }
  execFile('/bin/ps', ['-p', String(pid), '-o', 'comm='], (error, stdout) => resolve(!error && path.basename(String(stdout).trim()) === 'llama-server'));
});

function create({ dataDir, platform = process.platform, arch = process.arch, variant, runtime, models = Runtime.MODELS, idleMs = IDLE_MS, startTimeout = START_TIMEOUT, get, run, isOurProcess = defaultIsOurs, totalMemory } = {}) {
  const entry = runtime === undefined ? Runtime.runtimeFor({ platform, arch, variant }) : runtime;
  const model = models[0];
  const p = dataDir ? Runtime.paths(dataDir, entry, model) : null;
  let child = null, state = 'stopped', port = 0, startPromise = null, idleTimer = null, busy = 0, downloading = false, stopping = false, tail = '', logFd = null, logWritten = 0, delegate = null, delegatePort = 0;

  function status() {
    const ready = Boolean(p && entry);
    const runtimePresent = ready && Boolean(Runtime.runtimeServer(p.runtimeDir, platform)), modelPresent = ready && Runtime.modelPresent(p.modelDir, model);
    const modelSize = model.files.reduce((sum, file) => sum + file.size, 0);
    return { supported: Boolean(entry), configured: Boolean(p), build: Runtime.BUILD, variant: entry?.label || '', server: state,
      runtime: { present: runtimePresent, size: entry?.size || 0, license: 'MIT' }, model: { id: model.id, label: model.label, present: modelPresent, size: modelSize, license: model.license, vision: model.vision },
      complete: runtimePresent && modelPresent, missingBytes: (runtimePresent ? 0 : entry?.size || 0) + (modelPresent ? 0 : modelSize), totalBytes: (entry?.size || 0) + modelSize };
  }
  const requireReady = () => {
    const current = status();
    if (!current.supported) throw fail(`${LABEL} non è disponibile su questo computer (serve Mac Apple Silicon o Windows x64).`, 'NOT_READY');
    if (!current.configured || !current.complete) throw fail(NOT_READY, 'NOT_READY');
    return current;
  };

  // ---- Avvio e arresto del server ----
  function log(chunk) {
    const text = chunk.toString('utf8'); tail = (tail + text).slice(-TAIL);
    if (logFd !== null && logWritten < LOG_CAP) { try { fs.writeSync(logFd, text.slice(0, LOG_CAP - logWritten)); logWritten += text.length; } catch {} }
  }
  function closeLog() { if (logFd !== null) { try { fs.closeSync(logFd); } catch {} logFd = null; } }
  async function reapStale() {
    if (!p) return;
    try {
      const old = JSON.parse(fs.readFileSync(p.pid, 'utf8'));
      if (Number.isInteger(old.pid) && old.pid > 1 && alive(old.pid) && await isOurProcess(old.pid)) { killTree(old.pid, { force: true }); await new Promise(resolve => setTimeout(resolve, 300)); }
    } catch {}
    try { fs.unlinkSync(p.pid); } catch {}
  }
  function args(files, listen) {
    const out = ['-m', path.join(p.modelDir, files.find(file => file.role === 'model').name)];
    const projector = files.find(file => file.role === 'mmproj');
    if (projector) out.push('--mmproj', path.join(p.modelDir, projector.name));
    // -np 1: un solo posto, così tutto il contesto (-c) è per la conversazione; --no-webui: nessuna interfaccia web.
    return [...out, '--alias', model.id, '--host', '127.0.0.1', '--port', String(listen), '-c', String(model.ctx), '-np', '1', '--no-webui'];
  }
  async function start() {
    requireReady();
    if (child) await stopNow(); // mai due server insieme: si aspetta la fine di quello che si sta chiudendo
    const server = Runtime.runtimeServer(p.runtimeDir, platform);
    await reapStale();
    const listen = await freePort();
    fs.mkdirSync(p.root, { recursive: true });
    closeLog(); logWritten = 0; tail = '';
    try { logFd = fs.openSync(p.log, 'w', 0o600); } catch { logFd = null; }
    stopping = false; state = 'starting';
    const spawned = spawn(server, args(model.files, listen), { cwd: path.dirname(server), env: cleanEnv(platform, server), detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child = spawned; port = listen;
    let exited = false, spawnError = null;
    spawned.stdout.on('data', log); spawned.stderr.on('data', log);
    spawned.once('error', error => { spawnError = error; });
    spawned.once('exit', () => {
      exited = true;
      if (child === spawned) { child = null; state = 'stopped'; port = 0; clearTimeout(idleTimer); try { fs.unlinkSync(p.pid); } catch {} closeLog(); }
    });
    if (spawned.pid) { try { fs.writeFileSync(p.pid, JSON.stringify({ pid: spawned.pid, port: listen })); } catch {} }
    const deadline = Date.now() + startTimeout;
    for (;;) {
      if (spawnError) { state = 'stopped'; child = null; throw fail(`${LABEL}: impossibile avviare il programma (${spawnError.message.slice(0, 200)}).`, 'START_FAILED'); }
      if (exited) { if (stopping) throw fail(`${LABEL}: avvio interrotto.`, 'STOPPED'); throw fail(`${LABEL} si è chiuso durante l'avvio. ${tail.trim().split('\n').slice(-3).join(' ').slice(-400)} (log: ${p.log})`, 'START_FAILED'); }
      if (await health(listen) === 200) break;
      if (Date.now() > deadline) { stopNow(); throw fail(`${LABEL} non è partito entro ${Math.round(startTimeout / 1000)} secondi. Controlla il log: ${p.log}`, 'START_FAILED'); }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    state = 'ready'; touch(); return listen;
  }
  function stopNow() {
    clearTimeout(idleTimer); stopping = true;
    const target = child; if (!target) { state = 'stopped'; return Promise.resolve(); }
    state = 'stopping';
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { if (target.exitCode === null && target.pid) killTree(target.pid, { force: true }); setTimeout(done, 500); }, 4000);
      target.once('exit', done);
      if (target.exitCode !== null) { done(); return; }
      if (target.pid) killTree(target.pid); else target.kill();
    });
  }
  function touch() {
    clearTimeout(idleTimer);
    if (state !== 'ready' || busy > 0) return;
    idleTimer = setTimeout(() => { if (busy === 0) stopNow(); }, idleMs); idleTimer.unref?.();
  }
  function ensureRunning(signal) {
    if (state === 'ready' && child && child.exitCode === null) { touch(); return Promise.resolve(port); }
    if (!startPromise) startPromise = start().finally(() => { startPromise = null; });
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(Object.assign(new Error('Operazione interrotta.'), { name: 'AbortError' })); return; }
      const abort = () => reject(Object.assign(new Error('Operazione interrotta.'), { name: 'AbortError' }));
      signal?.addEventListener('abort', abort, { once: true });
      startPromise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
    });
  }
  const chatEngine = listen => {
    if (!delegate || delegatePort !== listen) { delegate = OpenAICompatible.create({ id: ID, label: LABEL, baseUrls: [`http://127.0.0.1:${listen}/v1`], platform, totalMemory, assumeVision: models.filter(item => item.vision).map(item => item.id),
      // Gemma 4 ragiona prima di rispondere e, con il limite di token di Windows (512), il ragionamento li consumava tutti lasciando la risposta vuota.
      chatOptions: { chat_template_kwargs: { enable_thinking: false } } }); delegatePort = listen; }
    return delegate;
  };

  return {
    id: ID, label: LABEL,
    capabilities: { vision: 'proiettore delle immagini caricato da Mascotte' },
    supportsVision: name => name === model.id && model.vision && status().model.present,
    status,
    serverState: () => state,
    // Rilevamento senza avviare nulla: pronto solo se runtime e modello sono già scaricati e verificati.
    async detect() {
      const current = status();
      if (!current.supported) return { available: false, state: 'unsupported', count: 0, message: 'non disponibile su questo computer' };
      return current.complete ? { available: true, state: 'ready', count: 1 } : { available: false, state: 'missing', count: 0, message: 'da scaricare' };
    },
    async listModels() { requireReady(); return { models: [{ name: model.id, size: status().model.size, vision: model.vision, warning: LocalAI.memoryWarning(status().model.size, platform, totalMemory) }], excluded: [] }; },
    async checkModel(name) {
      if (name !== model.id) throw fail('Modello non valido per ' + LABEL + '.', 'MODEL_INVALID');
      requireReady(); return true;
    },
    async chat({ messages, model: name, images = [], options = {}, signal } = {}) {
      await this.checkModel(name);
      busy++; clearTimeout(idleTimer);
      try {
        const listen = await ensureRunning(signal);
        const engine = chatEngine(listen);
        if (images.length) await engine.listModels({ signal }); // il motore compatibile conosce la visione solo dopo aver letto l'elenco del server
        return await engine.chat({ messages, model: name, images, options, signal });
      } finally { busy--; touch(); }
    },
    // Spazio e dimensioni prima del download (per la conferma).
    async plan() {
      const current = status();
      if (!current.supported || !current.configured) throw fail(NOT_READY, 'NOT_READY');
      const required = current.missingBytes + (current.runtime.present ? 0 : entry.size * 3) + 256 * 1024 * 1024;
      const free = await Runtime.freeBytes(p.root);
      return { ...current, requiredBytes: required, freeBytes: free, enough: free >= required, text: { missing: gb(current.missingBytes), required: gb(required), free: gb(free) } };
    },
    async download({ signal, onProgress = () => {} } = {}) {
      if (!status().supported || !p) throw fail(NOT_READY, 'NOT_READY');
      if (downloading) throw fail('Un download è già in corso.', 'BUSY');
      downloading = true;
      try {
        await stopNow();
        await Runtime.downloadAll({ dataDir, runtime: entry, model, signal, get, platform, run, onProgress: ({ done, total, file }) => onProgress({ done, total, percent: total ? Math.min(100, Math.floor(done / total * 100)) : 100, file: file?.name || null, text: `${file ? (file.role ? 'Scarico il modello' : 'Scarico llama.cpp') : 'Finalizzo'}… ${total ? Math.min(100, Math.floor(done / total * 100)) : 100}% (${gb(done)} di ${gb(total)})` }) });
      } finally { downloading = false; }
    },
    // Elimina runtime, modello e log (tutta la cartella `llama` nella cartella dati). Il server viene chiuso prima.
    async remove() {
      if (!p || downloading) throw fail('Operazione non possibile ora.', 'BUSY');
      await stopNow(); fs.rmSync(p.root, { recursive: true, force: true });
    },
    stop: stopNow,
    reapStale,
    // Chiusura dell'app: nessuna attesa, il processo riceve il segnale subito.
    shutdown() {
      clearTimeout(idleTimer); stopping = true;
      if (child?.pid && child.exitCode === null) killTree(child.pid);
    },
    logPath: p?.log
  };
}
module.exports = { create, ID, LABEL, NOT_READY, killTree, health, cleanEnv };
