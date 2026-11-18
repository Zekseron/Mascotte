'use strict';
// Osservazione di una finestra: immagine in attesa, pannello, anteprime, scelta e avvio.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
function clearPendingImage() {
  pendingImage = null; $('share-preview').removeAttribute('src');
  if ($('share-dialog').open) $('share-dialog').close();
}
function stopWatchLocal() {
  for (const track of watchStream?.getTracks() || []) track.stop();
  watchStream = null; $('watch-video').srcObject = null; $('watch-video').classList.remove('active'); $('watch-chip-video').srcObject = null;
  $('watch-state').textContent = 'Osservazione spenta · acquisizione solo locale';
  showThumbnail($('watch-source').value);
  clearPendingImage();
  updateImageStatus();
}
async function stopWatching() { stopWatchLocal(); render(await invoke('watch-disable')); }
// Pannellino della finestra da condividere: si apre dal pulsante accanto al campo di testo, sopra la conversazione,
// e si chiude con ✕, Esc o un clic fuori. Aprendolo l'elenco delle finestre si aggiorna da solo.
// Menu «+» accanto al campo di testo: oggi contiene solo «Condividi schermata», pensato per altri allegati futuri.
function openAttachMenu(open) {
  const menu = $('attach-menu'); if (menu.hidden === !open) return;
  menu.hidden = !open; $('watch-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('attach-screen').focus?.();
}
function openWatchPanel(open) {
  const panel = $('watch-panel'); if (panel.hidden === !open) return;
  if (open) openAttachMenu(false);
  panel.hidden = !open;
  if (open && !current?.watching) refreshWatchSources();
  if (open) $('watch-source').focus?.();
}
// Anteprima della finestra scelta prima di osservarla: una miniatura presa sul dispositivo, mai inviata ai servizi.
let thumbnailRequest = 0;
async function showThumbnail(id) {
  const request = ++thumbnailRequest, image = $('watch-thumb');
  if (watchStream) return;
  if (!id) { image.hidden = true; image.removeAttribute('src'); $('watch-empty').hidden = false; return; }
  const data = await invoke('watch-thumbnail', { id });
  if (request !== thumbnailRequest || watchStream) return;
  if (typeof data === 'string' && data.startsWith('data:image/')) { image.src = data; image.hidden = false; $('watch-empty').hidden = true; }
  else { image.hidden = true; image.removeAttribute('src'); $('watch-empty').hidden = false; }
}
async function refreshWatchSources() {
  const sources = await invoke('watch-sources');
  $('watch-permission').hidden = !sources?.permission;
  if (sources?.permission) { $('watch-state').textContent = sources.message; return; }
  if (!Array.isArray(sources)) return;
  const select = $('watch-source'), previous = select.value; select.replaceChildren(new Option('Scegli una finestra', ''));
  for (const source of sources) select.add(new Option(source.name, source.id));
  // La finestra già scelta resta selezionata se è ancora aperta, con la sua anteprima aggiornata.
  if (previous && sources.some(source => source.id === previous)) select.value = previous;
  select.disabled = false; $('toggle-watch').disabled = !select.value; showThumbnail(select.value);
  $('watch-state').textContent = sources.length ? `Seleziona una finestra. L’elenco resta su questo ${current?.deviceName || 'PC'}.` : 'Non trovo finestre da osservare.';
  // Su Mac si possono osservare solo le finestre sullo schermo: non quelle ridotte nel Dock o in un altro gruppo di Stage Manager.
  if (current?.deviceName === 'Mac') $('watch-state').textContent += ' Manca una finestra? Portala in primo piano (non ridotta nel Dock né in un altro gruppo di Stage Manager) e premi ↻.';
}
async function startWatching() {
  const id = $('watch-source').value; if (!id) return;
  const source = await invoke('watch-enable', { id });
  if (!source?.id) { if (source?.messages) render(source); return; }
  try {
    watchStream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: {
      width: { max: 1600 }, height: { max: 900 }, frameRate: { max: 5 }
    } });
    $('watch-video').srcObject = watchStream; $('watch-video').classList.add('active'); $('watch-chip-video').srcObject = watchStream;
    $('watch-thumb').hidden = true; $('watch-empty').hidden = true;
    await $('watch-video').play(); $('watch-state').textContent = `Osservazione locale attiva · ${source.name}`;
    for (const track of watchStream.getTracks()) track.addEventListener('ended', () => { if (watchStream) stopWatching(); }, { once: true });
    render(await invoke('snapshot'));
  } catch {
    stopWatchLocal(); $('watch-state').textContent = 'Non riesco ad acquisire questa finestra.';
    render(await invoke('watch-disable'));
  }
}