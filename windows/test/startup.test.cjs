'use strict';
// Avvio reale dell'app: è la rete di sicurezza per i riordini di main.cjs (moduli spostati, require sbagliati,
// variabili non più raggiungibili). Avvia Electron con una cartella dati temporanea, aspetta «Mascotte pronta»,
// controlla che non ci siano errori di caricamento né righe in errori.log, poi chiude l'app e i suoi processi.
// Serve windows/resources (npm run resources), che la CI prepara prima dei test. La mascotte compare per qualche
// secondo sullo schermo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const APP = path.join(__dirname, '..');
const READY = 'Mascotte pronta';
const FATAL = /Cannot find module|Uncaught|TypeError|ReferenceError|SyntaxError|is not a function|is not defined|non riesce ad avviarsi/;
const resources = fs.existsSync(path.join(APP, 'resources', 'characters')) && fs.existsSync(path.join(APP, 'resources', 'build-info.json'));

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* già chiuso */ } } }
}

test('avvio dell\'app con dati isolati: pronta, senza errori di caricamento', {
  timeout: 120000,
  skip: resources ? false : 'manca windows/resources: eseguire prima npm run resources',
}, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-avvio-'));
  const env = { ...process.env, MASCOTTE_DATA_DIR: data, ELECTRON_ENABLE_LOGGING: '' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), ['.'], { cwd: APP, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('l\'app non ha scritto «' + READY + '» entro 90 s')), 90000);
      const watch = chunk => {
        output += chunk;
        if (FATAL.test(output)) { clearTimeout(timer); reject(new Error('errore all\'avvio')); }
        else if (output.includes(READY)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', watch); child.stderr.on('data', watch);
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`l'app si è chiusa da sola (codice ${code})`)); });
    }).catch(error => { throw new Error(`${error.message}\n--- uscita dell'app ---\n${output.slice(-3000)}`); });
    // Qualche secondo in più: i lavori subito dopo l'avvio (pianificatore, pulizie) non devono fallire.
    await new Promise(resolve => setTimeout(resolve, 4000));
    assert.doesNotMatch(output, FATAL, `errore dopo l'avvio:\n${output.slice(-3000)}`);
    const log = path.join(data, 'errori.log');
    assert.ok(!fs.existsSync(log), `errori.log non vuoto all'avvio:\n${fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''}`);
  } finally {
    child.removeAllListeners('exit');
    stop(child);
    await new Promise(resolve => setTimeout(resolve, 1000));
    fs.rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
