'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const toml = require('smol-toml');
const { prepareHooks } = require('../lib/setup.cjs');
const { EventServer } = require('../lib/events.cjs');

const app = 'C:\\Apps\\Mascotte.exe';
const mascotNotify = previous => [app, '--mascotte-notify', '--codex-notify', '--forward-base64', Buffer.from(JSON.stringify(previous)).toString('base64')];
const desktopNotify = (version, previous) => [`C:\\runtime-${version}\\codex-computer-use.exe`, 'turn-ended', ...(previous ? ['--previous-notify', JSON.stringify(previous)] : [])];

test('migration removes nested Mascotte and obsolete desktop helpers, preserving unrelated notify', () => {
  const original = ['C:\\Tools\\my-notify.cmd', '--user-option'];
  const chain = desktopNotify('current', mascotNotify(desktopNotify('old', mascotNotify(original))));
  const migrated = prepareHooks('{}', toml.stringify({ notify: chain }), app);
  assert.deepEqual(toml.parse(migrated.codex).notify, desktopNotify('current', original));
  assert.deepEqual(toml.parse(prepareHooks(migrated.claude, migrated.codex, app).codex), toml.parse(migrated.codex));
  const noOther = desktopNotify('current', mascotNotify(desktopNotify('missing')));
  assert.deepEqual(toml.parse(prepareHooks('{}', toml.stringify({ notify: noOther }), app).codex).notify, desktopNotify('current'));
  assert.throws(() => prepareHooks('{}', toml.stringify({ notify: [app, '--mascotte-notify', '--codex-notify', '--forward-base64', 'broken'] }), app), /illeggibile/);
});

test('migration replaces old hooks while retaining other handlers and trust state', () => {
  const old = "$payload = [Console]::In.ReadToEnd(); $payload | & '" + app + "' --mascotte-notify --codex-hook; exit 0";
  const command = 'powershell.exe -EncodedCommand ' + Buffer.from(old, 'utf16le').toString('base64');
  const other = { type: 'command', command: 'custom-validation.exe' };
  const state = { custom: { enabled: false, trusted_hash: 'untouched' } };
  const codex = { hooks: { state, PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', commandWindows: command }, other] }] } };
  const claude = { hooks: { Stop: [{ hooks: [{ type: 'command', command: app, args: ['--mascotte-notify', '--claude-hook'] }, other] }] } };
  const result = prepareHooks(JSON.stringify(claude), toml.stringify(codex), app);
  const parsed = JSON.parse(JSON.stringify(toml.parse(result.codex)));
  const groups = parsed.hooks.PreToolUse;
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].hooks, [other]);
  assert.deepEqual(parsed.hooks.state, state);
  assert.deepEqual(JSON.parse(result.claude).hooks.Stop[0].hooks, [other]);
});

function run(command, payload, env) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = command.split(' ');
    const child = spawn(args.shift(), args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.stdin.on('error', () => {});
    const timer = setTimeout(() => { child.kill(); reject(new Error('Hook timeout')); }, 7000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, elapsed: Date.now() - started }); });
    child.stdin.end(payload);
  });
}

test('Windows launcher delivers stdin through bundled Electron Node, independent of inherited environment', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "mascotte hook ' è "));
  // The resolved directory is created by this test under tmp; never remove a
  // caller-provided path. Copies cover apostrophes, spaces and Unicode paths.
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of ['notify-entry.cjs', 'notify.cjs', 'storage.cjs']) fs.copyFileSync(path.join(__dirname, '../lib', file), path.join(directory, file));
  const executable = process.env.MASCOTTE_HOOK_TEST_EXE || require('electron');
  const bridge = process.env.MASCOTTE_HOOK_TEST_BRIDGE || path.join(directory, 'notify-entry.cjs');
  const proposal = prepareHooks('{}', '', executable, bridge);
  const codex = toml.parse(proposal.codex), claude = JSON.parse(proposal.claude);
  assert.equal(codex.hooks.Interrupt[0].hooks[0].timeout, 3);
  const events = [], states = ['listening', 'running', 'reading', 'writing', 'thinking', 'waiting', 'done', 'error', 'idle'];
  const server = new EventServer(path.join(directory, 'events.json'), states, event => events.push(event));
  await server.start(0);
  t.after(() => server.close());
  for (const inherited of [undefined, '1']) {
    const env = { ...process.env, MASCOTTE_WINDOWS_DATA_DIR: directory };
    if (inherited === undefined) delete env.ELECTRON_RUN_AS_NODE;
    else env.ELECTRON_RUN_AS_NODE = inherited;
    for (const [name, tool, expected] of [
      ['UserPromptSubmit', '', 'listening'], ['PreToolUse', 'exec_command', 'running'],
      ['PreToolUse', 'Read', 'reading'], ['PreToolUse', 'apply_patch', 'writing'],
      ['PostToolUse', '', 'thinking'], ['PermissionRequest', '', 'waiting'],
      ['Stop', '', 'done'], ['Interrupt', '', 'idle']
    ]) {
      const before = events.length;
      const result = await run(codex.hooks[name][0].hooks[0].command, JSON.stringify({ hook_event_name: name, tool_name: tool, prompt: 'Privato è 🐈 $(exit 99) & |' }), env);
      assert.deepEqual({ code: result.code, signal: result.signal, stdout: result.stdout, stderr: result.stderr }, { code: 0, signal: null, stdout: '', stderr: '' });
      assert.ok(result.elapsed < codex.hooks[name][0].hooks[0].timeout * 1000, `Hook exceeded host timeout: ${result.elapsed} ms`);
      assert.deepEqual(events.slice(before), [{ state: expected, source: 'codex' }]);
    }
    const before = events.length;
    const result = await run(claude.hooks.Stop[0].hooks[0].command, JSON.stringify({ hook_event_name: 'Stop' }), env);
    assert.equal(result.code, 0);
    assert.deepEqual(events.slice(before), [{ state: 'done', source: 'claude' }]);
  }
  const env = { ...process.env, MASCOTTE_WINDOWS_DATA_DIR: directory };
  for (const payload of ['invalid JSON', JSON.stringify({ hook_event_name: 'Unknown' }), 'x'.repeat(70000)]) {
    const before = events.length;
    const result = await run(codex.hooks.Stop[0].hooks[0].command, payload, env);
    assert.equal(result.code, 0);
    assert.equal(events.length, before);
    assert.equal(result.stdout + result.stderr, '');
  }
  await server.close();
  const closed = await run(codex.hooks.Stop[0].hooks[0].command, JSON.stringify({ hook_event_name: 'Stop' }), env);
  assert.equal(closed.code, 0);
  assert.ok(closed.elapsed < 5000);
  assert.equal(closed.stdout + closed.stderr, '');
});

test('Mac: sostituisce gli hook e il notify della vecchia app Swift, conserva gli altri', () => {
  const exe = '/Applications/Mascotte.app/Contents/MacOS/Mascotte', legacy = mode => `/usr/bin/python3 /Users/x/siti/mascotte/tools/mascotte-notify ${mode}`;
  const sky = '/Users/x/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient';
  const memoria = { type: 'command', command: '$HOME/strumenti/richiama.sh' };
  const claude = { hooks: { SessionStart: [{ hooks: [memoria] }], Stop: [{ hooks: [{ type: 'command', command: legacy('--claude-hook') }] }], PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: legacy('--claude-hook') }] }] } };
  const notify = [sky, 'turn-ended', '--previous-notify', JSON.stringify(['/usr/bin/python3', '/Users/x/siti/mascotte/tools/mascotte-notify', '--codex-notify', '--forward-command', JSON.stringify([sky, 'turn-ended'])])];
  const codex = { notify, hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: legacy('--codex-hook'), timeout: 5 }] }] } };
  const result = prepareHooks(JSON.stringify(claude), toml.stringify(codex), exe, undefined, 'darwin');
  const c = JSON.parse(result.claude), x = toml.parse(result.codex);
  assert.deepEqual(c.hooks.SessionStart, [{ hooks: [memoria] }]);
  for (const event of ['Stop', 'PreToolUse']) { assert.equal(c.hooks[event].length, 1); assert.match(c.hooks[event][0].hooks[0].command, /^ELECTRON_RUN_AS_NODE=1 '\/Applications\/Mascotte\.app\/Contents\/MacOS\/Mascotte' '\/Applications\/Mascotte\.app\/Contents\/Resources\/app\.asar\/lib\/notify-entry\.cjs' --mascotte-notify --claude-hook /); }
  assert.equal(x.hooks.PreToolUse.length, 1); assert.equal(x.hooks.PreToolUse[0].hooks[0].command_windows, undefined);
  assert.deepEqual(x.notify, [sky, 'turn-ended']);
  // Seconda applicazione: nessun doppione.
  const again = prepareHooks(result.claude, result.codex, exe, undefined, 'darwin');
  assert.deepEqual(JSON.parse(again.claude), c); assert.deepEqual(toml.parse(again.codex), x);
});

test('Mac launcher consegna stdin al ponte con il Node di Electron, anche con apostrofi nel percorso', { skip: process.platform !== 'darwin', timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "mascotte hook ' è "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of ['notify-entry.cjs', 'notify.cjs', 'storage.cjs', 'platform.cjs']) fs.copyFileSync(path.join(__dirname, '../lib', file), path.join(directory, file));
  const proposal = prepareHooks('{}', '', require('electron'), path.join(directory, 'notify-entry.cjs'), 'darwin');
  const codex = toml.parse(proposal.codex), claude = JSON.parse(proposal.claude);
  const events = [], server = new EventServer(path.join(directory, 'events.json'), ['listening', 'reading', 'done'], event => events.push(event));
  await server.start(0); t.after(() => server.close());
  const sh = (command, payload) => new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { env: { ...process.env, MASCOTTE_DATA_DIR: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Hook timeout')); }, 7000);
    child.once('close', code => { clearTimeout(timer); resolve({ code, out }); }); child.stdin.end(payload);
  });
  for (const [command, payload, expected] of [
    [codex.hooks.UserPromptSubmit[0].hooks[0].command, { hook_event_name: 'UserPromptSubmit', prompt: "Privato è 🐈 $(exit 99) ' & |" }, { state: 'listening', source: 'codex' }],
    [claude.hooks.PreToolUse[0].hooks[0].command, { hook_event_name: 'PreToolUse', tool_name: 'Read' }, { state: 'reading', source: 'claude' }],
    [claude.hooks.Stop[0].hooks[0].command, { hook_event_name: 'Stop' }, { state: 'done', source: 'claude' }]
  ]) {
    const before = events.length, result = await sh(command, JSON.stringify(payload));
    assert.deepEqual(result, { code: 0, out: '' }); assert.deepEqual(events.slice(before), [expected]);
  }
  await server.close();
  assert.deepEqual(await sh(claude.hooks.Stop[0].hooks[0].command, '{"hook_event_name":"Stop"}'), { code: 0, out: '' });
});
