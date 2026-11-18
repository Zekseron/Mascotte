'use strict';
// Coerenza delle versioni nelle guide per chi installa l'app.
// Fonte unica: la riga «Versioni distribuite» di README.md, con una versione per Mac e una per Windows
// (le due piattaforme possono essere pubblicate in momenti diversi). Questo test controlla che le altre guide
// citino le stesse versioni nei titoli, nei nomi dei pacchetti e nei link alle release, e che la versione di
// windows/package.json sia la più alta delle due: chi la alza per una release deve aggiornare anche le guide.
// RELEASE-NOTES.md e i riferimenti storici («dalla 0.9.1») sono esclusi di proposito.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const GUIDES = ['README.md', 'LEGGIMI.md', 'PRIVACY.md', 'WINDOWS.md', 'windows/README.md'];
const V = '(\\d+\\.\\d+\\.\\d+)';
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function distributed() {
  const line = read('README.md').split('\n').find(l => l.startsWith('Versioni distribuite:'));
  assert.ok(line, 'README.md: manca la riga «Versioni distribuite:»');
  const mac = line.match(new RegExp(`\\[Mac Apple Silicon ${V}\\]\\(https://github\\.com/Zekseron/Mascotte/releases/tag/v${V}\\)`));
  const win = line.match(new RegExp(`\\[Windows ${V}\\]\\(https://github\\.com/Zekseron/Mascotte/releases/tag/v${V}\\)`));
  assert.ok(mac && win, 'README.md: la riga «Versioni distribuite» deve citare [Mac Apple Silicon X](…/tag/vX) e [Windows Y](…/tag/vY)');
  assert.equal(mac[2], mac[1], 'README.md: il link della versione Mac punta a un altro tag');
  assert.equal(win[2], win[1], 'README.md: il link della versione Windows punta a un altro tag');
  return { mac: mac[1], win: win[1] };
}

test('versioni nelle guide: stessi numeri della riga «Versioni distribuite» del README', () => {
  const { mac, win } = distributed(), problems = [];
  for (const file of GUIDES) {
    read(file).split('\n').forEach((text, i) => {
      const where = `${file}:${i + 1}`;
      for (const m of text.matchAll(new RegExp(`Mascotte-Mac-${V}-arm64`, 'g'))) if (m[1] !== mac) problems.push(`${where}: pacchetto Mac ${m[1]} invece di ${mac}`);
      for (const m of text.matchAll(new RegExp(`Mascotte-(?:Windows|Setup)-${V}-x64`, 'g'))) if (m[1] !== win) problems.push(`${where}: pacchetto Windows ${m[1]} invece di ${win}`);
      for (const m of text.matchAll(new RegExp(`releases/tag/v${V}`, 'g'))) if (m[1] !== mac && m[1] !== win) problems.push(`${where}: link alla release ${m[1]}, che non è né Mac ${mac} né Windows ${win}`);
    });
  }
  const first = file => read(file).split('\n')[0];
  for (const file of ['PRIVACY.md', 'windows/README.md']) {
    if (!first(file).includes(`Windows ${win}`) || !first(file).includes(`Mac ${mac}`)) problems.push(`${file}: il titolo deve citare Windows ${win} e Mac ${mac}`);
  }
  const leggimi = read('LEGGIMI.md').split('\n').find(l => l.includes('Versioni distribuite')) || '';
  if (!leggimi.includes(mac) || !leggimi.includes(win)) problems.push(`LEGGIMI.md: la riga «Versioni distribuite» deve citare ${mac === win ? mac : `${mac} e ${win}`}`);
  if (!new RegExp(`anteprima ${win.replace(/\./g, '\\.')}\\b`).test(read('WINDOWS.md'))) problems.push(`WINDOWS.md: deve indicare l'anteprima ${win}`);
  assert.equal(problems.length, 0, 'versioni non allineate:\n  ' + problems.join('\n  '));
});

test('versioni nelle guide: package.json è la più alta fra Mac e Windows', () => {
  const { mac, win } = distributed();
  const highest = compare(mac, win) >= 0 ? mac : win;
  const pkg = JSON.parse(read('windows/package.json')).version;
  assert.equal(pkg, highest, `windows/package.json è ${pkg}, ma la versione distribuita più alta nel README è ${highest}: aggiornare insieme package.json e guide`);
});
