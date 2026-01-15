export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { getBackendUrlAsync } from '../../../../lib/backend-url.js';

/**
 * Route proxy pour télécharger un fichier .torrent depuis la DB locale
 * Fait un proxy vers le backend Rust /api/torrents/:id/download
 */
export const GET: APIRoute = async ({ params, request }) => {
  // Vérifier l'authentification
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Non authentifié' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = params.id;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID manquant' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer l'URL du backend Rust depuis la base de données
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/torrents/${encodeURIComponent(id)}/download`;
    
    console.log(`[TORRENTS] 📥 Téléchargement du fichier .torrent depuis la DB locale: ${backendApiUrl}`);

    // Faire la requête vers le backend Rust
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout de 30 secondes
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[TORRENTS] Erreur lors de la requête vers ${backendApiUrl}:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: `Le backend Rust ne répond pas dans les 30 secondes.`,
          }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

    // Si la route n'existe pas (404), retourner 404
    if (response.status === 404) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Fichier .torrent non trouvé dans la DB locale',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erreur inconnue');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'BackendError',
          message: `Le backend a retourné une erreur (status ${response.status}): ${errorText.substring(0, 200)}`,
        }),
        { status: response.status || 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer le fichier .torrent binaire
    const torrentBlob = await response.blob();
    const contentType = response.headers.get('content-type') || 'application/x-bittorrent';
    
    // Retourner le fichier .torrent binaire
    return new Response(torrentBlob, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="torrent-${id}.torrent"`,
      },
    });
  } catch (error) {
    console.error('[TORRENTS] Erreur lors du téléchargement du fichier .torrent:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalError',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors du téléchargement du fichier .torrent',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
