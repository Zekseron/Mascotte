'use strict';
// Avvisi di Claude e Codex nel fumetto (lib/agent-notices.cjs) e impronta di sessione del ponte (lib/notify.cjs).
// Sequenze concordate con Codex il 24 novembre 2026, riprodotte con eventi sintetici e la coda vera del fumetto.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBubbleQueue, LINGER } = require('../lib/bubble.cjs');
const { createAgentNotices } = require('../lib/agent-notices.cjs');
const { sessionKey, hookState } = require('../lib/notify.cjs');

const A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb';

function setup({ enabled = true } = {}) {
  const timers = new Map(); let next = 1, visible = true;
  const queue = createBubbleQueue({ setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id) });
  let on = enabled;
  const notices = createAgentNotices({ queue, enabled: () => on, ready: () => visible });
  const send = (state, source = 'claude', session) => notices.handle(session ? { state, source, session } : { state, source });
  const texts = () => queue.list().map(item => item.body);
  const runTimers = () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } };
  return { queue, notices, send, texts, timers, runTimers, hide: () => { visible = false; }, show: () => { visible = true; }, disable: () => { on = false; } };
}

test('prova decisiva: A aspetta → B aspetta → B riprende → A riprende', () => {
  const { send, texts } = setup();
  send('waiting', 'claude', A); assert.deepEqual(texts(), ['Claude è in attesa']);
  send('waiting', 'claude', B); assert.deepEqual(texts(), ['Claude è in attesa in 2 sessioni']);
  send('running', 'claude', B); assert.deepEqual(texts(), ['Claude è in attesa']);
  send('reading', 'claude', A); assert.deepEqual(texts(), []);
});

test('l\'attività di un\'altra sessione non chiude l\'attesa', () => {
  const { send, texts } = setup();
  send('waiting', 'claude', A);
  for (const state of ['listening', 'thinking', 'working', 'reading', 'writing', 'running', 'idle', 'done']) send(state, 'claude', B);
  assert.equal(texts()[0], 'Claude è in attesa');
  send('working', 'claude', A); assert.deepEqual(texts().filter(t => /attesa/.test(t)), []);
});

test('ogni stato di ripresa della stessa sessione chiude l\'attesa (compreso working, done e interruzione)', () => {
  for (const state of ['listening', 'thinking', 'working', 'reading', 'writing', 'running', 'idle', 'done']) {
    const { send, texts } = setup();
    send('waiting', 'codex', A); send(state, 'codex', A);
    assert.equal(texts().some(t => /attesa/.test(t)), false, state);
  }
});

test('attesa anonima: «in attesa» senza conteggio, nessun evento anonimo la chiude, solo il clic', () => {
  const { send, texts, queue, notices } = setup();
  for (let i = 0; i < 10; i++) send('waiting', 'codex');
  assert.deepEqual(texts(), ['Codex è in attesa']);
  send('waiting', 'codex', A); send('waiting', 'codex', B);
  assert.deepEqual(texts(), ['Codex è in attesa'], 'conteggio incerto: niente «in N sessioni»');
  send('running', 'codex'); send('done', 'codex'); send('running', 'codex', A); send('done', 'codex', B);
  assert.equal(texts()[0], 'Codex è in attesa', 'resta l\'attesa anonima');
  const id = queue.list()[0].id; notices.dismissed(id); queue.remove(id);
  assert.equal(texts().some(t => /attesa/.test(t)), false);
});

test('clic sull\'avviso aggregato: prende atto di tutte le attese; una nuova attesa lo fa ricomparire', () => {
  const { send, texts, queue, notices } = setup();
  send('waiting', 'claude', A); send('waiting', 'claude', B);
  const id = queue.list()[0].id; notices.dismissed(id); queue.remove(id);
  send('running', 'claude', A); assert.deepEqual(texts(), [], 'le attese di cui si è preso atto non ritornano');
  send('waiting', 'claude', B); assert.deepEqual(texts(), ['Claude è in attesa']);
});

test('fine turno: 8 secondi dalla prima comparsa, ravvicinati accorpati, non tocca l\'attesa nuova', () => {
  const { send, texts, timers, runTimers } = setup();
  send('done', 'claude', A); send('done', 'claude', A); send('done', 'claude', B);
  assert.deepEqual(texts(), ['Claude ha concluso il turno']);
  assert.deepEqual([...timers.values()].map(t => t.ms), [LINGER], 'un solo timer, non rinnovato');
  send('waiting', 'claude', A);
  runTimers();
  assert.deepEqual(texts(), ['Claude è in attesa'], 'il timer del fine turno non cancella la nuova attesa');
  send('done', 'claude'); assert.deepEqual(texts(), ['Claude è in attesa', 'Claude ha concluso il turno'], 'fine turno anonimo: nessuna attesa chiusa');
});

test('errore di un comando: solo animazione, nessun avviso', () => {
  const { send, texts } = setup();
  send('error', 'claude', A); send('error', 'codex');
  assert.deepEqual(texts(), []);
});

test('mascotte nascosta: nuovi avvisi scartati, chiusure elaborate', () => {
  const { send, texts, hide, show } = setup();
  send('waiting', 'claude', A);
  hide();
  send('reading', 'claude', A);
  send('waiting', 'codex', B); send('done', 'codex', B);
  show();
  assert.deepEqual(texts(), [], 'l\'attesa di A è sparita e quelle nate da nascosta non compaiono');
  send('waiting', 'codex', B); assert.deepEqual(texts(), ['Codex è in attesa']);
});

test('due agenti indipendenti, coda piena: sacrificato prima un fine turno, mai la sveglia', () => {
  const { send, texts, queue } = setup();
  queue.add({ title: 'Mascotte · sveglia', body: 'Uscire', alarm: true });
  queue.add({ title: 'Mascotte · promemoria', body: 'Bere', sticky: true });
  send('done', 'claude', A); send('waiting', 'codex', B);
  assert.equal(queue.size, 4);
  send('waiting', 'claude', A);
  assert.deepEqual(texts(), ['Uscire', 'Bere', 'Codex è in attesa', 'Claude è in attesa']);
  send('running', 'codex', B); send('running', 'claude', A);
  assert.deepEqual(texts(), ['Uscire', 'Bere']);
});

test('opzione spenta: nessun avviso; spegnendola spariscono quelli mostrati', () => {
  const off = setup({ enabled: false });
  off.send('waiting', 'claude', A); off.send('done', 'codex');
  assert.deepEqual(off.texts(), []);
  const on = setup();
  on.send('waiting', 'claude', A); on.send('done', 'codex');
  on.notices.reset(); on.disable();
  assert.deepEqual(on.texts(), []);
  on.send('waiting', 'claude', A); assert.deepEqual(on.texts(), []);
});

test('sorgente manuale o sconosciuta e session non valida: ignorate o trattate come anonime', () => {
  const { send, texts, notices } = setup();
  send('waiting', 'manual'); notices.handle({ state: 'waiting', source: 'altro' });
  assert.deepEqual(texts(), []);
  notices.handle({ state: 'waiting', source: 'claude', session: 'non-valida' });
  send('running', 'claude', A);
  assert.deepEqual(texts(), ['Claude è in attesa'], 'session non valida = attesa anonima');
});

test('ponte: impronta di sessione solo per i percorsi verificati, mai l\'id grezzo', () => {
  const claude = sessionKey('--claude-hook', 'claude', { session_id: 'sessione-uno' });
  assert.match(claude, /^[a-f0-9]{16}$/);
  assert.equal(sessionKey('--claude-hook', 'claude', { session_id: 'sessione-uno' }), claude, 'stabile');
  assert.notEqual(sessionKey('--claude-hook', 'claude', { session_id: 'sessione-due' }), claude);
  assert.match(sessionKey('--codex-notify', 'codex', { 'thread-id': 't1' }), /^[a-f0-9]{16}$/);
  // Hook di Codex: session_id verificato su Mac il 25 novembre 2026; thread-id e turn_id non si usano.
  assert.match(sessionKey('--codex-hook', 'codex', { session_id: 'x' }), /^[a-f0-9]{16}$/);
  assert.equal(sessionKey('--codex-hook', 'codex', { session_id: 'x', turn_id: 't1' }), sessionKey('--codex-hook', 'codex', { session_id: 'x', turn_id: 't2' }), 'turn_id non conta');
  assert.equal(sessionKey('--codex-hook', 'codex', { 'thread-id': 'y' }), null, 'senza session_id: anonimo');
  for (const event of [{}, { session_id: '' }, { session_id: 5 }, { session_id: 'x'.repeat(201) }, null]) assert.equal(sessionKey('--claude-hook', 'claude', event), null);
  assert.notEqual(sessionKey('--claude-hook', 'claude', { session_id: 'z' }), sessionKey('--codex-notify', 'codex', { 'thread-id': 'z' }), 'agenti diversi, impronte diverse');
});

// Percorso completo come nel ponte: payload dell'hook Codex → hookState → sessionKey → avviso nel fumetto.
function codexHook(notices, payload) {
  const state = hookState(payload);
  if (state) notices.handle({ state, source: 'codex', ...(sessionKey('--codex-hook', 'codex', payload) ? { session: sessionKey('--codex-hook', 'codex', payload) } : {}) });
}

test('regressione hook Codex: due sessioni, l\'attività di B non chiude l\'attesa di A; A ripartendo chiude solo la sua', () => {
  const { notices, texts } = setup();
  const A = { session_id: 'sessione-codex-A' }, B = { session_id: 'sessione-codex-B' };
  codexHook(notices, { ...A, hook_event_name: 'PermissionRequest', tool_name: 'exec_command', turn_id: 'a1' });
  codexHook(notices, { ...B, hook_event_name: 'PermissionRequest', tool_name: 'exec_command', turn_id: 'b1' });
  assert.deepEqual(texts(), ['Codex è in attesa in 2 sessioni']);
  codexHook(notices, { ...B, hook_event_name: 'PreToolUse', tool_name: 'exec_command', turn_id: 'b1' });
  assert.deepEqual(texts(), ['Codex è in attesa'], 'B riparte: resta solo l\'attesa di A');
  codexHook(notices, { ...B, hook_event_name: 'Stop', turn_id: 'b1' });
  assert.deepEqual(texts(), ['Codex è in attesa', 'Codex ha concluso il turno'], 'lo Stop di B non chiude A');
  codexHook(notices, { ...A, hook_event_name: 'PostToolUse', tool_name: 'exec_command', tool_response: { exit_code: 0 }, turn_id: 'a2' });
  assert.deepEqual(texts(), ['Codex ha concluso il turno'], 'A riparte (turno diverso, stessa sessione): chiusa');
});

test('regressione hook Codex: l\'interruzione della stessa sessione chiude l\'attesa', () => {
  const { notices, texts } = setup();
  codexHook(notices, { session_id: 'sessione-codex-A', hook_event_name: 'PermissionRequest', tool_name: 'exec_command' });
  codexHook(notices, { session_id: 'sessione-codex-B', hook_event_name: 'Interrupt' });
  assert.deepEqual(texts(), ['Codex è in attesa']);
  codexHook(notices, { session_id: 'sessione-codex-A', hook_event_name: 'Interrupt' });
  assert.deepEqual(texts(), []);
});

test('regressione hook Codex senza session_id: attesa anonima, nessun evento anonimo la chiude', () => {
  const { notices, texts } = setup();
  codexHook(notices, { hook_event_name: 'PermissionRequest', tool_name: 'exec_command' });
  codexHook(notices, { session_id: 'sessione-codex-B', hook_event_name: 'PermissionRequest', tool_name: 'exec_command' });
  assert.deepEqual(texts(), ['Codex è in attesa'], 'conteggio incerto con un\'attesa anonima');
  codexHook(notices, { hook_event_name: 'PreToolUse', tool_name: 'exec_command' });
  codexHook(notices, { hook_event_name: 'Stop' });
  codexHook(notices, { session_id: 'sessione-codex-B', hook_event_name: 'Stop' });
  assert.equal(texts()[0], 'Codex è in attesa', 'resta l\'attesa anonima, chiusa solo dal clic');
});
