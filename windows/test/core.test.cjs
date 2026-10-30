'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const P = require('../../viewer/pack.js');
const { StateController, clampPosition } = require('../lib/state.cjs');
const { prepareDirectory, ChatStore, readJSON } = require('../lib/storage.cjs');
const { parseRequest, EventServer } = require('../lib/events.cjs');
const { sendEvent, hookState } = require('../lib/notify.cjs');
const { argumentsFor, promptWithHistory, runCLI, decodeOutput, commandFor, findCLI, DISABLED } = require('../lib/cli.cjs');
const { prepareHooks, snapshot, applyHooks } = require('../lib/setup.cjs');
const toml = require('smol-toml');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../characters/Cat/rosso/character.json')));
const size = P.pngSize(fs.readFileSync(path.join(__dirname, '../../characters/Cat/rosso/sprites.png')));
const pack = P.validatePack(raw, size.width, size.height).pack;
function temporary(t) { const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mascotte test ')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const token = 'a'.repeat(64);
function request(body = JSON.stringify({ state: 'working', source: 'codex' }), extra = '') {
  return Buffer.from(`POST /event HTTP/1.1\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${extra}\r\n${body}`);
}
test('frame e fallback usano gli stessi asset/spec del Mac', () => {
  assert.ok(pack); assert.deepEqual(P.STATES, JSON.parse(fs.readFileSync(path.join(__dirname, '../../spec/states.json'))));
  assert.equal(P.resolveState('working', { ...pack, animations: { idle: pack.animations.idle } }).used, 'idle');
  assert.equal(P.frameAt(P.frameSchedule(pack.animations.celebrate), 99999, false).finished, true);
});
test('tempi, sonno, thinking persistente e fine celebrate', () => {
  let timeout, last;
  const state = new StateController(pack, P, v => last = v, { setTimeout: (fn, ms) => { timeout = { fn, ms }; return 1; }, clearTimeout: () => { timeout = null; } });
  state.set('idle'); assert.equal(timeout.ms, 300000); timeout.fn(); assert.equal(last.state, 'sleep');
  state.set('thinking', true); assert.equal(timeout, null);
  state.set('done'); assert.equal(timeout.ms, 4000);
  state.set('celebrate'); assert.equal(timeout.ms, P.totalMs(P.frameSchedule(pack.animations.celebrate)) + 1000);
  assert.equal(state.set('unknown'), false);
});
test('posizione recuperata se un monitor sparisce, coordinate negative valide', () => {
  const displays = [{ x: -1920, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1080 }];
  assert.deepEqual(clampPosition({ x: -100, y: 10 }, 192, 192, displays), { x: -192, y: 10 });
  assert.deepEqual(clampPosition({ x: 9000, y: 0 }, 192, 192, [displays[1]]), { x: 1704, y: 864 });
});
test('chat privata, bounded e distinta per IA', t => {
  const directory = temporary(t); prepareDirectory(directory);
  const store = new ChatStore(directory);
  store.set('codex', [{ role: 'user', text: 'uno' }]); store.set('claude', [{ role: 'user', text: 'due' }]);
  const recovered = new ChatStore(directory);
  assert.equal(recovered.get('codex')[0].text, 'uno'); assert.equal(recovered.get('claude')[0].text, 'due');
  recovered.set('claude', []); assert.equal(recovered.get('codex')[0].text, 'uno');
  recovered.set('codex', Array.from({ length: 100 }, () => ({ role: 'user', text: 'a'.repeat(9000) })));
  assert.equal(recovered.get('codex').length, 60); assert.equal(recovered.get('codex')[0].text.length, 8000);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(directory, 'history.json')).mode & 0o777, 0o600);
});
test('link nei dati non seguiti', t => {
  const directory = temporary(t), outside = path.join(directory, 'original.json'), link = path.join(directory, 'history.json');
  fs.writeFileSync(outside, '{"private":"data"}');
  try { fs.symlinkSync(outside, link); } catch (e) { if (process.platform === 'win32' && e.code === 'EPERM') return t.skip('Windows richiede il privilegio per creare symlink di file'); throw e; }
  assert.deepEqual(readJSON(link, {}), {});
  assert.throws(() => new ChatStore(directory).set('codex', []));
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"private":"data"}');
});
test('parser richiede autenticazione, formato ridotto e body completo', () => {
  const states = Object.keys(P.STATES.states);
  assert.equal(parseRequest(request(), token, states).status, 204);
  assert.equal(parseRequest(request(), 'b'.repeat(64), states).status, 401);
  assert.equal(parseRequest(request(undefined, 'Origin: https://example.com\r\n'), token, states).status, 403);
  assert.equal(parseRequest(request(undefined, 'Content-Length: 1\r\n'), token, states).status, 400);
  assert.equal(parseRequest(request(undefined, 'Transfer-Encoding: chunked\r\n'), token, states).status, 400);
  assert.equal(parseRequest(request('{"state":"idle","source":"codex","prompt":"private"}'), token, states).status, 400);
  assert.equal(parseRequest(request('{"state":"xxx","source":"codex"}'), token, states).status, 400);
  assert.equal(parseRequest(Buffer.alloc(4097), token, states).status, 413);
  assert.equal(parseRequest(request().subarray(0, -1), token, states), null);
});
test('server reale loopback, bridge, richieste spezzate e cleanup', async t => {
  const directory = temporary(t), file = path.join(directory, 'events.json'), received = [];
  prepareDirectory(directory);
  const server = new EventServer(file, Object.keys(P.STATES.states), e => received.push(e));
  const port = await server.start(0); t.after(() => server.close());
  assert.equal(server.server.address().address, '127.0.0.1');
  await sendEvent(file, 'done', 'claude'); assert.deepEqual(received, [{ state: 'done', source: 'claude' }]);
  const own = request().toString().replace(token, server.token);
  const reply = await new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }); let result = '';
    socket.on('connect', () => { socket.write(own.slice(0, 16)); setTimeout(() => socket.write(own.slice(16)), 10); });
    socket.on('data', d => { result += d; }); socket.on('end', () => resolve(result));
  });
  assert.match(reply, /204/); assert.equal(received.length, 2);
  await server.close(); assert.equal(fs.existsSync(file), false);
});
test('hook mapping senza trasmissione del testo', () => {
  assert.equal(hookState({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file: 'private' } }), 'reading');
  assert.equal(hookState({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), 'running');
  assert.equal(hookState({ hook_event_name: 'PostToolUse', tool_response: { exit_code: 1 } }), 'error');
  assert.equal(hookState({ hook_event_name: 'PermissionRequest' }), 'waiting');
  assert.equal(hookState({ hook_event_name: 'PostToolUseFailure', is_interrupt: true }), null);
});
test('Codex e Claude consentono ricerca web ma non strumenti generici o sessioni persistenti', () => {
  const codex = argumentsFor('codex').join(' ');
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox read-only']) assert.ok(codex.includes(flag));
  for (const feature of DISABLED) assert.ok(codex.includes('--disable ' + feature));
  assert.ok(codex.includes('--enable code_mode')); assert.ok(codex.includes('--enable code_mode_host'));
  assert.ok(codex.includes('suppress_unstable_features_warning=true')); assert.ok(!codex.includes('tools.view_image=false'));
  assert.ok(!codex.includes('--last')); assert.ok(codex.includes('web_search="live"')); assert.ok(argumentsFor('claude').includes('--no-session-persistence'));
  const args = argumentsFor('claude'); assert.equal(args[args.indexOf('--tools') + 1], 'WebSearch,WebFetch');
  assert.ok(!promptWithHistory([{ role: 'notice', text: 'private error' }], 'hi').includes('private error'));
});
for (const engine of ['codex', 'claude']) test('processo simulato ' + engine + ': stdin, JSON e niente shell', async t => {
  const directory = temporary(t), fixture = path.join(__dirname, 'fixture.cjs');
  const command = { file: process.execPath, prefix: [fixture], env: {} };
  const prompt = 'Ciao $(touch never) & <script>'; const args = argumentsFor(engine);
  assert.ok(!args.includes(prompt));
  const output = await runCLI(command, args, prompt, directory).promise;
  assert.equal(decodeOutput(engine, output.stdout, output.code, output.stderr), 'Risposta simulata: ' + prompt);
  assert.equal(fs.existsSync(path.join(directory, 'never')), false);
});
test('stop, timeout, errore e limite output', async t => {
  const directory = temporary(t), command = { file: process.execPath, prefix: [path.join(__dirname, 'fixture.cjs')], env: {} };
  const slow = runCLI(command, ['--slow'], 'test', directory); slow.stop(); await assert.rejects(slow.promise, /interrotta/);
  await assert.rejects(runCLI(command, ['--slow'], 'test', directory, 80).promise, /scaduto/);
  await assert.rejects(runCLI(command, ['--oversize'], 'test', directory).promise, /grande/);
  const output = await runCLI(command, ['--fail'], 'test', directory).promise;
  assert.throws(() => decodeOutput('codex', output.stdout, output.code, output.stderr), /Errore fixture/);
  assert.throws(() => decodeOutput('codex', '', 0, ''), /incompleta/);
  // Claude json: errore su stdout con uscita 1 e stderr vuoto (es. accesso scaduto) → messaggio reale, non generico.
  assert.throws(() => decodeOutput('claude', JSON.stringify({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired' }), 1, ''), /OAuth session expired/);
  assert.throws(() => decodeOutput('claude', 'non json', 1, ''), /verifica accesso/);
});
test('wrapper npm Codex con spazi risolto come JS, niente cmd.exe', t => {
  const directory = temporary(t), wrapper = path.join(directory, 'codex.cmd'); fs.writeFileSync(wrapper, 'not executed');
  assert.equal(commandFor(wrapper), null);
  const js = path.join(directory, 'node_modules/@openai/codex/bin/codex.js'); fs.mkdirSync(path.dirname(js), { recursive: true }); fs.writeFileSync(js, '');
  const command = commandFor(wrapper); assert.deepEqual(command.prefix, [js]); assert.equal(command.env.ELECTRON_RUN_AS_NODE, '1');
});
test('configurazione account pulito/esistente e conservazione notify', t => {
  const directory = temporary(t), executable = 'C:\\Apps with spaces\\Mascotte.exe';
  const initial = '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"original"}]}]},"permissions":{"allow":["Read"]}}';
  const codex = 'notify = ["C:\\\\Tools\\\\original.exe", "turn-ended"]\n[features]\nhooks = true\n';
  const proposal = prepareHooks(initial, codex, executable), parsed = toml.parse(proposal.codex);
  assert.deepEqual(JSON.parse(proposal.claude).permissions, { allow: ['Read'] });
  assert.equal(JSON.parse(proposal.claude).hooks.SessionStart[0].hooks[0].command, 'original');
  assert.deepEqual(parsed.notify, ['C:\\Tools\\original.exe', 'turn-ended']);
  assert.equal(parsed.features.hooks, true);
  assert.match(JSON.parse(proposal.claude).hooks.Stop[0].hooks[0].command, /^powershell\.exe /);
  const hook = parsed.hooks.PreToolUse[0].hooks[0];
  assert.equal(hook.command, hook.command_windows);
  assert.ok(Buffer.from(hook.command.split(' ').at(-1), 'base64').toString('utf16le').includes(executable));
  const repeated = prepareHooks(proposal.claude, proposal.codex, executable);
  assert.deepEqual(JSON.parse(repeated.claude), JSON.parse(proposal.claude));
  assert.deepEqual(toml.parse(repeated.codex), parsed);
  const clean = prepareHooks('{}', '', executable); assert.equal(toml.parse(clean.codex).notify, undefined);
  const paths = { claude: path.join(directory, 'claude.json'), codex: path.join(directory, 'config.toml') };
  fs.writeFileSync(paths.claude, initial); fs.writeFileSync(paths.codex, codex);
  const before = snapshot(paths); const backups = applyHooks(paths, before, proposal, path.join(directory, 'record.json'));
  assert.equal(fs.readFileSync(backups.claude, 'utf8'), initial); assert.equal(fs.readFileSync(backups.codex, 'utf8'), codex);
  assert.throws(() => applyHooks(paths, before, proposal, path.join(directory, 'record.json')), /cambiata/);
});

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (condition, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await condition()) return true; await new Promise(r => setTimeout(r, 25)); } return false; };
for (const how of ['stop', 'timeout']) test('arresto dell\'intero gruppo di processi, nipoti compresi (' + how + ')', { skip: process.platform === 'win32' && 'su Windows usa taskkill /T' }, async t => {
  const directory = temporary(t), pidFile = path.join(directory, 'nipote.pid'), command = { file: process.execPath, prefix: [path.join(__dirname, 'fixture.cjs')], env: {} };
  const run = runCLI(command, ['--grandchild=' + pidFile], 'x', directory, how === 'timeout' ? 1500 : 180000);
  assert.ok(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8')), 'il nipote deve partire');
  const pid = Number(fs.readFileSync(pidFile, 'utf8')); assert.ok(alive(pid));
  if (how === 'stop') run.stop();
  await assert.rejects(run.promise, how === 'stop' ? /interrotta/ : /scaduto/);
  assert.ok(await waitFor(() => !alive(pid), 3000), 'il nipote deve morire con il gruppo');
});
test('chiusura app: stop forzato uccide subito il gruppo', { skip: process.platform === 'win32' && 'su Windows usa taskkill /T' }, async t => {
  const directory = temporary(t), pidFile = path.join(directory, 'nipote.pid'), command = { file: process.execPath, prefix: [path.join(__dirname, 'fixture.cjs')], env: {} };
  const run = runCLI(command, ['--grandchild=' + pidFile], 'x', directory);
  assert.ok(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8')));
  const pid = Number(fs.readFileSync(pidFile, 'utf8')); run.stop('Risposta interrotta.', true);
  await assert.rejects(run.promise, /interrotta/); assert.ok(await waitFor(() => !alive(pid), 3000));
});
test('CLI script npm con shebang env node: runtime di Electron e PATH minimo, binari nativi invariati', { skip: process.platform === 'win32' && 'comportamento solo macOS/Linux' }, async t => {
  const directory = temporary(t), bin = path.join(directory, 'prefix', 'bin'), lib = path.join(directory, 'prefix', 'lib', 'pkg'); fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'cli.js'), '#!/usr/bin/env node\n' + fs.readFileSync(path.join(__dirname, 'fixture.cjs'), 'utf8'), { mode: 0o755 });
  fs.symlinkSync(path.join('..', 'lib', 'pkg', 'cli.js'), path.join(bin, 'claude'));
  const command = commandFor(path.join(bin, 'claude')), real = fs.realpathSync(path.join(lib, 'cli.js'));
  assert.equal(command.file, process.execPath); assert.deepEqual(command.prefix, [real]); assert.equal(command.env.ELECTRON_RUN_AS_NODE, '1'); assert.ok(command.pathDirs.includes(bin));
  const saved = process.env.PATH, savedCli = process.env.MASCOTTE_CHAT_CLAUDE; process.env.PATH = '/usr/bin:/bin'; process.env.MASCOTTE_CHAT_CLAUDE = path.join(bin, 'claude');
  try {
    const found = findCLI('claude'); assert.deepEqual(found.prefix, [real]);
    const output = await runCLI(found, argumentsFor('claude'), 'ciao', directory).promise;
    assert.equal(decodeOutput('claude', output.stdout, output.code, output.stderr), 'Risposta simulata: ciao');
  } finally { process.env.PATH = saved; if (savedCli === undefined) delete process.env.MASCOTTE_CHAT_CLAUDE; else process.env.MASCOTTE_CHAT_CLAUDE = savedCli; }
  const native = path.join(directory, 'nativo'); fs.writeFileSync(native, 'binario', { mode: 0o755 });
  assert.deepEqual(commandFor(native), { file: native, prefix: [], env: {} });
  const sh = path.join(directory, 'sh-script'); fs.writeFileSync(sh, '#!/bin/sh\n', { mode: 0o755 });
  assert.deepEqual(commandFor(sh), { file: sh, prefix: [], env: {} });
});
