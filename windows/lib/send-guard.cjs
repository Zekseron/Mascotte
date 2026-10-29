'use strict';
// Ammissione di un invio dalla chat. Restituisce null se si può procedere; altrimenti il motivo del rifiuto come avviso da
// mostrare: la chat svuota il campo prima di inviare e rimette il testo solo se lo snapshot successivo ha un `notice` (B7).
// Stringa vuota = rifiuto senza avviso (testo vuoto: non c'è nulla da perdere). Stessi limiti di prima: 8000 caratteri e 32768 byte.
function sendRefusal(text, { localDownload, currentRun, updateRunning }) {
  if (localDownload) return 'Il download del modello è in corso: attendi la fine (o annullalo) e invia di nuovo.';
  if (currentRun) return 'Una risposta è ancora in corso: attendi che finisca (o premi Ferma) e invia di nuovo.';
  if (updateRunning) return 'L’aggiornamento è in corso: invia di nuovo quando è finito.';
  if (typeof text !== 'string') return 'Il messaggio non è valido.';
  if (!text.trim()) return '';
  if (text.length > 8000 || Buffer.byteLength(text) > 32768) return 'Il messaggio è troppo lungo (massimo 8000 caratteri): accorcialo e invia di nuovo.';
  return null;
}

module.exports = { sendRefusal };
