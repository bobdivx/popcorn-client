export const prerender = false;

import type { APIRoute } from 'astro';
import type { Indexer, IndexerFormData } from '../../../../lib/client/types.js';
import { z } from 'zod';
import { randomUUID } from '../../../../lib/utils/uuid.js';

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
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/admin/indexers`;
    
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXERS GET] ❌ Erreur backend:', errorData);
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
              } else {
              console.warn(`[INDEXERS GET] ⚠️ Erreur lors de l'activation des catégories pour '${indexer.name}':`, categoriesResponse.status);
              }
          } else {
            console.warn(`[INDEXERS GET] ⚠️ Erreur lors de la mise à jour de l'indexer '${indexer.name}':`, response.status);
            }
        } catch (fixError) {
          console.warn(`[INDEXERS GET] ⚠️ Erreur lors de la correction automatique de l'indexer '${indexer.name}':`, fixError);
          }
      });
    }

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
    
    // Le backend fait maintenant automatiquement le matching avec les définitions JSON
    // Si indexerTypeId n'est pas fourni, le backend cherchera dans les définitions JSON
    // en utilisant le nom de l'indexer (ex: "c411" -> trouve "c411.json")
    
    // Générer un UUID v4
    const id = randomUUID();

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
    
    // Créer l'indexer directement dans le backend
    const createResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(syncPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[INDEXERS POST] ❌ Erreur backend:', errorData);
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
          const categoriesData = await categoriesResponse.json().catch(() => ({}));
          console.log('[INDEXERS POST] ✅ Catégories par défaut synchronisées avec le backend Rust:', categoriesData);
          } else {
          const errorText = await categoriesResponse.text().catch(() => '');
          const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
          console.warn('[INDEXERS POST] ⚠️ Erreur lors de la synchronisation des catégories:', {
            status: categoriesResponse.status,
            statusText: categoriesResponse.statusText,
            error: errorData,
          });
          }
      } catch (catError) {
        console.error('[INDEXERS POST] ❌ Erreur lors de la synchronisation des catégories:', catError);
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