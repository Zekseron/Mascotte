'use strict';
// Mascotte: personaggio, grandezza, mascotte personali e colori delle parti.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
// Sezione Mascotte: personaggio e grandezza (stessa logica del clic destro sulla mascotte) e mascotte personali.
function renderCharacters(value, locked) {
  const info = value.characters; if (!info) return;
  const busy = locked || Boolean(value.setup);
  const select = $('character-select'), signature = JSON.stringify(info.list.map(c => [c.id, c.name, c.category]));
  if (select.dataset.signature !== signature) {
    const groups = new Map();
    for (const c of info.list) { if (!groups.has(c.category)) { const group = document.createElement('optgroup'); group.label = c.category; groups.set(c.category, group); } groups.get(c.category).append(new Option(c.name, c.id)); }
    select.replaceChildren(...groups.values()); select.dataset.signature = signature;
  }
  select.value = info.current; select.disabled = $('character-scale').disabled = Boolean(value.setup);
  $('character-scale').replaceChildren(...info.scales.map(scale => new Option(`${scale}×`, String(scale))));
  $('character-scale').value = String(info.scale);
  const currentName = info.list.find(c => c.id === info.current)?.name || '';
  $('sum-mascotte').textContent = `${currentName} · ${info.scale}×`; $('character-eyebrow').textContent = currentName.toUpperCase();
  $('input').placeholder = currentName ? `Scrivi a ${currentName}…` : 'Scrivi un messaggio…';
  const personal = info.list.filter(c => c.personal);
  $('character-list').replaceChildren(...personal.map(c => {
    const row = document.createElement('div'); row.className = 'folder-row';
    const name = document.createElement('strong'); name.textContent = c.name;
    const remove = listButton('Rimuovi', async () => render(await invoke('character-remove', c.id)), busy);
    row.append(name, document.createElement('br'), remove); return row;
  }));
  $('character-add').disabled = busy || personal.length >= info.max;
  $('character-warnings').textContent = info.warnings.join('\n'); $('character-warnings').hidden = !info.warnings.length;
  $('character-status').textContent = info.status || ''; $('character-status').className = info.failed ? 'error' : '';
  renderColors(info, busy);
}
// Colori delle parti: l'elenco si ricostruisce solo cambiando personaggio, così il selettore aperto non si chiude mentre scegli.
// Ogni richiesta porta l'id del personaggio da cui parte: se intanto cambi personaggio, il processo principale la ignora.
// Un ripristino annulla il colore ancora in coda, così non viene riapplicato dopo.
let colorInputs = {}, colorTimer = null, colorPending = null, colorCharacter = null;
function sendColor(part, color) {
  colorPending = { character: colorCharacter, part, color };
  if (colorTimer) return;
  colorTimer = setTimeout(async () => { colorTimer = null; const next = colorPending; colorPending = null; if (next) render(await invoke('character-colors', next)); }, 120);
}
function cancelPendingColor(part) {
  if (colorPending && (!part || colorPending.part === part)) colorPending = null;
  if (!colorPending && colorTimer) { clearTimeout(colorTimer); colorTimer = null; }
}
async function resetColors(part) {
  cancelPendingColor(part);
  render(await invoke('character-colors', part ? { character: colorCharacter, part, color: null } : { character: colorCharacter, reset: true }));
}
function renderColors(info, busy) {
  const parts = info.parts || [], list = $('character-colors'), signature = info.current + '|' + parts.map(part => part.id).join(',');
  $('colors-section').hidden = !parts.length;
  if (list.dataset.signature !== signature) {
    cancelPendingColor(); colorCharacter = info.current;
    list.dataset.signature = signature; colorInputs = {};
    list.replaceChildren(...parts.map(part => {
      const row = document.createElement('label'); row.className = 'color-row';
      const name = document.createElement('span'); name.textContent = part.name;
      const input = document.createElement('input'); input.type = 'color'; input.setAttribute('aria-label', `Colore: ${part.name}`);
      input.addEventListener('input', () => sendColor(part.id, input.value));
      const reset = listButton('↺', () => resetColors(part.id));
      reset.title = `Colore originale di ${part.name}`; reset.setAttribute('aria-label', reset.title);
      colorInputs[part.id] = { input, reset };
      row.append(name, input, reset); return row;
    }));
  }
  for (const part of parts) {
    const item = colorInputs[part.id]; if (!item) continue;
    if (document.activeElement !== item.input && !colorPending) item.input.value = part.color;
    item.input.disabled = busy; item.reset.disabled = busy || part.color === part.original;
  }
  $('colors-reset').disabled = busy || parts.every(part => part.color === part.original);
}