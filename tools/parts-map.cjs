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
const isCream = (h, s, v) => h >= 30 && h <= 65 && v > 0.72 && s < 0.45 && (h >= 39 || (s >= 0.28 && v < 0.92));
function lumaGuess(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < 0.28) return 'contorno';
  // Azzurro chiaro: goccia di sudore e riflessi degli effetti, mai ricolorati (la salopette è petrolio scuro).
  if (h >= 160 && h <= 225 && s > 0.2 && v >= 0.72) return 'contorno';
  if (h >= 160 && h <= 225 && s > 0.2) return 'salopette';
  if (s < 0.16 && v > 0.82) return 'colletto';
  // Colletto della camicia: crema chiaro (tonalità 39–42, saturazione 0,16–0,4) con ombre crema più sature e meno luminose
  // da 30°. La pelle è pesca (13–28°), ma le luci di mani e pugni arrivano a 38° quasi bianche (luminosità ≥ 0,96).
  if (isCream(h, s, v)) return 'colletto';
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
  const region = new Int32Array(n).fill(-1), result = new Array(n).fill(null), mixedZone = new Uint8Array(n);
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
    // Sotto metà figura il colletto non c'è: i riflessi bianchi (che votano colletto) non decidono la zona, per esempio
    // la borsa con la luna e gli attrezzi chiari.
    if (main === 'colletto' && relY > 0.55 && cells.length >= 500 && ranked[1]) main = ranked[1][0];
    // La borsa e le cinghie hanno toni simili ai capelli scuri: una zona «capelli» nella metà bassa della figura è cuoio.
    if (main === 'capelli' && relY > 0.52) main = 'cuoio';
    const mixed = cells.length > 400 && ranked.length > 1 && ranked[0][1] < 0.85 * total;
    if (mixed) for (const i of cells) mixedZone[i] = 1;
    for (const i of cells) {
      const l = label[i];
      let part = mixed && l !== 'dubbio' ? l : main;
      // In una zona di giacca le pieghe arancioni e i polsini restano giacca anche se il singolo pixel somiglia a capelli o cuoio.
      if (main === 'giacca' && (part === 'capelli' || part === 'cuoio')) part = 'giacca';
      // La salopette è petrolio, mai marrone: in una sua zona i marroni-arancio sotto metà figura sono la borsa o la
      // cintura che la toccano (più in alto ci sono le fibbie d'ottone delle bretelle, che restano come sono).
      if (main === 'salopette' && part !== 'cuoio' && (Math.floor(i / w) - top) / height >= 0.5) {
        const [hh, ss, vv] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        if (hh >= 15 && hh <= 32 && ss >= 0.35 && ss <= 0.8 && vv >= 0.3 && vv <= 0.85) part = 'cuoio';
      }
      // Il colletto tocca giacca e collo senza contorno: i suoi pixel crema restano colletto anche dentro quelle zone.
      if (l === 'colletto' && (main === 'giacca' || main === 'pelle')) part = 'colletto';
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
  cuffShadows(result, label, mixedZone, data, w, h, top, height);
  leatherOnOveralls(result, region, id, data, w, h);
  heldObjects(result, region, id, w, h, top, height);
  growCollar(result, data, w, h, top, height);
  cleanSmallBlobs(result, w, h, 150, top, height, data);
  collarNeedsCream(result, label, data, w, h);
  fingersNotLeather(result, data, w, h);
  wrongColorPieces(result, data, w, h, top, height);
  for (let i = 0; i < n; i++) if (result[i] === 'dubbio') result[i] = null;
  // Il colletto sta attorno al collo: più in basso il crema chiaro è luce di mani e dita (pelle) o riflesso (nessuna parte).
  for (let i = 0; i < n; i++) if (result[i] === 'colletto' && (Math.floor(i / w) - top) / height > 0.55) result[i] = label[i] === 'pelle' ? 'pelle' : null;
  // Nel viso il cuoio non c'è: sopracciglia e linee scure prese per cuoio (anche assorbendo piccole ciocche vicine) sono capelli.
  for (let i = 0; i < n; i++) if (result[i] === 'cuoio' && (Math.floor(i / w) - top) / height < 0.3) result[i] = 'capelli';
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

// Il colletto tocca giacca e collo senza contorno e ha molti pixel a metà fra crema e pesca (tonalità 30–38): presi uno
// per uno finiscono nella pelle o nella giacca e il colletto si spezza in frammenti che la pulizia assorbe. Dal crema
// sicuro si allarga ai pixel vicini chiari e gialli (tonalità ≥ 30, la pelle è sotto 28) per al più 10 pixel.
function growCollar(result, data, w, h, top, height) {
  const n = w * h, yellowish = i => {
    const [hue, sat, val] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    return hue >= 30 && hue <= 65 && sat < 0.45 && val > 0.72;
  };
  // Semi: i pixel crema sicuri, ma non nel terzo più alto della figura, dove ci sono solo testa, pugni e mani alzate
  // (le loro luci hanno qualche pixel crema sparso). Il colletto sta sempre sotto il viso.
  let frontier = [];
  for (let i = 0; i < n; i++) if (result[i] === 'colletto' && (Math.floor(i / w) - top) / height >= 0.31 && isCream(...rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))) frontier.push(i);
  for (let step = 0; step < 10 && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
        if (j < 0 || !result[j] || result[j] === 'colletto' || !['pelle', 'giacca', 'dubbio'].includes(result[j]) || !yellowish(j)) continue;
        result[j] = 'colletto'; next.push(j);
      }
    }
    frontier = next;
  }
}

// Dita e palmi in ombra hanno l'arancio della giacca o il marrone chiaro del cuoio: un pezzo piccolo e chiaro di una di
// queste parti, circondato soprattutto dalla pelle, è una mano. Polsini, stivali, cintura e borsa confinano per lunghi
// tratti con manica, salopette o gambe, e gli stivali sono più scuri.
function fingersNotLeather(result, data, w, h) {
  const n = w * h;
  for (const part of ['cuoio', 'giacca']) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (result[i] === part) mask[i] = 1;
    components(mask, w, h, cells => {
      if (cells.length > 1500) return;
      let value = 0, r = 0, g = 0, b = 0; const around = {};
      for (const i of cells) {
        value += Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
        r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2];
        const x = i % w;
        for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
          if (j >= 0 && !mask[j] && result[j]) around[result[j]] = (around[result[j]] || 0) + 1;
        }
      }
      const total = Object.values(around).reduce((a, b) => a + b, 0);
      // Per la giacca serve anche il colore della pelle (pesca, tonalità < 22°, poco satura): matita, meccanismo e
      // oggetti in mano sono gialli o ottone e restano dove sono (le correzioni manuali li tolgono dalle parti).
      const [hue, sat] = rgbToHsv(r / cells.length, g / cells.length, b / cells.length);
      const skinColored = part === 'cuoio' || (hue < 22 && sat < 0.6);
      // Pezzi grandi (una mano aperta intera) solo se chiari come la pelle: il risvolto degli stivali da seduta è più scuro.
      const light = cells.length <= 300 ? value / cells.length > 0.55 : value / cells.length > 0.72;
      // Il cuoio è marrone fra 18° e 30° e mai chiarissimo: una mano in ombra è rosata (tonalità sotto 15°), le luci del
      // collo sono quasi bianche.
      const notLeather = part === 'cuoio' && (hue < 15 || value / cells.length > 0.85);
      if (total && skinColored && (around.pelle || 0) / total >= 0.7 && (light || notLeather)) for (const i of cells) result[i] = 'pelle';
      else if (total && notLeather && (around.pelle || 0) / total >= 0.4) for (const i of cells) result[i] = 'pelle';
      // Punte di ciocche che scendono sotto metà figura (Luma addormentata): circondate dai capelli, restano capelli.
      else if (part === 'cuoio' && total && (around.capelli || 0) / total >= 0.6) for (const i of cells) result[i] = 'capelli';
    });
  }
}

// Pezzi piccoli col colore medio impossibile per la loro parte (posa «spavento» e simili, dove giacca, collo e bretelle
// si toccano senza contorno): capelli arancio pieno sotto la testa → giacca, capelli pesca chiaro → pelle;
// cuoio petrolio → salopette, cuoio arancio pieno e luminoso → giacca.
function wrongColorPieces(result, data, w, h, top, height) {
  const n = w * h;
  for (const part of ['capelli', 'cuoio']) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (result[i] === part) mask[i] = 1;
    components(mask, w, h, cells => {
      if (cells.length > 400) return;
      let r = 0, g = 0, b = 0, y = 0;
      for (const i of cells) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; y += Math.floor(i / w); }
      const k = cells.length, [hue, sat, val] = rgbToHsv(r / k, g / k, b / k), relY = (y / k - top) / height;
      let to = null;
      if (part === 'capelli' && relY > 0.38) {
        if (hue >= 26 && hue <= 40 && sat >= 0.6) to = 'giacca';
        else if (hue >= 10 && hue <= 30 && sat < 0.45 && val > 0.8) to = 'pelle';
      } else if (part === 'cuoio') {
        if (hue >= 150 && hue <= 220) to = 'salopette';
        else if (hue >= 28 && hue <= 40 && sat >= 0.68 && val >= 0.8) to = 'giacca';
      }
      if (to) for (const i of cells) result[i] = to;
    });
  }
}

// Il bianco neutro (riflessi) vota «colletto», così riflessi di dita, pugni e palmi alzati finivano nel colletto.
// Un pezzo di colletto resta tale solo se contiene il crema della camicia.
function collarNeedsCream(result, label, data, w, h) {
  const n = w * h, mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (result[i] === 'colletto') mask[i] = 1;
  components(mask, w, h, cells => {
    let cream = 0;
    for (const i of cells) if (isCream(...rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))) cream++;
    if (cream >= 6 && cream >= 0.15 * cells.length) return;
    const around = {};
    for (const i of cells) {
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
        if (j >= 0 && !mask[j] && result[j] && result[j] !== 'dubbio') around[result[j]] = (around[result[j]] || 0) + 1;
      }
    }
    // Su mani e dita i pixel color pelle tornano pelle; il resto (riflessi bianchi, bianco e iride degli occhi, oggetti) resta
    // senza parte, così le iridi si riconoscono dopo in markIrises.
    const best = Object.entries(around).sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const i of cells) result[i] = best === 'pelle' && label[i] === 'pelle' ? 'pelle' : null;
  });
}

// Polsini: dove manica, polsino e borsa si toccano senza contorno nasce una zona «mista» molto grande, e le ombre del polsino
// (tonalità arancio, «dubbio» per colore) prenderebbero la parte prevalente della zona, poi il cuoio della borsa.
// Le ombre arancio molto sature (tonalità ≥ 22°, saturazione ≥ 0,78) attaccate alla giacca restano giacca; la borsa è meno satura (0,6–0,76)
// e le ciocche in ombra hanno tonalità più rossa. Le mani alzate sopra la testa non hanno polsini scuri attaccati a zone miste.
function cuffShadows(result, label, mixedZone, data, w, h, top, height) {
  const n = w * h, shadow = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    // Solo sotto la testa: le iridi hanno lo stesso arancio saturo.
    if (!mixedZone[i] || label[i] !== 'dubbio' || (Math.floor(i / w) - top) / height < 0.36) continue;
    const [hue, sat, val] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (hue >= 22 && hue <= 40 && sat >= 0.78) shadow[i] = 1;
    // Cintura e borsa: marrone-arancio meno saturo. Se la zona mista è soprattutto giacca o salopette (pose di
    // scrittura), prenderebbero quella parte: sotto il petto sono cuoio.
    else if ((result[i] === 'giacca' || result[i] === 'salopette') && hue >= 17 && hue <= 27 && sat >= 0.5 && val >= 0.3 && val <= 0.8 && (Math.floor(i / w) - top) / height > 0.45) result[i] = 'cuoio';
  }
  let frontier = [];
  for (let i = 0; i < n; i++) if (result[i] === 'giacca' && label[i] === 'giacca') frontier.push(i);
  for (let step = 0; step < 8 && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < n ? i + w : -1, i - w >= 0 ? i - w : -1]) {
        if (j >= 0 && shadow[j] && result[j] !== 'giacca') { result[j] = 'giacca'; next.push(j); }
      }
    }
    frontier = next;
  }
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
  // L'arancio pieno e luminoso resta giacca: un lembo di giacca fra bretella e manica può finire in una di queste zone,
  // mentre borsa e cintura sono più scure o meno sature.
  const lit = i => { const [hh, ss, vv] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); return hh >= 26 && hh <= 40 && ss >= 0.68 && vv >= 0.85; };
  for (let i = 0; i < n; i++) if (region[i] >= 0 && leather[region[i]] && result[i] === 'giacca' && !lit(i)) result[i] = 'cuoio';
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
    // Solo bianco quasi neutro: i lembi crema del colletto (più saturi) restano colletto.
    if (part === 'colletto' && cells.length <= 150 && relY < 0.42 && rgbToHsv(sumR / cells.length, sumG / cells.length, sumB / cells.length)[1] < 0.14) { for (const i of cells) result[i] = null; continue; }
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
  luma: { dir: 'characters/People/luma', parts: LUMA_PARTS, frame: lumaFrame, base: 'dominant',
    names: { capelli: 'Capelli', pelle: 'Pelle', giacca: 'Giacca', salopette: 'Salopette', cuoio: 'Cuoio e stivali', colletto: 'Colletto', occhi: 'Occhi' } },
  rosso: { dir: 'characters/Cat/rosso', parts: ROSSO_PARTS, frame: rossoFrame,
    names: { pelo: 'Pelo', strisce: 'Strisce', pancia: 'Pancia e muso', rosa: 'Orecchie e naso' } }
};

// Arancio della giacca, pieno o in ombra, polsini compresi (non il giallo di matita e ottone né il marrone scuro del libro).
function jacketColor(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  return h >= 20 && h <= 39 && s >= 0.6 && v >= 0.55;
}

function applyFixes(fixes, cell, labels, frame, fw) {
  const fh = labels.length / fw;
  for (const fix of fixes) {
    if (!fix.cells?.includes(cell)) continue;
    const [x0, y0, x1, y1] = fix.rect;
    // La manica che continua fuori dal riquadro (sotto il libro, il blocco o il meccanismo) è giacca di Luma, non
    // dell'oggetto: resta. Prima il riquadro lasciava un rettangolo non ricolorato sulla manica. Contano solo i pixel
    // arancio della giacca collegati fra loro: chiave, matita e copertina la toccano ma hanno altri colori.
    const keep = new Uint8Array(labels.length);
    if (fix.clear?.includes('giacca')) {
      const mask = new Uint8Array(labels.length);
      for (let i = 0; i < labels.length; i++) if (labels[i] === 'giacca' && jacketColor(frame[i * 4], frame[i * 4 + 1], frame[i * 4 + 2])) mask[i] = 1;
      components(mask, fw, fh, cells => {
        let outside = 0;
        for (const i of cells) { const x = i % fw, y = (i - x) / fw; if (x < x0 || x > x1 || y < y0 || y > y1) outside++; }
        if (outside >= 40) for (const i of cells) keep[i] = 1;
      });
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * fw + x, label = labels[i]; if (!label) continue;
      let clear = fix.clear?.includes(label) && !keep[i];
      // Carta e pagine: chiare e crema-gialle (tonalità oltre 32°), mentre la pelle è pesca (15–25°).
      if (!clear && fix.clearPale && label === 'pelle') { const [hue, s, v] = rgbToHsv(frame[i * 4], frame[i * 4 + 1], frame[i * 4 + 2]); clear = v > 0.75 && (s < 0.2 || (hue >= 32 && s < 0.5)); }
      if (clear) labels[i] = null;
      else labels[i] = fix.replace?.[label] ?? label;
      if (fix.clearGrey && ['cuoio', 'salopette', 'giacca'].includes(labels[i])) {
        const [, s, v] = rgbToHsv(frame[i * 4], frame[i * 4 + 1], frame[i * 4 + 2]);
        if (s < 0.15 && v < 0.95) labels[i] = null;
      }
      if (fix.collar && ['pelle', 'capelli', 'giacca'].includes(labels[i])) {
        const [hue, s, v] = rgbToHsv(frame[i * 4], frame[i * 4 + 1], frame[i * 4 + 2]);
        if (hue >= 28 && hue <= 50 && s < 0.45 && v > 0.8) labels[i] = 'colletto';
      }
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

// Colore originale di ogni parte: quello mostrato nel selettore e la base della ricolorazione, cioè il tono che diventa
// esattamente il colore scelto (più scuro → ombre, più chiaro → luci).
// «dominant» (illustrazioni): media dei pixel opachi con luminosità vicina alla mediana della parte. La media semplice
// è trascinata giù da ombre e bordi scuri: la giacca risultava più scura del suo tono pieno, che dopo la ricolorazione
// usciva più chiaro e sbiadito del colore scelto, come se il colore andasse solo sulle ombre.
function dominant(sheet, map, parts) {
  const lightness = i => (Math.max(sheet[i * 4], sheet[i * 4 + 1], sheet[i * 4 + 2]) + Math.min(sheet[i * 4], sheet[i * 4 + 1], sheet[i * 4 + 2])) / 510;
  const histograms = parts.map(() => new Uint32Array(256));
  for (let i = 0; i < map.length; i++) if (map[i] && sheet[i * 4 + 3] >= 200) histograms[map[i] - 1][Math.round(lightness(i) * 255)]++;
  const medians = histograms.map(hist => {
    const total = hist.reduce((a, b) => a + b, 0); let seen = 0;
    for (let k = 0; k < 256; k++) { seen += hist[k]; if (seen * 2 >= total) return k / 255; }
    return null;
  });
  const sum = parts.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < map.length; i++) {
    const index = map[i]; if (!index || sheet[i * 4 + 3] < 200 || Math.abs(lightness(i) - medians[index - 1]) > 0.03) continue;
    const s = sum[index - 1]; s[0] += sheet[i * 4]; s[1] += sheet[i * 4 + 1]; s[2] += sheet[i * 4 + 2]; s[3]++;
  }
  return sum.map(([r, g, b, a]) => a ? '#' + [r, g, b].map(c => Math.round(c / a).toString(16).padStart(2, '0')).join('') : null);
}

// Colore medio di ogni parte, pesato per alfa (pixel art a colori pieni come Rosso).
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
  const colors = (config.base === 'dominant' ? dominant : averages)(sheet, map, config.parts);
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
