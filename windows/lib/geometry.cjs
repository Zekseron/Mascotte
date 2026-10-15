'use strict';
function mascotSize(pack, scale) {
  const ratio = scale / (pack.pixelRatio || 1);
  return { width: Math.round(pack.frame.width * ratio), height: Math.round(pack.frame.height * ratio) };
}
function maskHit(mask, frame, bounds, cursor) {
  if (!mask || bounds.width <= 0 || bounds.height <= 0) return false;
  const x = Math.floor((cursor.x - bounds.x) * frame.width / bounds.width);
  const y = Math.floor((cursor.y - bounds.y) * frame.height / bounds.height);
  return x >= 0 && y >= 0 && x < frame.width && y < frame.height && Boolean(mask[y * frame.width + x]);
}
function dragPosition(drag, cursor) {
  return { x: Math.round(drag.position.x + cursor.x - drag.cursor.x), y: Math.round(drag.position.y + cursor.y - drag.cursor.y) };
}
module.exports = { mascotSize, maskHit, dragPosition };
