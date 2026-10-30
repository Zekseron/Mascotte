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

// ---- Confronto dell'HTML prodotto (D23/D24/D25): DOM finto che registra tag, proprietà, figli e ascoltatori. ----
// Il testo atteso è stato catturato dal codice PRIMA del refactoring di chat.js: se cambia un tag, una classe, un attributo,
// l'ordine o un testo, il confronto fallisce.
function loadChatDom() {
  const elements = new Map(), listeners = new Map(), calls = [];
  const make = (tag, id) => {
    const own = { __tag: tag, __children: [], __listeners: [], dataset: {}, style: {}, value: '', textContent: '', hidden: false, disabled: false, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
    const api = {
      append: (...nodes) => { own.__children.push(...nodes); },
      replaceChildren: (...nodes) => { own.__children = [...nodes]; },
      addEventListener: (type, fn) => { own.__listeners.push(type); if (id) listeners.set(`${id}:${type}`, fn); else (own.__fns ||= {})[type] = fn; }
    };
    own.__self = own;
    return new Proxy(own, {
      get: (target, key) => key in target ? target[key] : key in api ? api[key] : key === 'then' ? undefined : key === 'querySelector' ? () => element(`${id}>q`) : () => element(`${id}>${String(key)}`),
      set: (target, key, value) => { target[key] = value; return true; }
    });
  };
  const element = id => { if (!elements.has(id)) elements.set(id, make('div', id)); return elements.get(id); };
  const serialize = proxied => {
    if (typeof proxied === 'string') return proxied;
    const node = proxied.__self;
    if (node.__tag === 'option') return `<option value=${node.value}>${node.textContent}</option>`;
    const attrs = [['class', node.className], ['type', node.type], ['title', node.title], ['disabled', node.disabled || ''], ['src', node.src]].filter(([, v]) => v).map(([k, v]) => ` ${k}="${v === true ? '' : v}"`).join('');
    return `<${node.__tag}${attrs}>${node.textContent || ''}${node.__children.map(serialize).join('')}</${node.__tag}>`;
  };
  const never = new Promise(() => {});
  let handler = () => undefined;
  const context = {
    document: { getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: tag => make(tag, null), activeElement: null },
    Option: function (text, value) { const option = make('option', null); option.textContent = text; option.value = value; return option; },
    window: { addEventListener() {}, mascotte: { invoke: async (action, data) => { calls.push([action, data]); return action === 'snapshot' && calls.length === 1 ? never : handler(action, data); }, onWatchStop() {}, onChat() {} } },
    localStorage: { getItem: () => null, setItem() {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, Blob: class {}, Audio: class {}
  };
  vm.runInNewContext(source, context, { filename: 'chat.js' });
  const render = vm.runInContext('render', vm.createContext(context));
  return { render, element, serialize, listeners, calls, setHandler: fn => { handler = fn; } };
}

test('D24: l\'HTML di note, cartelle, promemoria e mascotte personali resta identico', () => {
  const { render, element, serialize } = loadChatDom();
  const snapshot = {
    engine: 'locale', busy: false, available: ['codex', 'locale'], localEngine: 'ollama', localEngineLabel: 'Ollama', localModel: 'm', localCatalog: { models: [], default: 'm' }, localInstalled: [], localEngines: null, localManaged: {}, deviceName: 'Mac',
    messages: [{ role: 'user', text: 'ciao' }, { role: 'assistant', text: 'eccomi' }],
    memories: [{ id: 'n1', text: 'prima nota', source: 'manuale' }, { id: 'n2', text: 'seconda', source: 'chat' }],
    reminders: [{ id: 'r1', index: 1, text: 'latte', when: 'oggi 18:00', alarm: false }, { id: 'r2', index: 2, text: 'svegliami', when: 'domani 07:00', alarm: true }],
    alarmSettings: { sound: 'beep', name: '', volume: 0.8 }, hooksAvailable: true, setup: null, notice: '',
    characters: { current: 'rosso', scale: 3, scales: [1, 2, 3], list: [{ id: 'rosso', name: 'Rosso', category: 'Base', personal: false }, { id: 'mio', name: 'Mio gatto', category: 'Personali', personal: true }], warnings: [], max: 5, status: '', failed: false },
    management: { available: true, packageName: 'Mac', version: '1', repoPath: '', hooks: {}, running: false, status: '', failed: false, folders: { defaults: [{ name: 'Documenti', path: '/d' }], extra: [{ name: 'Lavoro', path: '/l' }, { name: 'Foto', path: '/f' }], max: 20, status: '', failed: false } }
  };
  // Due stati: libero e occupato (pulsanti disabilitati).
  const out = [false, true].map(busy => { render({ ...snapshot, busy });
    return ['memory-list', 'folder-defaults', 'folder-extra', 'reminder-list', 'character-list', 'messages'].map(id => id + ' ' + element(id).__children.map(serialize).join('')).join('\n'); }).join('\n---\n');
  assert.equal(out, EXPECTED_DOM);
});

test('D23: i pulsanti semplici invocano l\'azione giusta e rendono la risposta', async () => {
  const { listeners, calls, setHandler } = loadChatDom();
  const buttons = { 'character-add': 'character-add', 'local-scan': 'local-scan', 'folders-add': 'folders-add', 'choose-repo': 'repo-select', 'release-update': 'release-update', 'local-download': 'local-download', 'managed-remove': 'local-managed-remove', 'local-download-cancel': 'local-download-cancel', 'local-check': 'local-check', 'pc-action-cancel': 'pc-action-cancel', 'alarm-sound-choose': 'alarm-sound-choose', 'alarm-sound-remove': 'alarm-sound-remove', 'update-app': 'update-run', 'manage-hooks': 'setup-preview', 'apply': 'setup-apply', 'dismiss': 'setup-dismiss' };
  setHandler(() => undefined);
  for (const [id, action] of Object.entries(buttons)) {
    const before = calls.length;
    await listeners.get(`${id}:click`)();
    assert.deepEqual(calls.slice(before), [[action, undefined]], id);
  }
});

test('D25: nomi dei servizi nei testi della chat', () => {
  const { render, element, serialize } = loadChatDom();
  const base = { busy: false, localEngine: 'ollama', localEngineLabel: 'Ollama', localModel: 'm', localCatalog: { models: [], default: 'm' }, localInstalled: [], localEngines: null, localManaged: {}, deviceName: 'Mac', memories: [], reminders: [], alarmSettings: { sound: 'beep', name: '', volume: 0.8 }, setup: null, notice: '', management: {} };
  const out = [];
  for (const engine of ['codex', 'claude', 'locale']) {
    render({ ...base, engine, available: [engine], messages: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }] });
    assert.equal(element('engine>q').textContent, 'Locale');
    assert.equal(element('account-hint').textContent, engine === 'locale' ? 'Sul tuo Mac' : `Invio a ${engine === 'codex' ? 'Codex' : 'Claude'}`);
    out.push(engine + ' | ' + element('status').textContent + ' | ' + element('messages').__children.map(serialize).join('') + ' | ' + element('cli-status').textContent + ' | ' + element('sum-cli').textContent);
  }
  assert.equal(out.join('\n'), EXPECTED_NAMES);
});

const EXPECTED_DOM = "memory-list <div class=\"memory-note\"><p>prima nota</p><small>Fonte: manuale</small><button type=\"button\">Elimina</button></div><div class=\"memory-note\"><p>seconda</p><small>Fonte: chat</small><button type=\"button\">Elimina</button></div>\nfolder-defaults <div class=\"folder-row\"><strong>Documenti</strong><p class=\"local-path\">/d</p></div>\nfolder-extra <div class=\"folder-row\"><strong>Lavoro</strong><p class=\"local-path\">/l</p><button type=\"button\">Rimuovi</button></div><div class=\"folder-row\"><strong>Foto</strong><p class=\"local-path\">/f</p><button type=\"button\">Rimuovi</button></div>\nreminder-list <div class=\"folder-row\"><strong>🔔 oggi 18:00</strong><p class=\"local-path\">latte</p><button type=\"button\">Elimina</button></div><div class=\"folder-row\"><strong>⏰ domani 07:00</strong><p class=\"local-path\">svegliami</p><button type=\"button\">Elimina</button></div>\ncharacter-list <div class=\"folder-row\"><strong>Mio gatto</strong><br></br><button type=\"button\">Rimuovi</button></div>\nmessages <section class=\"message user\"><strong>Tu</strong><span>ciao</span></section><section class=\"message assistant\"><strong>Locale</strong><span>eccomi</span><button type=\"button\">Ricorda…</button><button type=\"button\">Chiedi a Codex o Claude…</button></section>\n---\nmemory-list <div class=\"memory-note\"><p>prima nota</p><small>Fonte: manuale</small><button type=\"button\" disabled=\"\">Elimina</button></div><div class=\"memory-note\"><p>seconda</p><small>Fonte: chat</small><button type=\"button\" disabled=\"\">Elimina</button></div>\nfolder-defaults <div class=\"folder-row\"><strong>Documenti</strong><p class=\"local-path\">/d</p></div>\nfolder-extra <div class=\"folder-row\"><strong>Lavoro</strong><p class=\"local-path\">/l</p><button type=\"button\" disabled=\"\">Rimuovi</button></div><div class=\"folder-row\"><strong>Foto</strong><p class=\"local-path\">/f</p><button type=\"button\" disabled=\"\">Rimuovi</button></div>\nreminder-list <div class=\"folder-row\"><strong>🔔 oggi 18:00</strong><p class=\"local-path\">latte</p><button type=\"button\">Elimina</button></div><div class=\"folder-row\"><strong>⏰ domani 07:00</strong><p class=\"local-path\">svegliami</p><button type=\"button\">Elimina</button></div>\ncharacter-list <div class=\"folder-row\"><strong>Mio gatto</strong><br></br><button type=\"button\" disabled=\"\">Rimuovi</button></div>\nmessages <section class=\"message user\"><strong>Tu</strong><span>ciao</span></section><section class=\"message assistant\"><strong>Locale</strong><span>eccomi</span><button type=\"button\" disabled=\"\">Ricorda…</button><button type=\"button\" disabled=\"\">Chiedi a Codex o Claude…</button></section>";
const EXPECTED_NAMES = "codex | Pronto · Codex | <section class=\"message user\"><strong>Tu</strong><span>a</span></section><section class=\"message assistant\"><strong>Codex</strong><span>b</span><button type=\"button\">Ricorda…</button></section> | Codex: trovato · Claude: non trovato | Codex ✓ · Claude ✗\nclaude | Pronto · Claude | <section class=\"message user\"><strong>Tu</strong><span>a</span></section><section class=\"message assistant\"><strong>Claude</strong><span>b</span><button type=\"button\">Ricorda…</button></section> | Codex: non trovato · Claude: trovato | Codex ✗ · Claude ✓\nlocale | Pronto · Locale | <section class=\"message user\"><strong>Tu</strong><span>a</span></section><section class=\"message assistant\"><strong>Locale</strong><span>b</span><button type=\"button\">Ricorda…</button><button type=\"button\">Chiedi a Codex o Claude…</button></section> | Codex: non trovato · Claude: non trovato | Codex ✗ · Claude ✗";
