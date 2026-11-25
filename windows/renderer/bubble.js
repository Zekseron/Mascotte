'use strict';
// Fumetto della mascotte: mostra gli avvisi ricevuti dal processo principale (lib/bubble.cjs) e comunica l'altezza
// del contenuto, così la finestra è grande quanto l'elenco e non copre nulla con parti trasparenti.
// Clic sul testo: apre la micro chat e chiude l'avviso. «×»: chiude solo l'avviso.
// Sveglia (item.alarm): suona da qui (AlarmPlayer, alarm-player.js) finché c'è, con «Ferma» e «Rimanda 5 minuti» al posto di «×».
const list = document.getElementById('list');
let ringing = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Misura subito, senza requestAnimationFrame: con il fumetto vuoto la finestra è nascosta e lì il disegno non avviene mai,
// quindi l'altezza non arriverebbe e il fumetto non ricomparirebbe (difetto trovato il 24 novembre 2026 con la sveglia).
function reportSize() {
  window.mascotte.invoke('bubble-size', list.children.length ? Math.ceil(list.getBoundingClientRect().height) : 0);
}

function button(className, label, onClick) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function alarmRow(item) {
  const row = element('li', 'notice sticky alarm');
  const text = element('div', 'text');
  const marker = element('span', 'marker');
  marker.setAttribute('aria-hidden', 'true');
  text.append(marker);
  if (item.title) text.append(element('span', 'title', item.title));
  if (item.body) text.append(element('span', 'body', item.body));
  const actions = element('div', 'actions');
  actions.append(
    button('action primary', 'Ferma', () => window.mascotte.invoke('bubble-alarm', 'stop')),
    button('action', 'Rimanda 5 minuti', () => window.mascotte.invoke('bubble-alarm', 'snooze')));
  text.append(actions);
  row.append(text);
  return row;
}

function noticeRow(item) {
  const row = element('li', item.sticky ? 'notice sticky' : 'notice');
  // Avvisi di Claude e Codex: il clic sul testo chiude e basta (la chat di Mascotte non è il posto dell'agente).
  const text = button('text', undefined, () => window.mascotte.invoke(item.agent ? 'bubble-dismiss' : 'bubble-open', item.id));
  text.title = item.agent ? 'Chiudi avviso' : 'Apri la micro chat';
  const marker = element('span', 'marker');
  marker.setAttribute('aria-hidden', 'true');
  text.append(marker);
  if (item.title) text.append(element('span', 'title', item.title));
  if (item.body) text.append(element('span', 'body', item.body));
  const close = button('close', '×', () => window.mascotte.invoke('bubble-dismiss', item.id));
  close.setAttribute('aria-label', 'Chiudi avviso');
  row.append(text, close);
  return row;
}

// Il suono parte quando compare una sveglia e si ferma quando il processo principale la toglie (Ferma, Rimanda, 3 minuti, chat).
async function updateSound(items) {
  const alarm = items.some(item => item.alarm);
  if (alarm === ringing) return;
  ringing = alarm;
  if (!alarm) { AlarmPlayer.stop(); return; }
  const settings = await window.mascotte.invoke('bubble-alarm-sound').catch(() => ({}));
  if (ringing) await AlarmPlayer.start(settings);
}

function render(items) {
  if (!Array.isArray(items)) return;
  list.replaceChildren(...items.map(item => item.alarm ? alarmRow(item) : noticeRow(item)));
  reportSize();
  updateSound(items);
}

window.mascotte.onBubble(render);
window.mascotte.invoke('bubble-init').then(render);
