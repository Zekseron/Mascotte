'use strict';
// Runtime llama.cpp e modelli GGUF per il motore «llama.cpp (Mascotte)»: catalogo FISSO, download verificato, estrazione sicura.
// Gli indirizzi, le dimensioni e le impronte SHA-256 sono scritti qui (verificati il 29 ottobre 2026): aggiornare la build o il modello
// è una scelta esplicita nel codice, mai automatica. Niente viene eseguito prima della verifica di dimensione e impronta.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { execFile } = require('node:child_process');
const Releases = require('./releases.cjs');

const BUILD = 'b11982';
const RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/`;
const runtimeEntry = (key, label, name, size, sha256, kind) => Object.freeze({ key, label, name, url: RELEASE_BASE + name, size, sha256, kind, source: 'github' });
// Per piattaforma e architettura: la prima voce è quella predefinita, le altre sono ripieghi (non provati su Windows).
const RUNTIMES = Object.freeze({
  'darwin-arm64': [runtimeEntry('macos-arm64', 'macOS Apple Silicon', `llama-${BUILD}-bin-macos-arm64.tar.gz`, 16463509, 'a826c186f464594de3ff3dccec3676dfb35c78643f66e99df6b372feadf84ae6', 'tgz')],
  'win32-x64': [
    runtimeEntry('win-vulkan-x64', 'Windows x64 (Vulkan)', `llama-${BUILD}-bin-win-vulkan-x64.zip`, 37346367, '455c401e3a599ea08b5b1263bd994bf035880b8b558454d44a6cd0c3af480bfc', 'zip'),
    runtimeEntry('win-cpu-x64', 'Windows x64 (solo CPU)', `llama-${BUILD}-bin-win-cpu-x64.zip`, 24408458, '20cd898fafc269657df8de946b06ef37dcf6b783dfa43d28ac6d187bb6ebfe1e', 'zip')]
});
function runtimeFor({ platform = process.platform, arch = process.arch, variant } = {}) {
  const list = RUNTIMES[`${platform}-${arch}`];
  if (!list) return null;
  return (variant && list.find(item => item.key === variant)) || list[0];
}

const HF_REVISION = 'a69f018d7678a2b9f5e705f8903d6fb29b9b25dc';
const HF_BASE = `https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/${HF_REVISION}/`;
const modelFile = (role, name, size, sha256) => Object.freeze({ role, name, url: HF_BASE + encodeURIComponent(name), size, sha256, source: 'huggingface' });
// Un solo modello per ora; la struttura è pronta per altri. `id` è anche il nome (alias) con cui il server lo espone.
const MODELS = Object.freeze([Object.freeze({
  id: 'gemma-4-e4b', label: 'Gemma 4 E4B', license: 'Apache 2.0', vision: true, ctx: 8192, dir: `gemma-4-e4b-${HF_REVISION.slice(0, 8)}`,
  files: Object.freeze([
    modelFile('model', 'gemma-4-E4B-it-Q4_0.gguf', 4590807392, 'a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2'),
    modelFile('mmproj', 'mmproj-gemma-4-E4B-it-Q8_0.gguf', 559874816, '197f49a93027f9843772bd24a6a9e0be2a32a788de5a3def330e9c585d86edd1')])
})]);
const findModel = id => MODELS.find(item => item.id === id) || null;

// Host ammessi: solo HTTPS. GitHub come in releases.cjs; Hugging Face e il suo CDN (osservato il 29 ottobre 2026: us.aws.cdn.hf.co; altri nomi *.hf.co sono dello stesso servizio).
const HF_HOST = host => host === 'huggingface.co' || host === 'hf.co' || host.endsWith('.hf.co') || host.endsWith('.huggingface.co');
const allowedHost = (source, host) => source === 'github' ? Releases.DOWNLOAD_HOSTS.has(host) : source === 'huggingface' ? HF_HOST(host) : false;

function getResponse(url, { signal, source, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Download annullato.'), { name: 'AbortError' })); return; }
    let parsed; try { parsed = new URL(url); } catch { reject(new Error('Indirizzo di download non valido.')); return; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHost(source, parsed.hostname)) { reject(new Error('Indirizzo di download non autorizzato.')); return; }
    const request = https.get(parsed, { headers: { 'User-Agent': 'Mascotte', Accept: 'application/octet-stream' }, signal }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 5 || !response.headers.location) { reject(new Error('Troppi reindirizzamenti durante il download.')); return; }
        try { resolve(getResponse(new URL(response.headers.location, parsed).href, { signal, source, redirects: redirects + 1 })); } catch { reject(new Error('Reindirizzamento non valido.')); }
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Download non riuscito (HTTP ${response.statusCode}).`)); return; }
      resolve(response);
    });
    request.setTimeout(30000, () => request.destroy(new Error('Connessione scaduta.')));
    request.once('error', reject);
  });
}

// Scarica in `<dest>.part`, controlla dimensione e SHA-256 e solo allora rinomina. In caso di errore o annullamento il .part sparisce.
async function downloadFile(file, dest, { signal, onBytes = () => {}, get = getResponse } = {}) {
  const partial = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.unlinkSync(partial); } catch {}
  const hash = crypto.createHash('sha256'); let size = 0;
  try {
    const response = await get(file.url, { signal, source: file.source });
    const meter = new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length;
      if (size > file.size) { done(new Error('Il file supera la dimensione dichiarata.')); return; }
      hash.update(chunk); onBytes(chunk.length); done(null, chunk);
    } });
    await pipeline(response, meter, fs.createWriteStream(partial, { flags: 'wx' }), { signal });
    if (size !== file.size || hash.digest('hex') !== file.sha256) throw new Error(`Verifica SHA-256 non riuscita per ${file.name}: file scartato.`);
    fs.renameSync(partial, dest); return dest;
  } catch (error) { try { fs.unlinkSync(partial); } catch {} throw error; }
}

async function freeBytes(directory) {
  let target = directory;
  while (!fs.existsSync(target)) { const parent = path.dirname(target); if (parent === target) break; target = parent; }
  const info = await fs.promises.statfs(target);
  return Number(info.bavail) * Number(info.bsize);
}

// ---- Estrazione sicura -------------------------------------------------------------------------------------------------------------
const MAX_ENTRIES = 5000;
// Nome di un elemento dell'archivio: mai assoluto, mai con «..», mai con NUL o unità di Windows.
function safeEntryName(name) {
  if (typeof name !== 'string' || !name || name.includes('\0') || /^[\\/]/.test(name) || /^[A-Za-z]:/.test(name)) return false;
  return !name.split(/[\\/]+/).includes('..');
}
function checkEntryNames(names) {
  if (!names.length || names.length > MAX_ENTRIES) throw new Error('Archivio del runtime non valido.');
  if (!names.every(safeEntryName)) throw new Error('Archivio del runtime rifiutato: contiene percorsi che escono dalla cartella.');
}
// Nomi dei file di uno ZIP dalla directory centrale (senza decomprimere nulla).
function zipEntryNames(file) {
  const buffer = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Archivio ZIP non valido.');
  const count = buffer.readUInt16LE(eocd + 10); let offset = buffer.readUInt32LE(eocd + 16); const names = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Archivio ZIP non valido.');
    const nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength)); offset += 46 + nameLength + extra + comment;
  }
  return names;
}
function runTool(file, args, { signal, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Operazione interrotta.'), { name: 'AbortError' })); return; }
    execFile(file, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout, signal }, (error, stdout, stderr) => error ? reject(Object.assign(new Error(String(stderr || error.message).trim().slice(-400)), { name: signal?.aborted ? 'AbortError' : error.name })) : resolve({ stdout: String(stdout), stderr: String(stderr) }));
  });
}
// Dopo l'estrazione nulla deve stare fuori dalla cartella: collegamenti simbolici compresi (si controlla il percorso reale).
function verifyTree(root) {
  const base = fs.realpathSync(root) + path.sep;
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const real = fs.realpathSync(full);
      if (!(real + path.sep).startsWith(base)) throw new Error('Archivio del runtime rifiutato: un collegamento punta fuori dalla cartella.');
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
}
const serverName = (platform = process.platform) => platform === 'win32' ? 'llama-server.exe' : 'llama-server';
function findServer(root, platform = process.platform, depth = 3) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isFile() && entry.name === serverName(platform)) return path.join(root, entry.name);
  if (depth > 0) for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) { const found = findServer(path.join(root, entry.name), platform, depth - 1); if (found) return found; }
  return null;
}
// Estrae in `destination` (cartella nuova). tgz: /usr/bin/tar (Mac); zip: Expand-Archive (Windows, come releases.cjs).
async function extractArchive(archive, destination, kind, { signal, platform = process.platform, run = runTool } = {}) {
  fs.mkdirSync(destination, { recursive: true });
  if (kind === 'tgz') {
    const tar = platform === 'darwin' ? '/usr/bin/tar' : 'tar';
    const names = (await run(tar, ['-tzf', archive], { signal })).stdout.split('\n').filter(Boolean);
    checkEntryNames(names);
    // Collegamenti simbolici e fisici: il bersaglio non può essere assoluto né contenere «..».
    for (const line of (await run(tar, ['-tzvf', archive], { signal })).stdout.split('\n')) {
      if (!/^[lh]/.test(line)) continue;
      const target = line.includes(' -> ') ? line.split(' -> ').pop() : line.includes(' link to ') ? line.split(' link to ').pop() : '';
      if (!target || !safeEntryName(target.trim())) throw new Error('Archivio del runtime rifiutato: un collegamento punta fuori dalla cartella.');
    }
    await run(tar, ['-xzf', archive, '-C', destination], { signal });
  } else if (kind === 'zip') {
    checkEntryNames(zipEntryNames(archive));
    const quote = value => value.replace(/'/g, "''");
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${quote(archive)}' -DestinationPath '${quote(destination)}' -Force`], { signal });
  } else throw new Error('Formato di archivio non supportato.');
  verifyTree(destination);
  const server = findServer(destination, platform);
  if (!server) throw new Error(`L'archivio non contiene ${serverName(platform)}.`);
  return server;
}

// ---- Cartelle e stato ---------------------------------------------------------------------------------------------------------------
const paths = (dataDir, runtime, model) => ({
  root: path.join(dataDir, 'llama'),
  runtimeBuild: path.join(dataDir, 'llama', 'runtime', BUILD),
  runtimeDir: runtime && path.join(dataDir, 'llama', 'runtime', BUILD, runtime.key),
  modelDir: model && path.join(dataDir, 'llama', 'models', model.dir),
  log: path.join(dataDir, 'llama', 'server.log'), pid: path.join(dataDir, 'llama', 'server.pid')
});
const MARKER = 'mascotte-runtime.json';
// Runtime presente: segnalino scritto solo dopo verifica ed estrazione, più il file eseguibile ancora al suo posto.
function runtimeServer(dir, platform = process.platform) {
  if (!dir) return null;
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
    const server = path.join(dir, String(marker.server));
    return marker.build === BUILD && safeEntryName(String(marker.server)) && fs.statSync(server).isFile() ? server : null;
  } catch { return null; }
}
const modelPresent = (dir, model) => Boolean(dir) && model.files.every(file => { try { return fs.statSync(path.join(dir, file.name)).size === file.size; } catch { return false; } });

// Scarica e verifica quanto manca. `onProgress({ done, total, file })` con byte cumulati su tutto il lavoro.
async function downloadAll({ dataDir, runtime, model, signal, onProgress = () => {}, get, platform = process.platform, run }) {
  const p = paths(dataDir, runtime, model);
  const jobs = [];
  if (runtime && !runtimeServer(p.runtimeDir, platform)) jobs.push({ kind: 'runtime', file: runtime });
  if (model && !modelPresent(p.modelDir, model)) for (const file of model.files) { try { if (fs.statSync(path.join(p.modelDir, file.name)).size === file.size) continue; } catch {} jobs.push({ kind: 'model', file }); }
  if (!jobs.length) return { downloaded: 0 };
  const total = jobs.reduce((sum, job) => sum + job.file.size, 0);
  const needed = total + (jobs.some(job => job.kind === 'runtime') ? runtime.size * 3 : 0) + 256 * 1024 * 1024;
  const free = await freeBytes(p.root);
  if (free < needed) throw Object.assign(new Error(`Spazio libero insufficiente: servono circa ${(needed / 1e9).toFixed(1).replace('.', ',')} GB, ne restano ${(free / 1e9).toFixed(1).replace('.', ',')} GB.`), { code: 'NO_SPACE' });
  let done = 0, last = 0;
  const tick = file => { const now = Date.now(); if (now - last > 250) { last = now; onProgress({ done, total, file }); } };
  for (const job of jobs) {
    onProgress({ done, total, file: job.file }); last = 0;
    if (job.kind === 'runtime') {
      // Vecchie build: si tengono solo quella del catalogo.
      try { for (const entry of fs.readdirSync(path.dirname(p.runtimeBuild))) if (entry !== BUILD) fs.rmSync(path.join(path.dirname(p.runtimeBuild), entry), { recursive: true, force: true }); } catch {}
      const archive = path.join(p.runtimeBuild, job.file.name);
      await downloadFile(job.file, archive, { signal, get, onBytes: bytes => { done += bytes; tick(job.file); } });
      const temp = p.runtimeDir + '.tmp';
      try {
        fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(p.runtimeDir, { recursive: true, force: true });
        const server = await extractArchive(archive, temp, job.file.kind, { signal, platform, run });
        fs.writeFileSync(path.join(temp, MARKER), JSON.stringify({ build: BUILD, key: runtime.key, sha256: runtime.sha256, server: path.relative(temp, server).split(path.sep).join('/') }));
        fs.renameSync(temp, p.runtimeDir);
      } finally { fs.rmSync(temp, { recursive: true, force: true }); try { fs.unlinkSync(archive); } catch {} }
    } else await downloadFile(job.file, path.join(p.modelDir, job.file.name), { signal, get, onBytes: bytes => { done += bytes; tick(job.file); } });
  }
  onProgress({ done: total, total, file: null });
  return { downloaded: total };
}

module.exports = { BUILD, RUNTIMES, MODELS, HF_REVISION, runtimeFor, findModel, allowedHost, getResponse, downloadFile, downloadAll, freeBytes, safeEntryName, checkEntryNames, zipEntryNames, verifyTree, findServer, serverName, extractArchive, paths, runtimeServer, modelPresent, MARKER };
