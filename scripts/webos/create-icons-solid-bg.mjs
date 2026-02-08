#!/usr/bin/env node
/**
 * Génère les icônes webOS avec fond plein (0% transparence).
 * Exigence LG Content Store : fond uni conforme à la couleur tuile.
 *
 * Usage: node scripts/webos/create-icons-solid-bg.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const webosDir = join(projectRoot, 'webos');

// Couleur tuile Popcorn (rouge) - conforme aux guidelines LG
const TILE_COLOR = { r: 229, g: 9, b: 20 }; // #E50914

const SOURCE_ICONS = [
  join(projectRoot, 'src-tauri', 'icons', 'icon.png'),
  join(projectRoot, 'public', 'icon.png'),
  join(webosDir, 'icon.png'),
];

async function findSourceIcon() {
  for (const p of SOURCE_ICONS) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function createIcon(size, iconSize, outPath) {
  const source = await findSourceIcon();
  if (!source) {
    console.error('❌ Aucune icône source trouvée.');
    process.exit(1);
  }

  const padding = Math.max(5, Math.floor((size - iconSize) / 2));
  const bgBuffer = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: TILE_COLOR.r, g: TILE_COLOR.g, b: TILE_COLOR.b },
    },
  })
    .png()
    .toBuffer();

  await sharp(bgBuffer)
    .composite([
      {
        input: await sharp(source).resize(iconSize, iconSize).png().toBuffer(),
        left: padding,
        top: padding,
      },
    ])
    .png()
    .toFile(outPath);
}

async function main() {
  if (!existsSync(webosDir)) {
    mkdirSync(webosDir, { recursive: true });
  }

  console.log('🎨 Génération des icônes webOS (fond plein #E50914)...');
  await createIcon(80, 70, join(webosDir, 'icon.png'));
  await createIcon(130, 120, join(webosDir, 'icon-large.png'));
  console.log('✅ icon.png (80x80) et icon-large.png (130x130) créés.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
