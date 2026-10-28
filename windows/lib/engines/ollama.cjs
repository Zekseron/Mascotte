'use strict';
// Motore Ollama: avvolge le funzioni esistenti di local-ai.cjs senza cambiarne il comportamento (catalogo, download, modelli già presenti,
// esclusione dei cloud, keep_alive, num_predict, think, avviso di risposta troncata).
const LocalAI = require('../local-ai.cjs');

module.exports = {
  id: 'ollama', label: 'Ollama',
  capabilities: { vision: 'per modello' },
  supportsVision: (model, platform) => LocalAI.supportsVision(model, platform),
  async detect({ port, signal } = {}) {
    try { const tags = await LocalAI.request('/api/tags', undefined, { port, signal, timeout: 1500 }); return { available: true, state: 'ready', count: Array.isArray(tags.models) ? tags.models.length : 0 }; }
    catch (error) { if (error.name === 'AbortError') throw error; return { available: false, state: error.code === 'ECONNREFUSED' ? 'absent' : 'error', count: 0, message: error.code === 'ECONNREFUSED' ? 'non avviato' : error.message.slice(0, 300) }; }
  },
  listModels: options => LocalAI.discoverInstalled(options),
  checkModel: (model, options = {}) => LocalAI.checkModel({ ...options, model }),
  chat: ({ messages, model, images = [], options = {}, signal } = {}) => LocalAI.chatOllama({ ...options, messages, model, imageBase64: images[0] || null, signal })
};
