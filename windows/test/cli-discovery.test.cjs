'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findCLI, commandFor } = require('../lib/cli.cjs');

test('Windows avvia il binario npm Codex direttamente senza il wrapper che apre una console', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-cli-native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wrapper = path.join(root, 'codex.cmd'), pkg = path.join(root, 'node_modules/@openai/codex');
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.writeFileSync(wrapper, 'non eseguire'); fs.writeFileSync(path.join(pkg, 'bin/codex.js'), 'non eseguire');
  const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  for (const base of [pkg, path.join(pkg, 'node_modules/@openai', `codex-win32-${process.arch}`)]) {
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'package.json'), '{}');
    const native = path.join(base, 'vendor', triple, 'bin/codex.exe');
    fs.mkdirSync(path.dirname(native), { recursive: true }); fs.writeFileSync(native, 'fixture');
    const command = commandFor(wrapper);
    assert.equal(command.file, native); assert.deepEqual(command.prefix, []);
    assert.equal(command.env.CODEX_MANAGED_PACKAGE_ROOT, fs.realpathSync(pkg));
    assert.equal(command.env.ELECTRON_RUN_AS_NODE, undefined);
  }
});
test('Windows discovers the desktop CLI outside PATH and skips empty version folders', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'OpenAI', 'Codex', 'bin');
  for (const v of ['older', 'newer', 'empty']) fs.mkdirSync(path.join(bin, v), { recursive: true });
  for (const v of ['older', 'newer']) fs.writeFileSync(path.join(bin, v, 'codex.exe'), 'fixture');
  fs.utimesSync(path.join(bin, 'older'), 100, 100);
  fs.utimesSync(path.join(bin, 'newer'), 200, 200);
  fs.utimesSync(path.join(bin, 'empty'), 300, 300);
  const env = { PATH: '', LOCALAPPDATA: root };
  assert.equal(findCLI('codex', env).file, path.join(bin, 'newer', 'codex.exe'));
  env.MASCOTTE_CHAT_CODEX = path.join(bin, 'older', 'codex.exe');
  assert.equal(findCLI('codex', env).file, env.MASCOTTE_CHAT_CODEX);
});
