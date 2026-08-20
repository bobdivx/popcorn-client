#!/usr/bin/env node
/**
 * Copie VERSION.json dans public/ ( /VERSION.json ) et public/json/version
 * (sondes Chrome/Cursor sur /json/version).
 */

import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();
const versionFile = join(projectRoot, 'VERSION.json');
const publicDir = join(projectRoot, 'public');
const publicVersionFile = join(publicDir, 'VERSION.json');
const publicJsonDir = join(publicDir, 'json');
const publicJsonVersionFile = join(publicJsonDir, 'version');

try {
  if (!existsSync(versionFile)) {
    console.warn('⚠️  VERSION.json introuvable à la racine du projet');
    process.exit(0);
  }

  if (!existsSync(publicDir)) {
    console.warn('⚠️  Le dossier public/ n\'existe pas');
    process.exit(0);
  }

  copyFileSync(versionFile, publicVersionFile);
  mkdirSync(publicJsonDir, { recursive: true });
  copyFileSync(versionFile, publicJsonVersionFile);
  console.log('✅ VERSION.json copié dans public/ et public/json/version');
} catch (error) {
  console.error('❌ Erreur lors de la copie de VERSION.json:', error.message);
  process.exit(0);
}
