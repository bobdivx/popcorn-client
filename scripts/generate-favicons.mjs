import sharp from 'sharp';
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'popcorn_logo.png');

function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const png32 = await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const png64 = await sharp(src)
  .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const png180 = await sharp(src)
  .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const ico = pngToIco(png32);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <image href="data:image/png;base64,${png64.toString('base64')}" width="64" height="64" />
</svg>
`;

const outClient = join(root, 'public');
writeFileSync(join(outClient, 'favicon-32x32.png'), png32);
writeFileSync(join(outClient, 'apple-touch-icon.png'), png180);
writeFileSync(join(outClient, 'favicon.ico'), ico);
writeFileSync(join(outClient, 'favicon.svg'), svg);

const webos = join(root, 'webos');
if (existsSync(webos)) {
  writeFileSync(join(webos, 'favicon.svg'), svg);
}

const webPublic = join(root, '..', 'popcorn-web', 'public');
if (existsSync(webPublic)) {
  copyFileSync(src, join(webPublic, 'popcorn_logo.png'));
  writeFileSync(join(webPublic, 'favicon-32x32.png'), png32);
  writeFileSync(join(webPublic, 'apple-touch-icon.png'), png180);
  writeFileSync(join(webPublic, 'favicon.ico'), ico);
  writeFileSync(join(webPublic, 'favicon.svg'), svg);
}

console.log('Favicons generated');
