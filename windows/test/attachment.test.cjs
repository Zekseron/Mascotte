'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { origin, helperCommand, parseState } = require('../lib/attachment.cjs');
test('window anchor follows top edge on a monitor left of the primary', () => {
  assert.deepEqual(origin({width:128,height:128}, {x:-1100,y:500,width:600,height:400}, {x:-1200,y:40,width:1200,height:800}, .5), {x:-864,y:372});
});
test('maximized window clamps the pet inside the screen', () => {
  const area = {x:0,y:0,width:1920,height:1040};
  assert.deepEqual(origin({width:128,height:128}, area, area, 1), {x:1792,y:0});
});
test('taskbar anchor stays above its work-area edge', () => {
  const area = {x:0,y:0,width:1920,height:1040};
  assert.deepEqual(origin({width:128,height:128}, {...area,y:1040}, area, .5), {x:896,y:912});
});

test('comando dell’helper per piattaforma', t => {
  const win = helperCommand('win32');
  assert.match(win.executable, /powershell\.exe$/i); assert.ok(win.args.includes('-EncodedCommand'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte helper '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const finto = path.join(dir, 'helper'); fs.writeFileSync(finto, '');
  assert.deepEqual(helperCommand('darwin', { helper: finto }), { executable: finto, args: [] });
  assert.throws(() => helperCommand('darwin', { helper: path.join(dir, 'manca') }), /non disponibile/);
  assert.throws(() => helperCommand('linux'), /non supportato/);
});
test('righe del protocollo: stati validi e geometrie errate', () => {
  assert.deepEqual(parseState('{"status":"visible","x":-20,"y":30,"width":800,"height":600}'), { status: 'visible', x: -20, y: 30, width: 800, height: 600 });
  for (const status of ['hidden', 'closed', 'unavailable']) assert.equal(parseState(JSON.stringify({ status })).status, status);
  for (const bad of ['', 'non json', '{"status":"altro"}', '{"status":"visible"}', '{"status":"visible","x":0,"y":0,"width":0,"height":10}', '{"status":"visible","x":"1","y":0,"width":5,"height":5}'])
    assert.throws(() => parseState(bad), bad);
});
test('helper Mac compilato: una lettura singola con --once emette una riga valida', { skip: process.platform !== 'darwin' && 'solo macOS' }, t => {
  let swiftc = true;
  try { execFileSync('swiftc', ['--version'], { stdio: 'ignore' }); } catch { swiftc = false; }
  if (!swiftc) return t.skip('swiftc non disponibile');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte helper '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'window-helper');
  execFileSync('swiftc', ['-O', path.join(__dirname, '..', 'lib', 'mac', 'window-helper.swift'), '-o', out, '-module-cache-path', path.join(dir, 'cache')], { stdio: 'pipe' });
  const lines = execFileSync(out, ['--once'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, MASCOTTE_HOST_PID: String(process.pid) } }).trim().split('\n');
  assert.equal(lines.length, 1);
  const state = parseState(lines[0]);
  assert.ok(['visible', 'unavailable'].includes(state.status));
});
