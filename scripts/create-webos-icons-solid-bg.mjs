#!/usr/bin/env node
/**
 * Génère icon.png (80×80) et icon-large.png (130×130) pour webOS LG QA.
 * Fond plein opaque (0 % transparence), couleur tile = #D1C4E9 (--ds-accent-violet / violet-200).
 * Sortie en PNG RGB (sans canal alpha) pour éviter les rejets pretest « App Icon Background ».
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const webosDir = path.join(root, 'webos');
const BG = '#D1C4E9';

const candidates = [
  path.join(root, 'public', 'popcorn_logo.png'),
  path.join(webosDir, 'popcorn_logo.png'),
  path.join(root, 'src-tauri', 'icons', 'icon.png'),
  path.join(webosDir, 'icon.png'),
];

const source = candidates.find((p) => fs.existsSync(p));
if (!source) {
  console.error('❌ Aucune source logo trouvée');
  process.exit(1);
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;
}

function writeWithFfmpeg(outPath, size, logoSize) {
  const filter = [
    `color=c=${BG}:s=${size}x${size}:d=1[bg]`,
    `[0:v]scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease,format=rgba[logo]`,
    `[bg][logo]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24`,
  ].join(';');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', source, '-frames:v', '1', '-filter_complex', filter, outPath],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`ffmpeg failed for ${outPath}`);
  }
}

async function writeWithSharp(outPath, size, logoSize) {
  const sharp = (await import('sharp')).default;
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="100%" height="100%" fill="${BG}"/></svg>`,
  );
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .ensureAlpha()
    .toBuffer();
  await sharp(bg)
    .composite([{ input: logo, gravity: 'centre' }])
    .removeAlpha()
    .png()
    .toFile(outPath);
}

async function main() {
  const icon = path.join(webosDir, 'icon.png');
  const large = path.join(webosDir, 'icon-large.png');
  fs.mkdirSync(webosDir, { recursive: true });

  const store = path.join(webosDir, 'store-icon-400.png');

  if (hasFfmpeg()) {
    writeWithFfmpeg(icon, 80, 70);
    writeWithFfmpeg(large, 130, 120);
    writeWithFfmpeg(store, 400, 340);
  } else {
    await writeWithSharp(icon, 80, 70);
    await writeWithSharp(large, 130, 120);
    await writeWithSharp(store, 400, 340);
  }

  console.log(`✅ Icônes webOS générées (fond ${BG}, RGB opaque)`);
  console.log(`   source: ${source}`);
  console.log(`   → ${icon}`);
  console.log(`   → ${large}`);
  console.log(`   → ${store} (Seller Lounge 400×400, hors IPK)`);
  console.log('   Seller Lounge tile color à aligner: #D1C4E9');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
