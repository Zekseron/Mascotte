'use strict';
// Controllo del motore locale all'avvio (ramo reale di main.cjs con dipendenze simulate).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
const start = source.indexOf('  function fallbackToDefault(reason) {');
const end = source.indexOf('  async function prepareLocal() {', start);
assert.ok(start > 0 && end > start);
function check(error, { supported = true } = {}) {
  const fail = (message, code) => Object.assign(new Error(message), { code });
  const managed = { checkModel: async () => { throw fail(error.message, error.code); }, status: () => ({ supported }) };
  const context = { settings: { localEngine: 'llamacpp-mascotte', localModel: 'gemma', localModelSource: 'installed' }, saves: 0,
    LocalEngines: { MANAGED: 'llamacpp-mascotte', get: () => managed },
    LocalAI: { defaultModel: () => 'predefinito', checkModel: async () => {}, isModel: () => true }, installedCache: null, localAvailable: true,
    modelOptions: () => ({}) };
  context.saveSettings = () => { context.saves++; };
  return vm.runInNewContext(`(async () => { ${source.slice(start, end)}; try { return { result: await checkSelected() }; } catch (error) { return { error }; } })()`, context)
    .then(outcome => ({ ...outcome, settings: context.settings, saves: context.saves }));
}
test('llama.cpp gestito da scaricare: la scelta resta e non si passa a Ollama', async () => {
  const out = await check({ message: 'non è pronto', code: 'NOT_READY' });
  assert.equal(out.error.code, 'NOT_READY'); assert.equal(out.settings.localEngine, 'llamacpp-mascotte'); assert.equal(out.saves, 0);
});
test('llama.cpp gestito non supportato su questo computer o in errore: si torna a Ollama', async () => {
  const unsupported = await check({ message: 'non disponibile', code: 'NOT_READY' }, { supported: false });
  assert.equal(unsupported.settings.localEngine, 'ollama'); assert.equal(unsupported.saves, 1);
  const broken = await check({ message: 'modello non valido', code: 'MODEL_INVALID' });
  assert.equal(broken.settings.localEngine, 'ollama');
});
