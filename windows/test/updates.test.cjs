'use strict';
// Aggiornamenti dall'app (lib/updates.cjs) con release, installatore, finestre e chiusura simulati.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdates } = require('../lib/updates.cjs');

// Attende una condizione con un tempo reale: download, estrazione e cancellazioni finti finiscono subito, ma la
// pulizia della cartella di lavoro è un'operazione vera sul disco (su Windows può richiedere più tempo).
async function waitFor(condition, what, ms = 5000) {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`attesa scaduta: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function setup(overrides = {}) {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-aggiornamenti-'));
  const log = { statuses: [], confirms: [], installers: [], quit: 0, downloads: [], signals: [] };
  let repoPath = overrides.repoPath ?? '';
  const Releases = {
    latestRelease: async signal => { log.signals.push(signal); if (overrides.latestFails) throw new Error('GitHub non raggiungibile'); return { version: overrides.latest ?? '0.9.9' }; },
    compareVersions: (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    repositoryContaining: () => null,
    downloadRelease: async (release, work) => { log.downloads.push(work); if (overrides.downloadFails) throw new Error('impronta SHA-256 diversa'); return path.join(work, 'pacchetto.zip'); },
    extractRuntime: async (archive, work) => path.join(work, 'Mascotte.app'),
  };
  const Updater = {
    currentLocation: () => overrides.currentLocation ?? '/Applications/Mascotte.app',
    installationDirectory: () => '/Applications/Mascotte.app',
    launchInstaller: async options => { log.installers.push(options); },
    validateRepository: (root, options = {}) => {
      if (overrides.repoInvalid) throw new Error('Non è una repo Mascotte.');
      if (options.requireClean && overrides.repoDirty) throw new Error('La repo ha modifiche locali.');
      return { root, dirty: Boolean(overrides.repoDirty) };
    },
    updateFromRepository: async (root, progress) => { progress('Scarico le modifiche…'); progress('Compilo…'); return { root: '/tmp/build', archive: '/tmp/build.zip', runtime: '/tmp/build/Mascotte.app' }; },
  };
  const updates = createUpdates({
    Releases, Updater,
    confirmDialog: async options => { log.confirms.push(options); return overrides.confirm ?? true; },
    pickFolder: async () => overrides.picked ?? { canceled: false, filePaths: ['/Users/prova/Mascotte'] },
    broadcast: () => log.statuses.push(updates.status),
    quit: () => { log.quit++; },
    isBusy: () => Boolean(overrides.busy),
    getRepoPath: () => repoPath, setRepoPath: value => { repoPath = value; },
    can: { management: overrides.management ?? true, packageName: 'Mascotte-Mac-0.9.9-arm64.zip' },
    isPackaged: overrides.isPackaged ?? true, appVersion: '0.9.8',
    execPath: '/Applications/Mascotte.app/Contents/MacOS/Mascotte', resourcesPath: '/Applications/Mascotte.app/Contents/Resources',
    dataDirectory, platform: 'darwin',
  });
  return { updates, log, dataDirectory, repoPath: () => repoPath, cleanup: () => fs.rmSync(dataDirectory, { recursive: true, force: true }) };
}

test('dal sorgente (non pacchettizzata), senza gestione o con un lavoro in corso: nessuna azione', async () => {
  for (const overrides of [{ isPackaged: false }, { management: false }, { busy: true }]) {
    const { updates, log, cleanup } = setup(overrides);
    await updates.checkRelease(); await updates.runRepositoryUpdate();
    assert.deepEqual([updates.running, log.statuses.length, log.confirms.length], [false, 0, 0], JSON.stringify(overrides));
    cleanup();
  }
});

test('già aggiornata: messaggio con la versione, nessuna conferma', async () => {
  const { updates, log, cleanup } = setup({ latest: '0.9.8' });
  await updates.checkRelease();
  assert.deepEqual(log.statuses, ['Controllo le versioni disponibili…', 'Mascotte è aggiornata (versione 0.9.8).']);
  assert.deepEqual([updates.running, updates.failed, log.confirms.length], [false, false, 0]);
  cleanup();
});

test('release non raggiungibile: errore visibile e operazione libera', async () => {
  const { updates, cleanup } = setup({ latestFails: true });
  await updates.checkRelease();
  assert.deepEqual([updates.running, updates.failed, updates.status], [false, true, 'GitHub non raggiungibile']);
  cleanup();
});

test('conferma annullata: niente download', async () => {
  const { updates, log, cleanup } = setup({ confirm: false });
  await updates.checkRelease();
  assert.equal(updates.status, 'Aggiornamento annullato.');
  assert.deepEqual([updates.running, log.downloads.length, log.quit], [false, 0, 0]);
  assert.match(log.confirms[0].message, /Installare Mascotte 0\.9\.9\?/);
  assert.match(log.confirms[0].detail, /Mascotte-Mac-0\.9\.9-arm64\.zip/);
  cleanup();
});

test('conferma: scarica, verifica, avvia l\'installatore con i file giusti e chiude l\'app', async () => {
  const { updates, log, dataDirectory, cleanup } = setup();
  await updates.checkRelease();
  assert.equal(updates.running, true, 'resta in corso finché l\'app non si chiude');
  await waitFor(() => log.quit === 1, 'chiusura dell\'app dopo l\'avvio dell\'installatore');
  assert.deepEqual(log.statuses, ['Controllo le versioni disponibili…', 'Scarico Mascotte 0.9.9…', 'Verifica completata. Preparo l’installazione…']);
  const [installer] = log.installers, work = log.downloads[0];
  assert.ok(work.startsWith(path.join(dataDirectory, 'release-update-')) && fs.existsSync(work), 'cartella di lavoro lasciata all\'installatore');
  assert.deepEqual({ ...installer, parentPid: undefined }, {
    root: work, archive: path.join(work, 'pacchetto.zip'), runtime: path.join(work, 'Mascotte.app'), installDir: '/Applications/Mascotte.app',
    resultFile: path.join(dataDirectory, 'update-result.json'), logFile: path.join(dataDirectory, 'update.log'),
    previousExe: '/Applications/Mascotte.app/Contents/MacOS/Mascotte', parentPid: undefined, dataDir: dataDirectory,
    helperScript: path.join('/Applications/Mascotte.app/Contents/Resources', 'mascotte-updater.cjs'),
  });
  assert.equal(installer.parentPid, process.pid);
  assert.equal(log.quit, 1);
  cleanup();
});

test('download rifiutato: errore, operazione libera, cartella di lavoro tolta', async () => {
  const { updates, log, cleanup } = setup({ downloadFails: true });
  await updates.checkRelease();
  await waitFor(() => !updates.running, 'fine dell\'aggiornamento fallito');
  assert.deepEqual([updates.running, updates.failed, updates.status], [false, true, 'Aggiornamento non riuscito: impronta SHA-256 diversa']);
  assert.ok(!fs.existsSync(log.downloads[0]));
  assert.equal(log.quit, 0);
  cleanup();
});

test('un secondo «Controlla» mentre il primo è in corso non fa nulla; chiudere l\'app interrompe', async () => {
  const { updates, log, cleanup } = setup();
  await updates.checkRelease();
  const statuses = log.statuses.length;
  await updates.checkRelease();
  assert.equal(log.confirms.length, 1);
  assert.equal(log.statuses.length, statuses);
  updates.stop();
  assert.equal(log.signals[0].aborted, true);
  await waitFor(() => log.quit === 1 || !updates.running, 'conclusione dopo l\'interruzione');
  cleanup();
});

test('nota sul percorso e backup quando l\'app gira altrove', async () => {
  const { updates, log, cleanup } = setup({ confirm: false, currentLocation: '/Users/prova/Scaricati/Mascotte.app' });
  await updates.checkRelease();
  assert.match(log.confirms[0].detail, /Dopo il riavvio aggiorna gli hook/);
  cleanup();
});

test('scelta della repo: pulita, con modifiche, non valida, annullata', async () => {
  let { updates, repoPath, cleanup } = setup();
  await updates.selectRepository();
  assert.deepEqual([repoPath(), updates.status, updates.failed], ['/Users/prova/Mascotte', 'Repo selezionata. Puoi aggiornare Mascotte.', false]);
  cleanup();
  ({ updates, cleanup } = setup({ repoDirty: true }));
  await updates.selectRepository();
  assert.equal(updates.status, 'Repo selezionata. Salva o committa le modifiche locali prima di aggiornare.');
  cleanup();
  ({ updates, cleanup } = setup({ repoInvalid: true }));
  await updates.selectRepository();
  assert.deepEqual([updates.failed, updates.status], [true, 'Non è una repo Mascotte.']);
  cleanup();
  ({ updates, repoPath, cleanup } = setup({ picked: { canceled: true, filePaths: [] } }));
  await updates.selectRepository();
  assert.deepEqual([repoPath(), updates.status], ['', '']);
  cleanup();
});

test('aggiornamento dai sorgenti: repo con modifiche rifiutata; confermato compila, installa e chiude', async () => {
  let { updates, log, cleanup } = setup({ repoPath: '/Users/prova/Mascotte', repoDirty: true });
  await updates.runRepositoryUpdate();
  assert.deepEqual([updates.running, updates.failed, updates.status], [false, true, 'La repo ha modifiche locali.']);
  cleanup();
  ({ updates, log, cleanup } = setup({ repoPath: '/Users/prova/Mascotte' }));
  await updates.runRepositoryUpdate();
  await waitFor(() => log.quit === 1, 'chiusura dell\'app dopo la build');
  assert.deepEqual(log.statuses.slice(-3), ['Scarico le modifiche…', 'Compilo…', 'Pacchetto pronto. Chiudo Mascotte per installare e riavviare…']);
  assert.equal(log.installers[0].runtime, '/tmp/build/Mascotte.app');
  assert.equal(log.installers[0].installDir, '/Applications/Mascotte.app');
  assert.equal(log.quit, 1);
  assert.match(log.confirms[0].detail, /^Repo: \/Users\/prova\/Mascotte\nDestinazione: \/Applications\/Mascotte\.app/);
  cleanup();
});

test('esito del precedente aggiornamento letto all\'avvio, con nota aggiunta', () => {
  const { updates, cleanup } = setup();
  updates.restoreResult({ ok: false, message: 'x'.repeat(3000) });
  assert.equal(updates.status.length, 2000);
  assert.equal(updates.failed, true);
  updates.restoreResult({ ok: true, message: 'Mascotte aggiornata alla 0.9.9.' });
  updates.appendStatus(' Premi Crea / aggiorna hook.');
  assert.deepEqual([updates.failed, updates.status], [false, 'Mascotte aggiornata alla 0.9.9. Premi Crea / aggiorna hook.']);
  cleanup();
});
