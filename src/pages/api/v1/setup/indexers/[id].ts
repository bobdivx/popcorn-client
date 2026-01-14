export const prerender = false;

import type { APIRoute } from 'astro';
import type { Indexer } from '../../../../../lib/client/types.js';
import { z } from 'zod';

function getBackendUrlOverrideFromRequest(request: Request): string | null {
  const raw = request.headers.get('x-popcorn-backend-url') || request.headers.get('X-Popcorn-Backend-Url');
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined') return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed.replace(/\/$/, '');
  } catch {
    return null;
  }
}

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
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:24',message:'GET indexer by id - calling backend',data:{indexerId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const { getBackendUrlAsync } = await import('../../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/admin/indexers/${encodeURIComponent(id)}`;
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:32',message:'GET indexer by id - backend URL',data:{backendUrl,backendApiUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:43',message:'GET indexer by id - response received',data:{status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXER GET] ❌ Erreur backend:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:49',message:'GET indexer by id - backend error',data:{status:response.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Indexer non trouvé',
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const backendData = await response.json();
    const backendIndexer = backendData.data;
    
    // Convertir l'indexer du backend vers le format attendu par le client
    const indexer: Indexer = {
      id: backendIndexer.id,
      name: backendIndexer.name,
      baseUrl: backendIndexer.base_url,
      apiKey: backendIndexer.api_key || null,
      jackettIndexerName: backendIndexer.jackett_indexer_name || null,
      isEnabled: backendIndexer.is_enabled === 1,
      isDefault: backendIndexer.is_default === 1,
      priority: backendIndexer.priority || 0,
      fallbackIndexerId: backendIndexer.fallback_indexer_id || null,
      indexerTypeId: backendIndexer.indexer_type_id || null,
      configJson: backendIndexer.config_json || null,
    };

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:70',message:'GET indexer by id - success',data:{indexerId:indexer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:85',message:'GET indexer by id - exception',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:120',message:'PUT indexer - calling backend',data:{indexerId:id,updates:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (Object.keys(data).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Aucune donnée à mettre à jour' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer l'indexer actuel depuis le backend
    const { getBackendUrlAsync } = await import('../../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const getUrl = `${backendUrl}/api/client/admin/indexers/${encodeURIComponent(id)}`;
    
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXER PUT] ❌ Erreur lors de la récupération:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:138',message:'PUT indexer - get error',data:{status:getResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Indexer non trouvé',
        }),
        {
          status: getResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const getData = await getResponse.json();
    const currentIndexer = getData.data;
    
    // Le backend fait maintenant automatiquement le matching avec les définitions JSON
    // Si indexerTypeId n'est pas fourni et que l'indexer actuel n'en a pas,
    // le backend cherchera dans les définitions JSON en utilisant le nom de l'indexer
    let detectedIndexerTypeId = data.indexerTypeId !== undefined ? data.indexerTypeId : currentIndexer.indexer_type_id;
    
    if (!detectedIndexerTypeId) {
      console.log(`[INDEXER PUT] Le backend fera le matching automatique pour l'indexer '${currentIndexer.name}'`);
    }
    
    // Fusionner les données actuelles avec les nouvelles données
    const updatePayload = {
      id: currentIndexer.id,
      name: data.name !== undefined ? data.name : currentIndexer.name,
      base_url: data.baseUrl !== undefined ? data.baseUrl : currentIndexer.base_url,
      api_key: data.apiKey !== undefined ? data.apiKey : currentIndexer.api_key,
      jackett_indexer_name: data.jackettIndexerName !== undefined ? data.jackettIndexerName : currentIndexer.jackett_indexer_name,
      is_enabled: data.isEnabled !== undefined ? data.isEnabled : (currentIndexer.is_enabled === 1),
      is_default: data.isDefault !== undefined ? data.isDefault : (currentIndexer.is_default === 1),
      priority: data.priority !== undefined ? data.priority : currentIndexer.priority,
      indexer_type_id: detectedIndexerTypeId,
      config_json: data.configJson !== undefined ? data.configJson : currentIndexer.config_json,
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:180',message:'PUT indexer - final payload with detected type',data:{indexerTypeId:detectedIndexerTypeId,name:updatePayload.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:160',message:'PUT indexer - update payload prepared',data:{backendUrl,updatePayload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Mettre à jour dans le backend
    const updateUrl = `${backendUrl}/api/client/admin/indexers/${encodeURIComponent(id)}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:173',message:'PUT indexer - update response received',data:{status:updateResponse.status,ok:updateResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXER PUT] ❌ Erreur backend:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:180',message:'PUT indexer - update error',data:{status:updateResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la mise à jour de l\'indexer dans le backend',
        }),
        {
          status: updateResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const updateData = await updateResponse.json();
    const backendIndexer = updateData.data;
    
    // Convertir l'indexer du backend vers le format attendu par le client
    const indexer: Indexer = {
      id: backendIndexer.id,
      name: backendIndexer.name,
      baseUrl: backendIndexer.base_url,
      apiKey: backendIndexer.api_key || null,
      jackettIndexerName: backendIndexer.jackett_indexer_name || null,
      isEnabled: backendIndexer.is_enabled === 1,
      isDefault: backendIndexer.is_default === 1,
      priority: backendIndexer.priority || 0,
      fallbackIndexerId: backendIndexer.fallback_indexer_id || null,
      indexerTypeId: backendIndexer.indexer_type_id || null,
      configJson: backendIndexer.config_json || null,
    };

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:202',message:'PUT indexer - success',data:{indexerId:indexer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Plus besoin de synchronisation asynchrone, tout est déjà dans le backend

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
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:318',message:'DELETE indexer - calling backend',data:{indexerId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Déterminer l'URL du backend (priorité: header transmis par le client -> fallback env/default)
    const { getBackendUrlAsync } = await import('../../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const deleteUrl = `${backendUrl}/api/client/admin/indexers/${encodeURIComponent(id)}`;
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:323',message:'DELETE indexer - backend URL',data:{backendUrl,deleteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    console.log('[INDEXER DELETE] 🔄 Suppression de l\'indexer dans le backend Rust:', deleteUrl);
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:335',message:'DELETE indexer - response received',data:{status:deleteResponse.status,ok:deleteResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXER DELETE] ❌ Erreur backend:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:342',message:'DELETE indexer - backend error',data:{status:deleteResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la suppression de l\'indexer dans le backend',
        }),
        {
          status: deleteResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[INDEXER DELETE] ✅ Indexer supprimé du backend Rust avec succès');
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers/[id].ts:355',message:'DELETE indexer - success',data:{indexerId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
