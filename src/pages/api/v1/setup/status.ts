export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client.js';
import type { SetupStatus } from '../../../../lib/client/types.js';

/**
 * API pour récupérer le statut du setup
 * Vérifie si la configuration est complète (indexers, TMDB key, etc.)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const db = getDb();
    
    // S'assurer que la table app_config existe
    try {
      await db.execute({
        sql: `CREATE TABLE IF NOT EXISTS app_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        args: [],
      });
    } catch (createError) {
      // La table existe peut-être déjà, continuer
      console.log('[SETUP STATUS] Table app_config existe déjà ou erreur de création:', createError);
    }
    
    // Vérifier si des indexers existent
    const indexersResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM indexers WHERE is_enabled = 1',
      args: [],
    });
    const hasIndexers = (indexersResult.rows[0]?.count as number) > 0;

    // Vérifier si une clé TMDB est configurée
    const tmdbResult = await db.execute({
      sql: 'SELECT value FROM app_config WHERE key = ?',
      args: ['tmdb_api_key'],
    });
    const hasTmdbKey = tmdbResult.rows.length > 0 && 
                       tmdbResult.rows[0].value !== null && 
                       (tmdbResult.rows[0].value as string).trim() !== '';
    
    console.log('[SETUP STATUS] 🔍 Vérification TMDB:', {
      rowsFound: tmdbResult.rows.length,
      hasValue: tmdbResult.rows.length > 0 && tmdbResult.rows[0].value !== null,
      valueLength: tmdbResult.rows.length > 0 ? (tmdbResult.rows[0].value as string).length : 0,
      hasTmdbKey,
    });

    // Vérifier si le backend est configuré
    const backendResult = await db.execute({
      sql: 'SELECT value FROM app_config WHERE key = ?',
      args: ['backend_url'],
    });
    const hasBackendConfig = backendResult.rows.length > 0 && 
                            backendResult.rows[0].value !== null;

    // Vérifier si des torrents existent (optionnel, peut nécessiter le backend Rust)
    // Pour l'instant, on suppose qu'il n'y a pas de torrents
    const hasTorrents = false;

    // Vérifier si un emplacement de téléchargement est configuré
    const downloadLocationResult = await db.execute({
      sql: 'SELECT value FROM app_config WHERE key = ?',
      args: ['download_location'],
    });
    const hasDownloadLocation = downloadLocationResult.rows.length > 0 && 
                                downloadLocationResult.rows[0].value !== null;

    const setupStatus: SetupStatus = {
      needsSetup: !hasIndexers || !hasTmdbKey || !hasBackendConfig,
      hasIndexers,
      hasBackendConfig,
      hasTmdbKey,
      hasTorrents,
      hasDownloadLocation,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: setupStatus,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[SETUP STATUS] ❌ Erreur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
