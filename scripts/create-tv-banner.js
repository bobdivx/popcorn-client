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

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
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

// Chemin de l'icône source (fallback sharp uniquement — icon-512.png est une image générique, pas le logo)
const iconPath = join(projectRoot, 'src-tauri', 'icons', 'icon.png');

/**
 * Icônes Android Popcornn versionnées (mipmap-*, adaptive mipmap-anydpi-v26, fond, banner TV).
 * `tauri android init` régénère gen/android avec l'icône Tauri par défaut : sans cette copie,
 * l'APK embarquait le logo Tauri (constaté sur v1.4.5) et un banner TV avec damier incrusté.
 */
const androidIconsDir = join(projectRoot, 'src-tauri', 'icons', 'android');
/** Jeu de ressources Popcornn (base64, texte versionnable) — prioritaire sur androidIconsDir. */
const androidResBundle = join(projectRoot, 'src-tauri', 'icons', 'android-popcornn-res.json');

function readResBundle() {
  if (!existsSync(androidResBundle)) return null;
  try {
    const data = JSON.parse(readFileSync(androidResBundle, 'utf8'));
    return data && typeof data.files === 'object' ? data.files : null;
  } catch (e) {
    console.warn(`⚠️  ${androidResBundle} illisible: ${e.message}`);
    return null;
  }
}

function hasVersionedBanner() {
  const bundle = readResBundle();
  if (bundle && bundle['drawable-xhdpi/banner.png']) return true;
  return existsSync(join(androidIconsDir, 'drawable-xhdpi', 'banner.png'));
}

function copyTree(from, to) {
  let count = 0;
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) {
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
      count += copyTree(src, dst);
    } else {
      copyFileSync(src, dst);
      count += 1;
    }
  }
  return count;
}

function installLauncherIcons(resPath) {
  const bundle = readResBundle();
  if (!bundle && !existsSync(androidIconsDir)) {
    console.warn(`⚠️  Icônes Android introuvables: ${androidIconsDir} (icône Tauri par défaut conservée)`);
    return false;
  }
  // Supprimer les icônes par défaut du template (png/webp) pour éviter les doublons de ressource.
  for (const dir of readdirSync(resPath)) {
    if (!dir.startsWith('mipmap')) continue;
    const full = join(resPath, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) {
      if (/^ic_launcher(_round|_foreground)?\.(png|webp|xml)$/.test(f)) unlinkSync(join(full, f));
    }
  }
  let n = 0;
  if (bundle) {
    for (const [rel, b64] of Object.entries(bundle)) {
      if (!/^[a-z0-9-]+\/[a-z0-9_]+\.(png|xml)$/.test(rel)) continue;
      const dst = join(resPath, rel);
      if (!existsSync(dirname(dst))) mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, Buffer.from(String(b64), 'base64'));
      n += 1;
    }
  } else {
    n = copyTree(androidIconsDir, resPath);
  }
  console.log(`✅ Icônes Popcornn installées (${n} fichiers) dans ${resPath}`);

  // Icône ronde déclarée dans le manifest (launchers qui la demandent).
  const manifestPath = join(resPath, '..', 'AndroidManifest.xml');
  if (existsSync(manifestPath)) {
    let manifest = readFileSync(manifestPath, 'utf8');
    if (!manifest.includes('android:roundIcon') && /<application\b/.test(manifest)) {
      manifest = manifest.replace(/<application\b/, '<application android:roundIcon="@mipmap/ic_launcher_round"');
      writeFileSync(manifestPath, manifest);
      console.log('✅ android:roundIcon ajouté au manifest');
    }
  }
  return true;
}

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
  
  // Banner Popcornn versionné (copié par installLauncherIcons) : ne pas le régénérer.
  if (hasVersionedBanner()) {
    console.log(`✅ Banner TV Popcornn versionné utilisé: ${join(drawableXhdpiPath, 'banner.png')}`);
    return true;
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

  installLauncherIcons(resPath);
  
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
