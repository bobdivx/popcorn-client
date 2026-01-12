export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client.js';
import { z } from 'zod';

const tmdbKeySchema = z.object({
  apiKey: z.string().min(1, 'La clé API est requise'),
});

/**
 * GET /api/v1/setup/tmdb
 * Récupère la clé API TMDB (sans la valeur complète pour la sécurité)
 */
export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT value FROM app_config WHERE key = ?',
      args: ['tmdb_api_key'],
    });

    const hasKey = result.rows.length > 0 && 
                   result.rows[0].value !== null && 
                   (result.rows[0].value as string).trim() !== '';

    // Ne pas retourner la clé complète pour la sécurité
    // Retourner seulement un indicateur et les premiers caractères
    let maskedKey: string | null = null;
    if (hasKey) {
      const fullKey = result.rows[0].value as string;
      maskedKey = fullKey.substring(0, 4) + '...' + fullKey.substring(fullKey.length - 4);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          apiKey: maskedKey,
          hasKey,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB GET] ❌ Erreur:', error);
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

/**
 * POST /api/v1/setup/tmdb
 * Définit la clé API TMDB
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = tmdbKeySchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { apiKey } = validation.data;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    console.log('[TMDB POST] 💾 Sauvegarde de la clé API TMDB...');
    
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
      console.log('[TMDB POST] Table app_config existe déjà ou erreur de création:', createError);
    }
    
    // Utiliser INSERT OR REPLACE pour SQLite/libSQL
    await db.execute({
      sql: 'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
      args: ['tmdb_api_key', apiKey, now],
    });

    // Vérifier que la clé a bien été sauvegardée
    const verifyResult = await db.execute({
      sql: 'SELECT value FROM app_config WHERE key = ?',
      args: ['tmdb_api_key'],
    });

    if (verifyResult.rows.length > 0 && verifyResult.rows[0].value === apiKey) {
      console.log('[TMDB POST] ✅ Clé API TMDB sauvegardée avec succès');
    } else {
      console.error('[TMDB POST] ❌ Erreur: La clé n\'a pas été sauvegardée correctement');
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB POST] ❌ Erreur:', error);
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

/**
 * DELETE /api/v1/setup/tmdb
 * Supprime la clé API TMDB
 */
export const DELETE: APIRoute = async () => {
  try {
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM app_config WHERE key = ?',
      args: ['tmdb_api_key'],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB DELETE] ❌ Erreur:', error);
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
