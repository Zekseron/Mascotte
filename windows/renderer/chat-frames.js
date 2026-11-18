'use strict';
// Fotogrammi della finestra osservata e condivisione.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
// Stesse condizioni già usate dalla cattura: stream presente e dimensioni disponibili.
function frameReady() { const video = $('watch-video'); return Boolean(watchStream && video.videoWidth && video.videoHeight); }
function updateImageStatus() {
  let text = '';
  if (current?.watching) {
    text = current.engine !== 'locale' ? 'Nessuna immagine inviata automaticamente'
      : !current.localVision ? 'Modello solo testo · nessuna immagine inviata'
      : frameReady() ? `Immagine automatica attiva · ${current.watchName} · sul dispositivo`
      : 'Video in preparazione · immagine non disponibile';
  }
  const status = $('image-status'); status.textContent = text; status.title = text; status.hidden = !text;
  status.setAttribute('aria-label', text);
}
for (const event of ['loadedmetadata', 'loadeddata', 'playing', 'resize', 'emptied', 'ended']) $('watch-video').addEventListener(event, updateImageStatus);
// Fotogramma JPEG dalla finestra osservata (massimo 1600×900), oppure null se l'osservazione non è attiva.
function captureFrame() {
  const video = $('watch-video');
  if (!frameReady()) return null;
  const scale = Math.min(1, 1600 / video.videoWidth, 900 / video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .78);
}
function prepareShare() {
  if (!$('input').value.trim()) { $('status').textContent = 'Scrivi una domanda prima di allegare il fotogramma.'; return; }
  const frame = captureFrame(); if (!frame) return;
  pendingImage = frame;
  $('share-preview').src = pendingImage;
  $('share-notice').textContent = current.engine === 'locale' ? 'Confermando, il fotogramma viene analizzato dal modello locale sul ' + current.deviceName + '. Non viene inviato a Codex o Claude e non viene salvato nella cronologia.' : `Il fotogramma resta sul dispositivo finché non confermi. Confermando, viene inviato a ${current.engine === 'codex' ? 'Codex' : 'Claude'} con il tuo account. Non viene salvato nella cronologia Mascotte.`;
  $('share-dialog').showModal();
}