'use strict';
// Ricolorazione delle parti di una mascotte. Usata dalla finestra della mascotte (window.MascotteRecolor)
// e, con require, dagli strumenti e dai test (stesso risultato in anteprima e nell'app).
// Si usa la luminosità HSL: anche un colore completamente saturo può avere luci e ombre.
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
  function rgbToHsl(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    const lightness = v * (1 - s / 2);
    const room = Math.min(lightness, 1 - lightness);
    return [h, room ? Math.min(1, (v - lightness) / room) : 0, lightness];
  }
  function hslToRgb(hue, saturation, lightness) {
    const chroma = saturation * Math.min(lightness, 1 - lightness);
    const value = lightness + chroma;
    return hsvToRgb(hue, value ? 2 * chroma / value : 0, value);
  }
  // Il tono medio va sul colore scelto. Ombre e luci occupano il margine disponibile ai suoi due lati.
  function moveMidtone(lightness, base, target) {
    if (lightness === base) return target;
    if (lightness < base) return lightness * target / base;
    return 1 - (1 - lightness) * (1 - target) / (1 - base);
  }
  // Rimappa solo i due quarti esterni. Anche ai bordi del selettore, toni diversi restano distinti.
  const keepToneRoom = lightness => lightness < 0.25 ? 0.12 + 0.52 * lightness
    : lightness > 0.75 ? 0.88 - 0.52 * (1 - lightness) : lightness;
  const clamp = value => Math.max(0, Math.min(1, value));
  // Trasformazioni per indice di parte (1..n) a partire da { base, target } in esadecimale; null = parte non toccata.
  function prepare(parts) {
    return parts.map(part => {
      const base = hexToRgb(part?.base), target = hexToRgb(part?.target);
      if (!base || !target || part.base.toLowerCase() === part.target.toLowerCase()) return null;
      const [hue, saturation, lightness] = rgbToHsl(...target);
      // Nero e bianco sono toni medi con un margine per i dettagli del disegno.
      return { base: rgbToHsl(...base), target: [hue, saturation, keepToneRoom(lightness)] };
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
      const [h, s, lightness] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const [bh, bs, bl] = t.base, [th, ts, tl] = t.target;
      // I quasi-grigi non hanno una tonalità abbastanza stabile da usare come riferimento.
      const hue = Math.min(s, bs, ts) < 0.04 ? th : (th + (h - bh) + 360) % 360;
      const saturation = ts === 0 ? 0 : clamp(ts + s - bs);
      const [r, g, b] = hslToRgb(hue, saturation, moveMidtone(lightness, bl, tl));
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
    return data;
  }
  const api = { hexToRgb, rgbToHsv, hsvToRgb, prepare, apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MascotteRecolor = api;
})(this);
