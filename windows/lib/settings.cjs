'use strict';
// Normalizzazione delle impostazioni lette da settings.json: ogni campo ha un valore sicuro di ripiego.
// Funzione pura: le dipendenze esterne arrivano in ctx (moduli LocalEngines, LocalAI, ExtraFolders, Characters,
// AlarmSound, più platform, home e dataDir), così si prova senza Electron né disco.
// Grandezza e posizione della chat: solo numeri plausibili. La grandezza parte dai minimi della finestra (400×600);
// la posizione si controlla all'apertura contro gli schermi presenti.
function normalizeChat(chat) {
  if (!chat || typeof chat !== 'object') return {};
  const size = (value, min) => Number.isInteger(value) && value >= min && value <= 4000 ? value : undefined;
  const place = value => Number.isFinite(value) && Math.abs(value) <= 100000 ? Math.round(value) : undefined;
  const result = { width: size(chat.width, 400), height: size(chat.height, 600), x: place(chat.x), y: place(chat.y) };
  if (result.x === undefined || result.y === undefined) delete result.x, delete result.y;
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key];
  return result;
}
function normalizeSettings(raw, ctx) {
  const { LocalEngines, LocalAI, ExtraFolders, Characters, AlarmSound } = ctx;
  // Un file valido ma non oggetto (null, un elenco, un numero) vale come «nessuna impostazione salvata».
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  // Motore: un valore sconosciuto, o un modello di un altro motore senza nome valido, torna a Ollama e al predefinito.
  // Nessuna scelta salvata (prima installazione): su Windows il predefinito è llama.cpp gestito da Mascotte con il suo unico modello
  // (prove del 30 ottobre 2026: più veloce di Ollama con Vulkan e legge le immagini). Su Mac resta Ollama.
  if (raw.localEngine === undefined && ctx.platform === 'win32') raw = { ...raw, localEngine: LocalEngines.MANAGED, localModel: ctx.managedModel, localModelSource: 'installed' };
  let startEngine = LocalEngines.normalizeEngine(raw.localEngine);
  if (startEngine !== 'ollama' && !(raw.localModelSource === 'installed' && LocalAI.validName(raw.localModel))) startEngine = 'ollama';
  const startModel = startEngine === 'ollama' ? LocalAI.normalizeModel(raw.localModel, undefined, raw.localModelSource) : raw.localModel;
  return {scale:Characters.SCALES.includes(raw.scale)?raw.scale:6,scales:raw.scales&&typeof raw.scales==='object'?raw.scales:{},position:raw.position,attachment:raw.attachment==='bar'?'bar':'free',updateRepoPath:typeof raw.updateRepoPath==='string'?raw.updateRepoPath:'',localEngine:startEngine,localModel:startModel,localModelSource:startEngine==='ollama'&&LocalAI.isModel(startModel)?'catalog':'installed',extraFolders:ExtraFolders.normalizeExtraFolders(raw.extraFolders,ExtraFolders.realOpts({platform:ctx.platform,home:ctx.home,dataDir:ctx.dataDir})),alarmSound:raw.alarmSound==='custom'?'custom':'beep',alarmSoundName:typeof raw.alarmSoundName==='string'?raw.alarmSoundName.slice(0,120):'',alarmVolume:AlarmSound.normalizeVolume(raw.alarmVolume),chat:normalizeChat(raw.chat)};
}
module.exports = { normalizeSettings, normalizeChat };
