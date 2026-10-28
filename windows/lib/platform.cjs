'use strict';
const path = require('node:path');
// Capacità per piattaforma: un solo punto dove decidere cosa è attivo. Su macOS le funzioni dei passi 3–10
// del piano Mac restano spente finché non vengono portate e verificate.
function capabilities(platform = process.platform) {
  const win = platform === 'win32', mac = platform === 'darwin';
  return {
    windowAttach: win,     // aggancio alla finestra attiva (helper PowerShell; su Mac: passo 3)
    managedOllama: win,    // avvio di ollama.exe gestito dall'app (su Mac si guida l'installazione: passo 5)
    localActions: win,     // azioni locali con conferma (Calcolatrice, Download: passo 6)
    watch: win,            // osservazione e fotogrammi (passo 7)
    hooks: win,            // gestione hook Claude/Codex (passo 8)
    management: win,       // aggiornamenti dal pacchetto (passo 10)
    hideDock: mac,         // app da barra dei menu, senza icona nel Dock (come la vecchia app, LSUIElement)
    allSpaces: mac,        // mascotte visibile su tutte le scrivanie e sopra le app a tutto schermo (verifica completa: passo 3)
    gitGuide: mac ? 'https://git-scm.com/install/mac' : 'https://git-scm.com/install/windows',
    ollamaGuide: mac ? 'https://ollama.com/download/mac' : 'https://ollama.com/download/windows'
  };
}
function dataDirectory({ env = process.env, platform = process.platform, appData } = {}) {
  if (env.MASCOTTE_DATA_DIR || env.MASCOTTE_WINDOWS_DATA_DIR) return env.MASCOTTE_WINDOWS_DATA_DIR || env.MASCOTTE_DATA_DIR;
  if (platform === 'win32') return path.join(env.LOCALAPPDATA, 'Mascotte');
  // Su Mac mai in «Application Support/Mascotte»: è la cartella della vecchia app Swift (migrazione: passo 9).
  return path.join(appData, 'Mascotte Electron');
}
module.exports = { capabilities, dataDirectory };
