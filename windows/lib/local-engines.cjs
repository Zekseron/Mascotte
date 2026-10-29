'use strict';
// Interfaccia comune dei motori locali. Ogni motore espone: id, label, capabilities, supportsVision(model), detect(), listModels(),
// checkModel(model) e chat({ messages, model, images, options, signal }). Ollama è il primo; gli altri sono server compatibili OpenAI
// già avviati dall'utente su questo computer (Mascotte non li avvia, non li chiude, non scarica modelli). Solo preset fissi, niente URL liberi.
const LocalAI = require('./local-ai.cjs');
const ollama = require('./engines/ollama.cjs');
const OpenAICompatible = require('./engines/openai-compatible.cjs');

// Porte predefinite (verificate sulla documentazione ufficiale il 28 ottobre 2026):
// LM Studio 1234 (lmstudio.ai/docs/developer/openai-compat), Jan 1337 (docs.jan.ai/desktop/api-server),
// llama.cpp server 9931 nel README attuale (github.com/ggml-org/llama.cpp, tools/server) e 8080 nelle versioni precedenti e negli esempi Docker.
const PRESETS = Object.freeze([
  { id: 'lmstudio', label: 'LM Studio', baseUrls: ['http://127.0.0.1:1234/v1'], nativeModels: '/api/v0/models' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrls: ['http://127.0.0.1:9931/v1', 'http://127.0.0.1:8080/v1'] },
  { id: 'jan', label: 'Jan', baseUrls: ['http://127.0.0.1:1337/v1'] }
]);
const IDS = Object.freeze(['ollama', ...PRESETS.map(preset => preset.id)]);
const registry = new Map();
const build = (preset = {}) => OpenAICompatible.create(preset);
function get(id) {
  if (!IDS.includes(id)) throw new Error('Motore locale non supportato.');
  if (id === 'ollama') return ollama;
  if (!registry.has(id)) registry.set(id, build(PRESETS.find(preset => preset.id === id)));
  return registry.get(id);
}
const isEngine = id => IDS.includes(id);
// Un valore salvato che non è un motore noto torna a Ollama, senza errori.
const normalizeEngine = id => isEngine(id) ? id : 'ollama';
const label = id => isEngine(id) ? get(id).label : 'Ollama';
// `engine` può essere un id oppure un oggetto motore (usato dai test con server finti).
const resolve = engine => typeof engine === 'string' ? get(engine) : engine;
const supportsVision = (engine, model, platform) => resolve(engine).supportsVision(model, platform);

// Rilevamento di tutti i motori, solo su richiesta (apertura delle Impostazioni o pulsante), mai a ogni messaggio.
// Per i motori compatibili OpenAI restituisce anche l'elenco dei modelli idonei e degli esclusi.
async function detectAll({ engines = IDS.map(get), signal } = {}) {
  return Promise.all(engines.map(async engine => {
    const status = await engine.detect({ signal });
    if (engine.id === 'ollama' || !status.available) return { id: engine.id, label: engine.label, ...status };
    try { const { models, excluded } = await engine.listModels({ signal }); return { id: engine.id, label: engine.label, ...status, count: models.length, models, excluded }; }
    catch (error) { if (error.name === 'AbortError') throw error; return { id: engine.id, label: engine.label, available: false, state: error.code === 'AUTH' ? 'auth' : error.code === 'UNRECOGNIZED' ? 'unrecognized' : 'error', count: 0, message: error.message.slice(0, 300) }; }
  }));
}

// Risposta del motore scelto: stessi messaggi di sistema (note, cartelle) e stessa cronologia per tutti. Ollama passa da runLocal, invariato.
function run(engine, history, prompt, memories, { port, platform, model, installed = false, imageBase64 = null, folderContext = null } = {}) {
  const selected = resolve(engine);
  if (selected.id === 'ollama') return LocalAI.runLocal(history, prompt, memories, { port, platform, model, installed, imageBase64, folderContext });
  const controller = new AbortController();
  const promise = selected.chat({ messages: LocalAI.buildMessages(history, prompt, memories, folderContext), model, images: imageBase64 ? [imageBase64] : [], options: { maxTokens: LocalAI.numPredict(platform) }, signal: controller.signal });
  return { promise, stop: () => controller.abort() };
}
module.exports = { IDS, PRESETS, get, isEngine, normalizeEngine, label, supportsVision, detectAll, run, create: build, localBase: OpenAICompatible.localBase };
