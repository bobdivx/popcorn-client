export const prerender = false;

import type { APIRoute } from 'astro';
import { serverApi } from '../../../../lib/client/server-api';

/**
 * Supprime tous les torrents synchronisés
 * Fait un proxy vers le backend Rust du serveur popcorn
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Vérifier l'authentification via serverApi
    const meResponse = await serverApi.getMe();
    if (!meResponse.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Non authentifié' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer l'URL du serveur depuis serverApi
    const serverUrl = serverApi.getServerUrl();
    if (!serverUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL du serveur non configurée' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer le token d'accès
    const accessToken = serverApi.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Faire un appel direct au backend Rust du serveur popcorn
    const response = await fetch(`${serverUrl}/api/sync/clear-torrents`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Erreur HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        data: data,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[SYNC CLEAR TORRENTS] Exception:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur lors de la suppression des torrents',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
