#!/usr/bin/env node
/**
 * Script pour créer une version carrée de l'icône
 */

import sharp from 'sharp';
import { join } from 'path';
import { existsSync } from 'fs';

const inputPath = join(process.cwd(), 'src-tauri', 'icons', 'app-icon.png');
const outputPath = join(process.cwd(), 'src-tauri', 'icons', 'app-icon-square.png');

if (!existsSync(inputPath)) {
  console.error(`❌ Fichier introuvable: ${inputPath}`);
  process.exit(1);
}

try {
  const metadata = await sharp(inputPath).metadata();
  console.log(`📐 Dimensions originales: ${metadata.width}x${metadata.height}`);
  
  const size = Math.max(metadata.width, metadata.height);
  console.log(`📐 Taille carrée: ${size}x${size}`);
  
  await sharp(inputPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Fond transparent
    })
    .toFile(outputPath);
  
  console.log(`✅ Icône carrée créée: ${outputPath}`);
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
}
