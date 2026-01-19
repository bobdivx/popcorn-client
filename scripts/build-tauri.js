#!/usr/bin/env node
/**
 * Script pour préparer et exécuter le build Astro pour Tauri
 * Déplace temporairement les routes API hors de src/pages pour qu'Astro ne les détecte pas
 */

import { execSync } from 'child_process';
import { existsSync, renameSync, rmSync, readFileSync, writeFileSync, cpSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

// Charger les variables d'environnement depuis .env
config();

const apiPath = join(process.cwd(), 'src', 'pages', 'api');
const apiBackupPath = join(process.cwd(), 'src', 'api-routes-backup');
const apiBackupOld = join(process.cwd(), 'src', 'pages', 'api.backup');
const originalConfig = join(process.cwd(), 'astro.config.mjs');
const tauriConfig = join(process.cwd(), 'astro.config.tauri.mjs');
const configBackup = join(process.cwd(), 'astro.config.mjs.backup');

let apiBackedUp = false;
let configBackedUp = false;

// Fonction helper pour copier récursivement (plus fiable sur Windows)
const copyRecursive = (src, dest) => {
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true, force: true });
};

// Fonction helper pour supprimer avec retry (gère les verrous Windows)
const removeWithRetry = async (path, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`⚠️  Tentative ${i + 1}/${maxRetries} échouée, nouvelle tentative dans ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

(async () => {
  try {
    console.log('🔧 Préparation du build Tauri...\n');

    // Nettoyer TOUS les caches possibles
    const cachePaths = [
      join(process.cwd(), '.astro'),
      join(process.cwd(), 'dist'),
      join(process.cwd(), 'node_modules', '.astro'),
    ];

    for (const cachePath of cachePaths) {
      if (existsSync(cachePath)) {
        console.log(`🧹 Nettoyage de ${cachePath}...`);
        rmSync(cachePath, { recursive: true, force: true });
      }
    }
    console.log('✅ Caches nettoyés\n');

    // Déplacer l'ancien backup s'il existe dans src/pages (Astro le détecte !)
    if (existsSync(apiBackupOld)) {
      console.log('📦 Déplacement de l\'ancien backup hors de src/pages...');
      try {
        // Essayer d'abord avec rename (plus rapide)
        if (existsSync(apiBackupPath)) {
          rmSync(apiBackupPath, { recursive: true, force: true });
        }
        renameSync(apiBackupOld, apiBackupPath);
      } catch (error) {
        // Si rename échoue (verrouillage Windows), utiliser copie + suppression
        console.log('⚠️  Rename échoué, utilisation de la copie...');
        copyRecursive(apiBackupOld, apiBackupPath);
        rmSync(apiBackupOld, { recursive: true, force: true });
      }
      apiBackedUp = true;
      console.log('✅ Ancien backup déplacé\n');
    }

    // Déplacer les routes API COMPLÈTEMENT hors de src/pages
    if (existsSync(apiPath)) {
      console.log('📦 Déplacement des routes API hors de src/pages...');
      try {
        // Essayer d'abord avec rename (plus rapide)
        if (existsSync(apiBackupPath)) {
          rmSync(apiBackupPath, { recursive: true, force: true });
        }
        renameSync(apiPath, apiBackupPath);
      } catch (error) {
        // Si rename échoue (verrouillage Windows), utiliser copie + suppression
        console.log('⚠️  Rename échoué, utilisation de la copie...');
        copyRecursive(apiPath, apiBackupPath);
        // Attendre un peu avant de supprimer pour laisser Windows libérer les verrous
        await removeWithRetry(apiPath);
      }
      apiBackedUp = true;
      console.log('✅ Routes API déplacées\n');
      
      // Vérifier que le déplacement a fonctionné
      if (existsSync(apiPath)) {
        throw new Error('Le déplacement des routes API a échoué');
      }
      if (!existsSync(apiBackupPath)) {
        throw new Error('Les routes API n\'ont pas été sauvegardées');
      }
      console.log('✓ Vérification: routes API correctement déplacées\n');
    } else {
      console.log('ℹ️  Aucune route API à déplacer\n');
    }

    // Protection: Vérifier que tauri.android.conf.json est valide (Rust le lit toujours)
    const tauriAndroidConfigPath = join(process.cwd(), 'src-tauri', 'tauri.android.conf.json');
    if (existsSync(tauriAndroidConfigPath)) {
      try {
        let androidConfigContent = readFileSync(tauriAndroidConfigPath, 'utf-8');
        // Supprimer le BOM UTF-8 si présent (U+FEFF)
        if (androidConfigContent.length > 0 && androidConfigContent.charCodeAt(0) === 0xFEFF) {
          androidConfigContent = androidConfigContent.slice(1);
          writeFileSync(tauriAndroidConfigPath, androidConfigContent, 'utf-8');
        }
        if (!androidConfigContent || androidConfigContent.trim().length < 10) {
          console.log('⚠️  tauri.android.conf.json est vide, restauration depuis git...');
          execSync('git restore src-tauri/tauri.android.conf.json', { 
            cwd: process.cwd(), 
            stdio: 'ignore' 
          });
          console.log('✅ Configuration restaurée\n');
        } else {
          // Vérifier que c'est un JSON valide
          JSON.parse(androidConfigContent);
        }
      } catch (error) {
        console.log('⚠️  tauri.android.conf.json invalide, tentative de restauration...');
        try {
          execSync('git restore src-tauri/tauri.android.conf.json', { 
            cwd: process.cwd(), 
            stdio: 'ignore' 
          });
          // Vérifier à nouveau après restauration (et supprimer BOM si présent)
          let restored = readFileSync(tauriAndroidConfigPath, 'utf-8');
          if (restored.length > 0 && restored.charCodeAt(0) === 0xFEFF) {
            restored = restored.slice(1);
            writeFileSync(tauriAndroidConfigPath, restored, 'utf-8');
          }
          JSON.parse(restored);
          console.log('✅ Configuration restaurée et validée\n');
        } catch (restoreError) {
          console.error('❌ Impossible de restaurer tauri.android.conf.json:', restoreError.message);
          // Ne pas bloquer le build, mais logguer l'erreur
        }
      }
    }

    // Utiliser la configuration Tauri spécifique (mode static uniquement)
    if (existsSync(originalConfig) && existsSync(tauriConfig)) {
      console.log('📝 Application de la configuration Tauri (static)...');
      renameSync(originalConfig, configBackup);
      configBackedUp = true;
      const content = readFileSync(tauriConfig, 'utf-8');
      writeFileSync(originalConfig, content);
      console.log('✅ Configuration Tauri appliquée\n');
    }

    // Attendre un peu pour s'assurer que le système de fichiers est à jour
    await new Promise(resolve => setTimeout(resolve, 200));

    // Charger les variables d'environnement depuis .env
    import('dotenv').then((dotenv) => {
      dotenv.config();
    }).catch(() => {
      // dotenv n'est pas installé, continuer sans
    });

    // Détecter la plateforme (desktop ou android)
    const platform = process.env.TAURI_PLATFORM || 'desktop';
    const platformName = platform === 'android' ? 'Android' : 'Desktop';
    
    // Lancer le build Astro en mode static
    console.log(`🏗️  Build Astro en mode static (Tauri ${platformName})...\n`);
    
    try {
      // Préparer les variables d'environnement pour le build
      const buildEnv = {
        ...process.env,
        TAURI_PLATFORM: platform,
        NODE_ENV: 'production',
      };
      
      // Log les variables PUBLIC_* pour débogage
      if (buildEnv.PUBLIC_APP_VERSION) {
        console.log(`ℹ️  PUBLIC_APP_VERSION: ${buildEnv.PUBLIC_APP_VERSION}`);
      }
      if (buildEnv.PUBLIC_APP_VERSION_CODE) {
        console.log(`ℹ️  PUBLIC_APP_VERSION_CODE: ${buildEnv.PUBLIC_APP_VERSION_CODE}`);
      }
      
      execSync('npx astro build', {
        stdio: 'inherit',
        env: buildEnv,
        cwd: process.cwd(),
      });
      console.log(`\n✅ Build Astro terminé avec succès pour ${platformName}!\n`);
    } catch (buildError) {
      console.error(`\n❌ Erreur lors du build Astro pour ${platformName}`);
      throw buildError;
    }
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout.toString());
    if (error.stderr) console.error('STDERR:', error.stderr.toString());
    process.exit(1);
  } finally {
    // Restaurer la config originale
    if (configBackedUp && existsSync(configBackup)) {
      console.log('🔄 Restauration de la configuration originale...');
      if (existsSync(originalConfig)) {
        rmSync(originalConfig, { force: true });
      }
      renameSync(configBackup, originalConfig);
      console.log('✅ Configuration restaurée\n');
    }

    // Restaurer les routes API
    if (apiBackedUp && existsSync(apiBackupPath)) {
      console.log('🔄 Restauration des routes API...');
      try {
        if (existsSync(apiPath)) {
          rmSync(apiPath, { recursive: true, force: true });
        }
        renameSync(apiBackupPath, apiPath);
      } catch (error) {
        // Si rename échoue, utiliser copie + suppression
        console.log('⚠️  Rename échoué, utilisation de la copie...');
        copyRecursive(apiBackupPath, apiPath);
        await removeWithRetry(apiBackupPath);
      }
      console.log('✅ Routes API restaurées\n');
    }
  }
})();
