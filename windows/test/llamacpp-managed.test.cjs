'use strict';
// Motore «llama.cpp (Mascotte)»: catalogo fisso, download verificato (server HTTP finto), estrazione sicura e ciclo di vita del server
// con un finto llama-server (script Node). Nessun download vero, nessun modello vero.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Runtime = require('../lib/llama-runtime.cjs');
const Managed = require('../lib/engines/llamacpp-managed.cjs');
const Engines = require('../lib/local-engines.cjs');

const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-llama-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await sleep(50); } return false; }

// Archivio tar scritto a mano, così si possono costruire anche voci non valide (../, percorsi assoluti, collegamenti verso fuori).
function tar(entries) {
  const blocks = [];
  for (const { name, data = '', type = '0', link = '' } of entries) {
    const body = Buffer.from(data), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write('0000755\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(' ', 148, 156);
    header.write(type, 156); header.write(link, 157, 100); header.write('ustar\0' + '00', 257);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
// ZIP con sola directory centrale: basta per leggere i nomi.
function zip(names) {
  const central = names.map(name => { const header = Buffer.alloc(46 + Buffer.byteLength(name)); header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(Buffer.byteLength(name), 28); header.write(name, 46); return header; });
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(0, 16);
  return Buffer.concat([directory, end]);
}
// Server HTTP finto: serve `files` (percorso → Buffer); `slow` rallenta per poter annullare.
async function server(t, files, { slow = false } = {}) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.url); const body = files[req.url];
    if (!body) { res.statusCode = 404; res.end(); return; }
    res.statusCode = 200;
    if (!slow) { res.end(body); return; }
    res.write(body.subarray(0, 4)); const timer = setInterval(() => res.write('x'), 20); res.on('close', () => clearInterval(timer));
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { srv.close(resolve); srv.closeAllConnections?.(); }));
  return { base: `http://127.0.0.1:${srv.address().port}`, hits };
}
const getFrom = base => (url, { signal } = {}) => new Promise((resolve, reject) => {
  const request = http.get(base + new URL(url).pathname, { signal }, response => response.statusCode === 200 ? resolve(response) : (response.resume(), reject(new Error(`HTTP ${response.statusCode}`))));
  request.once('error', reject);
});

test('catalogo: nomi, indirizzi fissati, dimensioni e impronte coerenti', () => {
  assert.equal(Runtime.BUILD, 'b11982');
  const all = [...Object.values(Runtime.RUNTIMES).flat(), ...Runtime.MODELS.flatMap(model => model.files)];
  assert.equal(all.length, 5);
  for (const file of all) { assert.match(file.sha256, /^[0-9a-f]{64}$/); assert.ok(Number.isSafeInteger(file.size) && file.size > 0); assert.ok(file.url.startsWith('https://')); assert.ok(['github', 'huggingface'].includes(file.source)); }
  const mac = Runtime.runtimeFor({ platform: 'darwin', arch: 'arm64' });
  assert.equal(mac.name, 'llama-b11982-bin-macos-arm64.tar.gz');
  assert.equal(mac.url, 'https://github.com/ggml-org/llama.cpp/releases/download/b11982/llama-b11982-bin-macos-arm64.tar.gz');
  assert.equal(mac.size, 16463509); assert.equal(mac.sha256, 'a826c186f464594de3ff3dccec3676dfb35c78643f66e99df6b372feadf84ae6'); assert.equal(mac.kind, 'tgz');
  const win = Runtime.RUNTIMES['win32-x64'];
  assert.deepEqual(win.map(item => item.name), ['llama-b11982-bin-win-vulkan-x64.zip', 'llama-b11982-bin-win-cpu-x64.zip']);
  assert.equal(Runtime.runtimeFor({ platform: 'win32', arch: 'x64' }).key, 'win-vulkan-x64');
  assert.equal(Runtime.runtimeFor({ platform: 'win32', arch: 'x64', variant: 'win-cpu-x64' }).key, 'win-cpu-x64');
  assert.equal(Runtime.runtimeFor({ platform: 'darwin', arch: 'x64' }), null);
  assert.equal(Runtime.runtimeFor({ platform: 'linux', arch: 'x64' }), null);
  const model = Runtime.findModel('gemma-4-e4b');
  assert.equal(model.license, 'Apache 2.0');
  assert.deepEqual(model.files.map(file => [file.name, file.size]), [['gemma-4-E4B-it-Q4_0.gguf', 4590807392], ['mmproj-gemma-4-E4B-it-Q8_0.gguf', 559874816]]);
  for (const file of model.files) assert.equal(file.url, `https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/a69f018d7678a2b9f5e705f8903d6fb29b9b25dc/${file.name}`);
  assert.equal(Runtime.findModel('altro'), null);
});

test('host ammessi: solo HTTPS verso GitHub o Hugging Face, ognuno per la sua sorgente', async () => {
  for (const host of ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']) assert.ok(Runtime.allowedHost('github', host), host);
  for (const host of ['huggingface.co', 'us.aws.cdn.hf.co', 'cdn-lfs.hf.co', 'cas-bridge.xethub.hf.co', 'x.xethub.hf.co']) assert.ok(Runtime.allowedHost('huggingface', host), host);
  for (const host of ['evil.example', 'huggingface.co.evil.example', 'hf.co.evil.example', 'xhf.co', 'evilhuggingface.co', 'github.com.evil.example']) { assert.ok(!Runtime.allowedHost('github', host) || host === 'x', host); assert.ok(!Runtime.allowedHost('huggingface', host), host); }
  assert.ok(!Runtime.allowedHost('huggingface', 'github.com')); assert.ok(!Runtime.allowedHost('github', 'huggingface.co')); assert.ok(!Runtime.allowedHost('altro', 'github.com'));
  for (const url of ['http://github.com/x', 'https://evil.example/x', 'https://user:pw@github.com/x', 'ftp://github.com/x', 'non un url']) await assert.rejects(Runtime.getResponse(url, { source: 'github' }), /non autorizzato|non valido/, url);
});

test('download: impronta giusta → file; sbagliata o troppo grande → niente file; annullamento → niente file', async t => {
  const dir = temp(t), body = Buffer.from('contenuto di prova '.repeat(500));
  const srv = await server(t, { '/ok': body, '/slow': Buffer.concat([body, Buffer.alloc(0)]) });
  const get = getFrom(srv.base), file = { name: 'ok.bin', url: 'https://github.com/ok', size: body.length, sha256: sha(body), source: 'github' };
  let counted = 0;
  const dest = path.join(dir, 'a', 'ok.bin');
  await Runtime.downloadFile({ ...file, url: 'https://github.com/ok' }, dest, { get, onBytes: n => { counted += n; } });
  assert.deepEqual(fs.readFileSync(dest), body); assert.equal(counted, body.length); assert.deepEqual(fs.readdirSync(path.dirname(dest)), ['ok.bin']);
  // impronta sbagliata
  const bad = path.join(dir, 'bad.bin');
  await assert.rejects(Runtime.downloadFile({ ...file, sha256: '0'.repeat(64) }, bad, { get }), /SHA-256/);
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('bad')), []);
  // dimensione dichiarata minore del corpo
  await assert.rejects(Runtime.downloadFile({ ...file, size: body.length - 1 }, bad, { get }), /dimensione/);
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('bad')), []);
  // dimensione dichiarata maggiore del corpo
  await assert.rejects(Runtime.downloadFile({ ...file, size: body.length + 1 }, bad, { get }), /SHA-256/);
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('bad')), []);
  // un .part lasciato da un'esecuzione interrotta non blocca il nuovo tentativo
  fs.writeFileSync(path.join(dir, 'again.bin.part'), 'vecchio');
  await Runtime.downloadFile(file, path.join(dir, 'again.bin'), { get });
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('again')), ['again.bin']);
});

test('download: annullamento a metà lascia solo cartelle vuote', async t => {
  const dir = temp(t), body = Buffer.alloc(1000, 1);
  const srv = await server(t, { '/slow': body }, { slow: true });
  const controller = new AbortController(), dest = path.join(dir, 'm', 'slow.bin');
  const job = Runtime.downloadFile({ name: 'slow.bin', url: 'https://github.com/slow', size: 100000, sha256: '0'.repeat(64), source: 'github' }, dest, { get: getFrom(srv.base), signal: controller.signal, onBytes: () => { if (!controller.signal.aborted) setTimeout(() => controller.abort(), 30); } });
  await assert.rejects(job, error => error.name === 'AbortError');
  assert.deepEqual(fs.readdirSync(path.dirname(dest)), []);
  // già annullato prima di cominciare
  await assert.rejects(Runtime.getResponse('https://github.com/x', { signal: controller.signal, source: 'github' }), error => error.name === 'AbortError');
});

test('nomi dell\'archivio: assoluti, «..», NUL e unità di Windows rifiutati', () => {
  for (const bad of ['/etc/passwd', '../x', 'a/../../x', 'a\\..\\x', '\\windows\\x', 'C:\\x', 'c:/x', 'a\0b', '', undefined]) assert.equal(Runtime.safeEntryName(bad), false, String(bad));
  for (const good of ['llama/llama-server', 'a/b.dylib', 'llama.cpp/x', './x', 'a..b/c']) assert.equal(Runtime.safeEntryName(good), true, good);
  assert.throws(() => Runtime.checkEntryNames([]), /non valido/);
  assert.throws(() => Runtime.checkEntryNames(['ok', '../no']), /escono/);
});

test('ZIP: i nomi si leggono dalla directory centrale e quelli pericolosi si vedono', t => {
  const dir = temp(t), good = path.join(dir, 'g.zip'), bad = path.join(dir, 'b.zip');
  fs.writeFileSync(good, zip(['llama-server.exe', 'ggml.dll', 'sub/x.dll'])); fs.writeFileSync(bad, zip(['llama-server.exe', '..\\evil.dll']));
  assert.deepEqual(Runtime.zipEntryNames(good), ['llama-server.exe', 'ggml.dll', 'sub/x.dll']);
  assert.doesNotThrow(() => Runtime.checkEntryNames(Runtime.zipEntryNames(good)));
  assert.throws(() => Runtime.checkEntryNames(Runtime.zipEntryNames(bad)), /escono/);
  fs.writeFileSync(path.join(dir, 'n.zip'), 'non è uno zip'); assert.throws(() => Runtime.zipEntryNames(path.join(dir, 'n.zip')), /non valido/);
});

const hasTar = fs.existsSync('/usr/bin/tar');
test('estrazione tgz: archivio buono trova llama-server; archivi malevoli rifiutati senza scrivere fuori', { skip: !hasTar && 'tar non disponibile' }, async t => {
  const dir = temp(t), out = path.join(dir, 'out');
  const good = path.join(dir, 'good.tgz');
  fs.writeFileSync(good, tar([{ name: 'llama-x/', type: '5' }, { name: 'llama-x/llama-server', data: '#!/bin/sh\n' }, { name: 'llama-x/libllama.dylib', data: 'lib' }, { name: 'llama-x/libllama.0.dylib', type: '2', link: 'libllama.dylib' }]));
  const server = await Runtime.extractArchive(good, path.join(out, 'good'), 'tgz', { platform: 'darwin' });
  assert.equal(server, path.join(out, 'good', 'llama-x', 'llama-server')); assert.ok(fs.existsSync(path.join(out, 'good', 'llama-x', 'libllama.0.dylib')));
  const evil = {
    'dotdot': [{ name: '../fuori.txt', data: 'x' }],
    'nested-dotdot': [{ name: 'a/../../fuori.txt', data: 'x' }],
    'absolute': [{ name: '/tmp/mascotte-fuori.txt', data: 'x' }],
    'symlink-abs': [{ name: 'ln', type: '2', link: '/etc' }, { name: 'ln/passwd2', data: 'x' }],
    'symlink-dotdot': [{ name: 'ln', type: '2', link: '../..' }, { name: 'llama-server', data: 'x' }]
  };
  for (const [name, entries] of Object.entries(evil)) {
    const archive = path.join(dir, name + '.tgz'); fs.writeFileSync(archive, tar(entries));
    await assert.rejects(Runtime.extractArchive(archive, path.join(out, name), 'tgz', { platform: 'darwin' }), /rifiutato/, name);
    assert.ok(!fs.existsSync(path.join(dir, 'fuori.txt')) && !fs.existsSync('/tmp/mascotte-fuori.txt') && !fs.existsSync('/etc/passwd2'), name);
    assert.deepEqual(fs.existsSync(path.join(out, name)) ? fs.readdirSync(path.join(out, name)) : [], [], name);
  }
  // senza llama-server dentro
  const empty = path.join(dir, 'empty.tgz'); fs.writeFileSync(empty, tar([{ name: 'solo.txt', data: 'x' }]));
  await assert.rejects(Runtime.extractArchive(empty, path.join(out, 'empty'), 'tgz', { platform: 'darwin' }), /non contiene llama-server/);
  await assert.rejects(Runtime.extractArchive(empty, path.join(out, 'x'), 'rar', { platform: 'darwin' }), /non supportato/);
});

test('verifyTree: un collegamento che esce dalla cartella viene scoperto', { skip: process.platform === 'win32' }, t => {
  const dir = temp(t), root = path.join(dir, 'r'); fs.mkdirSync(root); fs.writeFileSync(path.join(dir, 'fuori'), 'x');
  fs.symlinkSync('a', path.join(root, 'ok')); fs.writeFileSync(path.join(root, 'a'), 'x'); assert.doesNotThrow(() => Runtime.verifyTree(root));
  fs.symlinkSync(path.join(dir, 'fuori'), path.join(root, 'ln')); assert.throws(() => Runtime.verifyTree(root), /fuori dalla cartella/);
});

// Catalogo di prova, piccolo: stessa struttura di quello vero.
function smallCatalog(archive) {
  const model = Buffer.from('modello finto '.repeat(40)), projector = Buffer.from('proiettore finto '.repeat(30));
  return {
    bodies: { '/runtime.tgz': archive, '/model.gguf': model, '/mmproj.gguf': projector },
    runtime: { key: 'prova', label: 'Prova', name: 'runtime.tgz', url: 'https://github.com/runtime.tgz', size: archive.length, sha256: sha(archive), kind: 'tgz', source: 'github' },
    model: { id: 'gemma-4-e4b', label: 'Gemma 4 E4B', license: 'Apache 2.0', vision: true, ctx: 8192, dir: 'm-prova', files: [
      { role: 'model', name: 'model.gguf', url: 'https://huggingface.co/model.gguf', size: model.length, sha256: sha(model), source: 'huggingface' },
      { role: 'mmproj', name: 'mmproj.gguf', url: 'https://huggingface.co/mmproj.gguf', size: projector.length, sha256: sha(projector), source: 'huggingface' }] }
  };
}
const goodArchive = () => tar([{ name: 'llama-x/', type: '5' }, { name: 'llama-x/llama-server', data: '#!/bin/sh\n' }]);

test('downloadAll: scarica, verifica, estrae, scrive il segnalino; la seconda volta non scarica nulla', { skip: !hasTar && 'tar non disponibile' }, async t => {
  const dir = temp(t), c = smallCatalog(goodArchive()), srv = await server(t, c.bodies), progress = [];
  const options = { dataDir: dir, runtime: c.runtime, model: c.model, get: getFrom(srv.base), platform: 'darwin', onProgress: p => progress.push(p) };
  const result = await Runtime.downloadAll(options);
  const p = Runtime.paths(dir, c.runtime, c.model);
  assert.equal(result.downloaded, c.runtime.size + c.model.files[0].size + c.model.files[1].size);
  assert.ok(Runtime.runtimeServer(p.runtimeDir, 'darwin').endsWith('llama-x/llama-server')); assert.ok(Runtime.modelPresent(p.modelDir, c.model));
  assert.equal(progress.at(-1).done, progress.at(-1).total); assert.ok(progress.every(item => item.done <= item.total));
  assert.deepEqual(fs.readdirSync(p.runtimeBuild), ['prova']); assert.deepEqual(fs.readdirSync(p.modelDir).sort(), ['mmproj.gguf', 'model.gguf']);
  const before = srv.hits.length; assert.equal((await Runtime.downloadAll(options)).downloaded, 0); assert.equal(srv.hits.length, before);
  // un file di modello con dimensione sbagliata (troncato) viene riscaricato da solo
  fs.truncateSync(path.join(p.modelDir, 'model.gguf'), 5); assert.ok(!Runtime.modelPresent(p.modelDir, c.model));
  await Runtime.downloadAll(options); assert.ok(Runtime.modelPresent(p.modelDir, c.model));
  assert.equal(srv.hits.filter(url => url === '/mmproj.gguf').length, 1);
});

test('downloadAll: modello con impronta sbagliata → nessun file del modello; runtime con impronta sbagliata → nulla da eseguire', { skip: !hasTar && 'tar non disponibile' }, async t => {
  const dir = temp(t), c = smallCatalog(goodArchive()), srv = await server(t, c.bodies), get = getFrom(srv.base);
  const p = Runtime.paths(dir, c.runtime, c.model);
  await assert.rejects(Runtime.downloadAll({ dataDir: dir, runtime: c.runtime, model: { ...c.model, files: [{ ...c.model.files[0], sha256: '1'.repeat(64) }, c.model.files[1]] }, get, platform: 'darwin' }), /SHA-256/);
  assert.deepEqual(fs.readdirSync(p.modelDir), []);
  const other = temp(t), q = Runtime.paths(other, c.runtime, c.model);
  await assert.rejects(Runtime.downloadAll({ dataDir: other, runtime: { ...c.runtime, sha256: '2'.repeat(64) }, model: c.model, get, platform: 'darwin' }), /SHA-256/);
  assert.equal(Runtime.runtimeServer(q.runtimeDir, 'darwin'), null); assert.deepEqual(fs.readdirSync(q.runtimeBuild), []); assert.ok(!fs.existsSync(q.modelDir));
  // archivio malevolo con impronta giusta: l'estrazione lo rifiuta e non resta nulla di eseguibile
  const evil = smallCatalog(tar([{ name: '../fuori', data: 'x' }, { name: 'llama-server', data: 'x' }])), srv2 = await server(t, evil.bodies), third = temp(t), r = Runtime.paths(third, evil.runtime, evil.model);
  await assert.rejects(Runtime.downloadAll({ dataDir: third, runtime: evil.runtime, model: evil.model, get: getFrom(srv2.base), platform: 'darwin' }), /rifiutato/);
  assert.equal(Runtime.runtimeServer(r.runtimeDir, 'darwin'), null); assert.deepEqual(fs.readdirSync(r.runtimeBuild), []); assert.ok(!fs.existsSync(path.join(third, 'llama', 'runtime', 'fuori')));
});

test('downloadAll: spazio insufficiente → errore prima di scaricare; annullamento → nessun file; build vecchie rimosse', { skip: !hasTar && 'tar non disponibile' }, async t => {
  const dir = temp(t), c = smallCatalog(goodArchive()), srv = await server(t, c.bodies, {}), get = getFrom(srv.base);
  const stat = t.mock.method(fs.promises, 'statfs', async () => ({ bavail: 10, bsize: 4096 }));
  await assert.rejects(Runtime.downloadAll({ dataDir: dir, runtime: c.runtime, model: c.model, get, platform: 'darwin' }), error => error.code === 'NO_SPACE' && /Spazio libero insufficiente/.test(error.message));
  assert.equal(srv.hits.length, 0); stat.mock.restore();
  // build precedente presente: va via quando si scarica il runtime nuovo
  const old = path.join(dir, 'llama', 'runtime', 'b1', 'vecchio'); fs.mkdirSync(old, { recursive: true });
  await Runtime.downloadAll({ dataDir: dir, runtime: c.runtime, model: c.model, get, platform: 'darwin' });
  assert.ok(!fs.existsSync(path.join(dir, 'llama', 'runtime', 'b1')));
  // annullamento: nessun file parziale
  const other = temp(t), slow = await server(t, c.bodies, { slow: true }), controller = new AbortController(); setTimeout(() => controller.abort(), 120);
  await assert.rejects(Runtime.downloadAll({ dataDir: other, runtime: c.runtime, model: c.model, get: getFrom(slow.base), signal: controller.signal, platform: 'darwin' }), error => error.name === 'AbortError');
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
  assert.deepEqual(walk(other), []);
});

// ---- Finto llama-server --------------------------------------------------------------------------------------------------------------
// Si comporta come quello vero per quanto serve: legge --port, risponde a /health (503 poi 200), /v1/models e /v1/chat/completions.
// Segnali in file accanto allo script: `fail.flag` (esce subito), `hang.flag` (non apre mai /health), `delay.flag` (apre /health dopo 600 ms).
const FAKE = `#!${process.execPath}
const fs = require('fs'), path = require('path'), http = require('http');
const dir = __dirname, args = process.argv.slice(2), port = Number(args[args.indexOf('--port') + 1]);
fs.appendFileSync(path.join(dir, 'starts.log'), JSON.stringify({ pid: process.pid, args, env: Object.keys(process.env).sort(), cwd: process.cwd() }) + '\\n');
if (fs.existsSync(path.join(dir, 'fail.flag'))) { console.error('boom: impossibile caricare il modello'); process.exit(1); }
let ready = false; setTimeout(() => { ready = true; }, fs.existsSync(path.join(dir, 'delay.flag')) ? 600 : 50);
process.on('SIGTERM', () => process.exit(0));
if (fs.existsSync(path.join(dir, 'hang.flag'))) { setInterval(() => {}, 1000); return; }
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') { res.statusCode = ready ? 200 : 503; res.end(JSON.stringify({ status: ready ? 'ok' : 'loading' })); return; }
    if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'gemma-4-e4b', object: 'model' }] })); return; }
    if (req.url === '/v1/chat/completions') { const p = JSON.parse(body); const last = p.messages[p.messages.length - 1];
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ max_tokens: p.max_tokens, image: Array.isArray(last.content) && last.content.some(x => x.type === 'image_url'), n: p.messages.length }) }, finish_reason: 'stop' }] })); return; }
    res.statusCode = 404; res.end('{}');
  });
}).listen(port, '127.0.0.1');
`;
function setup(t, options = {}) {
  const dir = temp(t), c = smallCatalog(Buffer.from('non usato')), p = Runtime.paths(dir, c.runtime, c.model);
  fs.mkdirSync(p.runtimeDir, { recursive: true }); fs.mkdirSync(p.modelDir, { recursive: true });
  const script = path.join(p.runtimeDir, 'llama-server'); fs.writeFileSync(script, FAKE, { mode: 0o755 });
  fs.writeFileSync(path.join(p.runtimeDir, Runtime.MARKER), JSON.stringify({ build: Runtime.BUILD, key: 'prova', server: 'llama-server' }));
  for (const file of c.model.files) fs.writeFileSync(path.join(p.modelDir, file.name), Buffer.alloc(file.size, 7));
  const engine = Managed.create({ dataDir: dir, platform: 'darwin', arch: 'arm64', runtime: c.runtime, models: [c.model], ...options });
  t.after(async () => { engine.shutdown(); await engine.stop(); });
  const starts = () => fs.existsSync(path.join(p.runtimeDir, 'starts.log')) ? fs.readFileSync(path.join(p.runtimeDir, 'starts.log'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { dir, engine, p, c, starts, flag: name => fs.writeFileSync(path.join(p.runtimeDir, name + '.flag'), '') };
}
const messages = [{ role: 'user', content: 'ciao' }];
const skipWin = process.platform === 'win32' && 'script con shebang non eseguibile su Windows';

test('stato e rilevamento: da scaricare finché mancano file; chat con errore chiaro NOT_READY', async t => {
  const dir = temp(t), engine = Managed.create({ dataDir: dir, platform: 'darwin', arch: 'arm64' });
  assert.equal(engine.id, 'llamacpp-mascotte'); assert.equal(engine.label, 'llama.cpp (Mascotte)');
  const status = engine.status();
  assert.deepEqual([status.supported, status.complete, status.runtime.present, status.model.present, status.server], [true, false, false, false, 'stopped']);
  assert.equal(status.totalBytes, 16463509 + 4590807392 + 559874816); assert.equal(status.missingBytes, status.totalBytes);
  assert.equal(status.runtime.license, 'MIT'); assert.equal(status.model.license, 'Apache 2.0');
  assert.deepEqual(await engine.detect(), { available: false, state: 'missing', count: 0, message: 'da scaricare' });
  await assert.rejects(engine.chat({ messages, model: 'gemma-4-e4b' }), error => error.code === 'NOT_READY' && /scarica runtime e modello/.test(error.message));
  await assert.rejects(engine.checkModel('gemma-4-e4b'), { code: 'NOT_READY' }); await assert.rejects(engine.listModels(), { code: 'NOT_READY' });
  await assert.rejects(engine.checkModel('altro'), { code: 'MODEL_INVALID' });
  assert.equal(engine.supportsVision('gemma-4-e4b'), false);
  const plan = await engine.plan(); assert.ok(plan.requiredBytes > plan.missingBytes); assert.equal(typeof plan.enough, 'boolean'); assert.match(plan.text.required, /GB$/);
  // piattaforma non supportata e cartella dati assente
  const unsupported = Managed.create({ dataDir: dir, platform: 'linux', arch: 'x64' });
  assert.equal(unsupported.status().supported, false); assert.equal((await unsupported.detect()).state, 'unsupported'); await assert.rejects(unsupported.chat({ messages, model: 'gemma-4-e4b' }), { code: 'NOT_READY' });
  assert.equal(Managed.create({ platform: 'darwin', arch: 'arm64' }).status().configured, false);
});

test('chat: avvia llama-server con i flag attesi, ambiente pulito, 127.0.0.1; un solo server anche con richieste insieme', { skip: skipWin }, async t => {
  const { engine, starts, p } = setup(t);
  assert.deepEqual(await engine.detect(), { available: true, state: 'ready', count: 1 });
  const { models } = await engine.listModels(); assert.deepEqual(models.map(m => [m.name, m.vision]), [['gemma-4-e4b', true]]);
  assert.equal(engine.supportsVision('gemma-4-e4b'), true);
  const [a, b] = await Promise.all([engine.chat({ messages, model: 'gemma-4-e4b', options: { maxTokens: 1536 } }), engine.chat({ messages, model: 'gemma-4-e4b', options: { maxTokens: 321 } })]);
  assert.deepEqual(JSON.parse(a), { max_tokens: 1536, image: false, n: 1 }); assert.equal(JSON.parse(b).max_tokens, 321);
  assert.equal(starts().length, 1); assert.equal(engine.serverState(), 'ready');
  const start = starts()[0], arg = name => start.args[start.args.indexOf(name) + 1];
  assert.equal(arg('-m'), path.join(p.modelDir, 'model.gguf')); assert.equal(arg('--mmproj'), path.join(p.modelDir, 'mmproj.gguf'));
  assert.equal(arg('--host'), '127.0.0.1'); assert.ok(Number(arg('--port')) > 1023); assert.equal(arg('-c'), '8192'); assert.equal(arg('-np'), '1'); assert.equal(arg('--alias'), 'gemma-4-e4b'); assert.ok(start.args.includes('--no-webui'));
  assert.ok(!start.args.some(item => /^0\.0\.0\.0$|^::$/.test(item)));
  // ambiente pulito: nessuna delle variabili dell'utente
  process.env.MASCOTTE_PROVA_SEGRETO = 'x'; assert.ok(!start.env.includes('MASCOTTE_PROVA_SEGRETO')); delete process.env.MASCOTTE_PROVA_SEGRETO;
  assert.ok(!start.env.some(name => /KEY|TOKEN|PROXY|DYLD|LD_/.test(name))); assert.equal(start.cwd, fs.realpathSync(p.runtimeDir));
  assert.equal(JSON.parse(fs.readFileSync(p.pid, 'utf8')).pid, start.pid);
  assert.ok(fs.existsSync(p.log));
  // richiesta successiva: stesso server
  await engine.chat({ messages, model: 'gemma-4-e4b' }); assert.equal(starts().length, 1);
});

test('chat: stesso numPredict degli altri motori e immagini accettate (proiettore caricato da Mascotte)', { skip: skipWin }, async t => {
  const { engine, starts } = setup(t);
  const run = Engines.run(engine, [], 'ciao', [], { platform: 'darwin', model: 'gemma-4-e4b', imageBase64: Buffer.from('jpeg finto').toString('base64') });
  const answer = JSON.parse(await run.promise);
  assert.equal(answer.max_tokens, 1536); assert.equal(answer.image, true); assert.equal(starts().length, 1);
  await assert.rejects(engine.chat({ messages, model: 'gemma-4-e4b', images: ['non base64!'] }), /Immagine non valida/);
});

test('arresto: dopo inattività il server si chiude e riparte alla richiesta successiva; mai due insieme', { skip: skipWin }, async t => {
  const { engine, starts, p } = setup(t, { idleMs: 400 });
  await engine.chat({ messages, model: 'gemma-4-e4b' });
  const first = starts()[0].pid; assert.ok(alive(first));
  assert.ok(await until(() => engine.serverState() === 'stopped'), 'si chiude da solo'); assert.ok(await until(() => !alive(first)), 'il processo è finito');
  assert.ok(!fs.existsSync(p.pid));
  await engine.chat({ messages, model: 'gemma-4-e4b' });
  const all = starts(); assert.equal(all.length, 2); assert.notEqual(all[1].pid, first); assert.ok(!alive(first));
  // durante una richiesta il timer non scatta
  await engine.chat({ messages, model: 'gemma-4-e4b' }); assert.equal(starts().length, 2);
});

test('arresto: stop() e shutdown() chiudono il processo; riavvio mentre si chiude non crea due server', { skip: skipWin }, async t => {
  const { engine, starts } = setup(t);
  await engine.chat({ messages, model: 'gemma-4-e4b' });
  const first = starts()[0].pid; await engine.stop(); assert.ok(!alive(first)); assert.equal(engine.serverState(), 'stopped');
  await engine.chat({ messages, model: 'gemma-4-e4b' }); const second = starts()[1].pid; assert.ok(alive(second));
  const stopping = engine.stop(); const again = engine.chat({ messages, model: 'gemma-4-e4b' });
  await stopping; await again;
  const all = starts(); assert.equal(all.length, 3); assert.ok(!alive(second)); assert.ok(alive(all[2].pid));
  engine.shutdown(); assert.ok(await until(() => !alive(all[2].pid)), 'shutdown chiude il processo');
});

test('avvio: errore chiaro se il server esce subito o non risponde in tempo; annullamento dell\'attesa', { skip: skipWin }, async t => {
  const failing = setup(t); failing.flag('fail');
  await assert.rejects(failing.engine.chat({ messages, model: 'gemma-4-e4b' }), error => error.code === 'START_FAILED' && /si è chiuso durante l'avvio/.test(error.message) && /boom/.test(error.message) && error.message.includes(failing.p.log));
  assert.equal(failing.engine.serverState(), 'stopped'); assert.match(fs.readFileSync(failing.p.log, 'utf8'), /boom/);
  const hanging = setup(t, { startTimeout: 700 }); hanging.flag('hang');
  await assert.rejects(hanging.engine.chat({ messages, model: 'gemma-4-e4b' }), error => error.code === 'START_FAILED' && /non è partito entro/.test(error.message));
  const pid = hanging.starts()[0].pid; assert.ok(await until(() => !alive(pid)), 'il processo che non risponde viene chiuso');
  // l'utente interrompe mentre il modello si carica: AbortError; il server finisce di avviarsi e poi si chiude da solo
  const slow = setup(t, { idleMs: 300 }); slow.flag('delay');
  const controller = new AbortController(); const pending = slow.engine.chat({ messages, model: 'gemma-4-e4b', signal: controller.signal }); setTimeout(() => controller.abort(), 150);
  await assert.rejects(pending, error => error.name === 'AbortError');
  await slow.engine.chat({ messages, model: 'gemma-4-e4b' }); assert.equal(slow.starts().length, 1);
});

test('server rimasto dopo un arresto brusco: si chiude al prossimo avvio (solo se è davvero llama-server)', { skip: skipWin }, async t => {
  const { spawn } = require('node:child_process');
  const orphan = spawn('/bin/sleep', ['60'], { stdio: 'ignore' }); t.after(() => { try { orphan.kill('SIGKILL'); } catch {} });
  const asked = [];
  const mine = setup(t, { isOurProcess: async pid => { asked.push(pid); return true; } });
  fs.writeFileSync(mine.p.pid, JSON.stringify({ pid: orphan.pid, port: 1 }));
  await mine.engine.chat({ messages, model: 'gemma-4-e4b' });
  assert.deepEqual(asked, [orphan.pid]); assert.ok(await until(() => !alive(orphan.pid)), 'il vecchio processo è stato chiuso');
  // pid che non è il nostro programma: non si tocca
  const other = spawn('/bin/sleep', ['60'], { stdio: 'ignore' }); t.after(() => { try { other.kill('SIGKILL'); } catch {} });
  const careful = setup(t, { isOurProcess: async () => false });
  fs.writeFileSync(careful.p.pid, JSON.stringify({ pid: other.pid, port: 1 }));
  await careful.engine.chat({ messages, model: 'gemma-4-e4b' }); assert.ok(alive(other.pid));
  // il controllo reale rifiuta un processo che non si chiama llama-server
  fs.writeFileSync(mine.p.pid, JSON.stringify({ pid: other.pid, port: 1 }));
  const real = setup(t); fs.writeFileSync(real.p.pid, JSON.stringify({ pid: other.pid, port: 1 }));
  await real.engine.chat({ messages, model: 'gemma-4-e4b' }); assert.ok(alive(other.pid));
});

test('remove: chiude il server e cancella la cartella llama; download durante l\'uso non ammesso', { skip: skipWin }, async t => {
  const { engine, starts, p, dir } = setup(t);
  await engine.chat({ messages, model: 'gemma-4-e4b' }); const pid = starts()[0].pid;
  await engine.remove(); assert.ok(!alive(pid)); assert.ok(!fs.existsSync(p.root)); assert.ok(fs.existsSync(dir));
  assert.equal(engine.status().complete, false); assert.equal(engine.status().runtime.present, false);
  await assert.rejects(engine.chat({ messages, model: 'gemma-4-e4b' }), { code: 'NOT_READY' });
});

test('download del motore: avanzamento in percentuale e stato pronto dopo la verifica', { skip: !hasTar && 'tar non disponibile' }, async t => {
  const dir = temp(t), c = smallCatalog(goodArchive()), srv = await server(t, c.bodies), seen = [];
  const engine = Managed.create({ dataDir: dir, platform: 'darwin', arch: 'arm64', runtime: c.runtime, models: [c.model], get: getFrom(srv.base) });
  t.after(() => engine.shutdown());
  assert.equal(engine.status().complete, false);
  await engine.download({ onProgress: p => seen.push(p) });
  assert.equal(engine.status().complete, true); assert.equal(seen.at(-1).percent, 100); assert.match(seen[0].text, /^Scarico llama\.cpp… \d+%/); assert.ok(seen.some(p => /Scarico il modello/.test(p.text)));
  assert.deepEqual(await engine.detect(), { available: true, state: 'ready', count: 1 });
  // due download insieme: il secondo è rifiutato
  const slow = await server(t, c.bodies, { slow: true }), other = temp(t);
  const busy = Managed.create({ dataDir: other, platform: 'darwin', arch: 'arm64', runtime: c.runtime, models: [c.model], get: getFrom(slow.base) });
  const controller = new AbortController(), first = busy.download({ signal: controller.signal });
  await assert.rejects(busy.download(), { code: 'BUSY' }); controller.abort(); await assert.rejects(first, error => error.name === 'AbortError');
});

test('integrazione con i motori locali: registrato, configurabile e chiuso con l\'app', async t => {
  assert.ok(Engines.IDS.includes('llamacpp-mascotte')); assert.equal(Engines.label('llamacpp-mascotte'), 'llama.cpp (Mascotte)'); assert.ok(Engines.isEngine('llamacpp-mascotte'));
  assert.equal(Engines.normalizeEngine('llamacpp-mascotte'), 'llamacpp-mascotte');
  const dir = temp(t); Engines.configureManaged({ dataDir: dir, platform: 'darwin', arch: 'arm64' }); t.after(() => Engines.configureManaged({}));
  const engine = Engines.get(Engines.MANAGED); assert.equal(Engines.get(Engines.MANAGED), engine); assert.equal(engine.status().configured, true);
  const status = await Engines.detectAll({ engines: [engine] });
  assert.deepEqual(status.map(({ id, available, state }) => ({ id, available, state })), [{ id: 'llamacpp-mascotte', available: false, state: 'missing' }]);
  assert.doesNotThrow(() => Engines.shutdown());
  Engines.configureManaged({ dataDir: dir }); assert.notEqual(Engines.get(Engines.MANAGED), engine);
});
