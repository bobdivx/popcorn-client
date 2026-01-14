export const prerender = false;

import type { APIRoute } from 'astro';
import type { Indexer, IndexerFormData } from '../../../../lib/client/types.js';
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

// Le backend fait maintenant automatiquement le matching avec les définitions JSON

/**
 * GET /api/v1/setup/indexers
 * Récupère tous les indexers depuis le backend Rust
 * Corrige automatiquement les indexers qui n'ont pas de type
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:50',message:'GET indexers - calling backend',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/admin/indexers`;
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:56',message:'GET indexers - backend URL',data:{backendUrl,backendApiUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:67',message:'GET indexers - response received',data:{status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXERS GET] ❌ Erreur backend:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:73',message:'GET indexers - backend error',data:{status:response.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la récupération des indexers depuis le backend',
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const backendData = await response.json();
    
    // Convertir les indexers du backend vers le format attendu par le client
    const indexers: Indexer[] = (backendData.data || []).map((idx: any) => ({
      id: idx.id,
      name: idx.name,
      baseUrl: idx.base_url,
      apiKey: idx.api_key || null,
      jackettIndexerName: idx.jackett_indexer_name || null,
      isEnabled: idx.is_enabled === 1,
      isDefault: idx.is_default === 1,
      priority: idx.priority || 0,
      fallbackIndexerId: idx.fallback_indexer_id || null,
      indexerTypeId: idx.indexer_type_id || null,
      configJson: idx.config_json || null,
    }));

    // Corriger automatiquement les indexers qui n'ont pas de type (en arrière-plan, non-bloquant)
    // Le backend fera le matching automatique lors de la mise à jour
    const indexersWithoutType = indexers.filter(idx => !idx.indexerTypeId);
    if (indexersWithoutType.length > 0) {
      console.log(`[INDEXERS GET] 🔧 ${indexersWithoutType.length} indexer(s) sans type détecté(s). Le backend les corrigera automatiquement lors de la prochaine synchronisation.`);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:100',message:'GET indexers - indexers without type detected',data:{count:indexersWithoutType.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // Corriger chaque indexer en arrière-plan en faisant une mise à jour (le backend fera le matching)
      // Et activer les catégories par défaut
      indexersWithoutType.forEach(async (indexer) => {
        try {
          const updateUrl = `${backendUrl}/api/client/admin/indexers/${encodeURIComponent(indexer.id)}`;
          const updatePayload = {
            id: indexer.id,
            name: indexer.name,
            base_url: indexer.baseUrl,
            api_key: indexer.apiKey,
            jackett_indexer_name: indexer.jackettIndexerName,
            is_enabled: indexer.isEnabled,
            is_default: indexer.isDefault,
            priority: indexer.priority,
            indexer_type_id: null, // Le backend fera le matching automatique
            config_json: indexer.configJson,
          };
          
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:105',message:'GET indexers - auto-fix indexer start',data:{indexerId:indexer.id,indexerName:indexer.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          const response = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          });
          
          if (response.ok) {
            console.log(`[INDEXERS GET] ✅ Type assigné automatiquement à l'indexer '${indexer.name}' par le backend`);
            
            // Attendre un peu puis activer les catégories par défaut
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const categoriesUrl = `${backendUrl}/api/admin/indexers/${encodeURIComponent(indexer.id)}/categories`;
            // #region agent log
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:120',message:'GET indexers - activating categories',data:{categoriesUrl,indexerId:indexer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            const categoriesResponse = await fetch(categoriesUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                categories: ['films', 'series'],
              }),
            });
            
            if (categoriesResponse.ok) {
              console.log(`[INDEXERS GET] ✅ Catégories 'films' et 'series' activées pour l'indexer '${indexer.name}'`);
              // #region agent log
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:135',message:'GET indexers - auto-fix success with categories',data:{indexerId:indexer.id,indexerName:indexer.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            } else {
              console.warn(`[INDEXERS GET] ⚠️ Erreur lors de l'activation des catégories pour '${indexer.name}':`, categoriesResponse.status);
              // #region agent log
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:140',message:'GET indexers - categories activation failed',data:{indexerId:indexer.id,status:categoriesResponse.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            }
          } else {
            console.warn(`[INDEXERS GET] ⚠️ Erreur lors de la mise à jour de l'indexer '${indexer.name}':`, response.status);
            // #region agent log
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:145',message:'GET indexers - auto-fix failed',data:{indexerId:indexer.id,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
          }
        } catch (fixError) {
          console.warn(`[INDEXERS GET] ⚠️ Erreur lors de la correction automatique de l'indexer '${indexer.name}':`, fixError);
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:150',message:'GET indexers - auto-fix error',data:{indexerId:indexer.id,error:fixError instanceof Error ? fixError.message : String(fixError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
        }
      });
    }

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:130',message:'GET indexers - success',data:{count:indexers.length,withoutType:indexersWithoutType.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:140',message:'GET indexers - exception',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
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
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:98',message:'POST indexer - calling backend',data:{name:data.name,hasIndexerTypeId:!!data.indexerTypeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Le backend fait maintenant automatiquement le matching avec les définitions JSON
    // Si indexerTypeId n'est pas fourni, le backend cherchera dans les définitions JSON
    // en utilisant le nom de l'indexer (ex: "c411" -> trouve "c411.json")
    
    // Générer un UUID v4
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/admin/indexers`;
    
    const syncPayload = {
      id: id,
      name: data.name,
      base_url: data.baseUrl,
      api_key: data.apiKey || null,
      jackett_indexer_name: data.jackettIndexerName || null,
      is_enabled: data.isEnabled,
      is_default: data.isDefault,
      priority: data.priority,
      indexer_type_id: data.indexerTypeId || null, // Le backend fera le matching automatique si null
      config_json: data.configJson || null,
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:140',message:'POST indexer - final payload',data:{indexerTypeId:data.indexerTypeId || 'null (auto-detect)',name:data.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:120',message:'POST indexer - backend URL',data:{backendUrl,backendApiUrl,payload:syncPayload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Créer l'indexer directement dans le backend
    const createResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(syncPayload),
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:133',message:'POST indexer - response received',data:{status:createResponse.status,ok:createResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXERS POST] ❌ Erreur backend:', errorData);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:139',message:'POST indexer - backend error',data:{status:createResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la création de l\'indexer dans le backend',
        }),
        {
          status: createResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const backendData = await createResponse.json();
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

    // Synchroniser les catégories par défaut avec le backend Rust (de manière asynchrone, non-bloquante)
    // Mais on attend un peu pour s'assurer que l'indexer est bien créé
    (async () => {
      try {
        // Attendre un peu pour s'assurer que l'indexer est bien créé dans la DB backend
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Synchroniser les catégories par défaut avec le backend Rust
        const categoriesUrl = `${backendUrl}/api/admin/indexers/${encodeURIComponent(indexer.id)}/categories`;
        console.log('[INDEXERS POST] 🔄 Synchronisation des catégories vers:', categoriesUrl);
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:170',message:'POST categories sync start',data:{categoriesUrl,indexerId:indexer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        const categoriesResponse = await fetch(categoriesUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            categories: ['films', 'series'],
          }),
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:183',message:'POST categories sync response',data:{ok:categoriesResponse.ok,status:categoriesResponse.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json().catch(() => ({}));
          console.log('[INDEXERS POST] ✅ Catégories par défaut synchronisées avec le backend Rust:', categoriesData);
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:188',message:'POST categories sync success',data:{categoriesData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        } else {
          const errorText = await categoriesResponse.text().catch(() => '');
          const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
          console.warn('[INDEXERS POST] ⚠️ Erreur lors de la synchronisation des catégories:', {
            status: categoriesResponse.status,
            statusText: categoriesResponse.statusText,
            error: errorData,
          });
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:196',message:'POST categories sync error',data:{status:categoriesResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
      } catch (catError) {
        console.error('[INDEXERS POST] ❌ Erreur lors de la synchronisation des catégories:', catError);
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'indexers.ts:201',message:'POST categories sync exception',data:{error:catError instanceof Error ? catError.message : String(catError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    })();

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
