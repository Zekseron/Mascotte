'use strict';
// Secondo parere con la modalità Agente attiva: ramo reale di main.cjs con servizi simulati.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
const start = source.indexOf('        const selected = engine, prompt = text.trim()');
const end = source.indexOf('\n      }\n    }\n    throw new Error(\'Azione non valida.\');', start);
assert.ok(start > 0 && end > start);
const memoryStore = initial => { let value = initial; return { get: () => value, set: (_engine, items) => { value = items; } }; };
async function send(data) {
  const calls = [];
  const chat = memoryStore([{ role: 'user', text: 'vecchia chat' }]), agentLog = memoryStore([{ role: 'user', text: 'lavoro agente' }, { role: 'assistant', text: 'fatto' }]);
  const ctx = { engine: 'codex', text: data.text, data, image: null, imagePath: null, imageDirectory: null, activeShareDirectory: null, command: { file: 'codex' }, notice: '', currentRun: null, folderRead: null,
    store: chat, broadcast() {}, controller: { set() {} }, fs, path, dataDirectory: '/dati',
    agents: { store: agentLog, snapshot: () => ({ enabled: true, session: true, workspace: '/progetto' }), reset: () => calls.push('reset'), run: () => { calls.push('agent-run'); return { promise: Promise.resolve() }; } },
    CLI: { promptWithHistory: (history, prompt) => JSON.stringify({ history, prompt }), argumentsFor: () => [], runCLI: (_c, _a, input) => { calls.push('chat:' + input); return { promise: Promise.resolve({ stdout: 'parere', code: 0, stderr: '' }) }; }, decodeOutput: (_e, stdout) => 'Risposta: ' + stdout } };
  await vm.runInNewContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
  return { calls, chat: chat.get(), agentLog: agentLog.get(), notice: ctx.notice };
}
test('secondo parere in Agente: va in Chat senza cronologia e la risposta compare nella vista agente', async () => {
  const out = await send({ text: 'controlla', noHistory: true });
  assert.deepEqual(out.calls, ['chat:' + JSON.stringify({ history: [], prompt: 'controlla' })]);
  assert.equal(out.notice, '');
  assert.equal(out.agentLog.length, 4, 'la sessione agente precedente resta e si aggiungono domanda e risposta');
  assert.match(out.agentLog[2].text, /^Secondo parere \(Chat, fuori dalla sessione agente\):\ncontrolla$/);
  assert.equal(out.agentLog[3].text, 'Risposta: parere');
  assert.equal(out.chat.at(-1).text, 'Risposta: parere');
});
test('messaggio normale in Agente: va all’agente e non passa dalla Chat', async () => {
  const out = await send({ text: 'modifica il file' });
  assert.deepEqual(out.calls, ['agent-run']);
});
