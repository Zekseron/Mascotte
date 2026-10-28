'use strict';

// Electron's patched fs opens ASAR archives while checking them and can keep a
// Windows handle alive, preventing the staging directory from being renamed.
const fs = process.versions.electron ? require('original-fs') : require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function usage() {
  console.log('Uso: install-update --archive <zip> [--install-dir <cartella o .app>] [--workspace-dir <repo>] [--wait-pid <pid>] [--restart].');
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') { result.help = true; continue; }
    if (argv[i] === '--restart') { result.restart = true; continue; }
    if (!['--archive', '--install-dir', '--workspace-dir', '--wait-pid', '--ready-file', '--result-file', '--previous-exe', '--data-dir'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Argomento non valido: ${argv[i]}`);
    result[argv[i].slice(2)] = argv[++i];
  }
  return result;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function fail(message) {
  console.error(`Aggiornamento non eseguito: ${message}`);
  process.exitCode = 1;
}

function taskList(filter) {
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tasklist.exe');
  const result = spawnSync(system, filter, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Impossibile controllare i processi Mascotte.');
  return result.stdout;
}
function pidIsRunning(pid) {
  if (process.platform !== 'win32') {
    try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
  }
  return new RegExp(`,\\s*"${pid}"\\s*,`).test(taskList(['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']));
}
async function waitForPid(pid) {
  const deadline = Date.now() + 45000;
  while (pidIsRunning(pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  if (pidIsRunning(pid)) throw new Error('Mascotte non si è chiusa in tempo per applicare l’aggiornamento.');
}
function otherMascotteProcesses() {
  if (process.platform !== 'win32') return otherMascotteProcessesMac();
  return taskList(['/FI', 'IMAGENAME eq Mascotte.exe', '/FO', 'CSV', '/NH']).split(/\r?\n/)
    .map(line => line.match(/^"Mascotte\.exe","(\d+)"/i)?.[1])
    .filter(pid => pid && Number(pid) !== process.pid);
}
function restartMascotte(installDir) {
  if (process.platform !== 'win32') return restartMascotteMac(installDir);
  const executable = path.join(installDir, 'Mascotte.exe');
  if (!fs.existsSync(executable)) return;
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(executable, [], { detached: true, windowsHide: true, stdio: 'ignore', cwd: installDir, env });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function writeResult(args, ok, message) {
  if (!args['result-file']) return;
  const destination = path.resolve(args['result-file']);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ok, message }), { flag: 'wx' });
  fs.renameSync(temporary, destination);
}

async function renameDirectory(from, to) {
  const deadline = Date.now() + 15000;
  for (;;) {
    try { fs.renameSync(from, to); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= deadline) throw error;
      // Windows can temporarily lock freshly extracted files or a just-closed runtime.
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Ramo macOS. L'app sta in /Applications/Mascotte.app (cartella indicata con --install-dir, che deve finire in .app).
const MAC_BUNDLE_ID = 'local.mascotte.desktop';
const MAC_APP = '/Applications/Mascotte.app';
const tool = (file, args, options = {}) => spawnSync(file, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...options });
function otherMascotteProcessesMac() {
  // pgrep esce con 1 se non trova nulla; qualsiasi altro errore non va scambiato per «nessuna istanza».
  const result = tool('/usr/bin/pgrep', ['-x', 'Mascotte'], { timeout: 10000 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Impossibile controllare i processi Mascotte.');
  return result.stdout.split(/\s+/).filter(pid => /^\d+$/.test(pid) && Number(pid) !== process.pid);
}
function restartMascotteMac(installDir, { open = '/usr/bin/open' } = {}) {
  if (!fs.existsSync(installDir)) return;
  // open passa da LaunchServices: l'app parte senza ELECTRON_RUN_AS_NODE e senza l'ambiente di questo processo.
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = tool(open, ['-n', installDir], { timeout: 30000, env });
  if (result.error || result.status !== 0) throw new Error(`Riavvio non riuscito: ${(result.stderr || result.error?.message || '').trim()}`);
}
function macBundleId(app) {
  const result = tool('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}
function macRequirement(app) {
  const result = tool('/usr/bin/codesign', ['-d', '-r-', app], { timeout: 30000 });
  const line = `${result.stdout}\n${result.stderr}`.split('\n').find(item => item.startsWith('designated =>'));
  return line ? line.slice(13).trim() : null;
}
const adHoc = requirement => !requirement || /\bcdhash\b/.test(requirement);
function macDataDirectory(args) {
  return path.resolve(args['data-dir'] || process.env.MASCOTTE_WINDOWS_DATA_DIR || process.env.MASCOTTE_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Mascotte Electron'));
}
// Sposta un bundle: rename; se i volumi differiscono (EXDEV) copia con ditto, che conserva firma e attributi.
function moveBundle(from, to) {
  try { fs.renameSync(from, to); return; }
  catch (error) { if (error.code !== 'EXDEV') throw error; }
  const copied = tool('/usr/bin/ditto', [from, to]);
  if (copied.error || copied.status !== 0) { fs.rmSync(to, { recursive: true, force: true }); throw new Error(`Copia dell’app non riuscita: ${(copied.stderr || copied.error?.message || '').trim()}`); }
  fs.rmSync(from, { recursive: true, force: true });
}
async function mainMac(args, options = {}) {
  const restart = options.restart || restartMascotteMac;
  const otherProcesses = options.otherProcesses || otherMascotteProcessesMac;
  if (args.help) { usage(); return; }
  if (!args.archive) { usage(); throw new Error('Indica il file ZIP creato da build:mac.'); }
  const waitPid = args['wait-pid'] === undefined ? null : Number(args['wait-pid']);
  if (waitPid !== null && (!Number.isSafeInteger(waitPid) || waitPid <= 0 || waitPid === process.pid)) throw new Error('PID da attendere non valido.');
  const archive = path.resolve(args.archive);
  const installDir = path.resolve(args['install-dir'] || MAC_APP);
  if (!installDir.endsWith('.app')) throw new Error('La destinazione deve essere un’app (.app), per esempio /Applications/Mascotte.app.');
  const workspace = path.resolve(args['workspace-dir'] || path.resolve(__dirname, '..', '..'));
  const dataDir = macDataDirectory(args);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) throw new Error(`ZIP non trovato: ${archive}`);
  if (isWithin(workspace, installDir) || isWithin(installDir, workspace)) throw new Error('La cartella scelta interseca il progetto sorgente; installa in Applicazioni.');
  if (isWithin(dataDir, installDir) || isWithin(installDir, dataDir)) throw new Error('La destinazione interseca i dati personali di Mascotte.');
  if (isWithin(installDir, archive)) throw new Error('Il ZIP deve trovarsi fuori dall’app che verrà sostituita.');
  if (fs.existsSync(installDir) && (fs.lstatSync(installDir).isSymbolicLink() || !fs.lstatSync(installDir).isDirectory())) throw new Error('La destinazione esiste ma non è una cartella normale.');
  if (waitPid !== null && isWithin(installDir, process.execPath)) throw new Error('Il runtime dell’installer deve trovarsi fuori dall’app da aggiornare.');
  if (waitPid === null && otherProcesses().length) throw new Error('Mascotte è ancora aperta. Esci dal menu della mascotte e riprova.');

  const parent = path.dirname(installDir);
  const token = randomUUID();
  const staging = path.join(parent, `.mascotte-staging-${token}`);
  const aside = path.join(parent, `.mascotte-old-${token}`);
  try { fs.mkdirSync(staging); }
  catch (error) { throw new Error(`Non posso scrivere in ${parent}: ${error.message}. Serve un utente amministratore.`); }
  let asideMoved = false, removeAside = false;
  try {
    const expanded = tool('/usr/bin/ditto', ['-x', '-k', archive, staging]);
    if (expanded.error || expanded.status !== 0) throw new Error((expanded.stderr || expanded.error?.message || 'Estrazione ZIP non riuscita.').trim());
    const fresh = path.join(staging, 'Mascotte.app');
    if (!fs.existsSync(path.join(fresh, 'Contents', 'MacOS', 'Mascotte')) || !fs.existsSync(path.join(fresh, 'Contents', 'Resources', 'app.asar'))) {
      throw new Error('Lo ZIP non contiene Mascotte.app con Contents/MacOS/Mascotte e app.asar al livello atteso.');
    }
    const freshId = macBundleId(fresh);
    if (freshId !== MAC_BUNDLE_ID) throw new Error(`Il pacchetto non è Mascotte (identificativo ${freshId || 'mancante'}, atteso ${MAC_BUNDLE_ID}).`);
    if (!options.skipSignatureCheck) {
      const verified = tool('/usr/bin/codesign', ['--verify', '--deep', '--strict', fresh], { timeout: 120000 });
      if (verified.error || verified.status !== 0) throw new Error(`La firma del pacchetto non è valida: ${(verified.stderr || verified.error?.message || '').trim().slice(-300)}`);
    }
    // Staging nella stessa cartella della destinazione: il rename finale è atomico. Se il volume risultasse diverso, moveBundle ripiega su ditto.
    if (args['ready-file']) fs.writeFileSync(path.resolve(args['ready-file']), 'ready', { flag: 'wx' });
    if (waitPid !== null) {
      const deadline = Date.now() + 45000;
      while (pidIsRunning(waitPid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
      if (pidIsRunning(waitPid)) throw new Error('Mascotte non si è chiusa in tempo per applicare l’aggiornamento.');
    }
    const settle = Date.now() + 10000;
    while (otherProcesses().length && Date.now() < settle) await new Promise(resolve => setTimeout(resolve, 250));
    if (otherProcesses().length) throw new Error('Un altro processo Mascotte è ancora aperto. Chiudilo e riprova.');

    let backupZip = null, note = '', previousRequirement = null;
    if (fs.existsSync(installDir)) {
      const oldId = macBundleId(installDir);
      if (oldId !== MAC_BUNDLE_ID) {
        // App diversa (la vecchia app Swift, bundle id local.mascotte.app): ZIP di sicurezza PRIMA di sostituirla.
        const backupDir = path.join(dataDir, 'backup');
        fs.mkdirSync(backupDir, { recursive: true });
        backupZip = path.join(backupDir, `Mascotte-swift-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
        const zipped = tool('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', installDir, backupZip], { timeout: 300000 });
        if (zipped.error || zipped.status !== 0 || !fs.existsSync(backupZip) || fs.statSync(backupZip).size <= 0) {
          fs.rmSync(backupZip, { force: true });
          throw new Error(`Backup della vecchia app non riuscito: ${(zipped.stderr || zipped.error?.message || 'ZIP vuoto').trim()}. L’app non è stata sostituita.`);
        }
      } else if (!options.skipSignatureCheck) previousRequirement = macRequirement(installDir);
    }
    if (previousRequirement && !adHoc(previousRequirement) && macRequirement(fresh) !== previousRequirement) {
      note = ' Attenzione: la firma è cambiata rispetto alla versione precedente, macOS potrebbe richiedere di nuovo i permessi (Registrazione schermo) e gli hook.';
    }
    try {
      if (fs.existsSync(installDir)) { fs.renameSync(installDir, aside); asideMoved = true; }
      moveBundle(fresh, installDir);
    } catch (error) {
      if (asideMoved && !fs.existsSync(installDir)) {
        try { fs.renameSync(aside, installDir); asideMoved = false; }
        catch (restoreError) { throw new Error(`Ripristino non riuscito: ${restoreError.message}. Versione precedente conservata in ${aside}.`, { cause: error }); }
      }
      throw new Error(`Sostituzione dell’app non riuscita: ${error.message}`, { cause: error });
    }
    removeAside = asideMoved;
    // Rimuove la quarantena solo se c'è (ZIP scaricato da browser): l'app firmata dall'utente non deve chiedere conferme.
    const attributes = tool('/usr/bin/xattr', ['-rl', installDir], { timeout: 120000 });
    if (attributes.status === 0 && attributes.stdout.includes('com.apple.quarantine')) tool('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', installDir]);
    console.log(`Mascotte installata in: ${installDir}`);
    if (backupZip) console.log(`Backup della vecchia app: ${backupZip}`);
    const previous = args['previous-exe'] && path.resolve(args['previous-exe'], '..', '..', '..');
    const moved = previous && previous.endsWith('.app') && previous !== installDir;
    try { writeResult(args, true, `Mascotte aggiornata in ${installDir}.${backupZip ? ` Backup della vecchia app: ${backupZip}.` : ''}${note}${moved ? ' Premi Crea / aggiorna hook in Gestione: l’app è stata spostata.' : ''}`); }
    catch (error) { console.error('Impossibile salvare l’esito:', error.message); }
    if (args.restart) await restart(installDir);
  } finally {
    if (removeAside) { try { fs.rmSync(aside, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (error) { console.error(`Cartella temporanea da rimuovere: ${aside}. ${error.message}`); } }
    if (fs.existsSync(staging)) {
      try { await fs.promises.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (error) { console.error(`Cartella temporanea da rimuovere: ${staging}. ${error.message}`); }
    }
  }
}

async function main(args, options) {
  if (process.platform === 'darwin') return mainMac(args, options);
  if (process.platform !== 'win32') throw new Error('Questo comando funziona solo su Windows e Mac.');
  if (args.help) { usage(); return; }
  if (!args.archive) { usage(); throw new Error('Indica il file ZIP creato da build:win.'); }
  if (!process.env.LOCALAPPDATA && !args['install-dir']) throw new Error('LOCALAPPDATA non è disponibile: indica --install-dir.');
  const waitPid = args['wait-pid'] === undefined ? null : Number(args['wait-pid']);
  if (waitPid !== null && (!Number.isSafeInteger(waitPid) || waitPid <= 0 || waitPid === process.pid)) throw new Error('PID da attendere non valido.');

  const archive = path.resolve(args.archive);
  const installDir = path.resolve(args['install-dir'] || path.join(process.env.LOCALAPPDATA, 'Programs', 'Mascotte'));
  const workspace = path.resolve(args['workspace-dir'] || path.resolve(__dirname, '..', '..'));
  const dataDir = process.env.LOCALAPPDATA && path.resolve(process.env.LOCALAPPDATA, 'Mascotte');
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) throw new Error(`ZIP non trovato: ${archive}`);
  if (isWithin(workspace, installDir) || isWithin(installDir, workspace)) throw new Error('La cartella scelta interseca il progetto sorgente; scegli una cartella di installazione separata.');
  if (dataDir && (isWithin(dataDir, installDir) || isWithin(installDir, dataDir))) throw new Error('La destinazione interseca i dati personali in %LOCALAPPDATA%\\Mascotte. Scegli la cartella dell’app, per esempio %LOCALAPPDATA%\\Programs\\Mascotte.');
  if (isWithin(installDir, archive)) throw new Error('Il ZIP deve trovarsi fuori dalla cartella che verrà sostituita.');
  if (fs.existsSync(installDir) && (!fs.lstatSync(installDir).isDirectory() || fs.lstatSync(installDir).isSymbolicLink())) {
    throw new Error('La destinazione esiste ma non è una cartella normale.');
  }

  // The UI helper must run outside the installation it will replace.
  if (waitPid !== null && isWithin(installDir, process.execPath)) throw new Error('Il runtime dell’installer deve trovarsi fuori dalla cartella da aggiornare.');
  if (waitPid === null && otherMascotteProcesses().length) throw new Error('Mascotte è ancora aperta. Esci dal menu della mascotte e riprova.');

  const parent = path.dirname(installDir);
  fs.mkdirSync(parent, { recursive: true });
  const token = randomUUID();
  const staging = path.join(parent, `.Mascotte-update-${token}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${installDir}.backup-${stamp}`;
  fs.mkdirSync(staging);

  try {
    const command = `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const expanded = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (expanded.error || expanded.status !== 0) throw new Error((expanded.stderr || expanded.error?.message || 'Estrazione ZIP non riuscita.').trim());
    if (!fs.existsSync(path.join(staging, 'Mascotte.exe')) || !fs.existsSync(path.join(staging, 'resources', 'app.asar'))) {
      throw new Error('Lo ZIP non contiene Mascotte.exe e resources/app.asar al livello atteso.');
    }
    // Keep the NSIS uninstaller registered at this installation path across ZIP updates.
    const uninstaller = path.join(installDir, 'Uninstall Mascotte.exe');
    if (fs.existsSync(uninstaller)) {
      const stat = fs.lstatSync(uninstaller);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Il programma di disinstallazione non è un file normale.');
      fs.copyFileSync(uninstaller, path.join(staging, 'Uninstall Mascotte.exe'), fs.constants.COPYFILE_EXCL);
    }
    if (args['ready-file']) fs.writeFileSync(path.resolve(args['ready-file']), 'ready', { flag: 'wx' });
    if (waitPid !== null) await waitForPid(waitPid);
    // Let short-lived hook bridges and Chromium children exit after the main process.
    const deadline = Date.now() + 10000;
    while (otherMascotteProcesses().length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    if (otherMascotteProcesses().length) throw new Error('Un altro processo Mascotte è ancora aperto. Chiudilo e riprova.');

    let movedOld = false;
    try {
      if (fs.existsSync(installDir)) { await renameDirectory(installDir, backup); movedOld = true; }
      await renameDirectory(staging, installDir);
    } catch (error) {
      if (movedOld && !fs.existsSync(installDir)) {
        try { await renameDirectory(backup, installDir); }
        catch (restoreError) { throw new Error(`Ripristino non riuscito: ${restoreError.message}. Versione precedente conservata in ${backup}.`, { cause: error }); }
      }
      throw new Error(`Sostituzione dell’app non riuscita: ${error.message}`, { cause: error });
    }
    console.log(`Mascotte aggiornata in: ${installDir}`);
    if (movedOld) console.log(`Versione precedente conservata in: ${backup}`);
    try { writeResult(args, true, `Mascotte aggiornata in ${installDir}.${movedOld ? ` Backup: ${backup}.` : ''}${args['previous-exe'] && path.dirname(args['previous-exe']).toLowerCase() !== installDir.toLowerCase() ? ' Premi Crea / aggiorna hook per collegarli al nuovo percorso.' : ''}`); }
    catch (error) { console.error('Impossibile salvare l’esito:', error.message); }
    if (args.restart) await restartMascotte(installDir);
  } finally {
    // Cleanup must not hide the original installation error or turn a successful update into a failure.
    if (fs.existsSync(staging)) {
      try { await fs.promises.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (error) { console.error(`Cartella temporanea da rimuovere: ${staging}. ${error.message}`); }
    }
  }
}

async function run(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); await main(args); }
  catch (error) {
    fail(error.message);
    // If the UI parent is alive it will show the error; never launch a duplicate instance.
    const parentAlive = args?.['wait-pid'] && pidIsRunning(Number(args['wait-pid']));
    // Mac: si riavvia l'app precedente solo se è stata lanciata da lei (--previous-exe), non nella prima installazione da terminale.
    if (!parentAlive && args?.restart && (process.platform !== 'darwin' || args['previous-exe'])) {
      try {
        writeResult(args, false, `Aggiornamento non riuscito: ${error.message}. Dettagli in update.log.`);
        const previousDir = process.platform === 'darwin' ? path.resolve(args['previous-exe'], '..', '..', '..') : args['previous-exe'] ? path.dirname(path.resolve(args['previous-exe'])) : path.resolve(args['install-dir'] || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Mascotte'));
        await restartMascotte(previousDir);
      } catch (restartError) { console.error('Riavvio non riuscito:', restartError.message); }
    }
  } finally {
    if (args?.['ready-file'] && fs.existsSync(args['ready-file'])) fs.unlinkSync(args['ready-file']);
  }
}
if (require.main === module) run().catch(error => fail(error.message));
module.exports = { parseArgs, isWithin, restartMascotte, renameDirectory, main, mainMac, run };
