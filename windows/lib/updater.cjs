'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const OFFICIAL_ORIGIN = 'https://github.com/Zekseron/Mascotte';
const MAC_APP = '/Applications/Mascotte.app';

// Mac: un'app avviata da Finder ha un PATH minimo (/usr/bin:/bin:…). Si cercano git, node e npm anche nelle
// cartelle di Homebrew e di nvm, come fa lib/cli.cjs per le CLI.
function macToolDirs(env = process.env, home = os.homedir()) {
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.local', 'bin'));
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try { if (fs.existsSync(nvm)) dirs.push(...fs.readdirSync(nvm).sort().reverse().map(version => path.join(nvm, version, 'bin'))); } catch {}
  return [...new Set(dirs)];
}
function findTool(name, { platform = process.platform, env = process.env, home = os.homedir(), exists = fs.existsSync } = {}) {
  if (platform === 'win32') return `${name}.exe`;
  for (const dir of macToolDirs(env, home)) { const file = path.join(dir, name); if (exists(file)) return file; }
  return null;
}
// Ambiente dei figli su Mac: cartelle di node e npm in testa al PATH, perché gli script npm usano «env node».
function toolEnvironment({ env = process.env, node, npm } = {}) {
  const dirs = [node, npm].filter(Boolean).map(file => path.dirname(file));
  const base = macToolDirs(env);
  return { ...env, PATH: [...new Set([...dirs, ...base])].join(path.delimiter), GIT_TERMINAL_PROMPT: '0' };
}
function gitCommand() {
  if (process.platform === 'win32') return 'git.exe';
  const file = findTool('git');
  if (!file) throw new Error('Git non trovato. Installa Git (per esempio con gli strumenti da riga di comando di Xcode) e riapri Mascotte.');
  return file;
}
function git(root, args) {
  const result = spawnSync(gitCommand(), ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024, env: process.platform === 'win32' ? process.env : toolEnvironment() });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'Comando Git non riuscito.').trim());
  return result.stdout.trim();
}
// Il nome utente nell'URL HTTPS (https://utente@github.com/…, usato per scegliere l'account del push) non cambia la repo.
function normalizedOrigin(value) {
  return value.trim().replace(/^https:\/\/[^@/]+@github\.com\//i, 'https://github.com/').replace(/^git@github\.com:/i, 'https://github.com/').replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/').replace(/\.git$/i, '').replace(/\/$/, '').toLowerCase();
}
function validateRepository(directory, { requireClean = false } = {}) {
  if (!['win32', 'darwin'].includes(process.platform)) throw new Error('L’aggiornamento è disponibile solo su Windows e Mac.');
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Scegli prima la repo Mascotte clonata da GitHub.');
  const requested = fs.realpathSync(directory);
  if (!fs.statSync(requested).isDirectory()) throw new Error('Scegli la cartella principale di una repo Mascotte.');
  const root = fs.realpathSync(git(requested, ['rev-parse', '--show-toplevel']));
  if (normalizedOrigin(git(root, ['remote', 'get-url', 'origin'])) !== OFFICIAL_ORIGIN.toLowerCase()) {
    throw new Error('La repo deve provenire da github.com/Zekseron/Mascotte.');
  }
  const packageFile = path.join(root, 'windows', 'package.json');
  if (!fs.existsSync(packageFile) || JSON.parse(fs.readFileSync(packageFile, 'utf8')).name !== 'mascotte-windows') {
    throw new Error('La repo selezionata non contiene la build di Mascotte (cartella windows).');
  }
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (requireClean && status) throw new Error('La repo contiene modifiche locali. Salvale o committale prima di aggiornare Mascotte.');
  const branch = git(root, ['symbolic-ref', '--short', 'HEAD']);
  if (git(root, ['config', '--get', `branch.${branch}.remote`]) !== 'origin') throw new Error('Il ramo selezionato deve seguire la repo origin.');
  const mergeRef = git(root, ['config', '--get', `branch.${branch}.merge`]);
  if (!mergeRef.startsWith('refs/heads/')) throw new Error('Il ramo selezionato non ha un ramo remoto valido da aggiornare.');
  return { root, dirty: Boolean(status), version: JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, mergeRef };
}
function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
// Cartella dell'installazione in esecuzione: su Windows quella dell'exe, su Mac il bundle .app.
function currentLocation(executable, platform = process.platform) {
  if (platform === 'darwin') { const app = path.resolve(executable, '..', '..', '..'); return app.endsWith('.app') ? app : path.dirname(executable); }
  return path.dirname(executable);
}
function installationDirectory(executable, repository, dataDirectory, { platform = process.platform, macDestination = MAC_APP } = {}) {
  const overlaps = directory => [repository, dataDirectory].some(protectedDir => isWithin(protectedDir, directory) || isWithin(directory, protectedDir));
  if (platform === 'darwin') {
    // Su Mac l'app sta sempre in Applicazioni, qualunque sia la posizione di quella in esecuzione.
    const target = path.resolve(macDestination);
    if (overlaps(target)) throw new Error('La cartella di installazione interseca la repo o i dati personali. Installa Mascotte in Applicazioni.');
    if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isDirectory())) throw new Error('La destinazione non è una cartella normale.');
    return target;
  }
  const current = fs.realpathSync(path.dirname(executable));
  const target = overlaps(current) ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Mascotte') : current;
  if (overlaps(target)) throw new Error('La cartella di installazione interseca la repo o i dati personali. Installa Mascotte in una cartella separata.');
  if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isDirectory())) throw new Error('La destinazione non è una cartella normale.');
  return target;
}
function run(command, args, cwd, onProgress, label, signal, env) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Operazione interrotta.')); return; }
    onProgress(label);
    const mac = process.platform !== 'win32';
    // Mac: il figlio guida un proprio gruppo di processi (detached), così si fermano anche npm, node ed electron-builder.
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], ...(mac ? { detached: true, env: env || process.env } : {}) });
    let output = '', done = false, timedOut = false;
    const stop = () => {
      if (mac) {
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        const killer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000); killer.unref();
        return;
      }
      if (child.pid) spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    };
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, 20 * 60 * 1000);
    const cleanup = () => { clearTimeout(timer); if (mac && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } // nipoti rimasti nel gruppo
       signal?.removeEventListener('abort', stop); };
    const append = chunk => {
      output = (output + chunk.toString('utf8')).slice(-6000);
    };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.once('error', error => { if (!done) { done = true; cleanup(); reject(new Error(`${label}: ${error.message}`)); } });
    child.once('close', code => {
      if (done) return;
      done = true; cleanup();
      if (signal?.aborted || timedOut) { reject(new Error(timedOut ? 'Tempo massimo superato. L’app installata non è stata sostituita.' : 'Operazione interrotta.')); return; }
      if (code === 0) resolve(output);
      else reject(new Error(`${label} non riuscito${output.trim() ? ': ' + output.trim().slice(-1800) : '.'}`));
    });
  });
}
async function updateFromRepository(directory, onProgress = () => {}, signal) {
  if (process.platform === 'darwin') return updateFromRepositoryMac(directory, onProgress, signal);
  const repo = validateRepository(directory, { requireClean: true });
  const windowsDirectory = path.join(repo.root, 'windows');
  const nodeVersion = await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'node --version'], windowsDirectory, onProgress, 'Controllo Node.js…', signal);
  if (!/^v(\d+)\./m.test(nodeVersion) || Number(nodeVersion.match(/^v(\d+)\./m)[1]) < 22) throw new Error('Installa Node.js 22 o successivo con npm e riapri Mascotte.');
  await run('git.exe', ['-C', repo.root, 'pull', '--ff-only', 'origin', repo.mergeRef], repo.root, onProgress, 'Scarico gli aggiornamenti della repo…', signal);
  const afterPull = validateRepository(repo.root, { requireClean: true });
  await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci'], windowsDirectory, onProgress, 'Preparo le dipendenze Windows…', signal);
  // A separate output also supports an app currently running from dist/win-unpacked.
  const outputRelative = `dist/mascotte-update-${require('node:crypto').randomUUID()}`;
  const outputDirectory = path.join(windowsDirectory, outputRelative);
  const buildStarted = Date.now();
  // The sole shell argument is generated here from a fixed prefix and a UUID, never a user path.
  await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run build:win:package -- --config.directories.output=${outputRelative}`], windowsDirectory, onProgress, 'Compilo il nuovo pacchetto…', signal);
  const archive = path.join(outputDirectory, `Mascotte-Windows-${afterPull.version}-x64.zip`);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile() || fs.statSync(archive).mtimeMs < buildStarted - 2000) throw new Error('La build è terminata ma non trovo un nuovo ZIP Windows.');
  return { ...afterPull, archive, runtime: path.join(outputDirectory, 'win-unpacked', 'Mascotte.exe') };
}
// Mac: tutto senza shell (spawn diretto con percorsi assoluti). build:mac inoltra gli argomenti a electron-builder
// (scripts/build-mac.cjs) e firma con «Mascotte Firma Locale» se presente.
async function updateFromRepositoryMac(directory, onProgress, signal, { tools } = {}) {
  const repo = validateRepository(directory, { requireClean: true });
  const windowsDirectory = path.join(repo.root, 'windows');
  const found = tools || { git: findTool('git'), node: findTool('node'), npm: findTool('npm') };
  if (!found.git) throw new Error('Git non trovato. Installa Git e riapri Mascotte.');
  if (!found.node || !found.npm) throw new Error('Installa Node.js 22 o successivo con npm (nodejs.org) e riapri Mascotte.');
  const env = toolEnvironment({ node: found.node, npm: found.npm });
  const nodeVersion = await run(found.node, ['--version'], windowsDirectory, onProgress, 'Controllo Node.js…', signal, env);
  if (!/^v(\d+)\./m.test(nodeVersion) || Number(nodeVersion.match(/^v(\d+)\./m)[1]) < 22) throw new Error('Installa Node.js 22 o successivo con npm e riapri Mascotte.');
  await run(found.git, ['-C', repo.root, 'pull', '--ff-only', 'origin', repo.mergeRef], repo.root, onProgress, 'Scarico gli aggiornamenti della repo…', signal, env);
  const afterPull = validateRepository(repo.root, { requireClean: true });
  await run(found.npm, ['ci'], windowsDirectory, onProgress, 'Preparo le dipendenze…', signal, env);
  const outputRelative = `dist/mascotte-update-${require('node:crypto').randomUUID()}`;
  const outputDirectory = path.join(windowsDirectory, outputRelative);
  const buildStarted = Date.now();
  await run(found.npm, ['run', 'build:mac', '--', `--config.directories.output=${outputRelative}`], windowsDirectory, onProgress, 'Compilo il nuovo pacchetto…', signal, env);
  const archive = path.join(outputDirectory, `Mascotte-Mac-${afterPull.version}-arm64.zip`);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile() || fs.statSync(archive).mtimeMs < buildStarted - 2000) throw new Error('La build è terminata ma non trovo un nuovo ZIP Mac.');
  const runtime = path.join(outputDirectory, 'mac-arm64', 'Mascotte.app', 'Contents', 'MacOS', 'Mascotte');
  if (!fs.existsSync(runtime)) throw new Error('La build è terminata ma non trovo l’app Mac compilata.');
  return { ...afterPull, archive, runtime };
}
async function launchInstaller({ root, archive, runtime, installDir, resultFile, logFile, previousExe, parentPid, helperScript, dataDir }) {
  if (!fs.existsSync(runtime) || !fs.existsSync(helperScript)) throw new Error(`Runtime o installer mancanti. Ricrea il pacchetto ${process.platform === 'darwin' ? 'Mac' : 'Windows'}.`);
  const readyFile = path.join(path.dirname(resultFile), `update-ready-${require('node:crypto').randomUUID()}`);
  const log = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawn(runtime, [helperScript, '--archive', archive, '--install-dir', installDir, '--workspace-dir', root,
      '--wait-pid', String(parentPid), '--ready-file', readyFile, '--result-file', resultFile, '--previous-exe', previousExe, ...(dataDir ? ['--data-dir', dataDir] : []), '--restart'],
    { detached: true, windowsHide: true, cwd: path.dirname(runtime), stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  } finally { fs.closeSync(log); }
  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = error => {
      if (finished) return; finished = true; clearInterval(timer); clearTimeout(deadline);
      child.removeListener('error', onError); child.removeListener('exit', onExit);
      if (error) reject(error); else { child.unref(); resolve(); }
    };
    const onError = error => finish(error);
    const onExit = () => finish(new Error(`L’installer non si è avviato. Dettagli in ${logFile}`));
    child.once('error', onError); child.once('exit', onExit);
    const timer = setInterval(() => {
      try { if (fs.existsSync(readyFile)) { fs.unlinkSync(readyFile); finish(); } }
      catch (error) { finish(error); }
    }, 100);
    const deadline = setTimeout(() => {
      if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      else if (child.pid) spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
      finish(new Error(`Preparazione dell’installer scaduta. Dettagli in ${logFile}`));
    }, 150000);
  });
}
module.exports = { normalizedOrigin, validateRepository, updateFromRepository, updateFromRepositoryMac, installationDirectory, currentLocation, launchInstaller, findTool, toolEnvironment, OFFICIAL_ORIGIN, MAC_APP };
