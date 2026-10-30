'use strict';

// Su Windows showInactive può riportare la finestra non attivabile nel gruppo normale,
// anche se il costruttore aveva alwaysOnTop: true. Riapplica il livello DOPO lo show.
// La mascotte resta non attivabile: non deve sottrarre il focus al programma in uso.
function showMascot(window, platform = process.platform) {
  if (!window || window.isDestroyed()) return;
  window.showInactive();
  if (platform === 'win32') window.setAlwaysOnTop(true, 'screen-saver');
}

module.exports = { showMascot };
