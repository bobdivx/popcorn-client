#!/usr/bin/env node
/**
 * Script pour patcher AndroidManifest.xml et activer le trafic HTTP non chiffré (cleartext traffic)
 * 
 * Android bloque par défaut le trafic HTTP non chiffré depuis Android 9 (API 28).
 * Ce script ajoute android:usesCleartextTraffic="true" dans le manifest pour permettre
 * les connexions HTTP vers le backend local (ex: http://192.168.1.x:3000).
 * 
 * Usage: node scripts/patch-android-manifest.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();

// Chemins possibles pour AndroidManifest.xml (Tauri génère dans différents endroits selon la version)
const possibleManifestPaths = [
  // Tauri v2 - chemin standard
  join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  // Tauri v2 - chemin alternatif
  join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  // Build output
  join(projectRoot, 'src-tauri', 'target', 'aarch64-linux-android', 'release', 'app', 'src', 'main', 'AndroidManifest.xml'),
  // Chemin de build alternatif
  join(projectRoot, 'src-tauri', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
];

function findManifestPath() {
  for (const path of possibleManifestPaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

function patchManifest(manifestPath) {
  console.log(`📝 Lecture de ${manifestPath}...`);
  
  let content = readFileSync(manifestPath, 'utf-8');
  
  // Vérifier si le patch est déjà appliqué
  if (content.includes('android:usesCleartextTraffic="true"')) {
    console.log('✅ Le manifest contient déjà usesCleartextTraffic="true"');
    return true;
  }
  
  // Vérifier si usesCleartextTraffic est présent mais avec une autre valeur
  if (content.includes('android:usesCleartextTraffic')) {
    console.log('⚠️  usesCleartextTraffic existe déjà avec une autre valeur, remplacement...');
    content = content.replace(
      /android:usesCleartextTraffic="[^"]*"/g,
      'android:usesCleartextTraffic="true"'
    );
  } else {
    // Trouver la balise <application> et ajouter l'attribut
    // Pattern pour trouver <application ...> avec ou sans attributs existants
    const applicationPattern = /(<application\s+)([^>]*)(>)/;
    const match = content.match(applicationPattern);
    
    if (!match) {
      console.error('❌ Impossible de trouver la balise <application> dans le manifest');
      return false;
    }
    
    // Ajouter usesCleartextTraffic après les attributs existants
    const beforeAttrs = match[1];
    const existingAttrs = match[2];
    const closingBracket = match[3];
    
    // Vérifier si des attributs existent déjà
    if (existingAttrs.trim()) {
      // Ajouter l'attribut après les attributs existants (avec un espace)
      content = content.replace(
        applicationPattern,
        `${beforeAttrs}${existingAttrs} android:usesCleartextTraffic="true"${closingBracket}`
      );
    } else {
      // Pas d'attributs, ajouter directement
      content = content.replace(
        applicationPattern,
        `${beforeAttrs}android:usesCleartextTraffic="true"${closingBracket}`
      );
    }
  }
  
  // Sauvegarder le fichier modifié
  writeFileSync(manifestPath, content, 'utf-8');
  console.log('✅ Patch appliqué avec succès: android:usesCleartextTraffic="true"');
  return true;
}

// Fonction principale
function main() {
  console.log('🔧 Patch AndroidManifest.xml pour activer cleartext traffic...\n');
  
  const manifestPath = findManifestPath();
  
  if (!manifestPath) {
    console.error('❌ AndroidManifest.xml introuvable dans les emplacements suivants:');
    possibleManifestPaths.forEach(path => {
      console.error(`   - ${path}`);
    });
    console.error('\n💡 Assurez-vous que le build Android a été lancé au moins une fois.');
    console.error('   Le manifest est généré par Tauri lors du build.');
    process.exit(1);
  }
  
  console.log(`✅ AndroidManifest.xml trouvé: ${manifestPath}\n`);
  
  const success = patchManifest(manifestPath);
  
  if (success) {
    console.log('\n✅ Patch terminé avec succès!');
    process.exit(0);
  } else {
    console.error('\n❌ Échec du patch');
    process.exit(1);
  }
}

// Exécuter le script
main();
