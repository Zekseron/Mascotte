'use strict';
const { contextBridge } = require('electron');
const snapshot = {
  engine: 'codex', messages: [{ role: 'user', text: 'Controlla il progetto e correggi il problema.' }], busy: true,
  available: ['codex', 'locale'], localEngine: 'ollama', localEngineLabel: 'Ollama', localModel: 'modello',
  localCatalog: { models: [], default: 'modello' }, localInstalled: [], localEngines: null, localManaged: {},
  deviceName: 'PC', memories: [], reminders: [], alarmSettings: { sound: 'beep', volume: 0.8 }, setup: null, notice: '', management: {}, watchAvailable: true,
  agent: { enabled: true, workspace: 'C:\\Progetti\\Esercizio', session: true, liveText: 'Ho individuato il problema. Verifico la correzione con i test.',
    events: [{ title: 'Modifiche ai file', detail: '--- esempio.cjs\n+++ esempio.cjs\n- risultato = undefined\n+ risultato = valore' }],
    requests: [{ id: 'qa', kind: 'approval', title: 'Eseguire il comando?', detail: 'Cartella: C:\\Progetti\\Esercizio\nComando: npm test\nMotivo: verificare la correzione.' }] }
};
contextBridge.exposeInMainWorld('mascotte', { invoke: async () => snapshot, onChat() {}, onWatchStop() {} });
