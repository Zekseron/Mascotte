'use strict';
// Fumetto della mascotte: mostra gli avvisi ricevuti dal processo principale (lib/bubble.cjs) e comunica l'altezza
// del contenuto, così la finestra è grande quanto l'elenco e non copre nulla con parti trasparenti.
// Clic sul testo: apre la micro chat e chiude l'avviso. «×»: chiude solo l'avviso.
const list = document.getElementById('list');

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function reportSize() {
  requestAnimationFrame(() => window.mascotte.invoke('bubble-size', list.children.length ? Math.ceil(list.getBoundingClientRect().height) : 0));
}

function render(items) {
  if (!Array.isArray(items)) return;
  list.replaceChildren(...items.map(item => {
    const row = element('li', item.sticky ? 'notice sticky' : 'notice');
    const text = element('button', 'text');
    text.type = 'button';
    text.title = 'Apri la micro chat';
    if (item.title) text.append(element('span', 'title', item.title));
    if (item.body) text.append(element('span', 'body', item.body));
    text.addEventListener('click', () => window.mascotte.invoke('bubble-open', item.id));
    const close = element('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi avviso');
    close.addEventListener('click', () => window.mascotte.invoke('bubble-dismiss', item.id));
    row.append(text, close);
    return row;
  }));
  reportSize();
}

window.mascotte.onBubble(render);
window.mascotte.invoke('bubble-init').then(render);
