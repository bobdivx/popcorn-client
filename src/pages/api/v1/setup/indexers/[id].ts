export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db/client.js';
import type { Indexer } from '../../../../../lib/client/types.js';
import { z } from 'zod';

const updateIndexerSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional().nullable(),
  jackettIndexerName: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().optional(),
  indexerTypeId: z.string().nullable().optional(),
  configJson: z.string().nullable().optional(),
});

/**
 * GET /api/v1/setup/indexers/:id
 * Récupère un indexer par son ID
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getDb();
    const result = await db.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, is_default, priority, fallback_indexer_id, indexer_type_id, config_json
            FROM indexers
            WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Indexer non trouvé' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const row = result.rows[0];
    const indexer: Indexer = {
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
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: indexer,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[INDEXER GET] ❌ Erreur:', error);
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
 * PUT /api/v1/setup/indexers/:id
 * Met à jour un indexer
 */
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const validation = updateIndexerSchema.safeParse(body);

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

    // Construire la requête UPDATE dynamiquement
    const updates: string[] = [];
    const args: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      args.push(data.name);
    }
    if (data.baseUrl !== undefined) {
      updates.push('base_url = ?');
      args.push(data.baseUrl);
    }
    if (data.apiKey !== undefined) {
      updates.push('api_key = ?');
      args.push(data.apiKey);
    }
    if (data.jackettIndexerName !== undefined) {
      updates.push('jackett_indexer_name = ?');
      args.push(data.jackettIndexerName);
    }
    if (data.isEnabled !== undefined) {
      updates.push('is_enabled = ?');
      args.push(data.isEnabled ? 1 : 0);
    }
    if (data.isDefault !== undefined) {
      updates.push('is_default = ?');
      args.push(data.isDefault ? 1 : 0);
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      args.push(data.priority);
    }
    if (data.indexerTypeId !== undefined) {
      updates.push('indexer_type_id = ?');
      args.push(data.indexerTypeId);
    }
    if (data.configJson !== undefined) {
      updates.push('config_json = ?');
      args.push(data.configJson);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Aucune donnée à mettre à jour' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    updates.push('updated_at = ?');
    args.push(now);
    args.push(id);

    await db.execute({
      sql: `UPDATE indexers SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    // Si c'est le défaut, désactiver les autres
    if (data.isDefault) {
      await db.execute({
        sql: 'UPDATE indexers SET is_default = 0 WHERE id != ?',
        args: [id],
      });
    }

    // Récupérer l'indexer mis à jour
    const result = await db.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, is_default, priority, fallback_indexer_id, indexer_type_id, config_json
            FROM indexers
            WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Indexer non trouvé' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const row = result.rows[0];
    const indexer: Indexer = {
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
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: indexer,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[INDEXER PUT] ❌ Erreur:', error);
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
 * DELETE /api/v1/setup/indexers/:id
 * Supprime un indexer
 */
export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM indexers WHERE id = ?',
      args: [id],
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
    console.error('[INDEXER DELETE] ❌ Erreur:', error);
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
