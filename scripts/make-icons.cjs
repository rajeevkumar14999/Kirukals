/**
 * Generates the PWA icons.
 *
 * Rasterises the Kirukals mark — a gold half-disc on the app's dark surface —
 * straight to PNG with zlib, so the build needs no image library. Run with
 * `node scripts/make-icons.cjs` if the mark ever changes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x0f, 0x11, 0x15];
const GOLD = [0xe8, 0xb0, 0x4b];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param size    pixels square
 * @param bleed   true for maskable icons: fill the whole square and keep the
 *                mark inside the safe zone, since launchers crop the corners
 */
function draw(size, bleed) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const radius = size * (bleed ? 0.22 : 0.3); // the half-disc
  const corner = size * 0.22; // rounded square
  const inset = bleed ? 0 : size * 0.06;

  // Antialias by sampling each pixel on a 3x3 grid.
  const SAMPLES = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px0 = x + (sx + 0.5) / SAMPLES;
          const py0 = y + (sy + 0.5) / SAMPLES;

          // rounded square
          const lx = Math.max(inset + corner - px0, px0 - (size - inset - corner), 0);
          const ly = Math.max(inset + corner - py0, py0 - (size - inset - corner), 0);
          const inside =
            px0 >= inset && px0 <= size - inset && py0 >= inset && py0 <= size - inset &&
            Math.hypot(lx, ly) <= corner;
          if (inside) bg += 1;

          // the mark: a disc with its left half cut away, like the ◗ glyph
          const d = Math.hypot(px0 - c * 0.92, py0 - c);
          if (inside && d <= radius && px0 >= c * 0.92) mark += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const i = (y * size + x) * 4;
      const bgA = bg / total;
      const markA = mark / total;
      const blend = (a, b) => Math.round(a * (1 - markA) + b * markA);
      px[i] = blend(BG[0], GOLD[0]);
      px[i + 1] = blend(BG[1], GOLD[1]);
      px[i + 2] = blend(BG[2], GOLD[2]);
      px[i + 3] = Math.round(255 * bgA);
    }
  }
  return png(size, size, px);
}

const out = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), draw(512, true));
console.log('wrote icon-192.png, icon-512.png, icon-maskable-512.png');
