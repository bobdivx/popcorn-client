/**
 * Script de migration de la base de données du client vers le serveur
 * 
 * Ce script migre toutes les tables et données de popcorn-client/.data/local.db
 * vers popcorn-server/.data/local.db
 * 
 * Usage: npx tsx scripts/migrate-db-to-server.ts
 */

import { createClient } from '@libsql/client';
import { resolve } from 'path';
import { existsSync } from 'fs';

async function migrateDatabase() {
  console.log('🔄 Début de la migration de la base de données...\n');

  // Chemins des bases de données
  const clientDbPath = resolve(process.cwd(), '.data', 'local.db');
  const serverDbPath = resolve(process.cwd(), '..', 'popcorn-server', '.data', 'local.db');

  console.log(`📂 Base client: ${clientDbPath}`);
  console.log(`📂 Base serveur: ${serverDbPath}\n`);

  // Vérifier que la base client existe
  if (!existsSync(clientDbPath)) {
    console.log('✅ Aucune base de données client trouvée. Aucune migration nécessaire.');
    return;
  }

  // Vérifier que la base serveur existe
  if (!existsSync(serverDbPath)) {
    console.error(`❌ La base de données serveur n'existe pas: ${serverDbPath}`);
    console.error('   Veuillez d\'abord démarrer le backend Rust pour créer la base de données.');
    process.exit(1);
  }

  // Créer les clients de base de données
  const clientDb = createClient({
    url: `file:${clientDbPath}`,
  });

  const serverDb = createClient({
    url: `file:${serverDbPath}`,
  });

  try {
    // Liste des tables à migrer (dans l'ordre pour respecter les clés étrangères)
    const tables = [
      'users',
      'invitations',
      'user_settings',
      'app_config',
      'torrents',
      'cached_torrents',
      'downloads',
      'tracker_peers',
      'indexers',
      'sync_settings',
      'quality_profiles',
    ];

    for (const table of tables) {
      console.log(`📋 Migration de la table: ${table}...`);

      // Vérifier si la table existe dans la base client
      const clientTableExists = await clientDb.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        args: [table],
      });

      if (clientTableExists.rows.length === 0) {
        console.log(`   ⏭️  Table ${table} n'existe pas dans la base client, ignorée.`);
        continue;
      }

      // Vérifier si la table existe dans la base serveur
      const serverTableExists = await serverDb.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        args: [table],
      });

      if (serverTableExists.rows.length === 0) {
        console.log(`   ⚠️  Table ${table} n'existe pas dans la base serveur, ignorée.`);
        continue;
      }

      // Récupérer toutes les données de la table client
      const clientData = await clientDb.execute({
        sql: `SELECT * FROM ${table}`,
        args: [],
      });

      if (clientData.rows.length === 0) {
        console.log(`   ✅ Aucune donnée à migrer pour ${table}.`);
        continue;
      }

      // Récupérer la structure de la table pour connaître les colonnes
      const columnsResult = await clientDb.execute({
        sql: `PRAGMA table_info(${table})`,
        args: [],
      });

      const columns = columnsResult.rows.map((row: any) => row.name);

      // Insérer les données dans la base serveur (INSERT OR IGNORE pour éviter les doublons)
      let migrated = 0;
      let skipped = 0;

      for (const row of clientData.rows) {
        try {
          const values = columns.map((col) => row[col]);
          const placeholders = columns.map(() => '?').join(', ');
          const columnsList = columns.join(', ');

          await serverDb.execute({
            sql: `INSERT OR IGNORE INTO ${table} (${columnsList}) VALUES (${placeholders})`,
            args: values,
          });

          migrated++;
        } catch (error: any) {
          // Si l'erreur est une violation de contrainte unique, c'est normal (déjà existant)
          if (error.message?.includes('UNIQUE constraint') || error.message?.includes('PRIMARY KEY')) {
            skipped++;
          } else {
            console.error(`   ❌ Erreur lors de la migration d'une ligne:`, error);
            throw error;
          }
        }
      }

      console.log(`   ✅ ${migrated} ligne(s) migrée(s), ${skipped} ligne(s) ignorée(s) (déjà existantes).`);
    }

    console.log('\n✅ Migration terminée avec succès!');
    console.log('\n💡 Vous pouvez maintenant supprimer la base de données du client si vous le souhaitez.');
    console.log(`   Chemin: ${clientDbPath}`);

  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error);
    process.exit(1);
  } finally {
    // Fermer les connexions
    await clientDb.close();
    await serverDb.close();
  }
}

// Exécuter la migration
migrateDatabase().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
