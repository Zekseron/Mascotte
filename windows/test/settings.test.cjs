'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LocalAI = require('../lib/local-ai.cjs'), LocalEngines = require('../lib/local-engines.cjs');
const ExtraFolders = require('../lib/extra-folders.cjs'), Characters = require('../lib/characters.cjs'), AlarmSound = require('../lib/alarm-sound.cjs');
const { normalizeSettings } = require('../lib/settings.cjs');

// Funzione di riferimento: copia TESTUALE dell'espressione che stava in main.cjs (whenReady) prima dell'estrazione
// in lib/settings.cjs, con le stesse dipendenze. Il test confronta la nuova funzione con questa su molti casi.
function reference(raw, dataDirectory) {
  let startEngine = LocalEngines.normalizeEngine(raw.localEngine);
  if (startEngine !== 'ollama' && !(raw.localModelSource === 'installed' && LocalAI.validName(raw.localModel))) startEngine = 'ollama';
  const startModel = startEngine === 'ollama' ? LocalAI.normalizeModel(raw.localModel, undefined, raw.localModelSource) : raw.localModel;
  const settings = {scale:Characters.SCALES.includes(raw.scale)?raw.scale:6,scales:raw.scales&&typeof raw.scales==='object'?raw.scales:{},position:raw.position,attachment:raw.attachment==='bar'?'bar':'free',updateRepoPath:typeof raw.updateRepoPath==='string'?raw.updateRepoPath:'',localEngine:startEngine,localModel:startModel,localModelSource:startEngine==='ollama'&&LocalAI.isModel(startModel)?'catalog':'installed',extraFolders:ExtraFolders.normalizeExtraFolders(raw.extraFolders,ExtraFolders.realOpts({platform:process.platform,home:os.homedir(),dataDir:dataDirectory})),alarmSound:raw.alarmSound==='custom'?'custom':'beep',alarmSoundName:typeof raw.alarmSoundName==='string'?raw.alarmSoundName.slice(0,120):'',alarmVolume:AlarmSound.normalizeVolume(raw.alarmVolume)};
  return settings;
}

test('normalizeSettings uguale all’espressione originale su molti casi', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-settings-'));
  const dataDir = path.join(base, 'dati'); fs.mkdirSync(dataDir);
  const good = path.join(base, 'cartella-buona'); fs.mkdirSync(good);
  const good2 = path.join(base, 'altra'); fs.mkdirSync(good2);
  const ctx = { LocalEngines, LocalAI, ExtraFolders, Characters, AlarmSound, platform: process.platform, home: os.homedir(), dataDir };
  const catalogModel = LocalAI.defaultModel();
  const cases = [
    {}, { scale: 6 }, { scale: Characters.SCALES[0] }, { scale: 7 }, { scale: '6' }, { scale: null },
    { scales: { a: 1 } }, { scales: 'x' }, { scales: null }, { scales: [1, 2] },
    { position: { x: 1, y: 2 } }, { position: 'boh' },
    { attachment: 'bar' }, { attachment: 'altro' },
    { updateRepoPath: '/tmp/repo' }, { updateRepoPath: 5 },
    { localEngine: 'ollama', localModel: catalogModel },
    { localEngine: 'ollama', localModel: 'modello-fuori-catalogo:1b' },
    { localEngine: 'ollama', localModel: 'modello-fuori-catalogo:1b', localModelSource: 'installed' },
    { localEngine: 'ollama', localModel: 'modello-fuori-catalogo:1b', localModelSource: 'catalog' },
    { localEngine: 'ollama', localModel: 12, localModelSource: 'installed' },
    { localEngine: 'ollama', localModel: 'no spazi!', localModelSource: 'installed' },
    { localEngine: 'sconosciuto', localModel: 'x', localModelSource: 'installed' },
    { localEngine: 'lmstudio' }, { localEngine: 'lmstudio', localModel: 'qwen3:4b' },
    { localEngine: 'lmstudio', localModel: 'qwen3:4b', localModelSource: 'installed' },
    { localEngine: 'lmstudio', localModel: 'no spazi!', localModelSource: 'installed' },
    { localEngine: 'llamacpp', localModel: 'a.gguf', localModelSource: 'installed' },
    { localEngine: 'llamacpp', localModel: 'a.gguf', localModelSource: 'catalog' },
    { localEngine: 'llamacpp-gestito', localModel: catalogModel, localModelSource: 'installed' },
    { localEngine: null, localModel: null }, { localEngine: 3 },
    { extraFolders: [{ name: 'buona', path: good }] },
    { extraFolders: [{ name: 'buona', path: good }, { name: 'altra', path: good2 }, { name: 'buona', path: good }] },
    { extraFolders: [{ name: 'x', path: path.join(base, 'non-esiste') }, { path: good }, null, 5, { path: 7 }] },
    { extraFolders: [{ name: 'root', path: '/' }, { name: 'sys', path: '/System' }] },
    { extraFolders: 'non un array' }, { extraFolders: null }, { extraFolders: {} },
    { alarmSound: 'custom' }, { alarmSound: 'sconosciuto' }, { alarmSound: 3 },
    { alarmSoundName: 'a'.repeat(300) }, { alarmSoundName: 'suono.mp3' }, { alarmSoundName: 12 },
    { alarmVolume: 0 }, { alarmVolume: 0.5 }, { alarmVolume: 1 }, { alarmVolume: 1.5 }, { alarmVolume: -1 }, { alarmVolume: 'x' }, { alarmVolume: NaN }, { alarmVolume: null },
    { campoInPiu: 1, altro: { b: 2 }, scale: 6 },
    { scale: 9, scales: { x: 1 }, position: { x: 3 }, attachment: 'bar', updateRepoPath: 'r', localEngine: 'ollama', localModel: catalogModel, alarmSound: 'custom', alarmSoundName: 'n', alarmVolume: 0.3, extraFolders: [{ name: 'buona', path: good }] },
  ];
  assert.ok(cases.length >= 15);
  for (const raw of cases) {
    const expected = reference(JSON.parse(JSON.stringify(raw)), dataDir), actual = normalizeSettings(JSON.parse(JSON.stringify(raw)), ctx);
    assert.deepEqual(actual, expected, JSON.stringify(raw));
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'stesso ordine dei campi: ' + JSON.stringify(raw));
  }
  // Su impostazioni vuote: stessi default noti.
  const empty = normalizeSettings({}, ctx);
  assert.equal(empty.scale, 6); assert.equal(empty.localEngine, 'ollama'); assert.equal(empty.alarmSound, 'beep'); assert.equal(empty.attachment, 'free');
  fs.rmSync(base, { recursive: true, force: true });
});
