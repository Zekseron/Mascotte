'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkModel, runLocal, startManaged, pullModel, LocalMemory } = require('../lib/local-ai.cjs');
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
  await assert.rejects(checkModel({ port, model: 'remote:cloud' }), /non supportato/);
  assert.equal(await checkModel({ port, model: 'qwen3:1.7b' }), true);
  assert.equal(await runLocal([{ role: 'user', text: 'domanda precedente' }], 'domanda attuale', [{ text: 'informazione scelta', source: 'codex' }], { port, model: 'qwen3:1.7b' }).promise, 'Risposta locale.');
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
  await assert.rejects(checkModel({ port: server.address().port, model: 'qwen3:1.7b' }), /non trovato/);
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
  const options = { port: server.address().port, onProgress: message => progress.push(message) };
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
  const { MODEL, MODELS } = require('../lib/local-ai.cjs');
  assert.equal(MODEL, 'qwen3:4b-instruct');
  assert.ok(MODELS.includes('qwen3:8b'));
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
  const options = { port: server.address().port, model: 'qwen3:8b' };
  await pullModel(options.model, options);
  assert.equal(await runLocal([], 'Ciao', [], options).promise, 'Risposta 8B.');
  const chat = calls.find(item => item.endpoint === '/api/chat').payload;
  assert.equal(chat.model, 'qwen3:8b');
  assert.equal(chat.think, false);
  assert.equal(chat.options.num_ctx, 4096);
});
