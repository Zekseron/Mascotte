'use strict';
// Fumetto della mascotte: gli avvisi di Mascotte (promemoria, sveglie, conferme) compaiono accanto al personaggio
// invece che come notifiche di sistema. Solo in memoria, mai su disco: chiudendo l'app la coda si svuota.
// Qui c'è solo la logica (coda, posizione, scelta fumetto/sistema), con timer e Notification iniettati: si prova senza Electron.
// Finestra e collegamenti stanno in main.cjs, l'aspetto in renderer/bubble.*.

const MAX = 4;            // avvisi visibili insieme; il più vecchio lascia il posto al nuovo
const LINGER = 8000;      // gli avvisi informativi (silent) spariscono da soli dopo 8 secondi
const WIDTH = 280;        // larghezza fissa della finestra del fumetto (punti)
const MAX_HEIGHT = 420;   // oltre, il contenuto scorre dentro il fumetto
const GAP = 6;            // distanza dalla mascotte

const normalizeMode = value => value === 'sistema' ? 'sistema' : 'fumetto';
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function createBubbleQueue({ onChange = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let items = [], seq = 0;
  const timers = new Map();
  const list = () => items.map(item => ({ ...item }));
  const forget = id => { if (timers.has(id)) { clearTimer(timers.get(id)); timers.delete(id); } };
  function remove(id) {
    if (!items.some(item => item.id === id)) return false;
    forget(id); items = items.filter(item => item.id !== id); onChange(list());
    return true;
  }
  // sticky: resta finché non lo chiudi (promemoria, sveglie). Uno uguale già visibile viene sostituito, non duplicato.
  function add({ title, body, sticky = false }) {
    title = clip(title, 80); body = clip(body, 300);
    if (!title && !body) return null;
    for (const same of items.filter(item => item.title === title && item.body === body)) forget(same.id);
    items = items.filter(item => item.title !== title || item.body !== body);
    const item = { id: `b${++seq}`, title, body, sticky: Boolean(sticky), at: now() };
    items.push(item);
    while (items.length > MAX) forget(items.shift().id);
    if (!item.sticky) timers.set(item.id, setTimer(() => { timers.delete(item.id); remove(item.id); }, LINGER));
    onChange(list());
    return { ...item };
  }
  function clear() { for (const id of [...timers.keys()]) forget(id); if (items.length) { items = []; onChange(list()); } }
  return { add, remove, clear, list, get size() { return items.length; } };
}

// Sopra la mascotte e centrato; se sopra non c'è spazio, sotto. Sempre dentro l'area di lavoro dello schermo.
function bubblePlacement(mascot, size, workArea) {
  const width = Math.min(size.width, workArea.width), height = Math.min(size.height, workArea.height);
  let side = 'above', y = mascot.y - height - GAP;
  if (y < workArea.y) { side = 'below'; y = mascot.y + mascot.height + GAP; }
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));
  const x = Math.max(workArea.x, Math.min(Math.round(mascot.x + mascot.width / 2 - width / 2), workArea.x + workArea.width - width));
  return { x, y: Math.round(y), width, height, side };
}

// Al posto della classe Notification di Electron, con la stessa forma (isSupported, new …({ title, body, silent }).show()):
// con il fumetto scelto e la mascotte visibile l'avviso va nel fumetto, altrimenti resta la notifica di sistema.
// Gli avvisi con suono (silent: false) restano finché non li chiudi e fanno il suono di avviso del sistema.
function createNoticeRouter({ Notification, mode, bubbleReady, queue, beep = () => {} }) {
  const useBubble = () => normalizeMode(mode()) === 'fumetto' && Boolean(bubbleReady());
  return class MascotteNotification {
    static isSupported() { return useBubble() || Notification.isSupported(); }
    constructor(options = {}) { this.options = options; }
    show() {
      const { title, body, silent } = this.options;
      if (useBubble()) { queue.add({ title, body, sticky: !silent }); if (!silent) beep(); return 'fumetto'; }
      new Notification(this.options).show();
      return 'sistema';
    }
  };
}

module.exports = { createBubbleQueue, bubblePlacement, createNoticeRouter, normalizeMode, MAX, LINGER, WIDTH, MAX_HEIGHT };
