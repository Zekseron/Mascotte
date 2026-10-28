'use strict';
// Importazione una tantum dalla vecchia app Swift per Mac (passo 9 del piano Mac).
// Sola lettura: la cartella «Application Support/Mascotte» e le preferenze `local.mascotte.app` non vengono mai modificate,
// così la vecchia app resta utilizzabile e i suoi dati fanno da copia di recupero.
// Si importa solo al primo avvio della nuova app (nessun settings.json) e una sola volta (file legacy-import.json).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readJSON, atomicJSON } = require('./storage.cjs');

const LEGACY_DOMAIN = 'local.mascotte.app';
const MAX_HISTORY = 4 * 1024 * 1024, MAX_MESSAGES = 60, MAX_TEXT = 8000;
const legacyDirectory = (home = os.homedir()) => path.join(home, 'Library', 'Application Support', 'Mascotte');

// Preferenze della vecchia app (UserDefaults) lette con `defaults export` in JSON tramite plutil. Errori: nessuna preferenza.
function readLegacyDefaults(run = execFileSync) {
  try {
    const plist = run('/usr/bin/defaults', ['export', LEGACY_DOMAIN, '-'], { timeout: 3000, maxBuffer: 1024 * 1024 });
    const json = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: plist, timeout: 3000, maxBuffer: 1024 * 1024 });
    const value = JSON.parse(json.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

// Cronologia Swift: { codex: { sessionID, messages: [{ role, text }] }, claude: … }. Si tengono solo user/assistant.
function readLegacyHistory(directory) {
  const file = path.join(directory, 'chat', 'history.json');
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_HISTORY) return {};
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = {};
    for (const engine of ['codex', 'claude']) {
      const messages = Array.isArray(value?.[engine]?.messages) ? value[engine].messages : [];
      const kept = messages.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.text === 'string' && m.text.trim())
        .slice(-MAX_MESSAGES).map(m => ({ role: m.role, text: m.text.slice(0, MAX_TEXT) }));
      if (kept.length) out[engine] = kept;
    }
    return out;
  } catch { return {}; }
}

// Funzione pura: dalle preferenze Swift alle impostazioni della nuova app. Posizione (coordinate Cocoa) e motore della chat
// non vengono importati; il personaggio solo se esiste anche nella nuova app.
function mapSettings(defaults, characters = []) {
  const settings = {}, character = defaults['mascotte.characterID'];
  if (defaults['mascotte.dockAttachment'] === true || defaults['mascotte.dockAttachment'] === 1) settings.attachment = 'bar';
  const valid = value => [1, 2, 3, 4, 5, 6].includes(value);
  if (valid(defaults['mascotte.scale'])) settings.scale = defaults['mascotte.scale'];
  if (typeof character === 'string' && characters.includes(character)) {
    settings.character = character;
    const scale = defaults['mascotte.characterScales']?.[character];
    if (valid(scale)) settings.scales = { [character]: scale };
  }
  return settings;
}

// Restituisce un riepilogo di ciò che è stato importato, oppure null se non c'era nulla da fare.
function importLegacy(dataDirectory, { platform = process.platform, home = os.homedir(), characters = [], readDefaults = readLegacyDefaults } = {}) {
  if (platform !== 'darwin') return null;
  const marker = path.join(dataDirectory, 'legacy-import.json'), settingsFile = path.join(dataDirectory, 'settings.json');
  if (fs.existsSync(marker) || fs.existsSync(settingsFile)) return null;
  const source = legacyDirectory(home);
  const hasFolder = fs.existsSync(source), defaults = readDefaults();
  if (!hasFolder && !Object.keys(defaults).length) return null;
  const settings = mapSettings(defaults, characters), history = hasFolder ? readLegacyHistory(source) : {};
  const summary = { date: new Date().toISOString(), source, settings: Object.keys(settings), messages: Object.fromEntries(Object.entries(history).map(([k, v]) => [k, v.length])) };
  if (Object.keys(history).length) {
    const chatFile = path.join(dataDirectory, 'chat', 'history.json');
    if (!fs.existsSync(chatFile)) { fs.mkdirSync(path.dirname(chatFile), { recursive: true, mode: 0o700 }); atomicJSON(chatFile, history); }
    else summary.messages = {};
  }
  if (Object.keys(settings).length) atomicJSON(settingsFile, settings);
  atomicJSON(marker, summary);
  return summary;
}

module.exports = { importLegacy, mapSettings, readLegacyHistory, readLegacyDefaults, legacyDirectory };
