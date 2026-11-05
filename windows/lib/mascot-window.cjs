'use strict';

// Su Windows showInactive può riportare la finestra non attivabile nel gruppo normale,
// anche se il costruttore aveva alwaysOnTop: true. Riapplica il livello DOPO lo show.
// La mascotte resta non attivabile: non deve sottrarre il focus al programma in uso.
function showMascot(window, platform = process.platform) {
  if (!window || window.isDestroyed()) return;
  window.showInactive();
  if (platform === 'win32') window.setAlwaysOnTop(true, 'screen-saver');
}

// La taskbar è anch'essa topmost e può passare davanti quando si attiva un'app.
// Aggiornare solo il flag non basta: si ripristina anche l'ordine, senza focus.
function keepAboveTaskbar(window, platform = process.platform) {
  if (platform !== 'win32' || !window || window.isDestroyed() || !window.isVisible()) return;
  window.setAlwaysOnTop(true, 'screen-saver');
  window.moveTop();
}

module.exports = { showMascot, keepAboveTaskbar };
