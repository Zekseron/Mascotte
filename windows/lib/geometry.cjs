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
// Linea su cui si posa la mascotte agganciata alla barra/Dock: sempre il bordo inferiore dell'area utile.
// Con il Dock in basso è la sua cima; con Dock laterale o nascosto è il fondo dello schermo (come visibleFrame della vecchia app).
function barEdge(display) { const a = display.workArea; return { ...a, y: a.y + a.height }; }
// Il punto di rilascio cade sulla barra (Windows: solo in basso) o sul Dock (Mac: qualunque lato) di questo schermo?
function barHit(display, point, platform = process.platform) {
  const { x, y, width, height } = display.bounds, a = display.workArea;
  if (!(point.x >= x && point.x < x + width && point.y >= y && point.y < y + height)) return false;
  const inBottom = point.x >= a.x && point.x < a.x + a.width && point.y >= a.y + a.height && point.y < y + height;
  if (platform !== 'darwin') return inBottom;
  const inSide = point.y >= a.y && point.y < a.y + a.height &&
    ((point.x >= x && point.x < a.x) || (point.x >= a.x + a.width && point.x < x + width));
  return inBottom || inSide;
}
module.exports = { mascotSize, maskHit, dragPosition, barEdge, barHit };
