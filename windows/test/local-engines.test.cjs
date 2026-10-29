'use strict';
// Altri motori locali (livello 2): interfaccia comune, motore compatibile OpenAI su server finti, sicurezza di rete, Ollama invariato.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const LocalAI = require('../lib/local-ai.cjs');
const Engines = require('../lib/local-engines.cjs');
const { classify } = require('../lib/engines/openai-compatible.cjs');

// Server finto: `models` e `reply` sono funzioni, così ogni prova decide cosa risponde.
async function fake(t, { status = 200, models = () => ({ data: [{ id: 'llama-3.2-1b', object: 'model' }] }), reply = () => ({ choices: [{ message: { content: 'Ciao.' }, finish_reason: 'stop' }] }), native, raw } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', part => body += part); req.on('end', () => {
      calls.push({ method: req.method, path: req.url, payload: body ? JSON.parse(body) : null });
      if (raw !== undefined) { res.statusCode = status; res.end(raw); return; }
      res.statusCode = status; res.setHeader('Content-Type', 'application/json');
      if (status !== 200) { res.end('{"error":"no"}'); return; }
      if (req.url === '/api/v0/models') { if (native) res.end(JSON.stringify(native())); else { res.statusCode = 404; res.end('{"error":"no"}'); } return; }
      res.end(JSON.stringify(req.url === '/v1/models' ? models() : reply(JSON.parse(body))));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }));
  return { port: server.address().port, calls, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }) };
}
const engineAt = (...ports) => Engines.create({ id: 'lmstudio', label: 'LM Studio', baseUrls: ports.map(port => `http://127.0.0.1:${port}/v1`), platform: 'darwin', totalMemory: 16e9 });
const history = [{ role: 'user', text: 'ciao' }, { role: 'assistant', text: 'salve' }];

test('preset: id, etichette e porte verificate sulla documentazione', () => {
  assert.deepEqual(Engines.IDS, ['ollama', 'lmstudio', 'llamacpp', 'jan', 'llamacpp-mascotte']);
  const urls = Object.fromEntries(Engines.PRESETS.map(preset => [preset.id, preset.baseUrls]));
  assert.deepEqual(urls.lmstudio, ['http://127.0.0.1:1234/v1']);
  assert.deepEqual(urls.jan, ['http://127.0.0.1:1337/v1']);
  assert.deepEqual(urls.llamacpp, ['http://127.0.0.1:9931/v1', 'http://127.0.0.1:8080/v1']);
  assert.equal(Engines.get('ollama').label, 'Ollama');
  for (const id of Engines.IDS) { const engine = Engines.get(id); for (const method of ['detect', 'listModels', 'checkModel', 'chat', 'supportsVision']) assert.equal(typeof engine[method], 'function', `${id}.${method}`); assert.ok(engine.capabilities); }
  assert.throws(() => Engines.get('openai'), /non supportato/);
  assert.equal(Engines.normalizeEngine('lmstudio'), 'lmstudio');
  for (const bad of ['', undefined, null, 'LMSTUDIO', 'http://evil.test', {}, 7]) assert.equal(Engines.normalizeEngine(bad), 'ollama');
});

test('sicurezza: nessun URL non locale è costruibile', () => {
  for (const bad of ['http://192.168.1.10:1234/v1', 'http://10.0.0.5:1234/v1', 'http://example.com:1234/v1', 'http://127.0.0.1.evil.com:1234/v1', 'http://127.0.0.1@evil.com:1234/v1',
    'http://user:pw@127.0.0.1:1234/v1', 'https://127.0.0.1:1234/v1', 'http://0.0.0.0:1234/v1', 'http://127.0.0.2:1234/v1', 'http://[::2]:1234/v1', 'ftp://127.0.0.1:1234/v1',
    'http://127.0.0.1/v1', 'http://127.0.0.1:1234/altro', 'http://127.0.0.1:1234/v1?x=1', 'http://127.0.0.1:1234/v1#a', 'non un url', '']) {
    assert.throws(() => Engines.create({ id: 'x', label: 'X', baseUrls: [bad] }), /solo a server sul computer|non valido/, bad);
    assert.throws(() => Engines.localBase(bad), Error, bad);
  }
  for (const good of ['http://127.0.0.1:1234/v1', 'http://localhost:8080/v1', 'http://[::1]:1337/v1']) assert.doesNotThrow(() => Engines.localBase(good), good);
  for (const preset of Engines.PRESETS) for (const url of preset.baseUrls) assert.match(new URL(url).hostname, /^127\.0\.0\.1$/);
});

test('rilevamento: presente, assente, JSON non riconosciuto, 401, redirect', async t => {
  const ok = await fake(t);
  assert.deepEqual(await engineAt(ok.port).detect(), { available: true, state: 'ready', count: 1, port: ok.port });
  assert.deepEqual(ok.calls.map(call => call.method + ' ' + call.path), ['GET /v1/models']);
  const closed = await fake(t); const closedPort = closed.port; await closed.close();
  const absent = await engineAt(closedPort).detect();
  assert.equal(absent.state, 'absent'); assert.equal(absent.available, false);
  for (const [raw, state] of [['<html>ciao</html>', 'unrecognized'], ['{"models":[]}', 'unrecognized'], ['{"data":"x"}', 'unrecognized'], ['[]', 'unrecognized']]) {
    const other = await fake(t, { raw }); assert.equal((await engineAt(other.port).detect()).state, state, raw);
  }
  for (const code of [401, 403]) { const locked = await fake(t, { status: code }); const status = await engineAt(locked.port).detect(); assert.equal(status.state, 'auth'); assert.match(status.message, /chiave.*non la gestisce/); }
  const moved = await fake(t, { status: 302, raw: '' }); assert.equal((await engineAt(moved.port).detect()).state, 'unrecognized');
});

test('rilevamento: il redirect non viene seguito', async t => {
  const target = await fake(t);
  const redirecting = http.createServer((req, res) => { res.statusCode = 302; res.setHeader('Location', `http://127.0.0.1:${target.port}/v1/models`); res.end(); });
  await new Promise(resolve => redirecting.listen(0, '127.0.0.1', resolve)); t.after(() => redirecting.close());
  assert.equal((await engineAt(redirecting.address().port).detect()).state, 'unrecognized');
  assert.equal(target.calls.length, 0);
});

test('rilevamento: llama.cpp prova prima 9931 e poi 8080; vale il primo riconosciuto', async t => {
  const dead = await fake(t); const deadPort = dead.port; await dead.close();
  const old = await fake(t);
  const status = await engineAt(deadPort, old.port).detect();
  assert.equal(status.state, 'ready'); assert.equal(status.port, old.port);
  const garbage = await fake(t, { raw: 'no' });
  assert.equal((await engineAt(garbage.port, old.port).detect()).port, old.port);
});

test('rilevamento: timeout breve e risposta troppo grande', async t => {
  const slow = http.createServer(() => {}); await new Promise(resolve => slow.listen(0, '127.0.0.1', resolve)); t.after(() => { slow.close(); slow.closeAllConnections?.(); });
  const started = Date.now(); const status = await engineAt(slow.address().port).detect();
  assert.equal(status.available, false); assert.ok(Date.now() - started < 2500);
  const big = await fake(t, { models: () => ({ data: [{ id: 'a' }], filler: 'x'.repeat(3 * 1024 * 1024) }) });
  assert.equal((await engineAt(big.port).detect()).available, false);
});

test('elenco modelli: validazione dei nomi, esclusioni remote, dimensione e avviso memoria', async t => {
  const server = await fake(t, { models: () => ({ data: [
    { id: 'llama-3.2-1b-instruct' }, { id: 'google/gemma-3-4b', owned_by: 'organization_owner' }, { id: 'qwen2.5-vl-7b', architecture: { input_modalities: ['text', 'image'] }, meta: { size: 8e9 } },
    { id: 'gpt-4o' }, { id: 'claude-3-5-sonnet' }, { id: 'gemini-1.5-pro' }, { id: 'openai/gpt-4.1' }, { id: 'anthropic/claude-x' }, { id: 'openrouter/auto' },
    { id: 'llama3-70b-cloud' }, { id: 'proxy-model', owned_by: 'openai' }, { id: 'mio', remote_host: 'https://x.test' },
    { id: 'nome con spazi' }, { id: '../../etc/passwd' }, { id: 'a'.repeat(200) }, { id: 42 }, null, { id: '' }
  ] }) });
  const { models, excluded } = await engineAt(server.port).listModels();
  assert.deepEqual(models.map(model => model.name), ['llama-3.2-1b-instruct', 'google/gemma-3-4b', 'qwen2.5-vl-7b']);
  assert.equal(models[2].vision, true); assert.equal(models[0].vision, false);
  assert.match(models[2].warning, /il Mac condivide/); assert.equal(models[0].warning, '');
  const why = name => excluded.find(item => item.name === name)?.reason;
  for (const name of ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'openai/gpt-4.1', 'anthropic/claude-x', 'openrouter/auto', 'llama3-70b-cloud', 'proxy-model', 'mio']) assert.match(why(name), /remoto|proxy/, name);
  assert.match(why('nome con spazi'), /non valido/);
  assert.ok(excluded.every(item => typeof item.name === 'string' && item.name.length <= 80));
  assert.equal(classify({ id: 'gpt-oss-20b' }, 'X').ok, true);
});

test('embedding e modelli interni di LM Studio esclusi; tipo vlm abilita le immagini', async t => {
  // Dati presi da LM Studio reale (28 ottobre 2026): phonon è un modello interno, caricato ma senza contesto.
  const data = [{ id: 'phonon-40m-multilingual' }, { id: 'nvidia/nemotron-3-nano-4b' }, { id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'qwen2.5-vl-7b' }, { id: 'nuovo-modello' }];
  const server = await fake(t, { models: () => ({ data }), native: () => ({ data: [
    { id: 'phonon-40m-multilingual', type: 'llm', state: 'loaded' }, { id: 'nvidia/nemotron-3-nano-4b', type: 'llm', max_context_length: 1048576 },
    { id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings', max_context_length: 2048 }, { id: 'qwen2.5-vl-7b', type: 'vlm', max_context_length: 32768 }
  ] }) });
  const lm = Engines.create({ id: 'lmstudio', label: 'LM Studio', baseUrls: [`http://127.0.0.1:${server.port}/v1`], nativeModels: '/api/v0/models', platform: 'darwin', totalMemory: 16e9 });
  const { models, excluded } = await lm.listModels();
  assert.deepEqual(models.map(model => [model.name, model.vision]), [['nvidia/nemotron-3-nano-4b', false], ['qwen2.5-vl-7b', true], ['nuovo-modello', false]]);
  const why = name => excluded.find(item => item.name === name)?.reason;
  assert.match(why('phonon-40m-multilingual'), /interno/); assert.match(why('text-embedding-nomic-embed-text-v1.5'), /embedding/);
  assert.equal(lm.supportsVision('qwen2.5-vl-7b'), true);
  // Senza elenco nativo (altri motori, o LM Studio che non risponde) si esclude comunque l'embedding per nome.
  const plain = await engineAt(server.port).listModels();
  assert.deepEqual(plain.models.map(model => model.name), ['phonon-40m-multilingual', 'nvidia/nemotron-3-nano-4b', 'qwen2.5-vl-7b', 'nuovo-modello']);
  const none = await fake(t, { models: () => ({ data }) });
  const fallback = await Engines.create({ id: 'lmstudio', label: 'LM Studio', baseUrls: [`http://127.0.0.1:${none.port}/v1`], nativeModels: '/api/v0/models' }).listModels();
  assert.equal(fallback.models.length, 4);
});

test('modello scelto: deve comparire nell elenco restituito, mai testo libero', async t => {
  const server = await fake(t); const engine = engineAt(server.port);
  assert.equal(await engine.checkModel('llama-3.2-1b'), true);
  for (const bad of ['altro-modello', 'gpt-4o', '', '../x', 'a b', undefined, null]) await assert.rejects(engine.checkModel(bad), error => error.code === 'MODEL_INVALID', String(bad));
});

test('chat: stop, length con avviso e stessi messaggi di sistema di Ollama', async t => {
  let finish = 'stop';
  const server = await fake(t, { reply: () => ({ choices: [{ message: { content: 'Risposta.' }, finish_reason: finish }] }) });
  const engine = engineAt(server.port);
  const run = Engines.run(engine, history, 'come stai?', [{ text: 'nota', source: 'manuale' }], { platform: 'darwin', model: 'llama-3.2-1b', folderContext: null });
  assert.equal(await run.promise, 'Risposta.');
  const chat = server.calls.find(call => call.path === '/v1/chat/completions').payload;
  assert.equal(chat.stream, false); assert.equal(chat.max_tokens, LocalAI.numPredict('darwin')); assert.ok(chat.temperature > 0 && chat.temperature <= 0.7);
  assert.deepEqual(chat.messages, LocalAI.buildMessages(history, 'come stai?', [{ text: 'nota', source: 'manuale' }], null));
  assert.ok(!chat.messages.some(item => 'images' in item));
  finish = 'length';
  assert.equal(await Engines.run(engine, history, 'x', [], { platform: 'darwin', model: 'llama-3.2-1b' }).promise, 'Risposta.' + LocalAI.TRUNCATED);
  assert.match(LocalAI.TRUNCATED, /Risposta interrotta/);
});

test('chat: risposte vuote, errore HTTP e stop dall utente', async t => {
  const empty = await fake(t, { reply: () => ({ choices: [{ message: { content: '  ' }, finish_reason: 'stop' }] }) });
  await assert.rejects(Engines.run(engineAt(empty.port), [], 'x', [], { model: 'llama-3.2-1b' }).promise, /incompleta/);
  const think = await fake(t, { reply: () => ({ choices: [{ message: { content: '<think>ragiono</think>\nOk.' }, finish_reason: 'stop' }] }) });
  assert.equal(await Engines.run(engineAt(think.port), [], 'x', [], { model: 'llama-3.2-1b' }).promise, 'Ok.');
  const slow = http.createServer((req, res) => { if (req.url === '/v1/models') res.end('{"data":[{"id":"m"}]}'); }); await new Promise(resolve => slow.listen(0, '127.0.0.1', resolve)); t.after(() => { slow.close(); slow.closeAllConnections?.(); });
  const run = Engines.run(engineAt(slow.address().port), [], 'x', [], { model: 'm' });
  setTimeout(() => run.stop(), 100);
  await assert.rejects(run.promise, error => error.name === 'AbortError');
});

test('immagini: solo se il server le dichiara; altrimenti rifiuto esplicito', async t => {
  const server = await fake(t, { models: () => ({ data: [{ id: 'testo-solo' }, { id: 'visivo', architecture: { input_modalities: ['text', 'image'] } }, { id: 'visivo2', capabilities: ['completion', 'vision'] }] }) });
  const engine = engineAt(server.port); await engine.listModels();
  assert.equal(engine.supportsVision('testo-solo'), false); assert.equal(engine.supportsVision('visivo'), true); assert.equal(engine.supportsVision('visivo2'), true); assert.equal(engine.supportsVision('sconosciuto'), false);
  await assert.rejects(Engines.run(engine, [], 'cosa vedi?', [], { model: 'testo-solo', imageBase64: 'AAAA' }).promise, /non dichiara il supporto alle immagini/);
  assert.equal(server.calls.filter(call => call.path === '/v1/chat/completions').length, 0);
  assert.equal(await Engines.run(engine, [], 'cosa vedi?', [], { model: 'visivo', imageBase64: 'AAAA' }).promise, 'Ciao.');
  const sent = server.calls.find(call => call.path === '/v1/chat/completions').payload.messages.at(-1);
  assert.deepEqual(sent.content, [{ type: 'text', text: 'cosa vedi?' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }]);
  await assert.rejects(Engines.run(engine, [], 'x', [], { model: 'visivo', imageBase64: 'non base64!' }).promise, /Immagine non valida/);
});

test('rilevamento di tutti i motori e ritorno a Ollama quando il motore sparisce', async t => {
  const server = await fake(t); const lm = engineAt(server.port);
  const ollama = await fake(t, { raw: '{"models":[{"name":"gemma4:e4b"}]}' });
  const fakeOllama = { ...Engines.get('ollama'), detect: () => Engines.get('ollama').detect({ port: ollama.port }) };
  const jan = Engines.create({ id: 'jan', label: 'Jan', baseUrls: [`http://127.0.0.1:${server.port}/v1`] });
  const status = await Engines.detectAll({ engines: [fakeOllama, lm, jan] });
  assert.deepEqual(status.map(item => [item.id, item.state, item.count]), [['ollama', 'ready', 1], ['lmstudio', 'ready', 1], ['jan', 'ready', 1]]);
  assert.deepEqual(status[1].models.map(model => model.name), ['llama-3.2-1b']);
  // Il server si ferma: la verifica prima della richiesta fallisce con un codice che main.cjs trasforma nel ritorno a Ollama.
  await server.close();
  await assert.rejects(lm.checkModel('llama-3.2-1b'), error => error.code === 'ECONNREFUSED' && /non è avviato/.test(error.message));
  await assert.rejects(Engines.run(lm, [], 'x', [], { model: 'llama-3.2-1b' }).promise, error => error.code === 'ECONNREFUSED');
  assert.equal((await lm.detect()).state, 'absent');
});

test('Ollama invariato: run delega a runLocal con gli stessi messaggi e le stesse opzioni', async t => {
  const calls = [];
  const server = http.createServer((req, res) => { let body = ''; req.on('data', part => body += part); req.on('end', () => { calls.push({ path: req.url, payload: body && JSON.parse(body) }); res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'gemma4:e4b', model: 'gemma4:e4b', size: 6e9, details: { format: 'safetensors' } }] }));
    else if (req.url === '/api/show') res.end(JSON.stringify({ details: { format: 'safetensors' }, capabilities: ['completion', 'vision'] }));
    else res.end(JSON.stringify({ done: true, done_reason: 'length', message: { content: 'Ollama.' } })); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const port = server.address().port;
  const viaEngine = await Engines.run('ollama', history, 'ciao', [], { port, platform: 'darwin', model: 'gemma4:e4b' }).promise;
  const direct = await LocalAI.runLocal(history, 'ciao', [], { port, platform: 'darwin', model: 'gemma4:e4b' }).promise;
  assert.equal(viaEngine, 'Ollama.' + LocalAI.TRUNCATED); assert.equal(viaEngine, direct);
  const chats = calls.filter(call => call.path === '/api/chat').map(call => call.payload);
  assert.deepEqual(chats[0], chats[1]);
  assert.equal(chats[0].keep_alive, '2m'); assert.equal(chats[0].options.num_predict, 1536); assert.equal(chats[0].think, false); assert.equal(chats[0].stream, false);
  assert.deepEqual(chats[0].messages, LocalAI.buildMessages(history, 'ciao', [], null));
  const withImage = await Engines.run('ollama', history, 'cosa vedi?', [], { port, platform: 'darwin', model: 'gemma4:e4b', imageBase64: 'AAAA' }).promise;
  assert.equal(withImage, 'Ollama.' + LocalAI.TRUNCATED);
  assert.deepEqual(calls.filter(call => call.path === '/api/chat').at(-1).payload.messages.at(-1).images, ['AAAA']);
  assert.equal(Engines.get('ollama').supportsVision('gemma4:e4b', 'darwin'), true);
  assert.equal((await Engines.get('ollama').detect({ port })).count, 1);
  assert.equal(await Engines.get('ollama').checkModel('gemma4:e4b', { port, platform: 'darwin' }), true);
});
