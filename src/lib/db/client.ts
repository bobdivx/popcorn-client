import { createClient } from '@libsql/client';
// Utiliser node:path pour contourner l'alias vers le stub (nécessaire pour les routes API SSR)
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

let db: ReturnType<typeof createClient> | null = null;

/**
 * Obtient le chemin de la base de données locale
 * Utilise la même base de données que le backend Rust (popcorn-server/.data/local.db)
 * Si on est dans popcorn-client, remonter d'un niveau pour accéder à popcorn-server/.data/local.db
 */
function getLocalDbPath(): string {
  // En Node.js/Astro SSR, utiliser process.cwd()
  // Dans le navigateur, ce code ne devrait jamais s'exécuter (Astro SSR uniquement)
  const currentDir = typeof process !== 'undefined' ? process.cwd() : '.';
  
  // Si on est dans popcorn-client, remonter d'un niveau pour accéder à popcorn-server
  // Vérifier si on est dans popcorn-client
  const currentDirName = currentDir.split(/[/\\]/).pop();
  let projectRoot = currentDir;
  
  if (currentDirName === 'popcorn-client') {
    // Remonter d'un niveau pour accéder à popcorn-server
    projectRoot = resolve(currentDir, '..', 'popcorn-server');
  } else {
    // Sinon, utiliser le répertoire courant (pour popcorn-server ou autre)
    projectRoot = currentDir;
  }
  
  const dbPath = resolve(projectRoot, '.data', 'local.db');
  
  // Créer le répertoire .data si nécessaire
  const dbDir = resolve(projectRoot, '.data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  console.log(`[DB] Utilisation de la base de données: ${dbPath}`);
  
  return dbPath;
}

export function getDb() {
  if (!db) {
    // TOUJOURS utiliser SQLite local - Turso désactivé
    const dbPath = getLocalDbPath();
    const dbUrl = `file:${dbPath}`;

    db = createClient({
      url: dbUrl,
    });
  }

  return db;
}

/**
 * Version asynchrone pour compatibilité
 */
export async function getDbAsync() {
  return getDb();
}
