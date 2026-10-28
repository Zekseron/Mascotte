'use strict';
// Firma dell'app Mac dopo electron-builder, con il certificato personale autofirmato creato nel portachiavi
// (nome predefinito «Mascotte Firma Locale», cambiabile con MASCOTTE_MAC_IDENTITY). Senza certificato l'app resta
// firmata ad hoc da electron-builder e viene scritto un avviso. Niente hardened runtime: senza notarizzazione
// romperebbe ELECTRON_RUN_AS_NODE e gli helper.
// Con la stessa identità il «requisito designato» non cambia da una build all'altra: macOS conserva i permessi
// (Registrazione schermo) e l'aggiornamento dall'app può verificare che il nuovo pacchetto sia dello stesso autore.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_IDENTITY = 'Mascotte Firma Locale';
const defaultRun = (file, args) => spawnSync(file, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 300000 });

// «security find-identity -p codesigning» senza -v: un certificato autofirmato non attendibile compare lo stesso.
// Righe: `  1) <SHA-1> "Nome" [(CSSMERR_TP_NOT_TRUSTED)]`. Si firma con l'hash, che resta univoco anche con nomi doppi.
function findIdentity(name = DEFAULT_IDENTITY, run = defaultRun) {
  const result = run('/usr/bin/security', ['find-identity', '-p', 'codesigning']);
  if (result.error || result.status !== 0) return null;
  for (const line of String(result.stdout).split('\n')) {
    const match = line.match(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(.+?)"/i);
    if (match && match[2] === name) return { hash: match[1].toUpperCase(), name: match[2] };
  }
  return null;
}
function check(result, what) {
  if (result.error || result.status !== 0) throw new Error(`${what} non riuscito: ${(result.stderr || result.error?.message || '').trim().slice(-600)}`);
}
function signApp(app, identity, run = defaultRun) {
  // Prima l'helper Swift in Resources (un eseguibile semplice, che --deep non tratta come codice annidato), poi tutto il bundle.
  const helper = path.join(app, 'Contents', 'Resources', 'mascotte-window-helper');
  if (fs.existsSync(helper)) check(run('/usr/bin/codesign', ['--force', '--sign', identity.hash, helper]), 'Firma dell’helper');
  check(run('/usr/bin/codesign', ['--force', '--deep', '--sign', identity.hash, app]), 'Firma dell’app');
  check(run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]), 'Verifica della firma');
  check(run('/usr/bin/codesign', ['--verify', '--strict', helper]), 'Verifica della firma dell’helper');
}
function regenerateZip(app, zip, run = defaultRun) {
  const temporary = `${zip}.tmp`;
  fs.rmSync(temporary, { force: true });
  check(run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, temporary]), 'Creazione dello ZIP');
  fs.renameSync(temporary, zip);
  fs.rmSync(`${zip}.blockmap`, { force: true }); // la mappa dei blocchi di electron-builder non corrisponderebbe più
}
function signOutput(outputDir, { env = process.env, run = defaultRun, log = console.log, warn = console.warn } = {}) {
  const app = path.join(outputDir, 'mac-arm64', 'Mascotte.app');
  if (!fs.existsSync(app)) throw new Error(`App compilata non trovata: ${app}`);
  const name = env.MASCOTTE_MAC_IDENTITY || DEFAULT_IDENTITY;
  const identity = findIdentity(name, run);
  if (!identity) {
    warn(`ATTENZIONE: certificato «${name}» non trovato nel portachiavi: l'app resta firmata ad hoc. macOS legherà i permessi alla singola build; dopo ogni ricompilazione può servire togliere e riaggiungere Mascotte in Registrazione schermo.`);
    return { signed: false };
  }
  signApp(app, identity, run);
  const zips = fs.readdirSync(outputDir).filter(file => /^Mascotte-Mac-.+-arm64\.zip$/.test(file));
  for (const zip of zips) regenerateZip(app, path.join(outputDir, zip), run);
  log(`App firmata con «${identity.name}» e verificata (codesign --verify --deep --strict). ZIP rigenerato: ${zips.join(', ') || 'nessuno'}.`);
  return { signed: true, identity, zips };
}
// Cartella di output scelta con --config.directories.output=… (come fa l'aggiornamento da sorgenti), altrimenti dist.
function outputDirectory(args, cwd = path.join(__dirname, '..')) {
  const option = args.find(arg => arg.startsWith('--config.directories.output='));
  return path.resolve(cwd, option ? option.slice(option.indexOf('=') + 1) : 'dist');
}
module.exports = { findIdentity, signApp, regenerateZip, signOutput, outputDirectory, DEFAULT_IDENTITY };
if (require.main === module) {
  try { signOutput(outputDirectory(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exit(1); }
}
