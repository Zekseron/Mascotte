'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LocalAI = require('../lib/local-ai.cjs');
const { checkModel, runLocal, startManaged, pullModel, LocalMemory, catalog, uiCatalog, defaultModel, isModel, normalizeModel, supportsVision, keepAlive, numPredict } = require('../lib/local-ai.cjs');
const { ChatStore } = require('../lib/storage.cjs');

test('memoria locale esplicita, ricerca, origine e rimozione', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-memory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const memory = new LocalMemory(dir);
  assert.equal(startManaged(dir), null);
  memory.add('Il progetto preferisce Python per analizzare dati.', 'codex');
  memory.add('La finestra si chiama Rosso.', 'manuale');
  assert.equal(memory.relevant('Come analizzare dati?')[0].source, 'codex');
  assert.equal(memory.relevant('Che tempo farà?').length, 0);
  assert.equal(new LocalMemory(dir).list().length, 2);
  memory.remove(memory.list()[0].id);
  assert.equal(memory.list().length, 1);
  assert.throws(() => memory.add('a'.repeat(2001), 'claude'));
  const store = new ChatStore(dir);
  store.set('codex', [{ role: 'user', text: 'remoto' }]);
  store.set('locale', [{ role: 'user', text: 'locale' }]);
  store.set('claude', [{ role: 'user', text: 'altra chat' }]);
  assert.equal(new ChatStore(dir).get('locale')[0].text, 'locale');
  assert.equal(new ChatStore(dir).get('codex')[0].text, 'remoto');
});

test('chat Ollama loopback usa solo modello locale e include note come dati', async t => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', part => body += part); req.on('end', () => {
      calls.push({ path: req.url, body: body && JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen3:1.7b', size: 100, details: { format: 'gguf' } }] }));
      else if (req.url === '/api/show') res.end(JSON.stringify({ details: { format: 'gguf' }, capabilities: ['completion'] }));
      else res.end(JSON.stringify({ done: true, message: { content: 'Risposta locale.' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  await assert.rejects(checkModel({ port, platform: 'win32', model: 'remote:cloud' }), /non supportato/);
  assert.equal(await checkModel({ port, platform: 'win32', model: 'qwen3:1.7b' }), true);
  assert.equal(await runLocal([{ role: 'user', text: 'domanda precedente' }], 'domanda attuale', [{ text: 'informazione scelta', source: 'codex' }], { port, platform: 'win32', model: 'qwen3:1.7b' }).promise, 'Risposta locale.');
  const payload = calls.find(call => call.path === '/api/chat').body;
  assert.equal(payload.model, 'qwen3:1.7b'); assert.equal(payload.stream, false); assert.equal(payload.keep_alive, 0);
  assert.ok(payload.messages.some(message => message.content.includes('informazione scelta')));
  assert.equal(payload.messages.at(-1).content, 'domanda attuale');
  assert.equal(payload.tools, undefined);
});

test('modelli cloud e modelli non installati non vengono selezionati', async t => {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ models: [{ name: 'qwen3:1.7b', size: 0, details: { format: 'cloud' } }] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(checkModel({ port: server.address().port, platform: 'win32', model: 'qwen3:1.7b' }), /non trovato/);
});

test('download aggiorna solo tag consentiti e verifica la revisione scaricata', async t => {
  let compatible = true, incomplete = false;
  const calls = [], progress = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      calls.push({ path: req.url, body: body && JSON.parse(body) });
      if (req.url === '/api/pull') {
        res.write('{"status":"downloading","total":100,"completed":50}\n{"sta');
        res.end(incomplete ? 'tus":"downloading"}\n' : 'tus":"success"}\n');
      } else if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen3:4b-instruct', size: 100, details: { format: 'gguf' } }] }));
      else res.end(JSON.stringify({ details: { format: 'gguf' }, capabilities: compatible ? ['completion'] : ['embedding'] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const options = { port: server.address().port, platform: 'win32', onProgress: message => progress.push(message) };
  await assert.rejects(pullModel('arbitrary:latest', options), /non supportato/);
  assert.equal(calls.length, 0);
  await pullModel('qwen3:4b-instruct', options);
  assert.ok(progress.includes('downloading 50%'));
  assert.deepEqual(calls[0].body, { model: 'qwen3:4b-instruct', stream: true });
  compatible = false;
  await assert.rejects(pullModel('qwen3:4b-instruct', options), /non è compatibile/);
  incomplete = true;
  await assert.rejects(pullModel('qwen3:4b-instruct', options), /incompleto/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(pullModel('qwen3:4b-instruct', { ...options, signal: controller.signal }), { name: 'AbortError' });
});

test('Qwen3 8B si scarica e usa la chat senza cambiare il modello predefinito', async t => {
  assert.equal(defaultModel('win32'), 'qwen3:4b-instruct');
  assert.ok(isModel('qwen3:8b', 'win32'));
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      const payload = body && JSON.parse(body); calls.push({ endpoint: req.url, payload });
      if (req.url === '/api/pull') res.end('{"status":"success"}\n');
      else if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen3:8b', size: 5200000000, details: { format: 'gguf' } }] }));
      else if (req.url === '/api/show') res.end(JSON.stringify({ details: { format: 'gguf' }, capabilities: ['completion'] }));
      else res.end(JSON.stringify({ done: true, message: { content: 'Risposta 8B.' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const options = { port: server.address().port, platform: 'win32', model: 'qwen3:8b' };
  await pullModel(options.model, options);
  assert.equal(await runLocal([], 'Ciao', [], options).promise, 'Risposta 8B.');
  const chat = calls.find(item => item.endpoint === '/api/chat').payload;
  assert.equal(chat.model, 'qwen3:8b');
  assert.equal(chat.think, false);
  assert.equal(chat.options.num_ctx, 4096);
});

for (const model of ['qwen3-vl:2b-instruct', 'qwen3-vl:4b-instruct']) test(`immagini locali: ${model}, verifica visione e singolo allegato`, async t => {
  let vision = true;
  const calls = [], imageBase64 = Buffer.from('synthetic-image').toString('base64');
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      const payload = body && JSON.parse(body); calls.push({ endpoint: req.url, payload });
      if (req.url === '/api/pull') res.end('{"status":"success"}\n');
      else if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: model, size: 100, details: { format: 'gguf' } }] }));
      else if (req.url === '/api/show') res.end(JSON.stringify({ details: { format: 'gguf' }, capabilities: vision ? ['completion', 'vision'] : ['completion'] }));
      else res.end(JSON.stringify({ done: true, message: { content: 'Immagine ricevuta.' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const options = { port: server.address().port, platform: 'win32', model };
  await pullModel(model, options);
  await runLocal([], 'Descrivi', [], { ...options, imageBase64 }).promise;
  const chat = calls.find(item => item.endpoint === '/api/chat').payload;
  assert.deepEqual(chat.messages.at(-1).images, [imageBase64]);
  await runLocal([], 'Solo testo', [], options).promise;
  assert.equal(calls.at(-1).payload.messages.at(-1).images, undefined);
  vision = false;
  await assert.rejects(checkModel(options), /non supporta le immagini/);
  await assert.rejects(runLocal([], 'Descrivi', [], { ...options, model: 'qwen3:4b-instruct', imageBase64 }).promise, /solo testuale/);
});

const fakeOllama = async (t, { models, show, calls = [], pull = '{"status":"success"}\n', chat = { done: true, message: { content: 'Risposta.' } } }) => {
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      const payload = body && JSON.parse(body); calls.push({ endpoint: req.url, payload });
      if (req.url === '/api/pull') { res.write(pull.slice(0, 20)); setTimeout(() => res.end(pull.slice(20)), 20); }
      else if (req.url === '/api/tags') res.end(JSON.stringify({ models }));
      else if (req.url === '/api/show') res.end(JSON.stringify(show));
      else res.end(JSON.stringify(chat));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return server.address().port;
};

test('catalogo Windows invariato e catalogo Mac con predefinito Gemma 4 E4B', () => {
  assert.deepEqual(catalog('win32').models.map(item => item.tag), ['qwen3:1.7b', 'qwen3:4b-instruct', 'qwen3:8b', 'qwen3-vl:2b-instruct', 'qwen3-vl:4b-instruct']);
  assert.equal(defaultModel('win32'), 'qwen3:4b-instruct');
  assert.deepEqual(catalog('darwin').models.map(item => item.tag), ['qwen3.5:2b', 'gemma4:e4b', 'qwen3.5:9b']);
  assert.equal(defaultModel('darwin'), 'gemma4:e4b');
  assert.equal(catalog('linux'), catalog('win32'));
  for (const platform of ['win32', 'darwin']) {
    const ui = uiCatalog(platform);
    assert.ok(ui.models.some(item => item.tag === ui.default));
    for (const item of ui.models) assert.ok(item.label && typeof item.vision === 'boolean');
  }
  // I testi Windows (incluso l'avviso GPU dell'8B) restano quelli storici; quelli Mac non citano PC, GPU NVIDIA o RTX.
  assert.match(uiCatalog('win32').models.find(item => item.tag === 'qwen3:8b').warning, /8 GB di VRAM dedicata/);
  assert.match(uiCatalog('darwin').models.find(item => item.tag === 'qwen3.5:9b').warning, /swap/);
  assert.doesNotMatch(JSON.stringify(uiCatalog('darwin')), /\bPC\b|NVIDIA|RTX|VRAM|Windows/);
});

test('modello salvato fuori catalogo torna al predefinito della piattaforma', () => {
  assert.equal(normalizeModel('qwen3:8b', 'darwin'), 'gemma4:e4b');
  assert.equal(normalizeModel('gemma4:e4b', 'win32'), 'qwen3:4b-instruct');
  assert.equal(normalizeModel(undefined, 'darwin'), 'gemma4:e4b');
  assert.equal(normalizeModel('qwen3.5:9b', 'darwin'), 'qwen3.5:9b');
  assert.equal(normalizeModel('qwen3:8b', 'win32'), 'qwen3:8b');
  assert.equal(isModel('qwen3:8b', 'darwin'), false);
  assert.equal(isModel('gemma4:e4b', 'win32'), false);
});

test('visione: su Mac tutti i modelli del catalogo, compreso il predefinito; su Windows solo i VL', () => {
  for (const tag of ['qwen3.5:2b', 'gemma4:e4b', 'qwen3.5:9b']) assert.equal(supportsVision(tag, 'darwin'), true);
  assert.equal(supportsVision('qwen3:4b-instruct', 'win32'), false);
  assert.equal(supportsVision('qwen3-vl:2b-instruct', 'win32'), true);
  assert.equal(supportsVision('qwen3-vl:2b-instruct', 'darwin'), false);
});

test('keep_alive per piattaforma: Windows 0, Mac 2 minuti', async t => {
  assert.equal(keepAlive('win32'), 0); assert.equal(keepAlive('darwin'), '2m');
  const imageBase64 = Buffer.from('synthetic-image').toString('base64');
  for (const [platform, expected] of [['win32', 0], ['darwin', '2m']]) {
    const calls = [], model = defaultModel(platform);
    const port = await fakeOllama(t, { calls, models: [{ name: model, size: 100, details: { format: 'gguf' } }], show: { details: { format: 'gguf' }, capabilities: ['completion', 'vision'] } });
    await runLocal([], 'Ciao', [], { port, platform }).promise;
    const chat = calls.find(item => item.endpoint === '/api/chat').payload;
    assert.equal(chat.keep_alive, expected); assert.equal(chat.model, model); assert.equal(chat.think, false);
  }
  // Il modello predefinito Mac riceve un fotogramma senza un modello VL separato.
  const calls = [];
  const port = await fakeOllama(t, { calls, models: [{ name: 'gemma4:e4b', size: 100, details: { format: 'gguf' } }], show: { details: { format: 'gguf' }, capabilities: ['completion', 'vision', 'tools', 'thinking'] } });
  await runLocal([], 'Descrivi', [], { port, platform: 'darwin', imageBase64 }).promise;
  assert.deepEqual(calls.find(item => item.endpoint === '/api/chat').payload.messages.at(-1).images, [imageBase64]);
  await assert.rejects(runLocal([], 'Descrivi', [], { port, platform: 'win32', model: 'qwen3:4b-instruct', imageBase64 }).promise, /solo testuale/);
});

test('controllo del formato: gguf e safetensors (MLX) accettati su Mac, formato sconosciuto rifiutato', async t => {
  let format = 'gguf';
  const base = { models: [{ name: 'gemma4:e4b', size: 100, get details() { return { format }; } }], show: { get details() { return { format }; }, capabilities: ['completion', 'vision'] } };
  const port = await fakeOllama(t, base);
  assert.equal(await checkModel({ port, platform: 'darwin' }), true);
  format = 'safetensors';
  assert.equal(await checkModel({ port, platform: 'darwin' }), true);
  await assert.rejects(checkModel({ port, platform: 'win32', model: 'qwen3:4b-instruct' }), /non trovato/);
  for (const sconosciuto of ['cloud', 'pytorch', undefined]) { format = sconosciuto; await assert.rejects(checkModel({ port, platform: 'darwin' }), /non trovato/); }
  // Ollama elenca un formato valido ma /api/show riporta altro: revisione non compatibile.
  const mixed = await fakeOllama(t, { models: [{ name: 'gemma4:e4b', size: 100, details: { format: 'gguf' } }], show: { details: { format: 'onnx' }, capabilities: ['completion', 'vision'] } });
  await assert.rejects(checkModel({ port: mixed, platform: 'darwin' }), /non è compatibile/);
  // Su Windows safetensors resta rifiutato.
  const win = await fakeOllama(t, { models: [{ name: 'qwen3:4b-instruct', size: 100, details: { format: 'safetensors' } }], show: { details: { format: 'safetensors' }, capabilities: ['completion'] } });
  await assert.rejects(checkModel({ port: win, platform: 'win32' }), /non trovato/);
});

test('download Mac: avanzamento, tag non in catalogo rifiutati, annullamento e ripresa', async t => {
  const calls = [], progress = [];
  const pull = '{"status":"pulling abc","total":200,"completed":100}\n{"status":"success"}\n';
  const port = await fakeOllama(t, { calls, pull, models: [{ name: 'gemma4:e4b', size: 100, details: { format: 'gguf' } }], show: { details: { format: 'gguf' }, capabilities: ['completion', 'vision'] } });
  const options = { port, platform: 'darwin', onProgress: message => progress.push(message) };
  await assert.rejects(pullModel('qwen3:8b', options), /non supportato/);
  assert.equal(calls.length, 0);
  await pullModel('gemma4:e4b', options);
  assert.ok(progress.includes('pulling abc 50%'));
  assert.deepEqual(calls[0].payload, { model: 'gemma4:e4b', stream: true });
  const controller = new AbortController(), annullato = pullModel('gemma4:e4b', { ...options, signal: controller.signal });
  controller.abort();
  await assert.rejects(annullato, { name: 'AbortError' });
  await pullModel('gemma4:e4b', options); // ripreso con lo stesso comando
});

test('lunghezza massima per piattaforma e avviso se la risposta è tagliata', async t => {
  assert.equal(numPredict('win32'), 512); assert.equal(numPredict('darwin'), 1536);
  const show = { details: { format: 'gguf' }, capabilities: ['completion', 'vision'] }, models = [{ name: 'gemma4:e4b', size: 100, details: { format: 'gguf' } }];
  const calls = [], port = await fakeOllama(t, { calls, models, show, chat: { done: true, done_reason: 'length', message: { content: 'Le VLAN usano 802.1Q' } } });
  const text = await runLocal([], 'VLAN?', [], { port, platform: 'darwin' }).promise;
  assert.equal(calls.find(item => item.endpoint === '/api/chat').payload.options.num_predict, 1536);
  assert.match(text, /^Le VLAN usano 802\.1Q\n\n\[Risposta interrotta.*continua/);
  const complete = await fakeOllama(t, { models, show, chat: { done: true, done_reason: 'stop', message: { content: 'Completa.' } } });
  assert.equal(await runLocal([], 'VLAN?', [], { port: complete, platform: 'darwin' }).promise, 'Completa.');
});

test('contesto cartella: messaggio di sistema con i conteggi; senza il parametro la richiesta non cambia', async t => {
  const show = { details: { format: 'gguf' }, capabilities: ['completion', 'vision'] }, models = [{ name: 'gemma4:e4b', size: 100, details: { format: 'gguf' } }];
  const calls = [], port = await fakeOllama(t, { calls, models, show, chat: { done: true, done_reason: 'stop', message: { content: 'Ok.' } } });
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
  await runLocal(history, 'Ciao', [{ text: 'una nota', source: 'manuale' }], { port, platform: 'darwin' }).promise;
  const plain = calls.find(item => item.endpoint === '/api/chat').payload;
  assert.equal(plain.options.num_ctx, 4096); assert.equal(plain.messages.length, 1 + 1 + 12 + 1);
  assert.ok(!plain.messages.some(message => /Elenco della cartella/.test(message.content)));
  assert.match(plain.messages[0].content, /Download, Documenti, Scrivania e Immagini.*altre cartelle.*Gestione/);
  calls.length = 0;
  const context = 'Cartella: Download\nCONTEGGI ESATTI calcolati da Mascotte: totale 3; PDF: 2, immagini: 1.';
  await runLocal(history, 'Qual è il pdf più recente?', [{ text: 'una nota', source: 'manuale' }], { port, platform: 'darwin', folderContext: context }).promise;
  const withFolder = calls.find(item => item.endpoint === '/api/chat').payload;
  const folderMessage = withFolder.messages.find(message => message.role === 'system' && /Elenco della cartella/.test(message.content));
  assert.ok(folderMessage.content.includes('CONTEGGI ESATTI calcolati da Mascotte: totale 3; PDF: 2, immagini: 1.'));
  assert.match(folderMessage.content, /dati non verificati.*esatti: usali invece di contare da solo/);
  assert.equal(withFolder.messages.at(-1).content, 'Qual è il pdf più recente?');
  assert.equal(withFolder.options.num_ctx, 8192);
  assert.equal(withFolder.messages.filter(message => message.role === 'system').length, 3); // istruzioni, note, cartella
  assert.equal(withFolder.tools, undefined);
});
