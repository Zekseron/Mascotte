'use strict';
// Ricolorazione delle parti di una mascotte. Usata dalla finestra della mascotte (window.MascotteRecolor)
// e, con require, dagli strumenti e dai test (stesso risultato in anteprima e nell'app).
// Ogni pixel di una parte prende tonalità, saturazione e luminosità dal colore scelto, conservando le
// differenze rispetto al colore originale della parte: luci, ombre e sfumature del disegno restano.
(function (root) {
  const hexToRgb = hex => /^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)) : null;
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, max ? d / max : 0, max];
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  // Porta un valore 0..1 da «base» a «target» mantenendo la posizione relativa: verso il nero si scala,
  // verso il bianco si scala la distanza dal bianco. Così un colore più chiaro non brucia le luci.
  function shift(value, base, target) {
    if (target <= base) return base > 0.001 ? value * target / base : target;
    return base < 0.999 ? 1 - (1 - value) * (1 - target) / (1 - base) : target;
  }
  const clamp = value => Math.max(0, Math.min(1, value));
  // Trasformazioni per indice di parte (1..n) a partire da { base, target } in esadecimale; null = parte non toccata.
  function prepare(parts) {
    return parts.map(part => {
      const base = hexToRgb(part?.base), target = hexToRgb(part?.target);
      if (!base || !target || part.base.toLowerCase() === part.target.toLowerCase()) return null;
      return { base: rgbToHsv(...base), target: rgbToHsv(...target) };
    });
  }
  // data: RGBA del fotogramma (modificato sul posto); map: RGBA della mappa delle parti (indice nel canale rosso).
  function apply(data, map, transforms) {
    if (!transforms.some(Boolean)) return data;
    for (let i = 0; i < data.length; i += 4) {
      const index = map[i];
      if (!index || !data[i + 3]) continue;
      const t = transforms[index - 1];
      if (!t) continue;
      const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      const [bh, bs, bv] = t.base, [th, ts, tv] = t.target;
      // Con un colore scelto quasi grigio la tonalità non conta: si tiene quella scelta.
      const hue = ts < 0.04 ? th : (th + (h - bh) + 360) % 360;
      const [r, g, b] = hsvToRgb(hue, clamp(shift(s, bs, ts)), clamp(shift(v, bv, tv)));
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
    return data;
  }
  const api = { hexToRgb, rgbToHsv, hsvToRgb, prepare, apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MascotteRecolor = api;
})(this);
