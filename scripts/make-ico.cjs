/**
 * Turn the icon into a .ico, without the converter that will not run here.
 *
 * electron-builder makes one itself from a PNG, using a WebAssembly tool that
 * on this machine cannot allocate the memory it wants. Rather than fight that,
 * the file is made once and committed: Windows is handed an icon that needs no
 * converting, on any machine, forever.
 *
 * An .ico is a header, a directory of images, and the images. Since Vista each
 * image may be a PNG rather than a bitmap, which means the PNG can go in
 * whole — no encoder, no dependency, about thirty lines.
 *
 *     npx electron scripts/make-ico.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const BUILD = path.join(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** One .ico containing every size Windows asks for at different zoom levels. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, png }, i) => {
    const at = i * 16;
    // 256 is written as 0: the field is one byte and 256 does not fit.
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // colours in palette
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(path.join(BUILD, 'icon.png'));
  if (source.isEmpty()) {
    console.error('build/icon.png is missing or unreadable.');
    app.exit(1);
    return;
  }

  const images = SIZES.map((size) => ({
    size,
    png: source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));

  const out = path.join(BUILD, 'icon.ico');
  fs.writeFileSync(out, ico(images));
  console.log(`build/icon.ico — ${SIZES.join(', ')}px, ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
  app.exit(0);
});
