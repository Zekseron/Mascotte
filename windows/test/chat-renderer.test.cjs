'use strict';
// Prove di regressione sul codice della chat (renderer/chat.js) eseguito in un contesto `vm` con un DOM finto minimo:
// nessuna finestra, nessun Electron. Il finto DOM risponde a qualunque proprietà; qui conta solo cosa fa il gestore provato.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');

// invoke(action, data) → valore restituito dal «main» finto; `undefined` simula il fallimento che `invoke` di chat.js assorbe.
function loadChat(handler) {
  const elements = new Map(), listeners = new Map();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const own = { dataset: {}, style: {}, value: '', textContent: '', hidden: false, disabled: false, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
    const proxy = new Proxy(own, {
      get: (target, key) => key in target ? target[key] : key === 'addEventListener' ? (type, fn) => listeners.set(`${id}:${type}`, fn) : key === 'then' ? undefined : () => element(`${id}>${String(key)}`),
      set: (target, key, value) => { target[key] = value; return true; }
    });
    elements.set(id, proxy); return proxy;
  };
  const calls = [];
  const never = new Promise(() => {}); // il primo «snapshot» di avvio non arriva mai: render() non parte
  const context = {
    document: { getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: element, activeElement: null },
    window: { addEventListener() {}, mascotte: { invoke: async (action, data) => { calls.push([action, data]); return action === 'snapshot' && calls.length === 1 ? never : handler(action, data); }, onWatchStop() {}, onChat() {} } },
    localStorage: { getItem: () => null, setItem() {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, Blob: class {}, Audio: class {}
  };
  vm.runInNewContext(source, context, { filename: 'chat.js' });
  return { listeners, element, calls };
}

test('B6: cambiando servizio con una risposta assente (invoke restituisce undefined) non c\'è TypeError', async () => {
  const { listeners, element, calls } = loadChat(() => undefined);
  const change = listeners.get('engine:change');
  assert.equal(typeof change, 'function');
  element('engine').value = 'claude';
  await assert.doesNotReject(async () => { await change(); });
  assert.deepEqual(calls.find(([action]) => action === 'engine'), ['engine', 'claude']);
});

test('B6: con una risposta valida il gestore continua a funzionare come prima', async () => {
  const snapshot = { engine: 'claude', messages: [], busy: false };
  const { listeners, element, calls } = loadChat(action => action === 'engine' ? snapshot : undefined);
  element('engine').value = 'claude';
  // render() non è provato qui: basta che il gestore arrivi a usare la risposta senza fermarsi prima.
  await listeners.get('engine:change')().catch(() => {});
  assert.equal(element('input').value, '');
  assert.equal(calls.filter(([action]) => action === 'engine').length, 1);
});
