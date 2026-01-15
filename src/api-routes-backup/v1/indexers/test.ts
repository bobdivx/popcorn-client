export const prerender = false;

import type { APIRoute } from 'astro';
import { getBackendUrlAsync } from '../../../../lib/backend-url.js';
import { z } from 'zod';

const testIndexerSchema = z.object({
  id: z.string().min(1, 'L\'ID de l\'indexer est requis'),
});

/**
 * POST /api/v1/indexers/test
 * Teste la connexion à un indexer
 * Fait un proxy vers le backend Rust /api/indexers/test
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('[INDEXER TEST] 🧪 Début du test d\'indexer...');
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/indexers/test`;
    
    console.log(`[INDEXER TEST] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Récupérer le body de la requête
    const body = await request.text();
    const contentType = request.headers.get('content-type') || 'application/json';
    
    // Parser et valider le body
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidJSON',
          message: 'Le body de la requête n\'est pas un JSON valide',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    // Valider avec Zod
    const validation = testIndexerSchema.safeParse(requestData);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    // Convertir l'ID en indexer_id pour le backend Rust
    const backendRequest = {
      indexer_id: validation.data.id,
    };
    
    // Copier les headers pertinents
    const headers: HeadersInit = {
      'Content-Type': contentType,
    };
    
    // Ajouter les headers pour le backend Rust si nécessaire
    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    if (clientIp !== 'unknown') {
      headers['X-Forwarded-For'] = clientIp;
    }
    
    // Faire la requête vers le backend Rust avec un timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout de 30 secondes (les tests peuvent prendre du temps)
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(backendRequest),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[INDEXER TEST] ✅ Réponse du backend: ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[INDEXER TEST] ❌ Erreur lors de la requête vers le backend:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 30 secondes. Le test d\'indexer peut prendre du temps.',
          }),
          {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      throw fetchError;
    }
    
    // Récupérer le body de la réponse
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    // Retourner la réponse du backend
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[INDEXER TEST] ❌ Erreur lors du test:', error);
    
    let errorMessage = 'Une erreur est survenue lors du test de l\'indexer';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
      console.error('[INDEXER TEST] ❌ Stack trace:', errorStack);
    } else {
      console.error('[INDEXER TEST] ❌ Erreur non-Error:', typeof error, error);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && errorStack ? { stack: errorStack } : {}),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
