'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { parseRelease, compareVersions, downloadRelease, latestRelease } = require('../lib/releases.cjs');

const bytes = Buffer.from('download fixture');
function release() {
  return { tag_name: 'v0.7.0', draft: false, prerelease: false, assets: [{
    name: 'Mascotte-Windows-0.7.0-x64.zip', state: 'uploaded', size: bytes.length,
    digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
    browser_download_url: 'https://github.com/Zekseron/Mascotte/releases/download/v0.7.0/Mascotte-Windows-0.7.0-x64.zip'
  }] };
}
test('selects only stable official Windows release with a valid digest', () => {
  assert.equal(parseRelease(release(), 'win32').version, '0.7.0');
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.9.1', '0.9.0'), 1);
  assert.equal(compareVersions('0.7.0', 'v0.7.0'), 0);
  assert.equal(compareVersions('0.6.9', '0.7.0'), -1);
  for (const mutate of [
    r => { r.prerelease = true; }, r => { r.draft = true; },
    r => { r.tag_name = 'v0.7.0-beta'; }, r => { r.assets[0].digest = null; },
    r => { r.assets[0].size = 0; }, r => { r.assets[0].browser_download_url = 'https://example.com/file.zip'; },
    r => { r.assets[0].browser_download_url = 'https://github.com/other/project/releases/download/v0.7.0/Mascotte-Windows-0.7.0-x64.zip'; },
    r => { r.assets.push({ ...r.assets[0] }); }
  ]) { const value = release(); mutate(value); assert.throws(() => parseRelease(value, 'win32')); }
});
test('downloads a verified archive and rejects altered or incomplete bytes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte release '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const item = parseRelease(release(), 'win32');
  const file = await downloadRelease(item, dir, undefined, async () => Readable.from([bytes]));
  assert.deepEqual(fs.readFileSync(file), bytes); fs.unlinkSync(file);
  for (const content of [Buffer.from('download fixturf'), bytes.subarray(0, 4), Buffer.concat([bytes, bytes])]) {
    await assert.rejects(downloadRelease(item, dir, undefined, async () => Readable.from([content])));
    assert.deepEqual(fs.readdirSync(dir), []);
  }
  const abort = new AbortController(); abort.abort();
  await assert.rejects(downloadRelease(item, dir, abort.signal, async () => Readable.from([bytes])));
  assert.deepEqual(fs.readdirSync(dir), []);
});

function platformRelease(version, platform) {
  const r = release(); r.tag_name = 'v' + version;
  const name = platform === 'darwin' ? `Mascotte-Mac-${version}-arm64.zip` : `Mascotte-Windows-${version}-x64.zip`;
  r.assets[0].name = name;
  r.assets[0].browser_download_url = `https://github.com/Zekseron/Mascotte/releases/download/v${version}/${name}`;
  return r;
}
const metadata = value => Readable.from([Buffer.from(JSON.stringify(value))]);
test('release Windows separata: Mac conserva la sua ultima versione disponibile', async () => {
  const windows = platformRelease('0.9.1', 'win32'), mac = platformRelease('0.9.0', 'darwin');
  let calls = 0;
  const get = async url => { calls++; return metadata(url.endsWith('/latest') ? windows : [windows, mac]); };
  assert.equal((await latestRelease(undefined, 'win32', get)).version, '0.9.1');
  assert.equal(calls, 1);
  assert.equal((await latestRelease(undefined, 'darwin', get)).version, '0.9.0');
});
test('release separata: cerca altre pagine, ignora anteprime e non ripiega su un pacchetto corrotto', async () => {
  const latest = platformRelease('0.9.2', 'win32'), mac = platformRelease('0.9.0', 'darwin');
  const preview = { ...platformRelease('0.9.3', 'darwin'), prerelease: true };
  let calls = 0;
  const get = async url => { calls++; return metadata(url.endsWith('/latest') ? latest : url.includes('page=1') ? [preview, ...Array(19).fill(latest)] : [mac]); };
  assert.equal((await latestRelease(undefined, 'darwin', get)).version, '0.9.0');
  assert.equal(calls, 3);
  mac.assets[0].digest = null;
  await assert.rejects(latestRelease(undefined, 'darwin', get), /SHA-256/);
});
test('release separata: nessun pacchetto compatibile e metadati invalidi danno errori espliciti', async () => {
  const windows = platformRelease('0.9.1', 'win32');
  await assert.rejects(latestRelease(undefined, 'darwin', async url => metadata(url.endsWith('/latest') ? windows : [windows])), /Non è disponibile un pacchetto Mac/);
  await assert.rejects(latestRelease(undefined, 'darwin', async url => metadata(url.endsWith('/latest') ? windows : {})), /Elenco delle release/);
  const invalid = platformRelease('0.9.1', 'darwin'); invalid.assets[0].browser_download_url = 'https://example.com/falso.zip';
  await assert.rejects(latestRelease(undefined, 'darwin', async () => metadata(invalid)), /ufficiale/);
});
