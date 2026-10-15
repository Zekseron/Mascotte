'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { origin } = require('../lib/attachment.cjs');
test('window anchor follows top edge on a monitor left of the primary', () => {
  assert.deepEqual(origin({width:128,height:128}, {x:-1100,y:500,width:600,height:400}, {x:-1200,y:40,width:1200,height:800}, .5), {x:-864,y:372});
});
test('maximized window clamps the pet inside the screen', () => {
  const area = {x:0,y:0,width:1920,height:1040};
  assert.deepEqual(origin({width:128,height:128}, area, area, 1), {x:1792,y:0});
});
test('taskbar anchor stays above its work-area edge', () => {
  const area = {x:0,y:0,width:1920,height:1040};
  assert.deepEqual(origin({width:128,height:128}, {...area,y:1040}, area, .5), {x:896,y:912});
});
