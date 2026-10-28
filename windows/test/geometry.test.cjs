'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mascotSize, maskHit, dragPosition, barEdge, barHit } = require('../lib/geometry.cjs');
test('2x size stays independent of previous window dimensions', () => {
  assert.deepEqual(mascotSize({ frame: { width: 32, height: 32 } }, 2), { width: 64, height: 64 });
  assert.deepEqual(mascotSize({ frame: { width: 224, height: 448 }, pixelRatio: 4 }, 2), { width: 112, height: 224 });
});
test('click mask follows actual content bounds, including scaled and negative monitor coordinates', () => {
  const frame = { width: 2, height: 2 }, mask = [0, 1, 0, 0];
  for (const width of [64, 128, 600]) {
    const b = { x: -700, y: 50, width, height: width };
    assert.equal(maskHit(mask, frame, b, { x: b.x + width * .75, y: b.y + width * .25 }), true);
    assert.equal(maskHit(mask, frame, b, { x: b.x + width * .25, y: b.y + width * .25 }), false);
    assert.equal(maskHit(mask, frame, b, { x: b.x + width, y: b.y }), false);
    assert.equal(maskHit(mask, frame, b, { x: b.x - 1, y: b.y }), false);
  }
});
test('drag uses absolute native cursor coordinates without accumulating movement', () => {
  const drag = { position: { x: -600, y: 400 }, cursor: { x: -580, y: 430 } };
  assert.deepEqual(dragPosition(drag, { x: -560, y: 450 }), { x: -580, y: 420 });
  for (let i = 0; i < 100; i++) assert.deepEqual(dragPosition(drag, { x: 100, y: 300 }), { x: 80, y: 270 });
});

// Schermo 1440x900 con barra dei menu (24) in alto: il Dock fisso riduce la workArea sul suo lato.
const mac = (workArea, bounds = { x: 0, y: 0, width: 1440, height: 900 }) => ({ bounds, workArea });
const dockBottom = mac({ x: 0, y: 24, width: 1440, height: 800 }), dockLeft = mac({ x: 70, y: 24, width: 1370, height: 876 });
const dockRight = mac({ x: 0, y: 24, width: 1370, height: 876 }), dockHidden = mac({ x: 0, y: 24, width: 1440, height: 876 });
test('bordo di appoggio: cima del Dock in basso, fondo dello schermo se laterale o nascosto', () => {
  assert.deepEqual(barEdge(dockBottom), { x: 0, y: 824, width: 1440, height: 800 });
  for (const d of [dockLeft, dockRight, dockHidden]) assert.equal(barEdge(d).y, 900);
});
test('rilascio sul Dock Mac in basso o laterale; non su barra dei menu, area utile o Dock nascosto', () => {
  assert.equal(barHit(dockBottom, { x: 700, y: 860 }, 'darwin'), true);
  assert.equal(barHit(dockBottom, { x: 700, y: 400 }, 'darwin'), false);
  assert.equal(barHit(dockBottom, { x: 700, y: 10 }, 'darwin'), false);
  assert.equal(barHit(dockLeft, { x: 30, y: 400 }, 'darwin'), true);
  assert.equal(barHit(dockLeft, { x: 30, y: 10 }, 'darwin'), false);
  assert.equal(barHit(dockRight, { x: 1400, y: 400 }, 'darwin'), true);
  assert.equal(barHit(dockRight, { x: 700, y: 400 }, 'darwin'), false);
  assert.equal(barHit(dockHidden, { x: 700, y: 895 }, 'darwin'), false);
  assert.equal(barHit(dockBottom, { x: 700, y: 900 }, 'darwin'), false);
});
test('Windows: solo la barra in basso, come prima', () => {
  const win = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  assert.equal(barHit(win, { x: 500, y: 1060 }, 'win32'), true);
  assert.equal(barHit(win, { x: 500, y: 500 }, 'win32'), false);
  const left = { bounds: win.bounds, workArea: { x: 48, y: 0, width: 1872, height: 1080 } };
  assert.equal(barHit(left, { x: 10, y: 500 }, 'win32'), false);
  assert.equal(barHit(left, { x: 10, y: 500 }, 'darwin'), true);
});
test('schermo secondario a sinistra con coordinate negative', () => {
  const d = { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 25, width: 1920, height: 1055 } };
  assert.equal(barEdge(d).y, 1080);
  assert.equal(barHit(d, { x: -900, y: 500 }, 'darwin'), false);
});
