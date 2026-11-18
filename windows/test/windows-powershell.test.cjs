'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WindowsPowerShell = require('../lib/windows-powershell.cjs');

test('PowerShell 5.1 di sistema, anche senza SystemRoot', () => {
  assert.equal(WindowsPowerShell.executable({ SystemRoot: 'D:\\Win' }), path.join('D:\\Win', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  assert.equal(WindowsPowerShell.executable({}), path.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
});

test('ambiente senza PSModulePath (qualunque maiuscola), il resto invariato', () => {
  const env = WindowsPowerShell.environment({ PSModulePath: 'c:\\program files\\powershell\\7\\Modules', psmodulepath: 'x', PATH: 'C:\\bin', SystemRoot: 'C:\\Windows' });
  assert.deepEqual(env, { PATH: 'C:\\bin', SystemRoot: 'C:\\Windows' });
});

test('comando di estrazione: errori bloccanti e percorsi con apostrofi', () => {
  const command = WindowsPowerShell.expandArchiveCommand("C:\\Users\\l'utente\\a.zip", 'C:\\tmp\\dest è');
  assert.equal(command, "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath 'C:\\Users\\l''utente\\a.zip' -DestinationPath 'C:\\tmp\\dest è' -Force");
});

test('l\'installatore pubblicato da solo ripete la stessa logica', () => {
  const installer = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install-update.cjs'), 'utf8');
  assert.match(installer, /\$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath/);
  assert.match(installer, /key\.toLowerCase\(\) === 'psmodulepath'/);
  assert.match(installer, /env: psEnv/);
});
