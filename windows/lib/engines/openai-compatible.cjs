'use strict';
// Motore locale con API compatibile OpenAI (LM Studio, llama.cpp server, Jan). Solo server già avviati dall'utente su questo computer:
// Mascotte non li avvia, non li chiude e non scarica modelli. Nessuna chiave API, nessun redirect, solo loopback.
const http = require('node:http');
const LocalAI = require('../local-ai.cjs');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX_BYTES = 2 * 1024 * 1024, DETECT_TIMEOUT = 1500, LIST_TIMEOUT = 3000, CHAT_TIMEOUT = 180000, MAX_MODELS = 60;
const MAX_IMAGE = 11000000, TEMPERATURE = 0.4;

// Costruisce l'unico tipo di URL ammesso: http://<loopback>:<porta>/v1. Qualsiasi altro host, schema, credenziale o percorso viene rifiutato.
function localBase(baseUrl) {
  let url; try { url = new URL(baseUrl); } catch { throw new Error('Indirizzo del motore locale non valido.'); }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || !url.port || url.pathname !== '/v1' || url.search || url.hash)
    throw new Error('Mascotte si collega solo a server sul computer (127.0.0.1, localhost o [::1]).');
  return { hostname: url.hostname === '[::1]' ? '::1' : url.hostname, port: Number(url.port), prefix: '/v1' };
}
const fail = (message, code) => Object.assign(new Error(message), { code });

// Segnali di un modello remoto o di un proxy verso un servizio online. Il controllo è euristico: nel dubbio si esclude.
const REMOTE_NAME = /gpt-?[345]|chatgpt|(?:^|[\/:._-])o[134](?:-|$)|claude|gemini|openrouter|(?:^|[\/:._-])(?:openai|anthropic|azure|bedrock|vertex)(?:[\/:._-]|$)|cloud|remote/i;
const REMOTE_OWNER = /openai|anthropic|openrouter|azure|bedrock|vertex|cloud|remote|proxy/i;
const EMBEDDING_NAME = /(?:^|[\/:._-])(?:text-)?embed(?:ding)?s?(?:[\/:._-]|$)/i;
// `native` (facoltativo, solo LM Studio): voce dell'elenco nativo /api/v0/models con `type` e `max_context_length`.
function classify(item, label, native) {
  const name = item?.id;
  if (!LocalAI.validName(name)) return { ok: false, reason: 'nome del modello non valido' };
  if (REMOTE_NAME.test(name) || REMOTE_OWNER.test(String(item.owned_by || '')) || item.remote || item.remote_host || item.remote_model || item.proxy)
    return { ok: false, cloud: true, reason: `potrebbe essere un modello remoto o un proxy verso un servizio online (controllo per nome, euristico): ${label} potrebbe inviare i dati fuori dal computer` };
  if (EMBEDDING_NAME.test(name) || /^embedding/i.test(String(native?.type || item.type || ''))) return { ok: false, reason: 'modello per gli embedding, non per la chat' };
  if (native && !['llm', 'vlm'].includes(native.type)) return { ok: false, reason: 'non è un modello per la chat' };
  // Modelli interni di LM Studio (per esempio phonon): compaiono nell'elenco ma non hanno una lunghezza di contesto.
  if (native && !(Number(native.max_context_length) > 0)) return { ok: false, reason: `modello interno di ${label}, non adatto alla chat` };
  const modalities = item.architecture?.input_modalities;
  const vision = native?.type === 'vlm' || (Array.isArray(modalities) && modalities.includes('image')) || (Array.isArray(item.capabilities) && item.capabilities.includes('vision'));
  const size = Number(item.meta?.size ?? item.size ?? item.size_bytes);
  return { ok: true, vision, size: size > 0 ? size : 0 };
}

// `assumeVision` (solo per il motore gestito da Mascotte, che carica lui stesso il proiettore delle immagini): nomi di modelli con visione garantita.
// `chatOptions`: campi in più per /chat/completions, solo per il motore gestito (gli altri server ricevono la richiesta standard).
function create({ id, label, baseUrls, nativeModels, platform = process.platform, totalMemory, assumeVision = [], chatOptions = {} }) {
  const bases = baseUrls.map(localBase);
  const vision = new Map();
  let active = null;
  function call(base, endpoint, body, { signal, timeout = LIST_TIMEOUT, native = false } = {}) {
    return new Promise((resolve, reject) => {
      const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = http.request({ hostname: base.hostname, port: base.port, path: native ? endpoint : base.prefix + endpoint, method: encoded ? 'POST' : 'GET', signal, agent: false,
        headers: encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {} }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > MAX_BYTES) { response.destroy(fail('Risposta locale troppo grande.', 'TOO_BIG')); return; } chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => {
          const status = response.statusCode;
          if (status === 401 || status === 403) { reject(fail(`${label} richiede una chiave di accesso (API key): Mascotte non la gestisce. Disattiva l’autenticazione del server locale per usarlo qui.`, 'AUTH')); return; }
          if (status >= 300 && status < 400) { reject(fail(`Il server sulla porta ${base.port} ha risposto con un reindirizzamento: non viene seguito.`, 'UNRECOGNIZED')); return; }
          let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reject(fail(`Il server sulla porta ${base.port} non è stato riconosciuto come ${label}.`, 'UNRECOGNIZED')); return; }
          if (status !== 200) { reject(fail(typeof value?.error === 'string' ? value.error.slice(0, 300) : typeof value?.error?.message === 'string' ? value.error.message.slice(0, 300) : `${label} ha risposto con errore ${status}.`, 'HTTP')); return; }
          resolve(value);
        });
      });
      req.setTimeout(timeout, () => req.destroy(fail('Tempo di risposta locale scaduto.', 'TIMEOUT')));
      req.on('error', error => { if (error.code === 'ECONNREFUSED') reject(fail(`${label} non è avviato: avvia il server locale da ${label}, Mascotte non lo avvia.`, 'ECONNREFUSED')); else reject(error); });
      req.end(encoded);
    });
  }
  // Elenco nativo facoltativo (LM Studio /api/v0/models): tipo del modello e contesto. Se manca o non risponde si usa solo /v1/models.
  async function nativeInfo(base, options) {
    if (!nativeModels) return null;
    try {
      const value = await call(base, nativeModels, undefined, { ...options, timeout: DETECT_TIMEOUT, native: true });
      if (!Array.isArray(value?.data)) return null;
      return new Map(value.data.filter(item => typeof item?.id === 'string').map(item => [item.id, item]));
    } catch (error) { if (error.name === 'AbortError') throw error; return null; }
  }
  // Prova le porte predefinite in ordine; vale la prima che risponde con JSON { data: [...] }.
  async function resolve(options = {}) {
    let best = null;
    for (const base of bases) {
      try {
        const value = await call(base, '/models', undefined, { timeout: DETECT_TIMEOUT, ...options });
        if (!Array.isArray(value?.data)) throw fail(`Il server sulla porta ${base.port} non è stato riconosciuto come ${label}.`, 'UNRECOGNIZED');
        active = base; return { base, data: value.data, native: await nativeInfo(base, options) };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        if (!best || (best.code === 'ECONNREFUSED' && error.code !== 'ECONNREFUSED')) best = error;
      }
    }
    active = null; throw best;
  }
  function sort(data, native) {
    const models = [], excluded = [];
    for (const item of data.slice(0, MAX_MODELS)) {
      const verdict = classify(item, label, native?.get(item?.id)), name = typeof item?.id === 'string' ? item.id.slice(0, 80) : '?';
      if (!verdict.ok) { vision.delete(item?.id); excluded.push({ name, reason: verdict.reason, cloud: Boolean(verdict.cloud) }); continue; }
      const seesImages = Boolean(verdict.vision || assumeVision.includes(item.id));
      vision.set(item.id, seesImages);
      models.push({ name: item.id, size: verdict.size, vision: seesImages, warning: verdict.size ? LocalAI.memoryWarning(verdict.size, platform, totalMemory) : '' });
    }
    return { models, excluded };
  }
  return {
    id, label,
    // Visione solo se dichiarata dal server (architecture.input_modalities con «image» o capabilities con «vision»): altrimenti si considera assente.
    capabilities: { vision: 'dichiarata dal server' },
    supportsVision: model => Boolean(vision.get(model)),
    async detect(options) {
      try { const { base, data, native } = await resolve(options); const { models } = sort(data, native); return { available: true, state: 'ready', count: models.length, port: base.port }; }
      catch (error) { if (error.name === 'AbortError') throw error; return { available: false, state: error.code === 'ECONNREFUSED' ? 'absent' : error.code === 'AUTH' ? 'auth' : error.code === 'UNRECOGNIZED' ? 'unrecognized' : 'error', count: 0, message: error.code === 'ECONNREFUSED' ? 'non avviato' : error.message.slice(0, 300) }; }
    },
    async listModels(options) { const { data, native } = await resolve({ timeout: LIST_TIMEOUT, ...options }); return sort(data, native); },
    // Il modello scelto deve comparire nell'elenco appena restituito dal server (mai testo libero) e non essere escluso.
    async checkModel(model, options) {
      if (!LocalAI.validName(model)) throw fail('Nome del modello non valido.', 'MODEL_INVALID');
      const { models } = await this.listModels(options);
      if (!models.some(item => item.name === model)) throw fail(`Il modello ${model} non è più disponibile in ${label} o non è idoneo.`, 'MODEL_INVALID');
      return true;
    },
    async chat({ messages, model, images = [], options = {}, signal } = {}) {
      if (images.length && (!vision.get(model) || images.some(image => typeof image !== 'string' || image.length > MAX_IMAGE || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)))) throw new Error(`Immagine non valida: ${label} non dichiara il supporto alle immagini per questo modello.`);
      await this.checkModel(model, { signal });
      if (images.length && !vision.get(model)) throw new Error('Immagine non valida o modello solo testuale.');
      const sent = images.length ? messages.map((item, index) => index === messages.length - 1 ? { role: item.role, content: [{ type: 'text', text: item.content }, ...images.map(image => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + image } }))] } : item) : messages;
      const result = await call(active, '/chat/completions', { ...chatOptions, model, messages: sent, stream: false, max_tokens: options.maxTokens ?? LocalAI.numPredict(platform), temperature: TEMPERATURE }, { signal, timeout: CHAT_TIMEOUT });
      const choice = result?.choices?.[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '') : '';
      if (!text.trim()) throw new Error('Risposta locale incompleta.');
      return text.slice(0, 100000) + (choice.finish_reason === 'length' ? LocalAI.TRUNCATED : '');
    }
  };
}
module.exports = { create, localBase, classify, LOOPBACK };
