'use strict';
// Fumetto della mascotte: gli avvisi di Mascotte (promemoria, sveglie, conferme) compaiono accanto al personaggio
// invece che come notifiche di sistema. Solo in memoria, mai su disco: chiudendo l'app la coda si svuota.
// Qui c'è solo la logica (coda, posizione, scelta fumetto/sistema), con timer e Notification iniettati: si prova senza Electron.
// Finestra e collegamenti stanno in main.cjs, l'aspetto in renderer/bubble.*.

const MAX = 4;            // avvisi visibili insieme; a coda piena lascia il posto prima il più vecchio di quelli che spariscono da soli
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
  // alarm: sveglia che suona, con «Ferma» e «Rimanda» nel fumetto; non lascia mai il posto ad altri avvisi.
  // agent: avviso di Claude o Codex (lib/agent-notices.cjs): il clic sul testo lo chiude e basta, senza aprire la chat.
  function add({ title, body, sticky = false, alarm = false, agent = false }) {
    title = clip(title, 80); body = clip(body, 300);
    if (!title && !body) return null;
    for (const same of items.filter(item => item.title === title && item.body === body)) forget(same.id);
    items = items.filter(item => item.title !== title || item.body !== body);
    const item = { id: `b${++seq}`, title, body, sticky: Boolean(sticky || alarm), at: now(), ...(alarm ? { alarm: true } : {}), ...(agent ? { agent: true } : {}) };
    items.push(item);
    // Coda piena: prima il più vecchio che sparirebbe da solo (conferme, fine turno degli agenti), poi il più vecchio
    // fra quelli che restano. La sveglia che suona non lascia mai il posto.
    while (items.length > MAX) {
      const transient = items.findIndex(entry => !entry.sticky);
      const old = transient >= 0 ? transient : Math.max(0, items.findIndex(entry => !entry.alarm));
      forget(items.splice(old, 1)[0].id);
    }
    if (!item.sticky) timers.set(item.id, setTimer(() => { timers.delete(item.id); remove(item.id); }, LINGER));
    onChange(list());
    return { ...item };
  }
  // Cambia il testo di un avviso già visibile senza spostarlo né toccare il suo timer (attesa di un agente: «in 2 sessioni»).
  function update(id, { title, body }) {
    const item = items.find(entry => entry.id === id);
    if (!item) return false;
    const next = { title: title === undefined ? item.title : clip(title, 80), body: body === undefined ? item.body : clip(body, 300) };
    if (next.title === item.title && next.body === item.body) return true;
    Object.assign(item, next); onChange(list());
    return true;
  }
  const has = id => items.some(item => item.id === id);
  function removeAlarms() { for (const item of items.filter(entry => entry.alarm)) remove(item.id); }
  function clear() { for (const id of [...timers.keys()]) forget(id); if (items.length) { items = []; onChange(list()); } }
  return { add, remove, update, has, removeAlarms, clear, list, get size() { return items.length; } };
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
// Gli avvisi con suono (silent: false) restano finché non li chiudi e fanno il suono di avviso del sistema; una sveglia
// (alarm: true) ha invece il suo suono, suonato dal fumetto. Alla notifica di sistema l'opzione alarm non arriva.
function createNoticeRouter({ Notification, mode, bubbleReady, queue, beep = () => {} }) {
  const useBubble = () => normalizeMode(mode()) === 'fumetto' && Boolean(bubbleReady());
  return class MascotteNotification {
    static isSupported() { return useBubble() || Notification.isSupported(); }
    constructor(options = {}) { this.options = options; }
    show() {
      const { alarm, ...options } = this.options, { title, body, silent } = options;
      if (useBubble()) { queue.add({ title, body, sticky: !silent, alarm: Boolean(alarm) }); if (!silent && !alarm) beep(); return 'fumetto'; }
      new Notification(options).show();
      return 'sistema';
    }
  };
}

module.exports = { createBubbleQueue, bubblePlacement, createNoticeRouter, normalizeMode, MAX, LINGER, WIDTH, MAX_HEIGHT };
