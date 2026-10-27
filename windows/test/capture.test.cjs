'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configureDisplayCapture } = require('../lib/capture.cjs');

function fixture(listSources) {
  const selected = { id: 'window:123:0', name: 'Synthetic test window' };
  const state = { source: selected, chat: { webContents: { mainFrame: {} }, isDestroyed: () => false } };
  const handlers = {};
  configureDisplayCapture({
    setPermissionRequestHandler: fn => handlers.permission = fn,
    setPermissionCheckHandler: fn => handlers.check = fn,
    setDisplayMediaRequestHandler: fn => handlers.display = fn
  }, { getChat: () => state.chat, getSource: () => state.source, listSources: listSources || (async () => [selected]) });
  const permission = (kind, details, web = state.chat.webContents) => {
    let result; handlers.permission(web, kind, value => { result = value; }, details); return result;
  };
  const display = overrides => new Promise(resolve => handlers.display({ frame: state.chat.webContents.mainFrame, videoRequested: true, audioRequested: false, ...overrides }, resolve));
  return { state, handlers, permission, display, selected };
}

test('capture permission supports Electron 44 and rejects camera, microphone and other pages', () => {
  const f = fixture();
  assert.equal(f.permission('display-capture'), true);
  assert.equal(f.permission('media', { mediaTypes: [] }), true);
  for (const details of [undefined, {}, { mediaTypes: ['video'] }, { mediaTypes: ['audio'] }, { mediaTypes: ['audio', 'video'] }])
    assert.equal(f.permission('media', details), false);
  assert.equal(f.permission('display-capture', {}, {}), false);
  assert.equal(f.permission('geolocation'), false);
  assert.equal(f.handlers.check(f.state.chat.webContents, 'media'), false);
  f.state.source = null;
  assert.equal(f.permission('display-capture'), false);
  assert.equal(f.permission('media', { mediaTypes: [] }), false);
});

test('capture grants only the selected window to the chat main frame without audio', async () => {
  const f = fixture();
  assert.deepEqual(await f.display(), { video: f.selected });
  assert.equal(await f.display({ frame: {} }), null);
  assert.equal(await f.display({ audioRequested: true }), null);
  assert.equal(await f.display({ videoRequested: false }), null);
  f.state.chat.isDestroyed = () => true;
  assert.equal(await f.display(), null);
});

test('capture denies vanished windows, enumeration errors and cancellation during selection', async () => {
  assert.equal(await fixture(async () => []).display(), null);
  assert.equal(await fixture(async () => { throw new Error('Unavailable'); }).display(), null);
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const pending = f.display(); f.state.source = null; resolve([f.selected]);
  assert.equal(await pending, null);
});
