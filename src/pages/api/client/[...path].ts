import type { APIRoute } from 'astro';
import { serverApi } from '../../../lib/client/server-api.js';
import { getBackendUrlAsync } from '../../../lib/backend-url.js';

/**
 * Fonction helper pour proxy les requêtes vers le backend Rust
 */
async function proxyRequest(
  params: { path?: string },
  request: Request,
  method: string
): Promise<Response> {
  const path = params.path;
  if (!path) {
    return new Response(
      JSON.stringify({ error: 'Chemin manquant' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Récupérer l'URL du backend Rust (utilise env vars ou valeur par défaut côté serveur)
  // Note: Cette route s'exécute côté serveur Astro, localStorage n'est pas disponible
  // backend-config.ts utilisera les variables d'environnement ou la valeur par défaut
  let backendBaseUrl: string = 'http://127.0.0.1:4327'; // Valeur par défaut
  try {
    backendBaseUrl = await getBackendUrlAsync();
    // S'assurer que baseUrl ne se termine pas par un slash et que path ne commence pas par un slash
    const cleanBaseUrl = backendBaseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const backendUrl = `${cleanBaseUrl}/api/client${cleanPath}`;
    
    console.log(`[Proxy] Connexion au backend: ${backendUrl}`);
    
    // Récupérer le body si présent
    let body: BodyInit | undefined;
    const contentType = request.headers.get('content-type');
    
    if (method !== 'GET' && method !== 'HEAD') {
      if (contentType?.includes('application/json')) {
        body = await request.text();
      } else if (contentType?.includes('application/x-bittorrent')) {
        body = await request.arrayBuffer();
      } else {
        body = await request.arrayBuffer();
      }
    }

    // Copier les headers pertinents
    const headers: HeadersInit = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    // Ajouter le token d'authentification si disponible
    const token = serverApi.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Copier les headers personnalisés pour le streaming
    const forStreaming = request.headers.get('X-For-Streaming');
    if (forStreaming) {
      headers['X-For-Streaming'] = forStreaming;
    }
    
    // Copier les headers pour le type de téléchargement et le chemin personnalisé
    const downloadType = request.headers.get('X-Download-Type');
    if (downloadType) {
      headers['X-Download-Type'] = downloadType;
    }
    
    const customDownloadPath = request.headers.get('X-Custom-Download-Path');
    if (customDownloadPath) {
      headers['X-Custom-Download-Path'] = customDownloadPath;
    }
    
    const userId = request.headers.get('X-User-ID');
    if (userId) {
      headers['X-User-ID'] = userId;
    }
    
    const deviceId = request.headers.get('X-Device-ID');
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }

    // Faire la requête vers le backend Rust avec un timeout adapté
    // Les requêtes magnet peuvent prendre plus de temps (téléchargement des métadonnées)
    const isMagnetRequest = path.includes('/torrents/magnet');
    const timeoutMs = isMagnetRequest ? 60000 : 10000; // 60 secondes pour magnet, 10 secondes pour les autres
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    let response: Response;
    try {
      console.log(`[Proxy] Envoi de la requête ${method} vers ${backendUrl}`);
      response = await fetch(backendUrl, {
        method: method,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[Proxy] Réponse reçue: ${response.status} ${response.statusText}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[Proxy] Erreur lors de la requête vers ${backendUrl}:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        const timeoutSeconds = isMagnetRequest ? 60 : 10;
        throw new Error(`Timeout: Le backend Rust ne répond pas dans les ${timeoutSeconds} secondes. Assurez-vous qu'il est démarré et accessible sur ${backendBaseUrl}.`);
      }
      throw fetchError;
    }

    // Récupérer le contenu de la réponse
    const responseContent = await response.arrayBuffer();
    
    // Copier les headers de la réponse
    const responseHeaders: HeadersInit = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    };

    // Retourner la réponse du backend
    return new Response(responseContent, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Erreur lors du proxy vers le backend Rust:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const defaultUrl = backendBaseUrl || 'http://127.0.0.1:4327';
    const detailedMessage = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Timeout')
      ? `Le backend Rust n'est pas accessible sur ${defaultUrl}. Vérifiez que :\n1. Le backend Rust est démarré\n2. Le backend Rust écoute sur le port correct (${defaultUrl.split(':').pop() || '4327'})\n3. Aucun firewall ne bloque la connexion`
      : `Erreur lors de la connexion au backend Rust sur ${defaultUrl}: ${errorMessage}`;
    
    return new Response(
      JSON.stringify({
        success: false,
        error: detailedMessage,
      }),
      { 
        status: 502, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

/**
 * Proxy pour toutes les requêtes /api/client/* vers le backend Rust
 * Cela permet au frontend de faire des requêtes relatives au lieu d'absolues
 */
export const GET: APIRoute = async ({ params, request }) => {
  return proxyRequest(params, request, 'GET');
};

export const POST: APIRoute = async ({ params, request }) => {
  return proxyRequest(params, request, 'POST');
};

export const PUT: APIRoute = async ({ params, request }) => {
  return proxyRequest(params, request, 'PUT');
};

export const DELETE: APIRoute = async ({ params, request }) => {
  return proxyRequest(params, request, 'DELETE');
};

export const PATCH: APIRoute = async ({ params, request }) => {
  return proxyRequest(params, request, 'PATCH');
};
