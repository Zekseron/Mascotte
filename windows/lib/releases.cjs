'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { spawn } = require('node:child_process');

const API = 'https://api.github.com/repos/Zekseron/Mascotte/releases/latest';
const DOWNLOAD_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
const MAX_ARCHIVE = 1024 * 1024 * 1024;

function versionParts(version) {
  const match = String(version).match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) throw new Error('Versione della release non valida.');
  return match.slice(1).map(Number);
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function parseRelease(release) {
  const version = versionParts(release?.tag_name).join('.');
  if (release.draft || release.prerelease || !Array.isArray(release.assets)) throw new Error('La release pubblicata non è stabile o non contiene pacchetti.');
  const name = `Mascotte-Windows-${version}-x64.zip`;
  const matches = release.assets.filter(asset => asset.name === name && asset.state === 'uploaded');
  if (matches.length !== 1) throw new Error(`La release ${version} non contiene il pacchetto Windows atteso.`);
  const asset = matches[0];
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ARCHIVE || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw new Error('La release non contiene dimensioni e impronta SHA-256 valide.');
  let url;
  try { url = new URL(asset.browser_download_url); } catch { throw new Error('Indirizzo del pacchetto non valido.'); }
  const expectedPath = `/Zekseron/Mascotte/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.pathname !== expectedPath || url.search || url.hash || url.username || url.password) throw new Error('Il pacchetto non proviene dalla release ufficiale Mascotte.');
  return { version, name, url: url.href, size: asset.size, sha256: asset.digest.slice(7).toLowerCase() };
}
function getResponse(url, { signal, redirects = 0, metadata = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Operazione interrotta.')); return; }
    let parsed;
    try { parsed = new URL(url); } catch { reject(new Error('Indirizzo di download non valido.')); return; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (metadata ? parsed.hostname !== 'api.github.com' : !DOWNLOAD_HOSTS.has(parsed.hostname))) { reject(new Error('Indirizzo di download non autorizzato.')); return; }
    const request = https.get(parsed, { headers: { 'User-Agent': 'Mascotte-Windows', Accept: metadata ? 'application/vnd.github+json' : 'application/octet-stream' }, signal }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 5 || !response.headers.location) { reject(new Error('Troppi reindirizzamenti durante il download.')); return; }
        try { resolve(getResponse(new URL(response.headers.location, parsed).href, { signal, redirects: redirects + 1, metadata })); }
        catch { reject(new Error('Reindirizzamento non valido.')); }
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        const message = response.statusCode === 404 && metadata ? 'Non è ancora disponibile una release pubblica di Mascotte.' : `Download non riuscito (HTTP ${response.statusCode}).`;
        reject(new Error(message)); return;
      }
      resolve(response);
    });
    request.setTimeout(30000, () => request.destroy(new Error('Connessione scaduta.')));
    request.once('error', reject);
  });
}
async function latestRelease(signal) {
  const response = await getResponse(API, { signal, metadata: true });
  const chunks = []; let size = 0;
  for await (const chunk of response) { size += chunk.length; if (size > 1024 * 1024) { response.destroy(); throw new Error('Risposta della release troppo grande.'); } chunks.push(chunk); }
  try { return parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('Risposta della release non valida.'); throw error; }
}
async function downloadRelease(release, directory, signal, get = getResponse) {
  const archive = path.join(directory, release.name), partial = archive + '.part';
  const hash = crypto.createHash('sha256'); let size = 0;
  try {
    const response = await get(release.url, { signal });
    const meter = new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length;
      if (size > release.size || size > MAX_ARCHIVE) { done(new Error('Il pacchetto supera la dimensione dichiarata.')); return; }
      hash.update(chunk); done(null, chunk);
    } });
    await pipeline(response, meter, fs.createWriteStream(partial, { flags: 'wx' }), { signal });
    if (size !== release.size || hash.digest('hex') !== release.sha256) throw new Error('Verifica SHA-256 del pacchetto non riuscita.');
    fs.renameSync(partial, archive); return archive;
  } catch (error) { try { fs.unlinkSync(partial); } catch {} throw error; }
}
async function extractRuntime(archive, directory, signal) {
  const unpacked = path.join(directory, 'runtime');
  fs.mkdirSync(unpacked);
  const command = `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${unpacked.replace(/'/g, "''")}' -Force`;
  await new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Operazione interrotta.')); return; }
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-2000); });
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 120000);
    const finish = error => { clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    child.once('error', finish);
    child.once('close', code => finish(signal?.aborted ? new Error('Operazione interrotta.') : code === 0 ? null : new Error(`Estrazione del pacchetto non riuscita: ${stderr.trim()}`)));
  });
  const runtime = path.join(unpacked, 'Mascotte.exe');
  if (!fs.existsSync(runtime) || !fs.existsSync(path.join(unpacked, 'resources', 'app.asar'))) throw new Error('Il pacchetto non contiene i file previsti.');
  return runtime;
}
function repositoryContaining(executable) {
  let directory = path.dirname(executable);
  for (;;) {
    if (fs.existsSync(path.join(directory, '.git')) && fs.existsSync(path.join(directory, 'windows', 'package.json'))) return directory;
    const parent = path.dirname(directory); if (parent === directory) return null; directory = parent;
  }
}
module.exports = { latestRelease, parseRelease, compareVersions, downloadRelease, extractRuntime, repositoryContaining };
