'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { installationDirectory } = require('../lib/updater.cjs');

test('updates from repo root and win-unpacked choose a separate installation', { skip: process.platform !== 'win32' && 'updater solo Windows fino al passo 10 del piano Mac (percorsi /var e /private/var)' }, t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte paths '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repository = path.join(base, 'repo'), data = path.join(base, 'data');
  const unpacked = path.join(repository, 'windows', 'dist', 'win-unpacked');
  fs.mkdirSync(unpacked, { recursive: true });
  const previous = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = base;
  try {
    const stable = path.join(base, 'Programs', 'Mascotte');
    assert.equal(installationDirectory(path.join(repository, 'Mascotte.exe'), repository, data), stable);
    assert.equal(installationDirectory(path.join(unpacked, 'Mascotte.exe'), repository, data), stable);
    fs.mkdirSync(stable, { recursive: true });
    assert.equal(installationDirectory(path.join(stable, 'Mascotte.exe'), repository, data), stable);
  } finally {
    if (previous === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previous;
  }
});

test('Windows installer with Electron and a real ASAR: replacement, validation and rollback', { skip: process.platform !== 'win32', timeout: 120000 }, async t => {
  const runtime = require('electron');
  assert.ok(fs.existsSync(runtime), 'Install the development Electron runtime before testing');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte installer prova è '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const source = path.join(base, 'source'), contents = path.join(base, 'contents');
  fs.mkdirSync(source); fs.mkdirSync(path.join(contents, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), '{"name":"installer-fixture","main":"main.cjs"}');
  fs.writeFileSync(path.join(source, 'main.cjs'), 'module.exports = "real ASAR fixture";');
  const asar = await import(pathToFileURL(require.resolve('@electron/asar')).href);
  const asarOutput = await asar.createPackage(source.replace(/\\/g, '/'), path.join(contents, 'resources', 'app.asar'));
  if (asarOutput?.on) await require('node:stream/promises').finished(asarOutput);
  assert.ok(asar.listPackage(path.join(contents, 'resources', 'app.asar')).some(name => name.endsWith('main.cjs')));
  fs.writeFileSync(path.join(contents, 'Mascotte.exe'), 'new executable fixture');
  const archive = path.join(base, 'valid.zip');
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  const compressed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(contents)}, ${quote(archive)})`],
  { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(compressed.status, 0, compressed.stderr);
  const malformedArchive = path.join(base, 'wrong-layout.zip');
  const malformed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(source)}, ${quote(malformedArchive)})`],
  { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(malformed.status, 0, malformed.stderr);
  const installer = path.resolve(__dirname, '../scripts/install-update.cjs');
  const runner = path.join(base, 'runner.cjs');
  fs.writeFileSync(runner, `
    const fs = require('original-fs');
    const cp = require('node:child_process');
    const originalSpawn = cp.spawnSync;
    // Unrelated desktop instances must not influence this isolated installer test.
    cp.spawnSync = (command, args, options) => /tasklist[.]exe$/i.test(command)
      ? {status:0, stdout:process.argv[2]==='running'?'"Mascotte.exe","999","Console","1","100 K"':'', stderr:''} : originalSpawn(command, args, options);
    const mode = process.argv[2], installDir = process.argv[3];
    const rename = fs.renameSync;
    let locks = 0;
    fs.renameSync = (from, to) => {
      const replacing = require('node:path').basename(from).startsWith('.Mascotte-update-');
      const restoring = from.startsWith(installDir + '.backup-');
      if (mode === 'temporary-lock' && from === installDir && locks++ < 2) {
        const error = new Error('temporary Windows lock'); error.code = 'EBUSY'; throw error;
      }
      if (mode === 'permanent-lock' && from === installDir) {
        const error = new Error('injected persistent Windows lock'); error.code = 'EPERM'; throw error;
      }
      if ((mode === 'rollback' || mode === 'restore-failure' || mode === 'cleanup-failure') &&
          (replacing || (mode === 'restore-failure' && restoring))) {
        const error = new Error('injected ' + (restoring ? 'restore' : 'replacement') + ' failure');
        error.code = 'EIO'; throw error;
      }
      return rename(from, to);
    };
    if (mode === 'permission-denied') {
      const mkdir = fs.mkdirSync;
      fs.mkdirSync = (target, ...args) => {
        if (require('node:path').basename(target).startsWith('.Mascotte-update-')) {
          const error = new Error('injected destination permission denied'); error.code='EACCES'; throw error;
        }
        return mkdir(target, ...args);
      };
    }
    if (mode === 'cleanup-failure') fs.promises.rm = async () => { throw new Error('injected cleanup failure'); };
    require(${JSON.stringify(installer)}).main({archive: process.argv[4], 'install-dir':installDir,
      'workspace-dir':${JSON.stringify(path.join(base, 'repo'))}, 'result-file':installDir+'.result.json',
      'ready-file':installDir+'.ready'}).catch(error => {console.error(error.message);process.exitCode=1;});
  `);
  function attempt(name, zip = archive) {
    const install = path.join(base, name);
    fs.mkdirSync(install);
    fs.writeFileSync(path.join(install, 'Mascotte.exe'), 'previous executable');
    fs.writeFileSync(path.join(install, 'Uninstall Mascotte.exe'), 'previous uninstaller');
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    if (name === 'without-tools-path') {
      env.PATH = [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), process.env.SystemRoot || 'C:\\Windows'].join(path.delimiter);
      delete env.Path;
    }
    const result = spawnSync(runtime, [runner, name, install, zip], {
      encoding: 'utf8', windowsHide: true, timeout: 30000,
      env
    });
    return { install, ...result, backups: fs.readdirSync(base).filter(n => n.startsWith(name + '.backup-')) };
  }
  await t.test('successful replacement preserves previous version and a real ASAR', () => {
    const result = attempt('success');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'new executable fixture');
    assert.equal(fs.readFileSync(path.join(result.install, 'Uninstall Mascotte.exe'), 'utf8'), 'previous uninstaller');
    assert.equal(result.backups.length, 1);
    assert.equal(fs.readFileSync(path.join(base, result.backups[0], 'Mascotte.exe'), 'utf8'), 'previous executable');
    assert.ok(fs.readFileSync(path.join(result.install, 'resources/app.asar')).equals(fs.readFileSync(path.join(contents, 'resources/app.asar'))));
    assert.equal(JSON.parse(fs.readFileSync(result.install + '.result.json')).ok, true);
  });
  await t.test('invalid ZIP preserves the old app and never signals readiness', () => {
    const invalid = path.join(base, 'invalid.zip'); fs.writeFileSync(invalid, 'invalid archive');
    const result = attempt('invalid', invalid);
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
    assert.equal(fs.existsSync(result.install + '.ready'), false);
    assert.equal(result.backups.length, 0);
  });
  await t.test('installer finds Windows PowerShell without Git or Node on PATH', () => {
    const result = attempt('without-tools-path');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'new executable fixture');
    assert.equal(result.backups.length, 1);
  });
  await t.test('ZIP with the wrong layout is rejected before readiness', () => {
    const result = attempt('wrong-layout', malformedArchive);
    assert.equal(result.status, 1); assert.match(result.stderr, /non contiene Mascotte/);
    assert.equal(fs.existsSync(result.install + '.ready'), false);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
  });
  await t.test('another running Mascotte prevents replacement', () => {
    const result = attempt('running');
    assert.equal(result.status, 1); assert.match(result.stderr, /ancora aperta/);
    assert.equal(fs.existsSync(result.install + '.ready'), false);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
  });
  await t.test('temporary Windows locks are retried before replacement', () => {
    const result = attempt('temporary-lock');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'new executable fixture');
    assert.equal(result.backups.length, 1);
  });
  await t.test('persistent Windows locks time out with the old app intact', () => {
    const started = Date.now(), result = attempt('permanent-lock');
    assert.equal(result.status, 1); assert.match(result.stderr, /persistent Windows lock/);
    assert.ok(Date.now() - started < 25000);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
    assert.equal(result.backups.length, 0);
  });
  await t.test('unwritable staging preserves the old app before signalling readiness', () => {
    const result = attempt('permission-denied');
    assert.equal(result.status, 1); assert.match(result.stderr, /destination permission denied/);
    assert.equal(fs.existsSync(result.install + '.ready'), false);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
    assert.equal(result.backups.length, 0);
  });
  await t.test('failed replacement restores the old app', () => {
    const result = attempt('rollback');
    assert.equal(result.status, 1); assert.match(result.stderr, /injected replacement failure/);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
    assert.equal(result.backups.length, 0);
  });
  await t.test('failed restore names a recoverable backup', () => {
    const result = attempt('restore-failure');
    assert.equal(result.status, 1); assert.match(result.stderr, /Ripristino non riuscito/);
    assert.equal(result.backups.length, 1);
    const backup = path.join(base, result.backups[0]);
    assert.ok(result.stderr.includes(backup));
    assert.equal(fs.readFileSync(path.join(backup, 'Mascotte.exe'), 'utf8'), 'previous executable');
  });
  await t.test('cleanup failure does not hide the replacement error', () => {
    const result = attempt('cleanup-failure');
    assert.equal(result.status, 1); assert.match(result.stderr, /injected replacement failure/);
    assert.match(result.stderr, /injected cleanup failure/);
    assert.equal(fs.readFileSync(path.join(result.install, 'Mascotte.exe'), 'utf8'), 'previous executable');
  });
});
