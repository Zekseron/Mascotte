'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { parseRelease, compareVersions, downloadRelease } = require('../lib/releases.cjs');

const bytes = Buffer.from('download fixture');
function release() {
  return { tag_name: 'v0.7.0', draft: false, prerelease: false, assets: [{
    name: 'Mascotte-Windows-0.7.0-x64.zip', state: 'uploaded', size: bytes.length,
    digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
    browser_download_url: 'https://github.com/Zekseron/Mascotte/releases/download/v0.7.0/Mascotte-Windows-0.7.0-x64.zip'
  }] };
}
test('selects only stable official Windows release with a valid digest', () => {
  assert.equal(parseRelease(release()).version, '0.7.0');
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.7.0', 'v0.7.0'), 0);
  assert.equal(compareVersions('0.6.9', '0.7.0'), -1);
  for (const mutate of [
    r => { r.prerelease = true; }, r => { r.draft = true; },
    r => { r.tag_name = 'v0.7.0-beta'; }, r => { r.assets[0].digest = null; },
    r => { r.assets[0].size = 0; }, r => { r.assets[0].browser_download_url = 'https://example.com/file.zip'; },
    r => { r.assets[0].browser_download_url = 'https://github.com/other/project/releases/download/v0.7.0/Mascotte-Windows-0.7.0-x64.zip'; },
    r => { r.assets.push({ ...r.assets[0] }); }
  ]) { const value = release(); mutate(value); assert.throws(() => parseRelease(value)); }
});
test('downloads a verified archive and rejects altered or incomplete bytes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte release '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const item = parseRelease(release());
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
