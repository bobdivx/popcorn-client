#!/usr/bin/env node
/**
 * Script pour créer le banner TV Android (320x180dp)
 * 
 * Google Play Console exige un banner TV pour détecter la compatibilité Android TV.
 * Ce script crée un banner à partir de l'icône de l'application.
 * 
 * Le banner doit être de 320x180dp (1280x720px pour xhdpi).
 * 
 * Usage: node scripts/create-tv-banner.js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';

const projectRoot = process.cwd();

// Chemins possibles pour les ressources Android
const possibleResPaths = [
  // Tauri v2 - chemin standard
  join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res'),
  // Build output
  join(projectRoot, 'src-tauri', 'target', 'aarch64-linux-android', 'release', 'app', 'src', 'main', 'res'),
  // Chemin de build alternatif
  join(projectRoot, 'src-tauri', 'android', 'app', 'src', 'main', 'res'),
];

// Chemin de l'icône source
const iconPath = join(projectRoot, 'src-tauri', 'icons', 'icon-512.png');

function findResPath() {
  for (const path of possibleResPaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

async function createBannerDrawable(resPath) {
  const drawablePath = join(resPath, 'drawable');
  const drawableXhdpiPath = join(resPath, 'drawable-xhdpi');
  
  // Créer les dossiers si nécessaire
  if (!existsSync(drawablePath)) {
    mkdirSync(drawablePath, { recursive: true });
  }
  if (!existsSync(drawableXhdpiPath)) {
    mkdirSync(drawableXhdpiPath, { recursive: true });
  }
  
  // Vérifier si l'icône source existe
  if (!existsSync(iconPath)) {
    console.error(`❌ Icône source introuvable: ${iconPath}`);
    console.error('   Le banner ne peut pas être créé automatiquement.');
    console.error('   Créez manuellement un banner 1280x720px et placez-le dans:');
    console.error(`   ${join(drawableXhdpiPath, 'banner.png')}`);
    return false;
  }
  
  // Lire l'icône source et créer le banner
  try {
    // Essayer d'utiliser sharp si disponible pour redimensionner l'icône
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      // sharp n'est pas disponible, on utilisera une copie simple
      console.log('⚠️  sharp non disponible, création d\'un banner basique');
    }
    
    const bannerPath = join(drawableXhdpiPath, 'banner.png');
    
    if (sharp) {
      // Utiliser sharp pour créer un banner 1280x720px à partir de l'icône
      console.log('🎨 Création du banner TV avec sharp (1280x720px)...');
      const image = sharp(iconPath);
      const metadata = await image.metadata();
      
      // Créer un banner 1280x720px avec l'icône centrée sur un fond
      // L'icône sera redimensionnée pour tenir dans 720px de hauteur, puis centrée horizontalement
      await image
        .resize(720, 720, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .extend({
          top: 0,
          bottom: 0,
          left: 280,
          right: 280,
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        })
        .png()
        .toFile(bannerPath);
      
      console.log(`✅ Banner TV créé: ${bannerPath} (1280x720px)`);
    } else {
      // Fallback: copier l'icône comme banner temporaire
      // Google Play Console acceptera cela comme minimum
      console.log('📋 Copie de l\'icône comme banner temporaire...');
      copyFileSync(iconPath, bannerPath);
      console.log(`✅ Banner temporaire créé: ${bannerPath}`);
      console.log('');
      console.log('⚠️  RECOMMANDÉ: Créez un vrai banner 1280x720px pour une meilleure expérience TV');
      console.log('   Le banner actuel est une copie de l\'icône (512x512px)');
    }
    
    // Pas de banner.xml : il créerait une référence circulaire (banner.xml → @drawable/banner = lui-même).
    // Le PNG dans drawable-xhdpi/banner.png est déjà la ressource @drawable/banner utilisée par le manifest.
    console.log('💡 Le banner apparaîtra dans la launcher Android TV (@drawable/banner → banner.png)');
    
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors de la création du banner: ${error.message}`);
    return false;
  }
}

// Fonction principale
async function main() {
  console.log('🎨 Création du banner TV Android...\n');
  
  const resPath = findResPath();
  
  if (!resPath) {
    console.error('❌ Dossier res/ introuvable dans les emplacements suivants:');
    possibleResPaths.forEach(path => {
      console.error(`   - ${path}`);
    });
    console.error('\n💡 Assurez-vous que le build Android a été lancé au moins une fois.');
    console.error('   Le dossier res/ est généré par Tauri lors du build.');
    process.exit(1);
  }
  
  console.log(`✅ Dossier res/ trouvé: ${resPath}\n`);
  
  const success = await createBannerDrawable(resPath);
  
  if (success) {
    console.log('\n✅ Banner TV créé avec succès!');
    process.exit(0);
  } else {
    console.error('\n❌ Échec de la création du banner');
    process.exit(1);
  }
}

// Exécuter le script
main();
