'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
const start = source.indexOf("      chat.on('close',");
const end = source.indexOf("      chat.webContents.on('render-process-gone'", start);
assert.ok(start > 0 && end > start);
function close(platform, quitting) {
  const state = { visible: true, minimized: false, prevented: false, stopped: false };
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    process: { platform }, quitting, currentRun: { stop: () => { state.stopped = true; } },
    chat: { on: (_event, callback) => { handler = callback; }, minimize: () => { state.minimized = true; }, hide: () => { state.visible = false; } }
  });
  handler({ preventDefault: () => { state.prevented = true; } });
  return state;
}
test('Windows: X mantiene la chat visibile alla barra, ridotta a icona, e interrompe la risposta', () => {
  assert.deepEqual(close('win32', false), { visible: true, minimized: true, prevented: true, stopped: true });
});
test('Mac: X conserva il comportamento precedente di nascondere la chat', () => {
  assert.deepEqual(close('darwin', false), { visible: false, minimized: false, prevented: true, stopped: true });
});
test('Esci permette la chiusura effettiva su entrambe le piattaforme', () => {
  for (const platform of ['win32', 'darwin']) assert.deepEqual(close(platform, true), { visible: true, minimized: false, prevented: false, stopped: false });
});
