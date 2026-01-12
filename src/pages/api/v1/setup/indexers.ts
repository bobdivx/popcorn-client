export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client.js';
import type { Indexer, IndexerFormData } from '../../../../lib/client/types.js';
import { z } from 'zod';

const indexerSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  baseUrl: z.string().url('URL invalide'),
  apiKey: z.string().optional(),
  jackettIndexerName: z.string().optional(),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().default(0),
  indexerTypeId: z.string().nullable().optional(),
  configJson: z.string().nullable().optional(),
});

/**
 * GET /api/v1/setup/indexers
 * Récupère tous les indexers
 */
export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, is_default, priority, fallback_indexer_id, indexer_type_id, config_json
            FROM indexers
            ORDER BY priority ASC, name ASC`,
      args: [],
    });

    const indexers: Indexer[] = result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      baseUrl: row.base_url as string,
      apiKey: (row.api_key as string) || null,
      jackettIndexerName: (row.jackett_indexer_name as string) || null,
      isEnabled: Boolean(row.is_enabled),
      isDefault: Boolean(row.is_default),
      priority: row.priority as number,
      fallbackIndexerId: (row.fallback_indexer_id as string) || null,
      indexerTypeId: (row.indexer_type_id as string) || null,
      configJson: (row.config_json as string) || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: indexers,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[INDEXERS GET] ❌ Erreur:', error);
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
 * POST /api/v1/setup/indexers
 * Crée un nouvel indexer
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = indexerSchema.safeParse(body);

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

    const data = validation.data;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    // Générer un UUID v4
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    await db.execute({
      sql: `INSERT INTO indexers (id, name, base_url, api_key, jackett_indexer_name, is_enabled, is_default, priority, indexer_type_id, config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        data.name,
        data.baseUrl,
        data.apiKey || null,
        data.jackettIndexerName || null,
        data.isEnabled ? 1 : 0,
        data.isDefault ? 1 : 0,
        data.priority,
        data.indexerTypeId || null,
        data.configJson || null,
        now,
        now,
      ],
    });

    // Si c'est le défaut, désactiver les autres
    if (data.isDefault) {
      await db.execute({
        sql: 'UPDATE indexers SET is_default = 0 WHERE id != ?',
        args: [id],
      });
    }

    const indexer: Indexer = {
      id,
      name: data.name,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey || null,
      jackettIndexerName: data.jackettIndexerName || null,
      isEnabled: data.isEnabled,
      isDefault: data.isDefault,
      priority: data.priority,
      fallbackIndexerId: null,
      indexerTypeId: data.indexerTypeId || null,
      configJson: data.configJson || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: indexer,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[INDEXERS POST] ❌ Erreur:', error);
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
