'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mascotSize, maskHit, dragPosition } = require('../lib/geometry.cjs');
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
