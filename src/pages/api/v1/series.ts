export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth/jwt.js';

/**
 * GET /api/v1/series
 * Récupère les séries (torrents de catégorie TV)
 * Fait un proxy vers le backend Rust /api/torrents/list avec category=TV
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Vérifier l'authentification
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Non authentifié' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SERIES] 📺 Récupération des séries...');
    
    // Récupérer les paramètres de pagination depuis l'URL
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '1000'; // Récupérer toutes les séries pour le tri côté client
    const sort = url.searchParams.get('sort') || 'recent'; // Trier par les plus récents par défaut
    
    // Récupérer l'URL du backend Rust depuis la base de données
    // Utiliser un import dynamique pour éviter les erreurs de chargement
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    // Utiliser "series" comme catégorie (comme dans le code de synchronisation)
    const backendApiUrl = `${backendUrl}/api/torrents/list?category=series&page=${page}&limit=${limit}&sort=${sort}`;
    
    console.log(`[SERIES] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Copier les headers pertinents
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
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
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[SERIES] ✅ Réponse du backend: ${response.status} ${response.statusText}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SERIES] ❌ Erreur HTTP ${response.status}:`, errorText);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[SERIES] ❌ Erreur:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 10 secondes.',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw fetchError;
    }
    
    const responseBody = await response.text();
    
    if (!response.ok) {
      console.error(`[SERIES] ❌ Erreur HTTP ${response.status}:`, responseBody);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erreur HTTP ${response.status}`,
          message: responseBody,
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    console.log(`[SERIES] 📦 Réponse brute du backend:`, {
      success: responseData.success,
      dataLength: Array.isArray(responseData.data) ? responseData.data.length : 0,
      hasData: !!responseData.data,
    });
    
    // Transformer les données pour correspondre au format SeriesData
    if (responseData.success && Array.isArray(responseData.data)) {
      const series = responseData.data
        .filter((torrent: any) => torrent && (torrent.id || torrent.infoHash)) // Filtrer les entrées invalides
        .map((torrent: any) => {
          const releaseDate = torrent.releaseDate || torrent.release_date;
          // Parser les genres depuis JSON si c'est une chaîne
          let genres: string[] | undefined;
          if (torrent.genres) {
            if (typeof torrent.genres === 'string') {
              try {
                genres = JSON.parse(torrent.genres);
              } catch {
                genres = undefined;
              }
            } else if (Array.isArray(torrent.genres)) {
              genres = torrent.genres;
            }
          }
          
          return {
            id: torrent.id || torrent.infoHash || String(Math.random()),
            title: torrent.cleanTitle || torrent.name || 'Sans titre',
            type: 'tv' as const,
            poster: torrent.imageUrl || torrent.poster_url,
            backdrop: torrent.heroImageUrl || torrent.hero_image_url,
            year: releaseDate ? new Date(releaseDate).getFullYear() : undefined,
            overview: torrent.synopsis || torrent.description,
            rating: torrent.voteAverage || torrent.vote_average,
            firstAirDate: releaseDate, // Optionnel maintenant
            genres: genres, // Genres depuis TMDB
            // numberOfSeasons et numberOfEpisodes peuvent être récupérés depuis d'autres endpoints si nécessaire
          };
        });
      
      console.log(`[SERIES] ✅ ${series.length} série(s) transformée(s)`);
      responseData.data = series;
    } else {
      console.warn(`[SERIES] ⚠️ Pas de données valides dans la réponse:`, {
        success: responseData.success,
        hasData: !!responseData.data,
        dataType: typeof responseData.data,
      });
      // S'assurer que data est toujours un tableau
      if (!Array.isArray(responseData.data)) {
        responseData.data = [];
      }
    }
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SERIES] ❌ Erreur:', error);
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
