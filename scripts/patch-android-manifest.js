#!/usr/bin/env node
/**
 * Script pour patcher AndroidManifest.xml :
 * 1. Activer le trafic HTTP non chiffré (cleartext traffic)
 * 2. Rendre les features optionnelles pour compatibilité Mobile + Tablette + TV
 * 
 * Android bloque par défaut le trafic HTTP non chiffré depuis Android 9 (API 28).
 * Ce script ajoute android:usesCleartextTraffic="true" dans le manifest pour permettre
 * les connexions HTTP vers le backend local (ex: http://192.168.1.x:3000).
 * 
 * Pour compatibilité Mobile + TV, les features comme touchscreen et leanback
 * sont rendues non requises pour permettre l'installation sur tous les types d'appareils.
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
  let modified = false;
  
  // 1. Patch usesCleartextTraffic
  if (!content.includes('android:usesCleartextTraffic="true"')) {
    modified = true;
  
    // Vérifier si usesCleartextTraffic est présent mais avec une autre valeur
    if (content.includes('android:usesCleartextTraffic')) {
      console.log('⚠️  usesCleartextTraffic existe déjà avec une autre valeur, remplacement...');
      content = content.replace(
        /android:usesCleartextTraffic="[^"]*"/g,
        'android:usesCleartextTraffic="true"'
      );
    } else {
      // Trouver la balise <application> et ajouter l'attribut
      const applicationPattern = /(<application\s+)([^>]*)(>)/;
      const match = content.match(applicationPattern);
      
      if (!match) {
        console.error('❌ Impossible de trouver la balise <application> dans le manifest');
        return false;
      }
      
      const beforeAttrs = match[1];
      const existingAttrs = match[2];
      const closingBracket = match[3];
      
      if (existingAttrs.trim()) {
        content = content.replace(
          applicationPattern,
          `${beforeAttrs}${existingAttrs} android:usesCleartextTraffic="true"${closingBracket}`
        );
      } else {
        content = content.replace(
          applicationPattern,
          `${beforeAttrs}android:usesCleartextTraffic="true"${closingBracket}`
        );
      }
    }
    console.log('✅ Patch usesCleartextTraffic appliqué');
  } else {
    console.log('✅ Le manifest contient déjà usesCleartextTraffic="true"');
  }
  
  // 2. Patch pour compatibilité Mobile + TV : rendre touchscreen non requis
  // Les TV Android n'ont pas d'écran tactile, donc touchscreen ne doit pas être requis
  const touchscreenPattern = /<uses-feature\s+android:name="android\.hardware\.touchscreen"[^>]*android:required="true"[^>]*\/>/g;
  if (content.match(touchscreenPattern)) {
    console.log('🔧 Modification: touchscreen requis -> non requis (pour compatibilité TV)');
    content = content.replace(
      touchscreenPattern,
      '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />'
    );
    modified = true;
  }
  
  // Si touchscreen est déclaré sans required, s'assurer qu'il est non requis
  const touchscreenPattern2 = /<uses-feature\s+android:name="android\.hardware\.touchscreen"(?!\s+android:required)/g;
  if (content.match(touchscreenPattern2)) {
    console.log('🔧 Ajout: touchscreen non requis (pour compatibilité TV)');
    content = content.replace(
      touchscreenPattern2,
      '<uses-feature android:name="android.hardware.touchscreen" android:required="false"'
    );
    modified = true;
  }
  
  // 3. S'assurer que leanback (TV) n'est pas requis (pour permettre mobile/tablette)
  const leanbackPattern = /<uses-feature\s+android:name="android\.software\.leanback"[^>]*android:required="true"[^>]*\/>/g;
  if (content.match(leanbackPattern)) {
    console.log('🔧 Modification: leanback requis -> non requis (pour compatibilité mobile)');
    content = content.replace(
      leanbackPattern,
      '<uses-feature android:name="android.software.leanback" android:required="false" />'
    );
    modified = true;
  }
  
  // 4. Ajouter la déclaration leanback si elle n'existe pas (pour support TV optionnel)
  if (!content.includes('android.software.leanback')) {
    console.log('🔧 Ajout: déclaration leanback (non requis) pour support TV optionnel');
    // Trouver la balise </manifest> et insérer avant
    const manifestClosePattern = /(\s*)(<\/manifest>)/;
    const leanbackDeclaration = '\n    <!-- Support Android TV optionnel -->\n    <uses-feature android:name="android.software.leanback" android:required="false" />';
    content = content.replace(manifestClosePattern, `${leanbackDeclaration}$1$2`);
    modified = true;
  }

  // 5. Ajouter le banner TV dans l'activité principale (requis pour détection TV par Play Console)
  // Le banner doit être déclaré dans l'activité avec android:banner
  // Google Play Console exige un banner TV (320x180dp) pour détecter la compatibilité TV
  const mainActivityPattern = /(<activity[^>]*android:name="[^"]*MainActivity"[^>]*)(>)/;
  if (content.match(mainActivityPattern) && !content.includes('android:banner')) {
    console.log('🔧 Ajout: déclaration banner TV dans MainActivity (pour détection Play Console)');
    // Ajouter android:banner à l'activité principale
    // Le banner sera créé par un script séparé dans les ressources drawable
    content = content.replace(
      mainActivityPattern,
      '$1 android:banner="@drawable/banner"$2'
    );
    modified = true;
  }
  
  // 6. S'assurer que les features critiques ne sont pas déclarées comme requises
  // Liste des features qui ne doivent pas être requises pour compatibilité large
  const optionalFeatures = [
    'android.hardware.camera',
    'android.hardware.camera.autofocus',
    'android.hardware.location',
    'android.hardware.location.gps',
    'android.hardware.wifi',
    'android.hardware.bluetooth'
  ];
  
  optionalFeatures.forEach(feature => {
    const featurePattern = new RegExp(`<uses-feature\\s+android:name="${feature.replace('.', '\\.')}"[^>]*android:required="true"[^>]*\\/>`, 'g');
    if (content.match(featurePattern)) {
      console.log(`🔧 Modification: ${feature} requis -> non requis`);
      content = content.replace(
        featurePattern,
        `<uses-feature android:name="${feature}" android:required="false" />`
      );
      modified = true;
    }
  });
  
  // Sauvegarder le fichier modifié seulement si des changements ont été faits
  if (modified) {
    writeFileSync(manifestPath, content, 'utf-8');
    console.log('✅ Tous les patches appliqués avec succès');
  } else {
    console.log('✅ Aucun patch nécessaire, le manifest est déjà correct');
  }
  
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
