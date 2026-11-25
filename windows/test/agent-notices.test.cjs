'use strict';
// Avvisi di Claude e Codex nel fumetto (lib/agent-notices.cjs) e impronta di sessione del ponte (lib/notify.cjs).
// Sequenze concordate con Codex il 24 novembre 2026, riprodotte con eventi sintetici e la coda vera del fumetto.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBubbleQueue, LINGER } = require('../lib/bubble.cjs');
const { createAgentNotices } = require('../lib/agent-notices.cjs');
const { sessionKey } = require('../lib/notify.cjs');

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
  assert.equal(sessionKey('--codex-hook', 'codex', { session_id: 'x', 'thread-id': 'y' }), null, 'hook di Codex non verificati: anonimi');
  for (const event of [{}, { session_id: '' }, { session_id: 5 }, { session_id: 'x'.repeat(201) }, null]) assert.equal(sessionKey('--claude-hook', 'claude', event), null);
  assert.notEqual(sessionKey('--claude-hook', 'claude', { session_id: 'z' }), sessionKey('--codex-notify', 'codex', { 'thread-id': 'z' }), 'agenti diversi, impronte diverse');
});
