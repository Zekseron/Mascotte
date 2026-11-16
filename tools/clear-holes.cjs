'use strict';
// Buchi bianchi nel foglio di un personaggio: zone di bianco pieno rimaste dallo scontorno dei disegni consegnati su fondo bianco,
// racchiuse dal contorno (per esempio fra ricciolo, collo e giacca di Luma seduta). Diventano trasparenti.
// Uso, dalla radice del progetto, dopo il generatore del personaggio e dopo `node tools/parts-map.cjs luma`:
//   node tools/clear-holes.cjs luma [--dry-run]
// Scrive l'elenco dei pixel da cambiare in work/clear-holes-<id>.json e li applica con Python e Pillow
// (tools/apply_pixels.py): il resto del foglio resta identico byte per byte nei pixel, senza passare da un canvas.
// poi rigenerare la mappa delle parti. Un buco è una zona quasi bianca (saturazione < 0,07, luminosità > 0,9, almeno 20 pixel)
// che attorno ha capelli o giacca (≥ 12%) e niente pelle né occhi: così restano intatti bianco degli occhi, denti, pagine,
// colletto e nuvolette. Il bianco diventa trasparenza («colore in alfa»), anche nel bordo sfumato di 2 pixel, senza aloni.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require(path.join(__dirname, '..', 'windows', 'node_modules', '@napi-rs', 'canvas'));
const { rgbToHsv, CHARACTERS } = require('./parts-map.cjs');

const ROOT = path.join(__dirname, '..');
async function pixels(file) {
  const image = await loadImage(fs.readFileSync(file));
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx, data: ctx.getImageData(0, 0, image.width, image.height), width: image.width, height: image.height };
}
// Toglie il bianco da un pixel: alfa = quanto si discosta dal bianco; il colore viene ricostruito di conseguenza. Mai più opaco di prima.
function whiteToAlpha(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3] / 255;
  const alpha = Math.max(255 - r, 255 - g, 255 - b) / 255;
  if (alpha >= a) return;
  if (alpha < 1 / 255) { d[i + 3] = 0; return; }
  for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round((d[i + k] - 255 * (1 - alpha)) / alpha)));
  d[i + 3] = Math.round(alpha * a * 255);
}

async function main() {
  const id = process.argv[2], dry = process.argv.includes('--dry-run'), config = CHARACTERS[id];
  if (!config) { console.error('Personaggio: ' + Object.keys(CHARACTERS).join(' | ')); process.exit(2); }
  const dir = path.join(ROOT, config.dir), pack = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
  const sheet = await pixels(path.join(dir, 'sprites.png')), parts = await pixels(path.join(dir, 'parts.png'));
  const W = sheet.width, H = sheet.height, fw = pack.frame.width, fh = pack.frame.height, d = sheet.data.data, m = parts.data.data;
  const index = name => config.parts.indexOf(name) + 1;
  const HAIR = index('capelli'), JACKET = index('giacca'), SKIN = index('pelle'), EYES = index('occhi');
  const found = [], edits = [];
  for (let row = 0; row < H / fh; row++) for (let col = 0; col < W / fw; col++) {
    const at = (x, y) => ((row * fh + y) * W + col * fw + x) * 4;
    const white = new Uint8Array(fw * fh), seen = new Uint8Array(fw * fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i = at(x, y); if (d[i + 3] < 200) continue;
      const [, s, v] = rgbToHsv(d[i], d[i + 1], d[i + 2]); if (s < 0.07 && v > 0.9) white[y * fw + x] = 1;
    }
    for (let start = 0; start < fw * fh; start++) {
      if (!white[start] || seen[start]) continue;
      const stack = [start], cells = []; seen[start] = 1;
      let ring = 0, hair = 0, skin = 0, eyes = 0;
      while (stack.length) {
        const k = stack.pop(); cells.push(k);
        const kx = k % fw, ky = (k - kx) / fw;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= fw || ny >= fh) continue;
          const j = ny * fw + nx;
          if (white[j]) { if (!seen[j] && Math.abs(dx) + Math.abs(dy) === 1) { seen[j] = 1; stack.push(j); } continue; }
          const p = m[at(nx, ny)]; ring++;
          if (p === HAIR || p === JACKET) hair++; else if (p === SKIN) skin++; else if (p === EYES) eyes++;
        }
      }
      if (cells.length < 20 || !ring || hair / ring < 0.12 || skin / ring >= 0.03 || eyes / ring >= 0.02) continue;
      // Buco confermato: bianco in alfa nella zona e nel bordo di 2 pixel.
      const touched = new Set();
      for (const k of cells) {
        const kx = k % fw, ky = (k - kx) / fw;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = kx + dx, ny = ky + dy; if (nx >= 0 && ny >= 0 && nx < fw && ny < fh) touched.add(ny * fw + nx); }
      }
      if (!dry) for (const k of touched) { const i = at(k % fw, Math.floor(k / fw)), before = [d[i], d[i + 1], d[i + 2], d[i + 3]]; whiteToAlpha(d, i); if (d[i + 3] !== before[3] || d[i] !== before[0] || d[i + 1] !== before[1] || d[i + 2] !== before[2]) edits.push([i / 4, d[i], d[i + 1], d[i + 2], d[i + 3]]); }
      let sx = 0, sy = 0; for (const k of cells) { sx += k % fw; sy += Math.floor(k / fw); }
      found.push(`${col}:${row} (${Math.round(sx / cells.length)},${Math.round(sy / cells.length)}) ${cells.length} px`);
    }
  }
  console.log(`${id}: ${found.length} buchi bianchi${dry ? ' (prova, nessuna modifica)' : ' resi trasparenti'}`);
  for (const line of found) console.log('  ' + line);
  if (!dry && edits.length) {
    const list = path.join(ROOT, 'work', `clear-holes-${id}.json`); fs.mkdirSync(path.dirname(list), { recursive: true });
    fs.writeFileSync(list, JSON.stringify({ width: W, edits }));
    const result = require('node:child_process').spawnSync('python3', [path.join(__dirname, 'apply_pixels.py'), path.join(dir, 'sprites.png'), list], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('apply_pixels.py non riuscito');
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { whiteToAlpha };
