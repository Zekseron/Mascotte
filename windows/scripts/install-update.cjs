'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function usage() {
  console.log('Uso: npm.cmd run update:win -- --archive <zip> [--install-dir <cartella>].');
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') { result.help = true; continue; }
    if (!['--archive', '--install-dir'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Argomento non valido: ${argv[i]}`);
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

function main() {
  if (process.platform !== 'win32') throw new Error('Questo comando funziona solo su Windows.');
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }
  if (!args.archive) { usage(); throw new Error('Indica il file ZIP creato da build:win.'); }
  if (!process.env.LOCALAPPDATA && !args['install-dir']) throw new Error('LOCALAPPDATA non è disponibile: indica --install-dir.');

  const archive = path.resolve(args.archive);
  const installDir = path.resolve(args['install-dir'] || path.join(process.env.LOCALAPPDATA, 'Programs', 'Mascotte'));
  const workspace = path.resolve(__dirname, '..', '..');
  const dataDir = process.env.LOCALAPPDATA && path.resolve(process.env.LOCALAPPDATA, 'Mascotte');
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) throw new Error(`ZIP non trovato: ${archive}`);
  if (isWithin(workspace, installDir) || isWithin(installDir, workspace)) throw new Error('La cartella scelta interseca il progetto sorgente; scegli una cartella di installazione separata.');
  if (dataDir && (isWithin(dataDir, installDir) || isWithin(installDir, dataDir))) throw new Error('La destinazione interseca i dati personali in %LOCALAPPDATA%\\Mascotte. Scegli la cartella dell’app, per esempio %LOCALAPPDATA%\\Programs\\Mascotte.');
  if (isWithin(installDir, archive)) throw new Error('Il ZIP deve trovarsi fuori dalla cartella che verrà sostituita.');
  if (fs.existsSync(installDir) && (!fs.lstatSync(installDir).isDirectory() || fs.lstatSync(installDir).isSymbolicLink())) {
    throw new Error('La destinazione esiste ma non è una cartella normale.');
  }

  const running = spawnSync('tasklist.exe', ['/FI', 'IMAGENAME eq Mascotte.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  if (running.error || running.status !== 0) throw new Error('Impossibile controllare se Mascotte è aperta. Chiudila e riprova.');
  if (/^"Mascotte\.exe"/mi.test(running.stdout)) throw new Error('Mascotte è aperta. Esci dal menu della mascotte e ripeti il comando.');

  const parent = path.dirname(installDir);
  fs.mkdirSync(parent, { recursive: true });
  const token = randomUUID();
  const staging = path.join(parent, `.Mascotte-update-${token}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${installDir}.backup-${stamp}`;
  fs.mkdirSync(staging);

  try {
    const command = `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`;
    const expanded = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
    if (expanded.error || expanded.status !== 0) throw new Error((expanded.stderr || expanded.error?.message || 'Estrazione ZIP non riuscita.').trim());
    if (!fs.existsSync(path.join(staging, 'Mascotte.exe')) || !fs.existsSync(path.join(staging, 'resources', 'app.asar'))) {
      throw new Error('Lo ZIP non contiene Mascotte.exe e resources/app.asar al livello atteso.');
    }

    let movedOld = false;
    try {
      if (fs.existsSync(installDir)) { fs.renameSync(installDir, backup); movedOld = true; }
      fs.renameSync(staging, installDir);
    } catch (error) {
      if (movedOld && !fs.existsSync(installDir)) fs.renameSync(backup, installDir);
      throw error;
    }
    console.log(`Mascotte aggiornata in: ${installDir}`);
    if (movedOld) console.log(`Versione precedente conservata in: ${backup}`);
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}

try { main(); }
catch (error) { fail(error.message); }
