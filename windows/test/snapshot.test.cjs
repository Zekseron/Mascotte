'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LocalAI = require('../lib/local-ai.cjs');
const RealLocalEngines = require('../lib/local-engines.cjs');
const FolderView = require('../lib/folder-view.cjs');
const Reminders = require('../lib/reminders.cjs'), Characters = require('../lib/characters.cjs'), ExtraFolders = require('../lib/extra-folders.cjs');
const { buildChatSnapshot } = require('../lib/snapshot.cjs');

// Il riferimento è l'espressione ORIGINALE di chatSnapshot (copia testuale da main.cjs prima dell'estrazione in
// lib/snapshot.cjs): legge le stesse variabili di main tramite `env`. Il test la confronta con la nuova coppia
// raccolta + costruzione, su vari stati finti.
function reference(env) {
  const { engine, store, currentRun, localDownload, localDownloadStatus, notice, CLI, localAvailable, settings, LocalEngines, localVision, engineStatus, installedCache, localScanning, can, memory, pendingAction, setupPreview, reminders, activeAlarm, lastFrame, watchSource, pack, characters, characterWarnings, characterStatus, characterStatusFailed, app, hooksState, updateRunning, updateStatus, updateFailed, folderStatus, folderStatusFailed } = env;
  const chatSnapshot = () => ({ engine, messages: store.get(engine), busy: Boolean(currentRun || localDownload), localDownloading: Boolean(localDownload), localDownloadStatus, notice, available: [...CLI.ENGINES.filter(e => CLI.findCLI(e)), ...(localAvailable ? ['locale'] : [])], localModel: settings?.localModel || LocalAI.defaultModel(), localInstalledSource: !LocalAI.isModel(settings?.localModel), localVision: localVision(), localEngine: settings?.localEngine || 'ollama', localEngineLabel: LocalEngines.label(settings?.localEngine), localManaged: LocalEngines.get(LocalEngines.MANAGED).status(), localEngines: engineStatus ? engineStatus.map(({ id, label, state, count, message }) => ({ id, label, state, count, message: message || '' })) : null, localEngineModels: settings?.localEngine && settings.localEngine !== 'ollama' ? engineStatus?.find(item => item.id === settings.localEngine) || null : null, localCatalog: LocalAI.uiCatalog(), localInstalled: installedCache, localScanning, deviceName: can.deviceName, memories: memory.list(), pendingAction: pendingAction && { id: pendingAction.id, description: pendingAction.description }, setup: setupPreview ? { claude: setupPreview.after.claude, codex: setupPreview.after.codex } : null, alarmSettings: { sound: settings?.alarmSound || 'beep', name: settings?.alarmSoundName || '', volume: settings?.alarmVolume ?? 0.8 }, reminders: reminders ? reminders.list().map((item, index) => ({ id: item.id, index: index + 1, text: item.text, when: Reminders.formatWhen(item.when), alarm: item.alarm })) : [], alarm: activeAlarm && { text: activeAlarm.text, time: new Date(activeAlarm.when).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }, secondOpinionFrame: lastFrame && { name: lastFrame.name, message: lastFrame.message, reply: lastFrame.reply, expiresAt: lastFrame.expiresAt }, watchAvailable: can.watch, hooksAvailable: can.hooks && app.isPackaged, watching: Boolean(watchSource), watchName: watchSource?.name || '', characters: pack ? { current: pack.id, scale: settings?.scale, scales: Characters.allowedScales(pack), list: characters.map(c => ({ id: c.id, name: c.name, category: c.category, personal: c.personal })), warnings: characterWarnings, max: Characters.MAX_PERSONAL, status: characterStatus, failed: characterStatusFailed } : null, management: { available: can.management && app.isPackaged, packageName: can.packageName, version: app.getVersion(), repoPath: settings?.updateRepoPath || '', hooks: hooksState(), running: updateRunning, status: updateStatus, failed: updateFailed, folders: { defaults: FolderView.viewableFolders().map(folder => ({ name: folder.display, path: folder.target })), extra: (settings?.extraFolders || []).map(folder => ({ name: folder.name, path: folder.path })), max: ExtraFolders.MAX_EXTRA, status: folderStatus, failed: folderStatusFailed } } });
  return chatSnapshot();
}

// Specchio della raccolta fatta da chatState in main.cjs (stesse chiamate, stesso ordine di lettura).
function collect(env) {
  const { engine, store, currentRun, localDownload, localDownloadStatus, notice, CLI, localAvailable, settings, LocalEngines, localVision, engineStatus, installedCache, localScanning, can, memory, pendingAction, setupPreview, reminders, activeAlarm, lastFrame, watchSource, pack, characters, characterWarnings, characterStatus, characterStatusFailed, app, hooksState, updateRunning, updateStatus, updateFailed, folderStatus, folderStatusFailed } = env;
  return {
    engine, messages: store.get(engine), currentRun, localDownload, localDownloadStatus, notice, localAvailable, settings,
    cliEngines: CLI.ENGINES.filter(e => CLI.findCLI(e)), defaultModel: LocalAI.defaultModel(), localInstalledSource: !LocalAI.isModel(settings?.localModel), localVision: localVision(),
    localEngineLabel: LocalEngines.label(settings?.localEngine), localManaged: LocalEngines.get(LocalEngines.MANAGED).status(), engineStatus, localCatalog: LocalAI.uiCatalog(), installedCache, localScanning,
    deviceName: can.deviceName, memories: memory.list(), pendingAction, setupPreview, reminders: reminders ? reminders.list() : null, activeAlarm, lastFrame, watchAvailable: can.watch,
    hooksAvailable: can.hooks && app.isPackaged, watchSource, pack, characters, characterWarnings, characterStatus, characterStatusFailed,
    managementAvailable: can.management && app.isPackaged, packageName: can.packageName, version: app.getVersion(), hooks: hooksState(), updateRunning, updateStatus, updateFailed,
    viewableFolders: FolderView.viewableFolders(), folderStatus, folderStatusFailed
  };
}

const LocalEngines = { MANAGED: RealLocalEngines.MANAGED, label: RealLocalEngines.label, get: () => ({ status: () => ({ complete: true, state: 'ready', bytes: 5 }) }) };
const when = Date.now() + 3600e3;
function make(over = {}) {
  const base = {
    engine: 'codex', store: { get: engine => [{ role: 'user', text: 'ciao ' + engine }] }, currentRun: null, localDownload: null, localDownloadStatus: '', notice: '',
    CLI: { ENGINES: ['codex', 'claude'], findCLI: e => e === 'codex' ? '/usr/bin/codex' : null }, localAvailable: false,
    settings: { scale: 6, scales: {}, localEngine: 'ollama', localModel: LocalAI.defaultModel(), alarmSound: 'beep', alarmSoundName: '', alarmVolume: 0.8, updateRepoPath: '', extraFolders: [] },
    LocalEngines, localVision: () => true, engineStatus: null, installedCache: null, localScanning: false,
    can: { deviceName: 'Mac', watch: true, hooks: true, management: true, packageName: 'Mascotte.app' }, memory: { list: () => [{ id: 'm1', text: 'nota' }] },
    pendingAction: null, setupPreview: null, reminders: null, activeAlarm: null, lastFrame: null, watchSource: null, pack: null, characters: [],
    characterWarnings: [], characterStatus: '', characterStatusFailed: false, app: { isPackaged: true, getVersion: () => '1.2.3' }, hooksState: () => ({ claude: true, codex: false }),
    updateRunning: false, updateStatus: '', updateFailed: false, folderStatus: '', folderStatusFailed: false
  };
  return { ...base, ...over, can: { ...base.can, ...over.can }, settings: over.settings === undefined ? base.settings : over.settings, app: { ...base.app, ...over.app } };
}
const p = { id: 'gatto', frame: { width: 600, height: 400 }, pixelRatio: 2 };
const scenarios = {
  'vuoto Codex': make(),
  'chat locale con modello catalogo': make({ engine: 'locale', localAvailable: true }),
  'chat locale remota (motore non Ollama)': make({ engine: 'locale', localAvailable: true, settings: { ...make().settings, localEngine: 'lmstudio', localModel: 'qwen3:4b', alarmVolume: 0 },
    engineStatus: [{ id: 'ollama', label: 'Ollama', state: 'off', count: 0 }, { id: 'lmstudio', label: 'LM Studio', state: 'ready', count: 2, message: 'ok', models: ['a'] }], localVision: () => false }),
  'motore gestito e catalogo fuori elenco': make({ localAvailable: true, settings: { ...make().settings, localEngine: 'llamacpp-mascotte', localModel: 'x.gguf' }, engineStatus: [{ id: 'llamacpp-mascotte', label: 'llama.cpp', state: 'ready', count: 1 }], installedCache: [{ name: 'x' }], localScanning: true }),
  'download in corso': make({ localDownload: { abort() {} }, localDownloadStatus: 'Scarico 40%', notice: 'Attendi' }),
  'esecuzione in corso': make({ currentRun: { child: 1 }, notice: 'avviso' }),
  'osservazione attiva e azione in attesa': make({ watchSource: { name: 'Finestra' }, pendingAction: { id: 'a1', description: 'Apri Safari', extra: 'non deve passare' } }),
  'sveglia attiva e promemoria': make({ reminders: { list: () => [{ id: 'r1', text: 'latte', when, alarm: false }, { id: 'r2', text: 'sveglia', when: when + 5e6, alarm: true }] }, activeAlarm: { id: 'r2', text: 'sveglia', when } }),
  'promemoria vuoti': make({ reminders: { list: () => [] } }),
  'setup aperto': make({ setupPreview: { after: { claude: 'cl', codex: 'cx' }, before: {} } }),
  'secondo parere': make({ lastFrame: { name: 'f.png', message: 'm', reply: 'r', expiresAt: 123, bytes: Buffer.from('a') } }),
  'personaggi': make({ pack: p, characters: [{ id: 'gatto', name: 'Gatto', category: 'animali', personal: false, extra: 1 }, { id: 'mio', name: 'Mio', category: 'personali', personal: true }], characterWarnings: ['w'], characterStatus: 'ok', characterStatusFailed: true }),
  'personaggio grande (scale ridotte)': make({ pack: { id: 'drago', frame: { width: 900, height: 700 }, pixelRatio: 1 }, characters: [{ id: 'drago', name: 'Drago', category: 'fantasia', personal: false }] }),
  'Windows senza management': make({ can: { deviceName: 'PC', watch: false, hooks: false, management: false, packageName: undefined }, app: { isPackaged: false } }),
  'management non confezionata': make({ app: { isPackaged: false } }),
  'aggiornamento in corso': make({ updateRunning: true, updateStatus: 'Scarico', updateFailed: true, settings: { ...make().settings, updateRepoPath: '/r' } }),
  'cartelle extra e stato': make({ settings: { ...make().settings, extraFolders: [{ name: 'Lavoro', path: '/Users/x/Lavoro', nascosto: 1 }] }, folderStatus: 'Aggiunta', folderStatusFailed: true }),
  'impostazioni mancanti': make({ settings: undefined }),
  'suono personalizzato': make({ settings: { ...make().settings, alarmSound: 'custom', alarmSoundName: 'drin.mp3', alarmVolume: 0.3, scale: 8 } }),
};

test('buildChatSnapshot(raccolta) è identico all’espressione originale su vari stati', () => {
  assert.ok(Object.keys(scenarios).length >= 15);
  for (const [name, env] of Object.entries(scenarios)) {
    const expected = reference(env), actual = buildChatSnapshot(collect(env));
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), name);
    assert.deepEqual(actual, expected, name);
  }
});

test('buildChatSnapshot è pura: non modifica lo stato e non ha bisogno di motori', () => {
  const state = collect(scenarios['sveglia attiva e promemoria']);
  const before = JSON.stringify(state);
  const a = buildChatSnapshot(state), b = buildChatSnapshot(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
