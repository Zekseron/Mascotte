'use strict';
// Mappa delle parti di un personaggio per la personalizzazione dei colori.
// Uso, dalla radice del progetto:   node tools/parts-map.cjs luma|rosso [--preview]
// Scrive characters/<categoria>/<id>/parts.png accanto a sprites.png: stesso formato del foglio,
// nel canale rosso l'indice della parte (0 = nessuna, resta com'è), alfa 255 dove c'è una parte.
// Con --preview scrive in work/previews/<id>/ un foglio di controllo con originale, parti e prova di colore.
// Serve @napi-rs/canvas (dipendenza di sviluppo in windows/node_modules).
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require(path.join(__dirname, '..', 'windows', 'node_modules', '@napi-rs', 'canvas'));

const ROOT = path.join(__dirname, '..');

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

// --- Luma: illustrazione. Etichetta per colore, poi voto per zone chiuse dal contorno scuro. ---
const LUMA_PARTS = ['capelli', 'pelle', 'giacca', 'salopette', 'cuoio', 'colletto', 'occhi'];
function lumaGuess(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < 0.28) return 'contorno';
  // Azzurro chiaro: goccia di sudore e riflessi degli effetti, mai ricolorati (la salopette è petrolio scuro).
  if (h >= 160 && h <= 225 && s > 0.2 && v >= 0.72) return 'contorno';
  if (h >= 160 && h <= 225 && s > 0.2) return 'salopette';
  if (s < 0.16 && v > 0.82) return 'colletto';
  if (h >= 8 && h <= 42 && s < 0.48 && v > 0.84) return 'pelle';
  // Misure sul foglio (16/11/2026): capelli tonalità 9–21 molto saturi; giacca 27–39 comprese le pieghe (27–30, saturazione 0,8–0,9);
  // stivali e cinghie spenti (saturazione 0,4–0,55); polsini e ombre scure delle maniche arancio-bruno (18–26, saturazione 0,6–0,75).
  if (h >= 15 && h <= 45 && s < 0.56 && v < 0.66) return 'cuoio';
  if (h >= 26 && h <= 60 && s > 0.5) return 'giacca';
  if ((h < 17 || h > 340) && s > 0.55) return 'capelli';
  if (h < 22 && s > 0.55 && v >= 0.66) return 'capelli';
  // Toni scuri o di confine (polsini, pieghe profonde, ciocche in ombra): decide la zona in cui stanno.
  return 'dubbio';
}

// Solo la figura: il pezzo opaco più grande. Effetti staccati (z, nuvolette, stelline, fulmine, gocce, cuori) restano com'erano.
function figureOnly(data, w, h) {
  const n = w * h, comp = new Int32Array(n).fill(-1), stack = new Int32Array(n), sizes = [];
  for (let start = 0; start < n; start++) {
    if (data[start * 4 + 3] <= 20 || comp[start] >= 0) continue;
    const id = sizes.length; let sp = 0, size = 0; stack[sp++] = start; comp[start] = id;
    while (sp) {
      const i = stack[--sp]; size++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (comp[j] < 0 && data[j * 4 + 3] > 20) { comp[j] = id; stack[sp++] = j; }
      }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  return i => comp[i] === main;
}

function lumaFrame(data, w, h) {
  const n = w * h, label = new Array(n).fill(null), inFigure = figureOnly(data, w, h);
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] > 20 && inFigure(i)) label[i] = lumaGuess(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  // Estensione verticale della figura, per le regole di posizione.
  let top = h, bottom = -1;
  for (let i = 0; i < n; i++) if (label[i]) { const y = Math.floor(i / w); if (y < top) top = y; if (y > bottom) bottom = y; }
  const height = Math.max(1, bottom - top);
  const region = new Int32Array(n).fill(-1), result = new Array(n).fill(null);
  const stack = new Int32Array(n);
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (!label[start] || label[start] === 'contorno' || region[start] >= 0) continue;
    let sp = 0; stack[sp++] = start; region[start] = id;
    const cells = [], votes = {};
    let sumY = 0;
    while (sp) {
      const i = stack[--sp]; cells.push(i); sumY += Math.floor(i / w);
      const l = label[i]; if (l !== 'dubbio') votes[l] = (votes[l] || 0) + 1;
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
        if (j >= 0 && region[j] < 0 && label[j] && label[j] !== 'contorno') { region[j] = id; stack[sp++] = j; }
      }
    }
    const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    // Zone senza un colore sicuro restano «dubbio» fino alla pulizia: un'iride ambra può sembrare giacca o niente.
    let main = ranked[0]?.[0] || 'dubbio';
    const relY = (sumY / cells.length - top) / height;
    // La borsa e le cinghie hanno toni simili ai capelli scuri: una zona «capelli» nella metà bassa della figura è cuoio.
    if (main === 'capelli' && relY > 0.52) main = 'cuoio';
    const mixed = cells.length > 400 && ranked.length > 1 && ranked[0][1] < 0.85 * total;
    for (const i of cells) {
      const l = label[i];
      let part = mixed && l !== 'dubbio' ? l : main;
      // In una zona di giacca le pieghe arancioni e i polsini restano giacca anche se il singolo pixel somiglia a capelli o cuoio.
      if (main === 'giacca' && (part === 'capelli' || part === 'cuoio')) part = 'giacca';
      // Mani e gambe: le ombre delle dita somigliano al cuoio, e sotto la testa la pelle non ha capelli sopra senza contorno.
      // (solo fino a tre quarti della figura: più in basso ci sono gli stivali, che possono toccare le gambe senza contorno).
      const rel = (Math.floor(i / w) - top) / height;
      if (main === 'pelle' && rel < 0.75 && (part === 'cuoio' || (part === 'capelli' && rel > 0.45))) part = 'pelle';
      if (part === 'capelli' && (Math.floor(i / w) - top) / height > 0.56) part = 'cuoio';
      result[i] = part;
    }
    id++;
  }
  // Nelle zone miste (capelli che toccano la pelle senza contorno) le macchie piccole prendono la parte attorno:
  // lentiggini e rossore restano pelle, i riflessi isolati restano capelli.
  leatherOnOveralls(result, region, id, data, w, h);
  heldObjects(result, region, id, w, h, top, height);
  cleanSmallBlobs(result, w, h, 150, top, height, data);
  for (let i = 0; i < n; i++) if (result[i] === 'dubbio') result[i] = null;
  markIrises(result, data, label, w, h, top, height);
  // Il contorno scuro non si ricolora; gli occhi sono la parte ambra dentro il viso (piccole zone «capelli» circondate da pelle).
  return result;
}

// Iridi: zone ambra nella parte alta della figura che toccano per un tratto il bianco dell'occhio.
// Il bianco dell'occhio è una piccola zona quasi bianca (saturazione < 0,12): i riflessi della pelle sono più rosati, il colletto è più in basso. Copre gli occhi che, guardando di lato o in basso, toccano i capelli.
function components(mask, w, h, visit) {
  const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0; stack[sp++] = start; seen[start] = 1;
    const cells = [];
    while (sp) {
      const i = stack[--sp]; cells.push(i);
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
    }
    visit(cells);
  }
}
function borderShare(cells, w, h, inside, test) {
  let border = 0, hit = 0;
  for (const i of cells) {
    const x = i % w;
    for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < w * h ? i + w : -1, i - w >= 0 ? i - w : -1]) {
      if (j < 0 || inside[j]) continue;
      border++; if (test(j)) hit++;
    }
  }
  return border ? hit / border : 0;
}
function markIrises(result, data, label, w, h, top, height) {
  // Solo la testa (fino a un terzo della figura): esclude matita, blocco e colletto.
  const n = w * h, limitY = top + 0.34 * height;
  const white = new Uint8Array(n), amber = new Uint8Array(n), dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (Math.floor(i / w) > limitY || !label[i]) continue;
    const [hue, sat, val] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (val < 0.3) dark[i] = 1;
    else if (sat < 0.12 && val > 0.86) white[i] = 1;
    // I capelli hanno toni ambra simili: si escludono, altrimenti l'iride si unisce alla ciocca vicina.
    else if (hue >= 5 && hue <= 42 && sat > 0.3 && val > 0.15 && result[i] !== 'pelle' && result[i] !== 'capelli') amber[i] = 1;
  }
  const sclera = new Uint8Array(n);
  components(white, w, h, cells => {
    if (cells.length >= 8 && cells.length <= 1200) for (const i of cells) sclera[i] = 1;
  });
  // Fra bianco e iride c'è spesso un bordo sfumato di un paio di pixel: il bianco si allarga di 3 pixel prima del confronto.
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!sclera[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1; }
  }
  components(amber, w, h, cells => {
    const inside = new Uint8Array(n); for (const i of cells) inside[i] = 1;
    if (cells.length < 15 || cells.length > 1600) return;
    if (borderShare(cells, w, h, inside, j => near[j]) >= 0.06) for (const i of cells) result[i] = 'occhi';
  });
  // Bianco d'occhio: l'iride è la zona colorata nel suo riquadro, collegata al bianco (completa anche iridi trovate a metà).
  // Serve quando l'iride ha il colore dei capelli o è scura (sguardo in basso). Contorno, ciglia e pelle restano fuori.
  components(sclera, w, h, cells => {
    if (cells.length < 40) return;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (const i of cells) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    x0 = Math.max(0, x0 - 2); x1 = Math.min(w - 1, x1 + 2); y0 = Math.max(0, y0 - 2); y1 = Math.min(h - 1, y1 + 2);
    // Un occhio ha sopra le ciglia scure; i denti hanno sopra il labbro. Si guarda la fascia appena sopra il bianco.
    let darkAbove = 0;
    for (let x = x0; x <= x1; x++) for (let y = Math.max(0, y0 - 6); y < y0 + 3; y++) { const i = y * w + x; if (data[i * 4 + 3] > 200 && rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[2] < 0.3) { darkAbove++; break; } }
    if (darkAbove < 0.4 * (x1 - x0 + 1)) return;
    const candidate = i => { const [hue, sat, val] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); return data[i * 4 + 3] > 200 && val > 0.12 && val < 0.97 && sat > 0.45 && hue <= 48; };
    const fill = new Uint8Array(n), stack = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x; if (!candidate(i)) continue;
      let close = false;
      for (let dy = -3; dy <= 3 && !close; dy++) for (let dx = -3; dx <= 3; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && sclera[ny * w + nx]) { close = true; break; } }
      if (close) { fill[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = ny * w + nx; if (!fill[j] && candidate(j)) { fill[j] = 1; stack.push(j); }
      }
    }
    let count = 0; for (let i = 0; i < n; i++) count += fill[i];
    if (count >= 15 && count <= 1600) for (let i = 0; i < n; i++) if (fill[i]) result[i] = 'occhi';
  });
  // Un «occhio» lontano da ogni bianco dell'occhio (più di 7 pixel) è un sopracciglio o un riflesso: torna ai capelli.
  const anyWhite = new Uint8Array(n);
  components(white, w, h, cells => { if (cells.length >= 3) for (const i of cells) anyWhite[i] = 1; });
  const nearWhite = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!anyWhite[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) nearWhite[ny * w + nx] = 1; }
  }
  for (let i = 0; i < n; i++) if (result[i] === 'occhi' && !nearWhite[i]) result[i] = 'capelli';
  // Macchioline «capelli» rimaste dentro un'iride: diventano occhi.
  const hair = new Uint8Array(n); for (let i = 0; i < n; i++) if (result[i] === 'capelli' && Math.floor(i / w) <= limitY) hair[i] = 1;
  components(hair, w, h, cells => {
    if (cells.length > 60) return;
    const inside = new Uint8Array(n); for (const i of cells) inside[i] = 1;
    if (borderShare(cells, w, h, inside, j => result[j] === 'occhi') >= 0.5) for (const i of cells) result[i] = 'occhi';
  });
}

// Cintura e borsa hanno un marrone-arancio simile ai polsini scuri della giacca. Una zona chiusa «giacca» piuttosto scura
// che attorno (oltre il contorno, entro 4 pixel) ha soprattutto salopette o cuoio, e quasi niente pelle, è cuoio.
function leatherOnOveralls(result, region, count, data, w, h) {
  const n = w * h, stats = Array.from({ length: count }, () => ({ v: 0, px: 0, around: {} }));
  for (let i = 0; i < n; i++) {
    const r = region[i]; if (r < 0 || result[i] !== 'giacca') continue;
    const st = stats[r]; st.px++; st.v += Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (region[j] === r || !result[j]) continue;
      st.around[result[j]] = (st.around[result[j]] || 0) + 1;
    }
  }
  const leather = new Uint8Array(count);
  stats.forEach((st, r) => {
    if (!st.px) return;
    const total = Object.values(st.around).reduce((a, b) => a + b, 0); if (!total) return;
    const share = k => (st.around[k] || 0) / total;
    if (st.v / st.px < 0.75 && share('salopette') + share('cuoio') >= 0.45 && share('pelle') < 0.1) leather[r] = 1;
  });
  for (let i = 0; i < n; i++) if (region[i] >= 0 && leather[region[i]] && result[i] === 'giacca') result[i] = 'cuoio';
}

// Oggetti tenuti in mano (copertina del libro, manico rosso degli attrezzi): zona «capelli» sotto la testa che non confina
// con altri capelli (le ciocche confinano sempre con altre ciocche). Non è una parte di Luma: resta del suo colore.
function heldObjects(result, region, count, w, h, top, height) {
  const n = w * h, stats = Array.from({ length: count }, () => ({ px: 0, y: 0, around: {} }));
  for (let i = 0; i < n; i++) {
    const r = region[i]; if (r < 0 || result[i] !== 'capelli') continue;
    const st = stats[r]; st.px++; st.y += Math.floor(i / w);
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (region[j] === r || !result[j]) continue;
      st.around[result[j]] = (st.around[result[j]] || 0) + 1;
    }
  }
  const held = new Uint8Array(count);
  stats.forEach((st, r) => {
    if (!st.px || (st.y / st.px - top) / height < 0.36) return;
    const total = Object.values(st.around).reduce((a, b) => a + b, 0); if (!total) return;
    if ((st.around.capelli || 0) / total < 0.08 && st.px >= 40) held[r] = 1;
  });
  for (let i = 0; i < n; i++) if (region[i] >= 0 && held[region[i]] && result[i] === 'capelli') result[i] = null;
}

function cleanSmallBlobs(result, w, h, limit, top, height, data) {
  const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (!result[start] || seen[start]) continue;
    const part = result[start];
    let sp = 0; stack[sp++] = start; seen[start] = 1;
    const cells = [], around = {};
    let sumY = 0, sumR = 0, sumG = 0, sumB = 0;
    while (sp) {
      const i = stack[--sp]; cells.push(i); sumY += Math.floor(i / w);
      sumR += data[i * 4]; sumG += data[i * 4 + 1]; sumB += data[i * 4 + 2];
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
        if (j < 0 || !result[j]) continue;
        if (result[j] === part) { if (!seen[j]) { seen[j] = 1; stack[sp++] = j; } }
        else around[result[j]] = (around[result[j]] || 0) + 1;
      }
    }
    const best = Object.entries(around).sort((a, b) => b[1] - a[1])[0];
    const relY = (sumY / cells.length - top) / height;
    // Viso: macchie «capelli» dentro la pelle nella parte alta. Ambra (tonalità ≥ 18°) = occhi; rosso o rosa = bocca e rossore, che restano pelle.
    const face = ['capelli', 'giacca', 'dubbio'].includes(part) && ['pelle', 'colletto'].includes(best?.[0]) && cells.length >= 6 && cells.length <= 600 && relY < 0.34;
    // Bocca aperta (anche grande, o più in basso quando salta): zona rossa racchiusa dalla pelle → pelle.
    if (!face && part === 'capelli' && best?.[0] === 'pelle' && cells.length <= 2500 && relY < 0.48) {
      const [hue] = rgbToHsv(sumR / cells.length, sumG / cells.length, sumB / cells.length);
      const share = best[1] / Object.values(around).reduce((a, b) => a + b, 0);
      if ((hue < 14 || hue > 340) && share > 0.5) { for (const i of cells) result[i] = 'pelle'; continue; }
    }
    // Ombra del collo sotto il mento: zona «capelli» fra pelle e colletto, sotto la faccia.
    if (!face && part === 'capelli' && ['pelle', 'colletto'].includes(best?.[0]) && cells.length <= 2500 && relY >= 0.26 && relY < 0.5) {
      const share = ((around.pelle || 0) + (around.colletto || 0)) / Object.values(around).reduce((a, b) => a + b, 0);
      if (share > 0.45) { for (const i of cells) result[i] = 'pelle'; continue; }
    }
    // Bianco degli occhi: piccole zone chiare nel viso. Non si ricolora (non è il colletto).
    if (part === 'colletto' && cells.length <= 150 && relY < 0.42) { for (const i of cells) result[i] = null; continue; }
    if (face) {
      const [hue] = rgbToHsv(sumR / cells.length, sumG / cells.length, sumB / cells.length);
      const [, sat] = rgbToHsv(sumR / cells.length, sumG / cells.length, sumB / cells.length);
      // Ambra abbastanza saturo = iride; il resto torna alla parte attorno (bocca e rossore restano pelle, riflessi chiari restano com'erano).
      const target = hue >= 18 && hue <= 40 && sat > 0.35 ? 'occhi' : part === 'dubbio' ? best[0] : 'pelle';
      for (const i of cells) result[i] = target;
    } else if (cells.length <= limit && best) for (const i of cells) result[i] = best[0];
  }
}

// --- Rosso: pixel art, corrispondenza esatta dei colori. ---
const ROSSO_PARTS = ['pelo', 'strisce', 'pancia', 'rosa'];
const ROSSO_COLORS = { 'f0a04b': 'pelo', 'cf6d2e': 'strisce', 'fdebc8': 'pancia', 'e6c493': 'pancia', 'f58aa3': 'rosa', 'f2688a': 'rosa' };
function rossoFrame(data, w, h) {
  const result = new Array(w * h).fill(null);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 255) continue;
    const hex = [0, 1, 2].map(k => data[i * 4 + k].toString(16).padStart(2, '0')).join('');
    result[i] = ROSSO_COLORS[hex] || null;
  }
  return result;
}

const CHARACTERS = {
  luma: { dir: 'characters/People/luma', parts: LUMA_PARTS, frame: lumaFrame,
    names: { capelli: 'Capelli', pelle: 'Pelle', giacca: 'Giacca', salopette: 'Salopette', cuoio: 'Cuoio e stivali', colletto: 'Colletto', occhi: 'Occhi' } },
  rosso: { dir: 'characters/Cat/rosso', parts: ROSSO_PARTS, frame: rossoFrame,
    names: { pelo: 'Pelo', strisce: 'Strisce', pancia: 'Pancia e muso', rosa: 'Orecchie e naso' } }
};

function applyFixes(fixes, cell, labels, frame, fw) {
  for (const fix of fixes) {
    if (!fix.cells?.includes(cell)) continue;
    const [x0, y0, x1, y1] = fix.rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * fw + x, label = labels[i]; if (!label) continue;
      let clear = fix.clear?.includes(label);
      // Carta e pagine: chiare e crema-gialle (tonalità oltre 32°), mentre la pelle è pesca (15–25°).
      if (!clear && fix.clearPale && label === 'pelle') { const [hue, s, v] = rgbToHsv(frame[i * 4], frame[i * 4 + 1], frame[i * 4 + 2]); clear = v > 0.75 && (s < 0.2 || (hue >= 32 && s < 0.5)); }
      if (clear) labels[i] = null;
      else labels[i] = fix.replace?.[label] ?? label;
    }
  }
}

// Aggiunge o sostituisce la sola voce "parts" in character.json, senza riformattare il resto del file.
function withParts(text, parts) {
  const value = JSON.parse(text); delete value.parts;
  const without = JSON.stringify(value) === JSON.stringify(JSON.parse(text)) ? text : text.replace(/,\s*"parts"\s*:\s*\{[\s\S]*\}\s*(\}\s*)$/, '\n$1');
  const end = without.lastIndexOf('}');
  const pretty = /\n\s+"/.test(without);
  const entry = pretty ? `,\n  "parts": ${JSON.stringify(parts)}\n` : `,"parts":${JSON.stringify(parts)}`;
  const result = without.slice(0, end).replace(/\s*$/, '') + entry + without.slice(end);
  if (JSON.stringify(JSON.parse(result).parts) !== JSON.stringify(parts)) throw new Error('character.json non aggiornato correttamente');
  return result;
}

// Colore medio di ogni parte, pesato per alfa: è il «colore originale» mostrato nel selettore e la base della ricolorazione.
function averages(sheet, map, parts) {
  const sum = parts.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < map.length; i++) {
    const index = map[i]; if (!index) continue;
    const a = sheet[i * 4 + 3] / 255; const s = sum[index - 1];
    s[0] += sheet[i * 4] * a; s[1] += sheet[i * 4 + 1] * a; s[2] += sheet[i * 4 + 2] * a; s[3] += a;
  }
  return sum.map(([r, g, b, a]) => a ? '#' + [r, g, b].map(c => Math.round(c / a).toString(16).padStart(2, '0')).join('') : null);
}

async function main() {
  const id = process.argv[2], preview = process.argv.includes('--preview');
  const config = CHARACTERS[id];
  if (!config) { console.error('Personaggio: ' + Object.keys(CHARACTERS).join(' | ')); process.exit(2); }
  const dir = path.join(ROOT, config.dir), packFile = path.join(dir, 'character.json');
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  const image = await loadImage(fs.readFileSync(path.join(dir, 'sprites.png')));
  const W = image.width, H = image.height, fw = pack.frame.width, fh = pack.frame.height;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const sheet = ctx.getImageData(0, 0, W, H).data;
  const map = new Uint8Array(W * H);
  // Correzioni manuali facoltative, accanto ai sorgenti del personaggio.
  const fixFile = path.join(ROOT, 'characters-src', path.relative('characters', config.dir), 'parts-fix.json');
  const fixes = fs.existsSync(fixFile) ? JSON.parse(fs.readFileSync(fixFile, 'utf8')).fix || [] : [];
  const cols = Math.floor(W / fw), rows = Math.floor(H / fh);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const frame = new Uint8ClampedArray(fw * fh * 4);
    let any = false;
    for (let y = 0; y < fh; y++) {
      const from = ((row * fh + y) * W + col * fw) * 4;
      frame.set(sheet.subarray(from, from + fw * 4), y * fw * 4);
    }
    for (let i = 3; i < frame.length; i += 4) if (frame[i]) { any = true; break; }
    if (!any) continue;
    const labels = config.frame(frame, fw, fh);
    applyFixes(fixes, `${col}:${row}`, labels, frame, fw);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const part = labels[y * fw + x], index = part ? config.parts.indexOf(part) + 1 : 0;
      if (index > 0) map[(row * fh + y) * W + col * fw + x] = index;
    }
  }
  const out = createCanvas(W, H), octx = out.getContext('2d'), od = octx.createImageData(W, H);
  for (let i = 0; i < map.length; i++) if (map[i]) { od.data[i * 4] = map[i]; od.data[i * 4 + 3] = 255; }
  octx.putImageData(od, 0, 0);
  fs.writeFileSync(path.join(dir, 'parts.png'), out.toBuffer('image/png'));
  const colors = averages(sheet, map, config.parts);
  pack.parts = { sheet: 'parts.png', list: config.parts.map((part, k) => ({ id: part, name: config.names[part], color: colors[k] })).filter(item => item.color) };
  fs.writeFileSync(packFile, withParts(fs.readFileSync(packFile, 'utf8'), pack.parts));
  const counts = config.parts.map((part, k) => `${part} ${map.reduce((sum, v) => sum + (v === k + 1), 0)}`);
  console.log(`${id}: parts.png ${W}×${H}, ${cols}×${rows} celle. ${counts.join(', ')}`);
  console.log('Colori medi: ' + pack.parts.list.map(item => `${item.id} ${item.color}`).join(', '));
  if (preview) await writePreview(id, config, sheet, map, W, H, fw, fh, cols, rows);
}

async function writePreview(id, config, sheet, map, W, H, fw, fh, cols, rows) {
  const PALETTE = [[230, 60, 60], [250, 200, 170], [240, 200, 0], [0, 140, 160], [120, 70, 30], [255, 255, 230], [40, 200, 80], [180, 120, 255]];
  const cells = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    let any = false;
    for (let y = 0; y < fh && !any; y += 8) for (let x = 0; x < fw; x += 8) if (sheet[((row * fh + y) * W + col * fw + x) * 4 + 3]) { any = true; break; }
    if (any) cells.push([col, row]);
  }
  const pick = cells.filter((_, k) => k % Math.max(1, Math.floor(cells.length / 24)) === 0).slice(0, 24);
  const scale = fw > 100 ? 0.5 : 4, tw = Math.round(fw * scale), th = Math.round(fh * scale);
  const sheetOut = createCanvas(tw * 2 * 6, th * Math.ceil(pick.length / 6)), sctx = sheetOut.getContext('2d');
  sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, sheetOut.width, sheetOut.height);
  for (const [k, [col, row]] of pick.entries()) {
    const a = createCanvas(fw, fh), actx = a.getContext('2d'), ad = actx.createImageData(fw, fh);
    const b = createCanvas(fw, fh), bctx = b.getContext('2d'), bd = bctx.createImageData(fw, fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i = (row * fh + y) * W + col * fw + x, o = (y * fw + x) * 4;
      for (let c = 0; c < 4; c++) ad.data[o + c] = sheet[i * 4 + c];
      const part = map[i];
      if (part) { const [r, g, bl] = PALETTE[part - 1]; bd.data[o] = r; bd.data[o + 1] = g; bd.data[o + 2] = bl; bd.data[o + 3] = sheet[i * 4 + 3]; }
      else if (sheet[i * 4 + 3]) { bd.data[o] = 0; bd.data[o + 1] = 0; bd.data[o + 2] = 0; bd.data[o + 3] = sheet[i * 4 + 3]; }
    }
    actx.putImageData(ad, 0, 0); bctx.putImageData(bd, 0, 0);
    const x0 = (k % 6) * tw * 2, y0 = Math.floor(k / 6) * th;
    sctx.imageSmoothingEnabled = scale < 1;
    sctx.drawImage(a, x0, y0, tw, th); sctx.drawImage(b, x0 + tw, y0, tw, th);
  }
  const folder = path.join(ROOT, 'work', 'previews', id); fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'parts-check.png'), sheetOut.toBuffer('image/png'));
  // Prova di colore (solo controllo, non è uno stile dell'app): stessa funzione usata dalla mascotte.
  const Recolor = require(path.join(ROOT, 'windows', 'renderer', 'recolor.js'));
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, config.dir, 'character.json'), 'utf8'));
  const demo = process.env.PARTS_DEMO ? JSON.parse(process.env.PARTS_DEMO) : { capelli: '#3a2448', pelle: '#f4e6e6', giacca: '#232026', salopette: '#43264a', cuoio: '#262325', colletto: '#ece6ee', occhi: '#7a2f8a', pelo: '#3b3a40', strisce: '#232227', pancia: '#cfcbd6', rosa: '#b07ab8' };
  const transforms = Recolor.prepare(config.parts.map(part => { const item = pack.parts.list.find(entry => entry.id === part); return item && demo[part] ? { base: item.color, target: demo[part] } : null; }));
  const demoOut = createCanvas(tw * 2 * 6, th * Math.ceil(pick.length / 6)), dctx = demoOut.getContext('2d');
  dctx.fillStyle = '#ffffff'; dctx.fillRect(0, 0, demoOut.width, demoOut.height);
  for (const [k, [col, row]] of pick.entries()) {
    const a = createCanvas(fw, fh), actx = a.getContext('2d'), ad = actx.createImageData(fw, fh), md = new Uint8ClampedArray(fw * fh * 4);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i = (row * fh + y) * W + col * fw + x, o = (y * fw + x) * 4;
      for (let c = 0; c < 4; c++) ad.data[o + c] = sheet[i * 4 + c];
      md[o] = map[i];
    }
    const b = createCanvas(fw, fh), bctx = b.getContext('2d'), bd = bctx.createImageData(fw, fh);
    bd.data.set(ad.data); Recolor.apply(bd.data, md, transforms);
    actx.putImageData(ad, 0, 0); bctx.putImageData(bd, 0, 0);
    const x0 = (k % 6) * tw * 2, y0 = Math.floor(k / 6) * th;
    dctx.imageSmoothingEnabled = scale < 1;
    dctx.drawImage(a, x0, y0, tw, th); dctx.drawImage(b, x0 + tw, y0, tw, th);
  }
  fs.writeFileSync(path.join(folder, 'recolor-check.png'), demoOut.toBuffer('image/png'));
  console.log('Controllo: ' + path.relative(ROOT, path.join(folder, 'parts-check.png')));
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { rgbToHsv, lumaGuess, lumaFrame, CHARACTERS };
