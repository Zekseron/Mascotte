'use strict';
// Fumetto della mascotte (lib/bubble.cjs): coda degli avvisi, posizione accanto alla mascotte, scelta fumetto/sistema.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBubbleQueue, bubblePlacement, createNoticeRouter, normalizeMode, MAX, LINGER } = require('../lib/bubble.cjs');

function fakeTimers() {
  const timers = new Map(); let next = 1;
  return {
    timers,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id),
    run: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
  };
}

test('avviso informativo: compare e sparisce da solo dopo LINGER', () => {
  const t = fakeTimers(), changes = [];
  const queue = createBubbleQueue({ onChange: items => changes.push(items), setTimer: t.setTimer, clearTimer: t.clearTimer, now: () => 5 });
  const item = queue.add({ title: 'Mascotte', body: 'Promemoria impostato.' });
  assert.deepEqual(queue.list(), [{ id: item.id, title: 'Mascotte', body: 'Promemoria impostato.', sticky: false, at: 5 }]);
  assert.equal([...t.timers.values()][0].ms, LINGER);
  t.run();
  assert.deepEqual(queue.list(), []);
  assert.deepEqual(changes.map(items => items.length), [1, 0]);
});

test('avviso con suono (sticky): resta finché non viene chiuso', () => {
  const t = fakeTimers();
  const queue = createBubbleQueue({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  const item = queue.add({ title: 'Mascotte · promemoria', body: 'Chiamare Marco', sticky: true });
  assert.equal(t.timers.size, 0);
  assert.equal(queue.remove(item.id), true);
  assert.equal(queue.remove(item.id), false);
  assert.equal(queue.size, 0);
});

test('stesso avviso ripetuto: sostituito, non duplicato, e il vecchio timer si annulla', () => {
  const t = fakeTimers();
  const queue = createBubbleQueue({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  queue.add({ title: 'A', body: 'uno' }); queue.add({ title: 'A', body: 'uno' });
  assert.equal(queue.size, 1);
  assert.equal(t.timers.size, 1);
});

test('al massimo MAX avvisi: il più vecchio lascia il posto', () => {
  const t = fakeTimers();
  const queue = createBubbleQueue({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  for (let i = 0; i < MAX + 2; i++) queue.add({ title: 'Mascotte', body: `avviso ${i}` });
  assert.deepEqual(queue.list().map(item => item.body), Array.from({ length: MAX }, (_, i) => `avviso ${i + 2}`));
  assert.equal(t.timers.size, MAX);
  queue.clear();
  assert.deepEqual([queue.size, t.timers.size], [0, 0]);
});

test('testi ripuliti e tagliati; avviso vuoto ignorato', () => {
  const queue = createBubbleQueue({ setTimer: () => 0, clearTimer: () => {} });
  assert.equal(queue.add({ title: '  ', body: '\n' }), null);
  const item = queue.add({ title: 'x'.repeat(200), body: 'riga\n  due\t tre' + 'y'.repeat(400) });
  assert.equal(item.title.length, 80);
  assert.equal(item.body.length, 300);
  assert.match(item.body, /^riga due tre/);
});

test('posizione: sopra la mascotte e centrato; sotto se sopra non c\'è spazio; dentro lo schermo', () => {
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  assert.deepEqual(bubblePlacement({ x: 600, y: 500, width: 200, height: 200 }, { width: 280, height: 100 }, area), { x: 560, y: 394, width: 280, height: 100, side: 'above' });
  assert.deepEqual(bubblePlacement({ x: 600, y: 60, width: 200, height: 200 }, { width: 280, height: 100 }, area), { x: 560, y: 266, width: 280, height: 100, side: 'below' });
  // Mascotte nell'angolo in alto a destra: il fumetto non esce dal bordo destro.
  assert.deepEqual(bubblePlacement({ x: 1300, y: 60, width: 140, height: 140 }, { width: 280, height: 100 }, area), { x: 1160, y: 206, width: 280, height: 100, side: 'below' });
  // Mascotte grande quanto lo schermo: il fumetto resta comunque dentro, anche sovrapposto.
  assert.deepEqual(bubblePlacement({ x: 0, y: 25, width: 1440, height: 875 }, { width: 280, height: 100 }, area), { x: 580, y: 800, width: 280, height: 100, side: 'below' });
});

function router({ mode = 'fumetto', ready = true, supported = true } = {}) {
  const log = { system: [], beeps: 0 };
  class Notification {
    static isSupported() { return supported; }
    constructor(options) { this.options = options; }
    show() { log.system.push(this.options); }
  }
  const queue = createBubbleQueue({ setTimer: () => 0, clearTimer: () => {} });
  const Routed = createNoticeRouter({ Notification, mode: () => mode, bubbleReady: () => ready, queue, beep: () => { log.beeps++; } });
  return { Routed, queue, log };
}

test('fumetto scelto e mascotte visibile: l\'avviso va nel fumetto, quello con suono fa il bip e resta', () => {
  const { Routed, queue, log } = router();
  assert.equal(Routed.isSupported(), true);
  assert.equal(new Routed({ title: 'Mascotte · promemoria', body: 'Bere', silent: false }).show(), 'fumetto');
  assert.equal(new Routed({ title: 'Mascotte', body: 'Promemoria impostato.', silent: true }).show(), 'fumetto');
  assert.deepEqual(queue.list().map(item => [item.body, item.sticky]), [['Bere', true], ['Promemoria impostato.', false]]);
  assert.deepEqual([log.system.length, log.beeps], [0, 1]);
});

test('mascotte nascosta o notifiche di sistema scelte: resta la notifica di sistema', () => {
  for (const options of [{ ready: false }, { mode: 'sistema' }]) {
    const { Routed, queue, log } = router(options);
    assert.equal(new Routed({ title: 'Mascotte', body: 'Bere', silent: false }).show(), 'sistema');
    assert.deepEqual(log.system, [{ title: 'Mascotte', body: 'Bere', silent: false }]);
    assert.deepEqual([queue.size, log.beeps], [0, 0]);
  }
});

test('notifiche di sistema non disponibili: il fumetto basta, senza fumetto non è supportato', () => {
  assert.equal(router({ supported: false }).Routed.isSupported(), true);
  assert.equal(router({ supported: false, ready: false }).Routed.isSupported(), false);
});

test('modalità: tutto ciò che non è «sistema» vale fumetto', () => {
  assert.deepEqual(['sistema', 'fumetto', undefined, 'altro'].map(normalizeMode), ['sistema', 'fumetto', 'fumetto', 'fumetto']);
});
