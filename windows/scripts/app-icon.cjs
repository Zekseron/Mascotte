'use strict';
const fs = require('node:fs'), path = require('node:path');

async function build() {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const root = path.resolve(__dirname, '../..'), dest = path.join(root, 'windows/resources');
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'characters/Cat/rosso/character.json'), 'utf8'));
  const image = await loadImage(path.join(root, 'characters/Cat/rosso/sprites.png'));
  const entries = [], sizes = [16, 24, 32, 48, 64, 128, 256];
  for (const size of sizes) {
    const canvas = createCanvas(size, size), ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, pack.frame.width, pack.frame.height, 0, 0, size, size);
    const png = canvas.toBuffer('image/png'); entries.push({ size, png });
    if (size === 256) fs.writeFileSync(path.join(dest, 'app-icon.png'), png);
  }
  const header = Buffer.alloc(6 + 16 * entries.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => { const at = 6 + 16 * index; header[at] = header[at + 1] = size === 256 ? 0 : size; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += png.length; });
  fs.writeFileSync(path.join(dest, 'app-icon.ico'), Buffer.concat([header, ...entries.map(e => e.png)]));
}
module.exports = { build };
