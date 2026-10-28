'use strict';
const fs = require('node:fs');
const path = require('node:path');
const HELPER_NAME = 'mascotte-window-helper';
// Helper Swift dell'aggancio: nel pacchetto sta in Contents/Resources (extraResources), da sorgente in resources/mac
// (compilato da scripts/mac-helper.cjs). Restituisce il primo percorso esistente, o il percorso di sviluppo.
function macHelperPath({ resourcesPath = process.resourcesPath, exists = fs.existsSync } = {}) {
  const dev = path.join(__dirname, '..', 'resources', 'mac', HELPER_NAME);
  const packaged = resourcesPath && path.join(resourcesPath, HELPER_NAME);
  return packaged && exists(packaged) ? packaged : dev;
}
// Capacità per piattaforma: un solo punto dove decidere cosa è attivo. Su macOS le funzioni dei passi 3–10
// del piano Mac restano spente finché non vengono portate e verificate.
function capabilities(platform = process.platform, { macHelper } = {}) {
  const win = platform === 'win32', mac = platform === 'darwin';
  return {
    windowAttach: win || (mac && (macHelper ?? fs.existsSync(macHelperPath()))), // aggancio alla finestra attiva (helper PowerShell; su Mac helper Swift, solo se compilato)
    managedOllama: win,    // avvio di ollama.exe gestito dall'app (su Mac si guida l'installazione: passo 5)
    localActions: win || mac, // azioni locali con conferma: Calcolatrice e cartella Download (Mac: passo 6)
    watch: win,            // osservazione e fotogrammi (passo 7)
    hooks: win,            // gestione hook Claude/Codex (passo 8)
    management: win,       // aggiornamenti dal pacchetto (passo 10)
    appMenu: mac,          // menu applicazione minimale (appMenu + editMenu): senza, Cmd+C/V/X/A/Z non arrivano ai campi di testo
    hideDock: mac,         // app da barra dei menu, senza icona nel Dock (come la vecchia app, LSUIElement)
    allSpaces: mac,        // mascotte visibile su tutte le scrivanie e sopra le app a tutto schermo (verifica completa: passo 3)
    deviceName: mac ? 'Mac' : 'PC',
    barLabel: mac ? 'Aggancia al Dock' : 'Aggancia alla barra delle applicazioni',
    barName: mac ? 'al Dock' : 'alla barra',
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
module.exports = { capabilities, dataDirectory, macHelperPath };
