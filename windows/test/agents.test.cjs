'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AgentManager, workspacePath } = require('../lib/agents.cjs');
const { runCodex } = require('../lib/agent-codex.cjs');
const { runClaude } = require('../lib/agent-claude.cjs');
const fixture = { file: process.execPath, prefix: [path.join(__dirname, 'fixtures/agent-codex.cjs')], env: {} };
// I t.after girano nell'ordine di registrazione: la pulizia della cartella parte prima dei run.stop()
// registrati dopo. Su Windows taskkill termina il processo finto in modo asincrono e la cartella di
// lavoro resta bloccata (EBUSY) per qualche istante: si riprova con attesa crescente.
const temporary = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-agent-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })); return dir; };
const until = async fn => { const end = Date.now() + 5000; while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 15)); assert.ok(fn(), 'evento atteso'); };

test('app-server: protocollo reale su processo finto, rifiuto, chiarimento e ripresa', { timeout: 15000 }, async t => {
  const cwd = temporary(t), sessions = [], events = [];
  for (const sessionId of [undefined, 'session-fixture']) {
    const run = runCodex({ command: fixture, cwd, prompt: 'prova', sessionId, onSession: id => sessions.push(id), onEvent: e => events.push(e), ask: async r => r.kind === 'approval' ? false : { name: 'prova.txt' } });
    t.after(() => run.stop());
    const result = JSON.parse(await run.promise);
    assert.deepEqual(result, { approval: 'decline', question: 'prova.txt', method: sessionId ? 'thread/resume' : 'thread/start' });
    run.stop(); // libera subito la cartella di lavoro, prima della pulizia
  }
  assert.deepEqual(sessions, ['session-fixture', 'session-fixture']);
  assert.ok(events.some(e => e.title === 'fileChange' && e.detail.includes('+ciao')));
});

test('sessioni e cronologie agente separate per servizio, persistenti; cartella e Nuova azzerano sessione', async t => {
  const root = temporary(t), data = path.join(root, 'data'), cwd = path.join(root, 'progetto'); fs.mkdirSync(cwd);
  const seen = [];
  const runner = options => { seen.push(options.sessionId); options.onSession('persistita'); return { promise: Promise.resolve('fatto'), stop() {} }; };
  let manager = new AgentManager(data, () => {}, { codex: runner, claude: runner });
  manager.choose('codex', cwd); manager.mode = true;
  await manager.run('codex', {}, 'prima').promise;
  manager = new AgentManager(data, () => {}, { codex: runner, claude: runner });
  assert.equal(manager.mode, false, 'riavvio in Chat'); assert.equal(manager.entry('codex').cwd, fs.realpathSync(cwd));
  assert.equal(manager.store.get('claude').length, 0);
  await manager.run('codex', {}, 'seconda').promise;
  assert.deepEqual(seen, [undefined, 'persistita']); assert.equal(manager.store.get('codex').length, 4);
  manager.reset('codex'); assert.equal(manager.entry('codex').sessionId, undefined); assert.deepEqual(manager.store.get('codex'), []);
  manager.choose('codex', root); assert.equal(manager.entry('codex').cwd, fs.realpathSync(root));
  assert.throws(() => workspacePath('relativo')); assert.throws(() => workspacePath(path.join(root, 'inesistente')));
});

test('approvazioni: ID attivo obbligatorio, dati validati; Interrompi libera le richieste', { timeout: 10000 }, async t => {
  const root = temporary(t), manager = new AgentManager(path.join(root, 'data'));
  manager.choose('codex', root); const run = manager.run('codex', fixture, 'prova'); t.after(() => run.stop());
  const rejected = assert.rejects(run.promise, /interrotta/);
  await until(() => manager.pending.size === 1);
  const id = manager.snapshot('codex').requests[0].id;
  assert.throws(() => manager.answer({ id: 'stale', approved: true }), /non è più attiva/);
  assert.throws(() => manager.answer({ id, approved: 'true' }), /non valida/);
  manager.answer({ id, approved: true });
  await until(() => manager.snapshot('codex').requests[0]?.kind === 'questions');
  const questionId = manager.snapshot('codex').requests[0].id;
  assert.throws(() => manager.answer({ id: questionId, answers: { name: '' } }), /tutte le domande/);
  run.stop(); await rejected; assert.equal(manager.pending.size, 0); assert.equal(manager.active, null);
});

test('Esci: stop del gestore raggiunge subito il processo, una sola volta', async t => {
  const root = temporary(t); let reject, stops = 0;
  const manager = new AgentManager(path.join(root, 'data'), () => {}, {
    codex: () => ({ promise: new Promise((_, fail) => { reject = fail; }), stop() { stops++; reject(new Error('Attività interrotta.')); } })
  });
  manager.choose('codex', root);
  const run = manager.run('codex', {}, 'prova');
  const rejected = assert.rejects(run.promise, /interrotta/);
  run.stop(); run.stop();
  assert.equal(stops, 1, 'before-quit non deve dipendere da una microtask');
  await rejected;
});

test('Claude SDK: usa sessione, permessi default, strumenti e risposte ai chiarimenti', async () => {
  let options, closed = false; const requests = [], sessions = [];
  const loadSDK = async () => ({ query: args => {
    options = args.options;
    return { close() { closed = true; }, async *[Symbol.asyncIterator]() {
      const approval = await options.canUseTool('Write', { file_path: 'prova.txt', content: 'ciao' });
      assert.equal(approval.behavior, 'deny');
      const question = await options.canUseTool('AskUserQuestion', { questions: [{ question: 'Quale?', options: [] }] });
      assert.equal(question.updatedInput.answers['Quale?'], 'uno');
      yield { type: 'system', session_id: 'claude-session' };
      yield { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.txt' } }] } };
      yield { type: 'result', subtype: 'success', result: 'fatto' };
    } };
  } });
  const run = runClaude({ command: { file: 'claude.exe', prefix: [], env: {} }, cwd: process.cwd(), prompt: 'prova', sessionId: 'ripresa', onSession: id => sessions.push(id), onEvent() {}, ask: async r => { requests.push(r); return r.kind === 'approval' ? false : { 0: 'uno' }; }, loadSDK });
  assert.equal(await run.promise, 'fatto'); assert.equal(options.resume, 'ripresa'); assert.equal(options.permissionMode, 'default');
  assert.deepEqual(options.settingSources, []); assert.equal(options.persistSession, true); assert.equal(requests.length, 2); assert.deepEqual(sessions, ['claude-session']); assert.ok(closed);
});

test('Claude SDK ufficiale comunica con la CLI simulata e inoltra il rifiuto, senza account', { timeout: 15000 }, async t => {
  const cwd = temporary(t), sessions = [], requests = [];
  const run = runClaude({ command: { file: process.execPath, prefix: [path.join(__dirname, 'fixtures/agent-claude.cjs')], env: {} }, cwd, prompt: 'prova', onSession: id => sessions.push(id), onEvent() {}, ask: async request => { requests.push(request); return false; } });
  t.after(() => run.stop());
  assert.equal(await run.promise, 'deny'); assert.equal(requests.length, 1); assert.match(requests[0].title, /Write/); assert.ok(sessions.includes('3b044866-76c2-4a91-9342-cb23fe5dbad0'));
});
