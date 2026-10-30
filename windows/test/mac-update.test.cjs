'use strict';
// Passo 10 del piano Mac: pacchetti, release, aggiornamento da sorgenti, installatore e firma. Tutto in cartelle
// temporanee: nessuna scrittura in /Applications, nessun `open`, nessun accesso al portachiavi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const Releases = require('../lib/releases.cjs');
const Updater = require('../lib/updater.cjs');
const Installer = require('../scripts/install-update.cjs');
const Sign = require('../scripts/mac-sign.cjs');
const mac = { skip: process.platform !== 'darwin' && 'solo macOS' };

const digest = crypto.createHash('sha256').update('x').digest('hex');
function release(name = 'Mascotte-Mac-0.9.0-arm64.zip', tag = 'v0.9.0') {
  return { tag_name: tag, draft: false, prerelease: false, assets: [
    { name: 'Mascotte-Windows-0.9.0-x64.zip', state: 'uploaded', size: 10, digest: 'sha256:' + digest, browser_download_url: `https://github.com/Zekseron/Mascotte/releases/download/${tag}/Mascotte-Windows-0.9.0-x64.zip` },
    { name, state: 'uploaded', size: 20, digest: 'sha256:' + digest, browser_download_url: `https://github.com/Zekseron/Mascotte/releases/download/${tag}/${name}` }] };
}

test('release: asset scelto per piattaforma, con le stesse verifiche', () => {
  const win = Releases.parseRelease(release(), 'win32'), darwin = Releases.parseRelease(release(), 'darwin');
  assert.equal(win.name, 'Mascotte-Windows-0.9.0-x64.zip'); assert.equal(win.size, 10);
  assert.equal(darwin.name, 'Mascotte-Mac-0.9.0-arm64.zip'); assert.equal(darwin.size, 20);
  assert.equal(darwin.sha256, digest); assert.match(darwin.url, /^https:\/\/github\.com\/Zekseron\/Mascotte\/releases\/download\/v0\.9\.0\/Mascotte-Mac-0\.9\.0-arm64\.zip$/);
  assert.throws(() => Releases.parseRelease(release(), 'linux'));
  const onlyWindows = release(); onlyWindows.assets.pop();
  assert.throws(() => Releases.parseRelease(onlyWindows, 'darwin'), /pacchetto Mac atteso/);
  const onlyMac = release(); onlyMac.assets.shift();
  assert.throws(() => Releases.parseRelease(onlyMac, 'win32'), /pacchetto Windows atteso/);
  for (const mutate of [r => { r.assets[1].digest = null; }, r => { r.assets[1].size = 0; }, r => { r.assets[1].browser_download_url = 'https://example.com/Mascotte-Mac-0.9.0-arm64.zip'; },
    r => { r.assets[1].browser_download_url = 'https://github.com/other/p/releases/download/v0.9.0/Mascotte-Mac-0.9.0-arm64.zip'; }, r => { r.assets[1].state = 'new'; }, r => { r.assets.push({ ...r.assets[1] }); }, r => { r.prerelease = true; }]) {
    const value = release(); mutate(value); assert.throws(() => Releases.parseRelease(value, 'darwin'));
  }
});

test('release Mac: controlli del bundle (identificativo, firma, stessa identità)', async () => {
  const calls = [];
  const fake = ({ id = 'local.mascotte.desktop', verify = true, requirements = {} } = {}) => async (file, args) => {
    calls.push([path.basename(file), ...args]);
    if (file.endsWith('plutil')) return { stdout: id + '\n', stderr: '' };
    if (file.endsWith('codesign') && args[0] === '--verify') { if (!verify) throw new Error('a sealed resource is missing'); return { stdout: '', stderr: '' }; }
    if (file.endsWith('codesign') && args[0] === '-d') return { stdout: '', stderr: `Executable=x\ndesignated => ${requirements[args[2]] ?? 'cdhash H"aa"'}\n` };
    throw new Error('comando inatteso');
  };
  const certA = 'identifier "local.mascotte.desktop" and certificate leaf = H"AAAA"', certB = 'identifier "local.mascotte.desktop" and certificate leaf = H"BBBB"';
  await Releases.verifyMacBundle('/n/Mascotte.app', { run: fake(), currentApp: '/c/Mascotte.app' }); // app in esecuzione ad hoc: nessun vincolo
  await Releases.verifyMacBundle('/n/Mascotte.app', { run: fake({ requirements: { '/c/Mascotte.app': certA, '/n/Mascotte.app': certA } }), currentApp: '/c/Mascotte.app' });
  await assert.rejects(Releases.verifyMacBundle('/n/Mascotte.app', { run: fake({ id: 'local.mascotte.app' }) }), /non è Mascotte/);
  await assert.rejects(Releases.verifyMacBundle('/n/Mascotte.app', { run: fake({ verify: false }) }), /firma del pacchetto non è valida/);
  await assert.rejects(Releases.verifyMacBundle('/n/Mascotte.app', { run: fake({ requirements: { '/c/Mascotte.app': certA, '/n/Mascotte.app': certB } }), currentApp: '/c/Mascotte.app' }), /identità diversa/);
  await assert.rejects(Releases.verifyMacBundle('/n/Mascotte.app', { run: fake({ requirements: { '/c/Mascotte.app': certA } }), currentApp: '/c/Mascotte.app' }), /identità diversa/); // nuovo ad hoc
  assert.equal(Releases.runningMacApp('/Applications/Mascotte.app/Contents/MacOS/Mascotte'), path.resolve('/Applications/Mascotte.app'));
  assert.equal(Releases.runningMacApp('/usr/local/bin/node'), null);
});

test('release Mac: estrazione con ditto e controlli sul file ZIP reale', mac, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte rel ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const app = fakeApp(path.join(base, 'src', 'Mascotte.app'), 'local.mascotte.desktop');
  const zip = path.join(base, 'a.zip'); zipApp(app, zip);
  const work = path.join(base, 'w1'); fs.mkdirSync(work);
  const noSign = async (file, args, o) => file.endsWith('codesign') ? { stdout: '', stderr: '' } : require('../lib/releases.cjs').verifyMacBundle && realRun(file, args, o);
  const runtime = await Releases.extractRuntime(zip, work, undefined, { platform: 'darwin', currentApp: null, run: noSign });
  assert.equal(runtime, path.join(work, 'runtime', 'Mascotte.app', 'Contents', 'MacOS', 'Mascotte')); assert.ok(fs.existsSync(runtime));
  const wrong = path.join(base, 'src2'); fs.mkdirSync(wrong); fs.writeFileSync(path.join(wrong, 'x'), 'x');
  const zip2 = path.join(base, 'b.zip'); assert.equal(spawnSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', wrong, zip2]).status, 0);
  const work2 = path.join(base, 'w2'); fs.mkdirSync(work2);
  await assert.rejects(Releases.extractRuntime(zip2, work2, undefined, { platform: 'darwin', currentApp: null, run: noSign }), /file previsti/);
});
const realRun = (file, args) => { const r = spawnSync(file, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return { stdout: r.stdout, stderr: r.stderr }; };
function fakeApp(app, id, marker = 'x') {
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true }); fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>\n`);
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'Mascotte'), marker); fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'app.asar'), marker);
  return app;
}
function zipApp(app, zip) { assert.equal(spawnSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]).status, 0); }

test('updater Mac: destinazione sempre /Applications/Mascotte.app, mai dentro repo o dati', mac, t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte inst ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo'), data = path.join(base, 'data'), dest = path.join(base, 'Applications', 'Mascotte.app');
  fs.mkdirSync(repo); fs.mkdirSync(data);
  const exe = path.join(repo, 'windows', 'dist', 'mac-arm64', 'Mascotte.app', 'Contents', 'MacOS', 'Mascotte');
  assert.equal(Updater.installationDirectory(exe, repo, data, { platform: 'darwin', macDestination: dest }), dest);
  assert.equal(Updater.installationDirectory(path.join(dest, 'Contents', 'MacOS', 'Mascotte'), repo, data, { platform: 'darwin', macDestination: dest }), dest);
  assert.throws(() => Updater.installationDirectory(exe, repo, data, { platform: 'darwin', macDestination: path.join(repo, 'Mascotte.app') }), /interseca/);
  assert.throws(() => Updater.installationDirectory(exe, repo, data, { platform: 'darwin', macDestination: path.join(data, 'Mascotte.app') }), /interseca/);
  fs.mkdirSync(path.dirname(dest)); fs.writeFileSync(dest, 'file');
  assert.throws(() => Updater.installationDirectory(exe, repo, data, { platform: 'darwin', macDestination: dest }), /non è una cartella normale/);
  assert.equal(Updater.installationDirectory('/Applications/Mascotte.app/Contents/MacOS/Mascotte', '/r', '/d', { platform: 'darwin' }), '/Applications/Mascotte.app');
  assert.equal(Updater.currentLocation('/Applications/Mascotte.app/Contents/MacOS/Mascotte', 'darwin'), '/Applications/Mascotte.app');
  assert.equal(Updater.currentLocation('C:\\App\\Mascotte.exe', 'win32') === path.dirname('C:\\App\\Mascotte.exe'), true);
});

test('updater Mac: git, node e npm trovati anche con PATH minimo', mac, () => {
  const present = new Set(['/opt/homebrew/bin/git', '/Users/u/.nvm/versions/node/v22.1.0/bin/node']);
  const opts = { platform: 'darwin', env: { PATH: '/usr/bin:/bin' }, home: '/Users/u/', exists: p => present.has(p) };
  assert.equal(Updater.findTool('git', opts), '/opt/homebrew/bin/git');
  assert.equal(Updater.findTool('npm', opts), null);
  assert.equal(Updater.findTool('git', { ...opts, platform: 'win32' }), 'git.exe');
  const env = Updater.toolEnvironment({ env: { PATH: '/usr/bin' }, node: '/x/node/bin/node', npm: '/x/node/bin/npm' });
  assert.ok(env.PATH.startsWith('/x/node/bin' + path.delimiter)); assert.ok(env.PATH.split(path.delimiter).includes('/opt/homebrew/bin')); assert.equal(env.GIT_TERMINAL_PROMPT, '0');
});

test('validateRepository non rifiuta più macOS', mac, t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte repo ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sh = (...args) => { const r = spawnSync('git', ['-C', base, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  sh('init', '-b', 'main'); sh('remote', 'add', 'origin', 'git@github.com:Zekseron/Mascotte.git');
  sh('config', 'branch.main.remote', 'origin'); sh('config', 'branch.main.merge', 'refs/heads/main');
  fs.mkdirSync(path.join(base, 'windows')); fs.writeFileSync(path.join(base, 'windows', 'package.json'), '{"name":"mascotte-windows","version":"1.2.3"}');
  const repo = Updater.validateRepository(base);
  assert.equal(repo.version, '1.2.3'); assert.equal(repo.mergeRef, 'refs/heads/main'); assert.equal(repo.dirty, true);
  assert.throws(() => Updater.validateRepository(base, { requireClean: true }), /modifiche locali/);
  sh('remote', 'set-url', 'origin', 'https://github.com/altro/progetto.git');
  assert.throws(() => Updater.validateRepository(base), /deve provenire/);
});

test('updater Mac: spawn diretto, ZIP atteso e arresto del gruppo di processi', mac, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte src ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const bin = path.join(base, 'bin'); fs.mkdirSync(bin);
  const log = path.join(base, 'log.txt');
  // «git» e «npm» finti: registrano gli argomenti; «npm run build:mac» crea il pacchetto nella cartella dedicata.
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "git $@" >> '${log}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\necho v22.1.0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "npm $@" >> '${log}'\nfor a in "$@"; do case "$a" in --config.directories.output=*) out="\${a#*=}";; esac; done\nif [ -n "$out" ]; then mkdir -p "$out/mac-arm64/Mascotte.app/Contents/MacOS"; : > "$out/mac-arm64/Mascotte.app/Contents/MacOS/Mascotte"; : > "$out/Mascotte-Mac-1.2.3-arm64.zip"; fi\n`, { mode: 0o755 });
  const repoDir = path.join(base, 'repo');
  const sh = (...args) => { const r = spawnSync('/usr/bin/git', ['-C', repoDir, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  fs.mkdirSync(path.join(repoDir, 'windows'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'windows', 'package.json'), '{"name":"mascotte-windows","version":"1.2.3"}');
  sh('init', '-b', 'main'); sh('remote', 'add', 'origin', 'https://github.com/Zekseron/Mascotte.git');
  sh('config', 'branch.main.remote', 'origin'); sh('config', 'branch.main.merge', 'refs/heads/main');
  sh('add', '.'); sh('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'x');
  const steps = [];
  const result = await Updater.updateFromRepositoryMac(repoDir, message => steps.push(message), undefined, { tools: { git: path.join(bin, 'git'), node: path.join(bin, 'node'), npm: path.join(bin, 'npm') } });
  assert.match(result.archive, /mascotte-update-[0-9a-f-]+\/Mascotte-Mac-1\.2\.3-arm64\.zip$/);
  assert.match(result.runtime, /mac-arm64\/Mascotte\.app\/Contents\/MacOS\/Mascotte$/);
  const calls = fs.readFileSync(log, 'utf8');
  assert.match(calls, /git -C .* pull --ff-only origin refs\/heads\/main/); assert.match(calls, /npm ci/);
  assert.match(calls, /npm run build:mac -- --config\.directories\.output=dist\/mascotte-update-/);
  assert.equal(steps.length, 4);
});

test('mac-sign: ricerca dell’identità, firma coerente e ZIP rigenerato', mac, t => {
  const out = '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Mascotte Firma Locale" (CSSMERR_TP_NOT_TRUSTED)\n  2) ' + 'A'.repeat(40) + ' "Mascotte Firma Locale Vecchia"\n     2 identities found\n';
  const find = (stdout, status = 0) => () => ({ status, stdout, stderr: '' });
  assert.deepEqual(Sign.findIdentity('Mascotte Firma Locale', find(out)), { hash: '0123456789ABCDEF0123456789ABCDEF01234567', name: 'Mascotte Firma Locale' });
  assert.equal(Sign.findIdentity('Altro', find(out)), null);
  assert.equal(Sign.findIdentity('Mascotte Firma Locale', find('     0 valid identities found\n')), null);
  assert.equal(Sign.findIdentity('Mascotte Firma Locale', find(out, 1)), null);
  assert.equal(Sign.outputDirectory(['--x', '--config.directories.output=dist/mascotte-update-1'], '/p'), '/p/dist/mascotte-update-1');
  assert.equal(Sign.outputDirectory([], '/p'), '/p/dist');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte sign ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const app = path.join(base, 'mac-arm64', 'Mascotte.app'); fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'mascotte-window-helper'), 'h');
  fs.writeFileSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip'), 'old'); fs.writeFileSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip.blockmap'), 'b');
  const calls = [], warnings = [];
  const run = (file, args) => {
    calls.push([path.basename(file), ...args.map(a => a.startsWith(base) ? path.relative(base, a) : a)]);
    if (file.endsWith('security')) return { status: 0, stdout: out, stderr: '' };
    if (file.endsWith('ditto')) fs.writeFileSync(args[args.length - 1], 'new zip');
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = Sign.signOutput(base, { env: {}, run, log() {}, warn: m => warnings.push(m) });
  assert.equal(result.signed, true); assert.equal(warnings.length, 0);
  const id = '0123456789ABCDEF0123456789ABCDEF01234567';
  assert.deepEqual(calls.filter(c => c[0] === 'codesign').map(c => c.slice(1)), [
    ['--force', '--sign', id, 'mac-arm64/Mascotte.app/Contents/Resources/mascotte-window-helper'],
    ['--force', '--deep', '--sign', id, 'mac-arm64/Mascotte.app'],
    ['--verify', '--deep', '--strict', 'mac-arm64/Mascotte.app'],
    ['--verify', '--strict', 'mac-arm64/Mascotte.app/Contents/Resources/mascotte-window-helper']]);
  assert.ok(!calls.flat().includes('--options'), 'niente hardened runtime');
  assert.deepEqual(calls.find(c => c[0] === 'ditto').slice(1, 5), ['-c', '-k', '--sequesterRsrc', '--keepParent']);
  assert.equal(fs.readFileSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip'), 'utf8'), 'new zip');
  assert.equal(fs.existsSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip.blockmap')), false);
  // Nome personalizzato e certificato assente: avviso, nessuna firma, ZIP intatto.
  calls.length = 0; fs.writeFileSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip'), 'old');
  const none = Sign.signOutput(base, { env: { MASCOTTE_MAC_IDENTITY: 'Non esiste' }, run, log() {}, warn: m => warnings.push(m) });
  assert.equal(none.signed, false); assert.match(warnings[0], /Non esiste.*ad hoc/);
  assert.equal(calls.filter(c => c[0] === 'codesign').length, 0); assert.equal(fs.readFileSync(path.join(base, 'Mascotte-Mac-1.0.0-arm64.zip'), 'utf8'), 'old');
  // Errore di codesign: l'avviso non lo nasconde.
  const failing = (file, args) => file.endsWith('codesign') ? { status: 1, stdout: '', stderr: 'errSecInternalComponent' } : run(file, args);
  assert.throws(() => Sign.signOutput(base, { env: {}, run: failing, log() {}, warn() {} }), /Firma dell’helper non riuscito/);
});

// ---- Installatore Mac, in cartelle temporanee ----
function scenario(t, { oldId = 'local.mascotte.app' } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte è mac ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dest = path.join(base, 'Applications', 'Mascotte.app'), data = path.join(base, 'data');
  fs.mkdirSync(path.join(base, 'Applications')); fs.mkdirSync(data);
  if (oldId) fakeApp(dest, oldId, 'vecchia');
  const zip = path.join(base, 'nuova.zip'); zipApp(fakeApp(path.join(base, 'src', 'Mascotte.app'), 'local.mascotte.desktop', 'nuova'), zip);
  const args = (extra = {}) => ({ archive: zip, 'install-dir': dest, 'data-dir': data, 'workspace-dir': path.join(base, 'repo'), 'result-file': path.join(base, 'result.json'), ...extra });
  const options = (extra = {}) => ({ skipSignatureCheck: true, otherProcesses: () => [], restart: async () => {}, ...extra });
  const left = () => fs.readdirSync(path.dirname(dest)).filter(n => n.startsWith('.mascotte-'));
  return { base, dest, data, zip, args, options, left };
}
const read = (app, file = 'Contents/MacOS/Mascotte') => fs.readFileSync(path.join(app, file), 'utf8');

test('installatore Mac: la vecchia app Swift viene salvata in ZIP e poi sostituita', mac, async t => {
  const s = scenario(t); let restarted = null;
  await Installer.mainMac(s.args({ restart: true }), s.options({ restart: async dir => { restarted = dir; } }));
  assert.equal(read(s.dest), 'nuova'); assert.equal(restarted, s.dest);
  const backups = fs.readdirSync(path.join(s.data, 'backup')); assert.equal(backups.length, 1); assert.match(backups[0], /^Mascotte-swift-.*\.zip$/);
  const check = path.join(s.base, 'check'); fs.mkdirSync(check);
  assert.equal(spawnSync('/usr/bin/ditto', ['-x', '-k', path.join(s.data, 'backup', backups[0]), check]).status, 0);
  assert.equal(read(path.join(check, 'Mascotte.app')), 'vecchia'); assert.match(read(path.join(check, 'Mascotte.app'), 'Contents/Info.plist'), /local\.mascotte\.app/);
  assert.deepEqual(s.left(), []);
  const result = JSON.parse(fs.readFileSync(path.join(s.base, 'result.json'), 'utf8')); assert.equal(result.ok, true); assert.match(result.message, /Backup della vecchia app/);
});

test('installatore Mac: app già nuova, sostituzione senza ZIP e senza residui', mac, async t => {
  const s = scenario(t, { oldId: 'local.mascotte.desktop' });
  await Installer.mainMac(s.args({ 'previous-exe': '/altrove/Mascotte.app/Contents/MacOS/Mascotte' }), s.options());
  assert.equal(read(s.dest), 'nuova'); assert.equal(fs.existsSync(path.join(s.data, 'backup')), false); assert.deepEqual(s.left(), []);
  assert.match(JSON.parse(fs.readFileSync(path.join(s.base, 'result.json'), 'utf8')).message, /Crea \/ aggiorna hook in Impostazioni: l’app è stata spostata/);
});

test('installatore Mac: prima installazione senza app in destinazione', mac, async t => {
  const s = scenario(t, { oldId: null });
  await Installer.mainMac(s.args(), s.options());
  assert.equal(read(s.dest), 'nuova'); assert.deepEqual(s.left(), []);
});

test('installatore Mac: errore durante la sostituzione, la vecchia app torna al suo posto', mac, async t => {
  for (const oldId of ['local.mascotte.app', 'local.mascotte.desktop']) {
    const s = scenario(t, { oldId }); const rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (from.includes('/.mascotte-staging-')) { const e = new Error('errore simulato'); e.code = 'EIO'; throw e; } return rename(from, to); };
    try { await assert.rejects(Installer.mainMac(s.args(), s.options()), /errore simulato/); } finally { fs.renameSync = rename; }
    assert.equal(read(s.dest), 'vecchia'); assert.deepEqual(s.left(), []);
    assert.equal(fs.existsSync(path.join(s.base, 'result.json')), false);
  }
});

test('installatore Mac: ripristino impossibile, la versione precedente è indicata', mac, async t => {
  const s = scenario(t, { oldId: 'local.mascotte.desktop' }); const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (from.includes('/.mascotte-staging-') || path.basename(from).startsWith('.mascotte-old-')) { const e = new Error('errore simulato'); e.code = 'EIO'; throw e; } return rename(from, to); };
  try { await assert.rejects(Installer.mainMac(s.args(), s.options()), /Ripristino non riuscito.*\.mascotte-old-/); } finally { fs.renameSync = rename; }
  assert.equal(s.left().filter(n => n.startsWith('.mascotte-old-')).length, 1);
});

test('installatore Mac: backup fallito, la vecchia app non viene toccata', mac, async t => {
  const s = scenario(t);
  fs.rmSync(s.data, { recursive: true }); fs.writeFileSync(s.data, 'un file al posto della cartella dati');
  await assert.rejects(Installer.mainMac(s.args(), s.options()));
  assert.equal(read(s.dest), 'vecchia'); assert.deepEqual(s.left(), []);
});

test('installatore Mac: ZIP non valido o pacchetto sbagliato preservano la vecchia app', mac, async t => {
  const s = scenario(t); const ready = path.join(s.base, 'ready');
  fs.writeFileSync(path.join(s.base, 'rotto.zip'), 'non è uno zip');
  await assert.rejects(Installer.mainMac(s.args({ archive: path.join(s.base, 'rotto.zip'), 'ready-file': ready }), s.options()));
  const other = path.join(s.base, 'altra.zip'); zipApp(fakeApp(path.join(s.base, 'src2', 'Mascotte.app'), 'local.mascotte.app', 'altra'), other);
  await assert.rejects(Installer.mainMac(s.args({ archive: other, 'ready-file': ready }), s.options()), /non è Mascotte/);
  const layout = path.join(s.base, 'layout'); fs.mkdirSync(layout); fs.writeFileSync(path.join(layout, 'x'), 'x');
  const wrong = path.join(s.base, 'layout.zip'); assert.equal(spawnSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', layout, wrong]).status, 0);
  await assert.rejects(Installer.mainMac(s.args({ archive: wrong, 'ready-file': ready }), s.options()), /non contiene Mascotte\.app/);
  assert.equal(read(s.dest), 'vecchia'); assert.equal(fs.existsSync(ready), false); assert.deepEqual(s.left(), []);
  assert.equal(fs.existsSync(path.join(s.data, 'backup')), false);
});

test('installatore Mac: firma non valida rifiutata (senza saltare il controllo)', mac, async t => {
  const s = scenario(t); // l'app finta non è firmata: codesign --verify deve fallire
  await assert.rejects(Installer.mainMac(s.args(), { ...s.options(), skipSignatureCheck: false }), /firma del pacchetto non è valida/);
  assert.equal(read(s.dest), 'vecchia');
});

test('installatore Mac: un’altra istanza aperta impedisce la sostituzione; destinazioni non ammesse', mac, async t => {
  const s = scenario(t);
  await assert.rejects(Installer.mainMac(s.args(), s.options({ otherProcesses: () => ['999'] })), /ancora aperta/);
  assert.equal(read(s.dest), 'vecchia');
  await assert.rejects(Installer.mainMac(s.args({ 'install-dir': path.join(s.base, 'Applications', 'Mascotte') }), s.options()), /\.app/);
  await assert.rejects(Installer.mainMac(s.args({ 'install-dir': path.join(s.data, 'Mascotte.app') }), s.options()), /dati personali/);
  await assert.rejects(Installer.mainMac(s.args({ 'install-dir': path.join(s.base, 'repo', 'Mascotte.app') }), s.options()), /progetto sorgente/);
});

test('installatore Mac: attende la chiusura del PID prima di sostituire', mac, async t => {
  const s = scenario(t); const child = spawn('/bin/sleep', ['1.2'], { stdio: 'ignore' });
  const closed = new Promise(resolve => child.once('exit', () => resolve(Date.now())));
  const started = Date.now();
  await Installer.mainMac(s.args({ 'wait-pid': String(child.pid) }), s.options());
  const finished = Date.now(); assert.ok(await closed <= finished, 'sostituzione dopo la chiusura'); assert.ok(finished - started >= 800);
  assert.equal(read(s.dest), 'nuova');
  await assert.rejects(Installer.mainMac(s.args({ 'wait-pid': String(process.pid) }), s.options()), /PID da attendere/);
});

test('installatore Mac: rimuove la quarantena presente nello ZIP', mac, async t => {
  const s2 = scenario(t, { oldId: null });
  fakeApp(path.join(s2.base, 'q', 'Mascotte.app'), 'local.mascotte.desktop', 'q');
  // Gli attributi estesi nello ZIP (--sequesterRsrc) tornano all'estrazione: si impone la quarantena prima di zippare.
  spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0081;00000000;Safari;', path.join(s2.base, 'q', 'Mascotte.app', 'Contents', 'MacOS', 'Mascotte')]);
  zipApp(path.join(s2.base, 'q', 'Mascotte.app'), s2.zip);
  await Installer.mainMac(s2.args(), s2.options());
  assert.doesNotMatch(spawnSync('/usr/bin/xattr', ['-rl', s2.dest], { encoding: 'utf8' }).stdout, /quarantine/);
});

test('hook: avviso solo se puntano a un’app diversa (sola lettura)', t => {
  const Setup = require('../lib/setup.cjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte hook ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const config = path.join(base, 'settings.json'), record = path.join(base, 'hook-installation.json');
  assert.equal(Setup.hooksPointElsewhere(record, '/Applications/Mascotte.app/Contents/MacOS/Mascotte'), false);
  fs.writeFileSync(record, JSON.stringify({ paths: { claude: config, codex: path.join(base, 'manca.toml') } }));
  fs.writeFileSync(config, JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "ELECTRON_RUN_AS_NODE=1 '/dist/Mascotte.app/Contents/MacOS/Mascotte' 'b' --mascotte-notify --claude-hook" }] }] } }));
  assert.equal(Setup.hooksPointElsewhere(record, '/Applications/Mascotte.app/Contents/MacOS/Mascotte'), true);
  assert.equal(Setup.hooksPointElsewhere(record, '/dist/Mascotte.app/Contents/MacOS/Mascotte'), false);
  fs.writeFileSync(config, '{}'); assert.equal(Setup.hooksPointElsewhere(record, '/x'), false);
});

test('origine della repo: nome utente nell’URL HTTPS accettato, altre repo no', () => {
  const { normalizedOrigin, OFFICIAL_ORIGIN } = require('../lib/updater.cjs');
  const official = OFFICIAL_ORIGIN.toLowerCase();
  for (const url of ['https://Zekseron@github.com/Zekseron/Mascotte.git', 'https://github.com/Zekseron/Mascotte', 'git@github.com:Zekseron/Mascotte.git', 'ssh://git@github.com/Zekseron/Mascotte.git'])
    assert.equal(normalizedOrigin(url), official, url);
  for (const url of ['https://Zekseron@github.com/altro/Mascotte.git', 'https://github.com@evil.test/Zekseron/Mascotte', 'https://x@evil.test/Zekseron/Mascotte'])
    assert.notEqual(normalizedOrigin(url), official, url);
});

test('aggiornamento da sorgenti: rimuove solo le vecchie compilazioni mascotte-update', t => {
  const { removeOldOutputs } = require('../lib/updater.cjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte dist ')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dist = path.join(base, 'dist'), old = 'mascotte-update-cffb3f5d-4dff-44bc-8723-d944446ed10a', running = 'mascotte-update-11111111-2222-3333-4444-555555555555';
  for (const name of [old, running, 'mac-arm64', 'mascotte-update-non-uuid']) fs.mkdirSync(path.join(dist, name, 'x'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'Mascotte-Mac-0.8.0-arm64.zip'), 'zip');
  removeOldOutputs(base, path.join(dist, running, 'x', 'Mascotte'));
  assert.deepEqual(fs.readdirSync(dist).sort(), ['Mascotte-Mac-0.8.0-arm64.zip', 'mac-arm64', 'mascotte-update-non-uuid', running].sort());
});

test('B3: la cartella dati dell\'installatore Windows usa --data-dir, poi %LOCALAPPDATA%\\Mascotte', () => {
  assert.equal(typeof Installer.windowsDataDirectory, 'function');
  assert.equal(Installer.windowsDataDirectory({ 'data-dir': '/dati/mia' }, { LOCALAPPDATA: '/local' }), path.resolve('/dati/mia'));
  assert.equal(Installer.windowsDataDirectory({ 'data-dir': '/dati/mia' }, {}), path.resolve('/dati/mia'), 'anche senza LOCALAPPDATA');
  assert.equal(Installer.windowsDataDirectory({}, { LOCALAPPDATA: '/local' }), path.resolve('/local', 'Mascotte'));
  assert.equal(Installer.windowsDataDirectory({}, {}), undefined);
  // Il controllo di sicurezza di main() deve usare questa funzione, non LOCALAPPDATA direttamente.
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install-update.cjs'), 'utf8');
  assert.match(source, /const dataDir = windowsDataDirectory\(args\)/);
});
