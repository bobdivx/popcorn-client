#!/usr/bin/env node
/**
 * Script pour copier VERSION.json dans le dossier public
 * Permet d'accéder à la version via /VERSION.json dans l'application
 */

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();
const versionFile = join(projectRoot, 'VERSION.json');
const publicDir = join(projectRoot, 'public');
const publicVersionFile = join(publicDir, 'VERSION.json');

try {
  if (!existsSync(versionFile)) {
    console.warn('⚠️  VERSION.json introuvable à la racine du projet');
    process.exit(0); // Ne pas bloquer le build si le fichier n'existe pas
  }

  if (!existsSync(publicDir)) {
    console.warn('⚠️  Le dossier public/ n\'existe pas');
    process.exit(0);
  }

  copyFileSync(versionFile, publicVersionFile);
  console.log('✅ VERSION.json copié dans public/');
} catch (error) {
  console.error('❌ Erreur lors de la copie de VERSION.json:', error.message);
  process.exit(0); // Ne pas bloquer le build en cas d'erreur
}
