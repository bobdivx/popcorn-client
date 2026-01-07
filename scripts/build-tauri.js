#!/usr/bin/env node
/**
 * Script pour préparer et exécuter le build Astro pour Tauri
 * Déplace temporairement les routes API hors de src/pages pour qu'Astro ne les détecte pas
 */

import { execSync } from 'child_process';
import { existsSync, renameSync, rmSync, readFileSync, writeFileSync } from 'fs';
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
      if (existsSync(apiBackupPath)) {
        rmSync(apiBackupPath, { recursive: true, force: true });
      }
      renameSync(apiBackupOld, apiBackupPath);
      apiBackedUp = true;
      console.log('✅ Ancien backup déplacé\n');
    }

    // Déplacer les routes API COMPLÈTEMENT hors de src/pages
    if (existsSync(apiPath)) {
      console.log('📦 Déplacement des routes API hors de src/pages...');
      if (existsSync(apiBackupPath)) {
        rmSync(apiBackupPath, { recursive: true, force: true });
      }
      renameSync(apiPath, apiBackupPath);
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

    // Lancer le build Astro en mode static
    console.log('🏗️  Build Astro en mode static (Tauri)...\n');
    process.env.TAURI_PLATFORM = 'desktop';
    
    try {
      execSync('npx astro build', {
        stdio: 'inherit',
        env: { 
          ...process.env, 
          TAURI_PLATFORM: 'desktop',
          NODE_ENV: 'production'
        },
        cwd: process.cwd(),
      });
      console.log('\n✅ Build Astro terminé avec succès!\n');
    } catch (buildError) {
      console.error('\n❌ Erreur lors du build Astro');
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
      if (existsSync(apiPath)) {
        rmSync(apiPath, { recursive: true, force: true });
      }
      renameSync(apiBackupPath, apiPath);
      console.log('✅ Routes API restaurées\n');
    }
  }
})();
