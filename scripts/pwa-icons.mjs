// Draws the Atlas app icons (teal tile with a white «A») as PNGs, without image libraries:
//   node scripts/pwa-icons.mjs
// Writes apps/web/public/icons/*.png. Maskable and Apple icons are full-bleed squares (no transparency).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x17, 0x6f, 0x68];
const FG = [255, 255, 255];
// The letter on a 192-unit canvas: outer outline with legs, and the crossbar.
const LETTER = [[96, 38], [146, 154], [122, 154], [96, 92], [70, 154], [46, 154]];
const BAR = [[76, 114], [116, 114], [108, 132], [84, 132]];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, tail]);
};
const inside = (x, y, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** size: pixels; glyph: share of the canvas the 192-unit letter area takes; rounded: corner radius share (0 = square). */
function icon(size, { glyph = 1, rounded = 0.19 } = {}) {
  const rows = [];
  const radius = rounded * size;
  const offset = (size - size * glyph) / 2;
  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) {
      const cx = Math.min(Math.max(x, radius), size - 1 - radius);
      const cy = Math.min(Math.max(y, radius), size - 1 - radius);
      if (radius && (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) { row.push(0, 0, 0, 0); continue; }
      const u = ((x + 0.5 - offset) / (size * glyph)) * 192;
      const v = ((y + 0.5 - offset) / (size * glyph)) * 192;
      const color = inside(u, v, LETTER) || inside(u, v, BAR) ? FG : BG;
      row.push(...color, 255);
    }
    rows.push(Buffer.from(row));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../apps/web/public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  'icon-192.png': icon(192),
  'icon-512.png': icon(512),
  // Maskable: the platform crops to a circle or squircle, so the letter keeps to the inner 80%.
  'icon-maskable-512.png': icon(512, { glyph: 0.8, rounded: 0 }),
  'apple-touch-icon.png': icon(180, { glyph: 0.9, rounded: 0 }),
};
for (const [name, png] of Object.entries(files)) { writeFileSync(new URL(name, out), png); console.log(name, png.length, 'bytes'); }
