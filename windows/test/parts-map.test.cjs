'use strict';
// Regressione della mappa delle parti (colori personalizzati delle mascotte).
// La mappa nasce da tools/parts-map.cjs con soglie di colore e correzioni mirate (colletto, polsini,
// cuoio, giacca): ogni correzione può romperne un'altra senza che si veda. Questi test controllano che
//  1. il generatore produca esattamente il parts.png committato (niente mappa vecchia o generatore cambiato a metà);
//  2. i pixel di ogni parte, cella per cella, restino vicini alla fotografia verificata in test/fixtures/parts-<id>.json;
//  3. i colori di base in character.json siano quelli che il generatore calcola;
//  4. il colletto di Luma non sparisca (difetto «il colletto non cambia colore», 0.9.8).
// Dopo una modifica voluta della mappa: controllare a vista con `node tools/parts-map.cjs <id> --preview`,
// poi aggiornare la fotografia con `node tools/parts-map.cjs <id> --snapshot windows/test/fixtures/parts-<id>.json`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeMap, cellCounts, loadImage, createCanvas } = require('../../tools/parts-map.cjs');

// Scarto ammesso per parte e cella prima di considerare cambiata la mappa: piccoli ritocchi passano,
// una parte che sparisce o si sposta in un'altra (es. un polsino che diventa cuoio) no.
const tolerance = expected => Math.max(40, Math.round(expected * 0.03));
const MIN_COLLAR = 30;

async function committedMap(result) {
  const image = await loadImage(fs.readFileSync(path.join(result.dir, 'parts.png')));
  assert.equal(image.width, result.W, 'larghezza di parts.png diversa dal foglio');
  assert.equal(image.height, result.H, 'altezza di parts.png diversa dal foglio');
  const canvas = createCanvas(result.W, result.H), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, result.W, result.H).data;
  const map = new Uint8Array(result.W * result.H);
  for (let i = 0; i < map.length; i++) if (data[i * 4 + 3]) map[i] = data[i * 4];
  return map;
}

for (const id of ['luma', 'rosso']) {
  test(`mappa delle parti di ${id}: generatore, fotografia e colori di base`, { timeout: 120000 }, async () => {
    const result = await computeMap(id);

    // 1. Il parts.png committato è esattamente l'uscita del generatore.
    const committed = await committedMap(result);
    const wrongCells = new Map();
    for (let i = 0; i < committed.length; i++) {
      if (committed[i] === result.map[i]) continue;
      const x = i % result.W, y = Math.floor(i / result.W);
      const cell = `${Math.floor(x / result.fw)}:${Math.floor(y / result.fh)}`;
      wrongCells.set(cell, (wrongCells.get(cell) || 0) + 1);
    }
    assert.equal(wrongCells.size, 0, `parts.png di ${id} non corrisponde al generatore (pixel diversi per cella: ${
      [...wrongCells].slice(0, 8).map(([c, n]) => `${c}=${n}`).join(', ')}). Rigenerare con node tools/parts-map.cjs ${id}.`);

    // 2. Conteggi per cella e parte vicini alla fotografia verificata.
    const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `parts-${id}.json`), 'utf8'));
    assert.deepEqual(result.config.parts, snapshot.parts, 'elenco delle parti cambiato');
    const counts = cellCounts(result), problems = [];
    const cells = new Set([...Object.keys(counts), ...Object.keys(snapshot.cells)]);
    for (const cell of cells) {
      if (!counts[cell]) { problems.push(`${cell}: cella senza parti`); continue; }
      if (!snapshot.cells[cell]) { problems.push(`${cell}: cella nuova`); continue; }
      for (const part of snapshot.parts) {
        const want = snapshot.cells[cell][part], got = counts[cell][part];
        if (Math.abs(got - want) > tolerance(want)) problems.push(`${cell} ${part}: ${got} invece di ${want}`);
      }
    }
    assert.equal(problems.length, 0, `mappa di ${id} cambiata rispetto alla fotografia:\n  ${problems.slice(0, 15).join('\n  ')}${
      problems.length > 15 ? `\n  … e altri ${problems.length - 15}` : ''}`);

    // 3. I colori di base del pacchetto sono quelli calcolati sulla mappa.
    const listed = Object.fromEntries((result.pack.parts?.list || []).map(item => [item.id, item.color]));
    const expected = Object.fromEntries(result.config.parts.map((part, k) => [part, result.colors[k]]).filter(([, c]) => c));
    assert.deepEqual(listed, expected, `colori di base in character.json di ${id} non aggiornati`);

    // 4. Luma: dove c'è la giacca c'è anche il colletto.
    if (id === 'luma') {
      const missing = Object.entries(counts).filter(([, c]) => c.giacca > 0 && c.colletto < MIN_COLLAR).map(([cell, c]) => `${cell}=${c.colletto}`);
      assert.equal(missing.length, 0, `colletto assente o quasi nelle celle: ${missing.join(', ')}`);
    }
  });
}
