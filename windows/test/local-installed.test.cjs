'use strict';
// Modelli già presenti in Ollama (livello 1): scoperta, esclusioni, scelta, verifica e catalogo invariato. Server Ollama finto su 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const LocalAI = require('../lib/local-ai.cjs');
const { checkModel, discoverInstalled, classifyInstalled, memoryWarning, validName, runLocal, pullModel, normalizeModel, supportsVision, isModel, defaultModel, catalog } = LocalAI;

const GB = 1e9;
const good = (name, extra = {}) => ({ name, model: name, size: 2 * GB, details: { format: 'gguf', family: 'llama', parameter_size: '1.2B', quantization_level: 'Q4_K_M' }, ...extra });
const SHOW = {
  'llama3.2:1b': { details: { format: 'gguf', family: 'llama', parameter_size: '1.2B', quantization_level: 'Q4_K_M' }, capabilities: ['completion', 'tools'] },
  'llava:7b': { details: { format: 'gguf', family: 'llama', parameter_size: '7B', quantization_level: 'Q4_0' }, capabilities: ['completion', 'vision'] },
  'nomic-embed-text:latest': { details: { format: 'gguf' }, capabilities: ['embedding'] },
  'strano:1b': { details: { format: 'onnx' }, capabilities: ['completion'] },
  'cloud-tag:120b-cloud': { details: { format: 'gguf' }, capabilities: ['completion'] },
  'cloud-colon:cloud': { details: { format: 'gguf' }, capabilities: ['completion'] },
  'remote-show:1b': { details: { format: 'gguf' }, capabilities: ['completion'], remote_host: 'https://ollama.com:443', remote_model: 'x' },
  'remote-tags:1b': { details: { format: 'gguf' }, capabilities: ['completion'] },
  'tiny:1b': { details: { format: 'gguf' }, capabilities: ['completion'] },
  'maybe-cloudy:1b': { details: { format: 'gguf' }, capabilities: ['completion'] },
  'big:70b': { details: { format: 'gguf', family: 'llama', parameter_size: '70B' }, capabilities: ['completion'] },
  'nocap:1b': { details: { format: 'gguf' } }
};
async function fake(t, models, show = SHOW) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', part => body += part); req.on('end', () => {
      const payload = body && JSON.parse(body); calls.push({ path: req.url, payload });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') res.end(JSON.stringify({ models: models() }));
      else if (req.url === '/api/show') { const value = show[payload.model]; if (!value) { res.statusCode = 404; res.end('{"error":"non trovato"}'); } else res.end(JSON.stringify(value)); }
      else res.end(JSON.stringify({ done: true, message: { content: 'Risposta.' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { port: server.address().port, calls };
}
const all = () => [good('gemma4:e4b', { details: { format: 'safetensors' } }), good('llama3.2:1b'), good('llava:7b'), good('nomic-embed-text:latest'), good('strano:1b'),
  good('cloud-tag:120b-cloud'), good('cloud-colon:cloud'), good('remote-show:1b'), good('remote-tags:1b', { remote_host: 'https://ollama.com:443' }),
  { ...good('tiny:1b'), size: 0 }, good('maybe-cloudy:1b'), good('sparito:1b'), good('nocap:1b'), good('big:70b', { size: 40 * GB })];

test('scoperta: idonei, esclusi con motivo, catalogo escluso dall elenco e /api/show solo per i fuori catalogo', async t => {
  const { port, calls } = await fake(t, all);
  const found = await discoverInstalled({ port, platform: 'darwin', totalMemory: 16 * GB });
  assert.deepEqual(found.models.map(model => model.name).sort(), ['big:70b', 'llama3.2:1b', 'llava:7b']);
  const why = name => found.excluded.find(item => item.name === name)?.reason;
  assert.match(why('nomic-embed-text:latest'), /embedding/);
  assert.match(why('strano:1b'), /formato «onnx»/);
  assert.match(why('cloud-tag:120b-cloud'), /cloud di Ollama/);
  assert.match(why('cloud-colon:cloud'), /cloud di Ollama/);
  assert.match(why('remote-show:1b'), /cloud di Ollama/);
  assert.match(why('remote-tags:1b'), /cloud di Ollama/);
  assert.match(why('tiny:1b'), /potrebbe essere un modello cloud/);
  assert.match(why('maybe-cloudy:1b'), /potrebbe essere un modello cloud/);
  assert.match(why('sparito:1b'), /potrebbe essere un modello cloud/);   // /api/show non risponde: prudenza
  assert.match(why('nocap:1b'), /capacità/);
  assert.equal(found.excluded.some(item => item.name === 'gemma4:e4b'), false);
  assert.equal(calls.some(call => call.path === '/api/show' && call.payload.model === 'gemma4:e4b'), false);
  assert.ok(calls.every(call => ['/api/tags', '/api/show'].includes(call.path)));
  const llava = found.models.find(model => model.name === 'llava:7b');
  assert.equal(llava.vision, true); assert.equal(llava.size, 2 * GB); assert.equal(llava.family, 'llama'); assert.equal(llava.quantization, 'Q4_0'); assert.equal(llava.format, 'gguf');
  assert.equal(found.models.find(model => model.name === 'llama3.2:1b').vision, false);
  assert.equal(supportsVision('llava:7b', 'darwin'), true);
  assert.equal(supportsVision('llama3.2:1b', 'darwin'), false);
});

test('formato: su Windows safetensors non è accettato, su Mac sì', () => {
  const item = good('mlx:1b'), info = { details: { format: 'safetensors' }, capabilities: ['completion'] };
  assert.equal(classifyInstalled(item, info, catalog('darwin').formats).ok, true);
  assert.equal(classifyInstalled(item, info, catalog('win32').formats).ok, false);
});

test('avviso memoria oltre il 40%, con testo diverso per Mac e Windows', async t => {
  assert.equal(memoryWarning(5 * GB, 'darwin', 16 * GB), '');
  assert.match(memoryWarning(8 * GB, 'darwin', 16 * GB), /Mac condivide la memoria/);
  assert.match(memoryWarning(8 * GB, 'win32', 16 * GB), /RAM del PC/);
  const { port } = await fake(t, all);
  const found = await discoverInstalled({ port, platform: 'win32', totalMemory: 16 * GB });
  assert.equal(found.models.find(model => model.name === 'big:70b').warning.includes('RAM'), true);
  assert.equal(found.models.find(model => model.name === 'llava:7b').warning, '');
});

test('nomi non validi rifiutati; checkModel senza approvazione resta solo catalogo', async t => {
  for (const name of ['', 'a b', '../x', 'x;rm', '-x', 'a'.repeat(200), 'x\nx', null, 42]) assert.equal(validName(name), false, String(name));
  for (const name of ['llama3.2:1b', 'hf.co/user/model:Q4_K_M', 'a_b-c.d']) assert.equal(validName(name), true);
  const { port } = await fake(t, all);
  await assert.rejects(checkModel({ port, platform: 'darwin', model: 'llama3.2:1b' }), /non supportato/);
  await assert.rejects(checkModel({ port, platform: 'darwin', model: 'a b', installed: true }), /non supportato/);
  const found = await discoverInstalled({ port, platform: 'darwin', totalMemory: 16 * GB });
  assert.equal(found.excluded.length > 0, true);
});

test('scelta e uso: checkModel installed accetta solo modelli idonei, runLocal usa think false e parametri piattaforma', async t => {
  const { port, calls } = await fake(t, all);
  const options = { port, platform: 'darwin', installed: true };
  assert.equal(await checkModel({ ...options, model: 'llama3.2:1b' }), true);
  for (const name of ['cloud-tag:120b-cloud', 'cloud-colon:cloud', 'remote-show:1b', 'remote-tags:1b', 'nomic-embed-text:latest', 'strano:1b', 'tiny:1b'])
    await assert.rejects(checkModel({ ...options, model: name }), error => error.code === 'MODEL_INVALID', name);
  assert.equal(await runLocal([], 'Ciao', [], { ...options, model: 'llama3.2:1b' }).promise, 'Risposta.');
  const chat = calls.find(call => call.path === '/api/chat').payload;
  assert.equal(chat.model, 'llama3.2:1b'); assert.equal(chat.think, false); assert.equal(chat.keep_alive, '2m');
  assert.equal(chat.options.num_predict, 1536); assert.equal(chat.options.num_ctx, 4096);
  const win = await runLocal([], 'Ciao', [], { ...options, platform: 'win32', model: 'llama3.2:1b' }).promise;
  assert.equal(win, 'Risposta.');
  const payload = calls.filter(call => call.path === '/api/chat').at(-1).payload;
  assert.equal(payload.keep_alive, 0); assert.equal(payload.options.num_predict, 512);
});

test('visione dal /api/show: immagine accettata con modello vision, rifiutata senza', async t => {
  const { port, calls } = await fake(t, all);
  const options = { port, platform: 'darwin', installed: true }, image = Buffer.from('x').toString('base64');
  await runLocal([], 'Descrivi', [], { ...options, model: 'llava:7b', imageBase64: image }).promise;
  assert.deepEqual(calls.filter(call => call.path === '/api/chat').at(-1).payload.messages.at(-1).images, [image]);
  await assert.rejects(runLocal([], 'Descrivi', [], { ...options, model: 'llama3.2:1b', imageBase64: image }).promise, /solo testuale/);
});

test('modello disinstallato dopo la scelta: checkModel segnala MODEL_INVALID (il main torna al predefinito)', async t => {
  let installed = true;
  const { port } = await fake(t, () => installed ? [good('llama3.2:1b')] : []);
  assert.equal(await checkModel({ port, platform: 'darwin', installed: true, model: 'llama3.2:1b' }), true);
  installed = false;
  await assert.rejects(checkModel({ port, platform: 'darwin', installed: true, model: 'llama3.2:1b' }), error => error.code === 'MODEL_INVALID' && /non è più installato/.test(error.message));
  assert.equal(supportsVision('llama3.2:1b', 'darwin'), false);
});

test('normalizeModel: catalogo resta, sconosciuto torna al predefinito, installato solo con source approvato', () => {
  assert.equal(normalizeModel('gemma4:e4b', 'darwin'), 'gemma4:e4b');
  assert.equal(normalizeModel('llama3.2:1b', 'darwin'), 'gemma4:e4b');
  assert.equal(normalizeModel('llama3.2:1b', 'darwin', 'catalog'), 'gemma4:e4b');
  assert.equal(normalizeModel('llama3.2:1b', 'darwin', 'installed'), 'llama3.2:1b');
  assert.equal(normalizeModel('a b;', 'darwin', 'installed'), 'gemma4:e4b');
  assert.equal(normalizeModel('llama3.2:1b', 'win32', 'installed'), 'llama3.2:1b');
  assert.equal(normalizeModel(undefined, 'win32', 'installed'), 'qwen3:4b-instruct');
});

test('Mascotte non scarica modelli fuori catalogo e i cataloghi restano invariati', async () => {
  await assert.rejects(pullModel('llama3.2:1b', { platform: 'darwin' }), /non supportato/);
  assert.equal(isModel('llama3.2:1b', 'darwin'), false);
  assert.deepEqual(catalog('win32').models.map(model => model.tag), ['qwen3:1.7b', 'qwen3:4b-instruct', 'qwen3:8b', 'qwen3-vl:2b-instruct', 'qwen3-vl:4b-instruct']);
  assert.deepEqual(catalog('darwin').models.map(model => model.tag), ['qwen3.5:2b', 'gemma4:e4b', 'qwen3.5:9b']);
  assert.equal(defaultModel('win32'), 'qwen3:4b-instruct'); assert.equal(defaultModel('darwin'), 'gemma4:e4b');
  assert.equal(LocalAI.uiCatalog('darwin').models.length, 3);
});
