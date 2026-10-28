'use strict';
// Passo 9 del piano Mac: importazione una tantum, in sola lettura, dalla vecchia app Swift.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importLegacy, mapSettings } = require('../lib/legacy-mac.cjs');

function setup(t, history) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte legacy ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), data = path.join(base, 'nuova'), old = path.join(home, 'Library', 'Application Support', 'Mascotte');
  fs.mkdirSync(path.join(old, 'chat'), { recursive: true }); fs.mkdirSync(path.join(old, 'characters')); fs.mkdirSync(data);
  if (history !== undefined) fs.writeFileSync(path.join(old, 'chat', 'history.json'), typeof history === 'string' ? history : JSON.stringify(history));
  const listing = () => fs.readdirSync(old, { recursive: true }).sort().map(name => [name, fs.statSync(path.join(old, name)).mtimeMs]);
  return { home, data, old, listing };
}
// Preferenze reali della vecchia app sul Mac di prova (28 ottobre 2026).
const DEFAULTS = { 'mascotte.characterID': 'rebecca', 'mascotte.characterScales': { rebecca: 2 }, 'mascotte.chatEngine': 'codex', 'mascotte.dockAttachment': true, 'mascotte.scale': 6, 'mascotte.windowOrigin': [1189, -18] };

test('impostazioni: aggancio al Dock e scala; personaggio solo se esiste; niente posizione né motore', () => {
  assert.deepEqual(mapSettings(DEFAULTS, ['rosso']), { attachment: 'bar', scale: 6 });
  assert.deepEqual(mapSettings(DEFAULTS, ['rosso', 'rebecca']), { attachment: 'bar', scale: 6, character: 'rebecca', scales: { rebecca: 2 } });
  assert.deepEqual(mapSettings({ 'mascotte.scale': 9, 'mascotte.dockAttachment': false }), {});
});

test('primo avvio: importa cronologia e impostazioni senza toccare la vecchia cartella', t => {
  const history = { codex: { sessionID: 'x', messages: [{ role: 'user', text: 'ciao' }, { role: 'assistant', text: 'ciao!' }, { role: 'system', text: 'no' }] }, claude: { messages: [] } };
  const { home, data, listing } = setup(t, history), before = listing();
  const summary = importLegacy(data, { platform: 'darwin', home, characters: ['rosso'], readDefaults: () => DEFAULTS });
  assert.deepEqual(summary.messages, { codex: 2 }); assert.deepEqual(summary.settings, ['attachment', 'scale']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'chat', 'history.json'))), { codex: [{ role: 'user', text: 'ciao' }, { role: 'assistant', text: 'ciao!' }] });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'settings.json'))), { attachment: 'bar', scale: 6 });
  assert.deepEqual(listing(), before);
  // Una sola volta: il segnaposto impedisce una seconda importazione anche se settings.json sparisce.
  fs.rmSync(path.join(data, 'settings.json'));
  assert.equal(importLegacy(data, { platform: 'darwin', home, readDefaults: () => DEFAULTS }), null);
});

test('nessuna importazione se la nuova app ha già impostazioni, fuori da macOS o senza vecchi dati', t => {
  const { home, data } = setup(t, { codex: { messages: [{ role: 'user', text: 'ciao' }] } });
  fs.writeFileSync(path.join(data, 'settings.json'), '{"scale":3}');
  assert.equal(importLegacy(data, { platform: 'darwin', home, readDefaults: () => DEFAULTS }), null);
  assert.equal(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'), '{"scale":3}');
  const other = setup(t);
  assert.equal(importLegacy(other.data, { platform: 'win32', home: other.home, readDefaults: () => DEFAULTS }), null);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte vuota ')); t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(importLegacy(path.join(empty), { platform: 'darwin', home: path.join(empty, 'home'), readDefaults: () => ({}) }), null);
});

test('cronologia vuota, illeggibile o troppo grande: solo impostazioni', t => {
  for (const history of [{ codex: { messages: [] } }, 'non json', undefined]) {
    const { home, data } = setup(t, history);
    const summary = importLegacy(data, { platform: 'darwin', home, readDefaults: () => DEFAULTS });
    assert.deepEqual(summary.messages, {}); assert.equal(fs.existsSync(path.join(data, 'chat', 'history.json')), false);
    assert.ok(fs.existsSync(path.join(data, 'legacy-import.json')));
  }
});
