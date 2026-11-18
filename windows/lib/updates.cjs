'use strict';
// Aggiornamenti dall'app: stato (in corso, messaggio, fallito), controllo e installazione della release pubblicata,
// scelta della repo e aggiornamento dai sorgenti. Download, verifica ed estrazione sono in releases.cjs; build,
// installatore e risultato in updater.cjs. Qui ci sono le decisioni e i messaggi, con Electron e i moduli passati
// da fuori: così ogni caso si prova nei test senza scaricare né installare nulla.
// Funziona solo nell'app pacchettizzata (isPackaged): dal sorgente le azioni non fanno nulla.
const fs = require('node:fs');
const path = require('node:path');

function createUpdates({
  Releases, Updater,
  confirmDialog,        // (opzioni, etichetta, pulsante predefinito) → true se l'utente conferma
  pickFolder,           // (titolo, cartella iniziale) → risultato di dialog.showOpenDialog
  broadcast,            // invia lo stato alle finestre
  quit,                 // chiude l'app (per lasciare il posto all'installatore)
  isBusy,               // () → true se c'è una risposta, un download o una configurazione hook in corso
  getRepoPath, setRepoPath, // repo scelta per l'aggiornamento dai sorgenti (salvata nelle impostazioni)
  can, isPackaged, appVersion, execPath, resourcesPath, dataDirectory, platform = process.platform,
}) {
  let running = false, status = '', failed = false, abort = null;

  // Nota sul percorso: se l'app in esecuzione sta altrove rispetto alla destinazione, gli hook vanno ricollegati.
  const movedNote = (installDir, text) => Updater.currentLocation(execPath).toLowerCase() !== installDir.toLowerCase() ? text : '';
  // Mac: la vecchia app Swift in Applicazioni (altro identificativo) viene salvata in un ZIP prima di essere sostituita.
  const backupNote = installDir => platform === 'darwin' && fs.existsSync(installDir) && installDir !== Updater.currentLocation(execPath) ? `\n\nSe in ${installDir} c’è un’altra app Mascotte (per esempio la vecchia app Swift), ne viene fatto prima un backup ZIP in ${path.join(dataDirectory, 'backup')}.` : '';
  const installerFiles = () => ({
    resultFile: path.join(dataDirectory, 'update-result.json'), logFile: path.join(dataDirectory, 'update.log'),
    previousExe: execPath, dataDir: dataDirectory, helperScript: path.join(resourcesPath, 'mascotte-updater.cjs'),
  });

  async function installRepositoryUpdate(repo) {
    const installDir = Updater.installationDirectory(execPath, repo.root, dataDirectory);
    const result = await Updater.updateFromRepository(repo.root, message => { status = message; broadcast(); }, abort.signal);
    status = 'Pacchetto pronto. Chiudo Mascotte per installare e riavviare…'; broadcast();
    // Run the helper from the NEW unpacked build, so no process locks the installed runtime.
    const files = installerFiles();
    await Updater.launchInstaller({ ...result, installDir, resultFile: files.resultFile, logFile: files.logFile, previousExe: files.previousExe, parentPid: process.pid, dataDir: files.dataDir, helperScript: files.helperScript });
    quit();
  }

  async function installPublishedRelease(release) {
    const work = fs.mkdtempSync(path.join(dataDirectory, 'release-update-'));
    let handedOff = false;
    try {
      const repo = Releases.repositoryContaining(execPath);
      const installDir = Updater.installationDirectory(execPath, repo || work, dataDirectory);
      status = `Scarico Mascotte ${release.version}…`; broadcast();
      const archive = await Releases.downloadRelease(release, work, abort.signal);
      status = 'Verifica completata. Preparo l’installazione…'; broadcast();
      const runtime = await Releases.extractRuntime(archive, work, abort.signal);
      const files = installerFiles();
      await Updater.launchInstaller({ root: work, archive, runtime, installDir,
        resultFile: files.resultFile, logFile: files.logFile,
        previousExe: files.previousExe, parentPid: process.pid, dataDir: files.dataDir, helperScript: files.helperScript });
      handedOff = true; quit();
    } finally {
      if (!handedOff) { try { await fs.promises.rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* cartella già sparita */ } }
    }
  }

  // «Controlla aggiornamenti»: versione pubblicata, conferma, poi download e installazione in sottofondo.
  async function checkRelease() {
    if (!can.management || !isPackaged || running || isBusy()) return;
    running = true; failed = false; status = 'Controllo le versioni disponibili…'; abort = new AbortController(); broadcast();
    try {
      const release = await Releases.latestRelease(abort.signal);
      if (Releases.compareVersions(release.version, appVersion) <= 0) {
        status = `Mascotte è aggiornata (versione ${appVersion}).`;
        running = false; abort = null; broadcast(); return;
      }
      const repo = Releases.repositoryContaining(execPath);
      const installDir = Updater.installationDirectory(execPath, repo || dataDirectory, dataDirectory);
      const confirmed = await confirmDialog({ title: 'Aggiorna Mascotte',
        message: `Installare Mascotte ${release.version}?`,
        detail: `Il pacchetto ${can.packageName} verrà scaricato dalla release ufficiale e verificato prima dell’installazione.\nDestinazione: ${installDir}\n\nMascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${movedNote(installDir, '\n\nDopo il riavvio aggiorna gli hook per collegarli al nuovo percorso.')}${backupNote(installDir)}` }, 'Aggiorna e riavvia', 1);
      if (!confirmed) { running = false; abort = null; status = 'Aggiornamento annullato.'; broadcast(); return; }
      void installPublishedRelease(release).catch(error => {
        running = false; failed = true; status = `Aggiornamento non riuscito: ${error.message}`; broadcast();
      }).finally(() => { abort = null; });
    } catch (error) { running = false; abort = null; failed = true; status = error.message; broadcast(); }
  }

  // Scelta della repo clonata da GitHub per l'aggiornamento dai sorgenti.
  async function selectRepository() {
    if (!can.management || !isPackaged) return;
    try {
      const selected = await pickFolder('Scegli la repo Mascotte clonata da GitHub', getRepoPath() || undefined);
      if (!selected.canceled && selected.filePaths[0]) {
        const repo = Updater.validateRepository(selected.filePaths[0]);
        setRepoPath(repo.root); failed = false;
        status = repo.dirty ? 'Repo selezionata. Salva o committa le modifiche locali prima di aggiornare.' : 'Repo selezionata. Puoi aggiornare Mascotte.';
      }
    } catch (error) { failed = true; status = error.message; }
  }

  // Aggiornamento dai sorgenti: git pull, build e installazione.
  async function runRepositoryUpdate() {
    if (!can.management || !isPackaged || running || isBusy()) return;
    // Reserve the operation before opening the native dialog to prevent duplicate updates.
    running = true; failed = false; broadcast();
    try {
      const repo = Updater.validateRepository(getRepoPath(), { requireClean: true });
      const installDir = Updater.installationDirectory(execPath, repo.root, dataDirectory);
      const confirmed = await confirmDialog({ title: 'Aggiorna Mascotte', message: 'Scaricare, compilare e installare l’aggiornamento?', detail: `Repo: ${repo.root}\nDestinazione: ${installDir}\n\nServono Git e Node.js 22+ con npm. La repo viene aggiornata con git pull --ff-only. A fine build Mascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${movedNote(installDir, '\n\nL’app verrà installata in una cartella stabile: dopo il riavvio premi Crea / aggiorna hook per collegarli al nuovo percorso.')}${backupNote(installDir)}` }, 'Aggiorna e riavvia', 1);
      if (!confirmed) { running = false; broadcast(); return; }
      abort = new AbortController();
      void installRepositoryUpdate(repo).catch(error => {
        running = false; failed = true; status = `Aggiornamento non riuscito: ${error.message}`; broadcast();
      }).finally(() => { abort = null; });
    } catch (error) { running = false; failed = true; status = error.message; broadcast(); }
  }

  // Esito dell'aggiornamento precedente, letto all'avvio (scritto dall'installatore).
  function restoreResult(result) { status = result.message.slice(0, 2000); failed = !result.ok; }
  function appendStatus(text) { status += text; }

  return {
    checkRelease, selectRepository, runRepositoryUpdate, restoreResult, appendStatus,
    stop() { abort?.abort(); },
    get running() { return running; }, get status() { return status; }, get failed() { return failed; },
  };
}

module.exports = { createUpdates };
