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
// Capacità per piattaforma: un solo punto dove decidere cosa è attivo. Su macOS le funzioni si accendono passo dopo passo
// del piano Mac, man mano che vengono portate e verificate.
function capabilities(platform = process.platform, { macHelper } = {}) {
  const win = platform === 'win32', mac = platform === 'darwin';
  return {
    windowAttach: win || (mac && (macHelper ?? fs.existsSync(macHelperPath()))), // aggancio alla finestra attiva (helper PowerShell; su Mac helper Swift, solo se compilato)
    managedOllama: win,    // avvio di ollama.exe gestito dall'app (su Mac si guida l'installazione: passo 5)
    localActions: win || mac, // azioni locali con conferma: Calcolatrice e cartella Download (Mac: passo 6)
    watch: win || mac,     // osservazione e fotogrammi (Mac: passo 7, con permesso «Registrazione schermo»)
    hooks: win || mac,     // gestione hook Claude/Codex (Mac: passo 8, comando di shell al posto di PowerShell)
    management: win || mac, // aggiornamenti da release e da sorgenti (Mac: passo 10, installazione in /Applications)
    appMenu: mac,          // menu applicazione minimale (appMenu + editMenu): senza, Cmd+C/V/X/A/Z non arrivano ai campi di testo
    hideDock: mac,         // app da barra dei menu, senza icona nel Dock (come la vecchia app, LSUIElement)
    allSpaces: mac,        // mascotte visibile su tutte le scrivanie e sopra le app a tutto schermo (verifica completa: passo 3)
    deviceName: mac ? 'Mac' : 'PC',
    packageName: mac ? 'Mac' : 'Windows', // nome del pacchetto negli aggiornamenti
    barLabel: mac ? 'Aggancia al Dock' : 'Aggancia alla barra delle applicazioni',
    barName: mac ? 'al Dock' : 'alla barra',
    gitGuide: mac ? 'https://git-scm.com/install/mac' : 'https://git-scm.com/install/windows',
    nodeGuide: 'https://nodejs.org/en/download',
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
