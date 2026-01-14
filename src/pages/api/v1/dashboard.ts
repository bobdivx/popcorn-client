export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth/jwt.js';
import type { DashboardData, ContentItem } from '../../../lib/client/types.js';

/**
 * API pour récupérer les données du dashboard
 * Retourne les données pour afficher le dashboard (hero, continue watching, etc.)
 */
export const GET: APIRoute = async ({ request }) => {
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

    const userId = payload.userId || payload.id;
    console.log('[DASHBOARD] 📊 Récupération des données du dashboard pour user_id:', userId);

    // Récupérer l'URL du backend Rust depuis la base de données
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();

    // Récupérer toutes les données en parallèle pour éviter les blocages séquentiels
    const filmsUrl = `${backendUrl}/api/torrents/list?category=films&page=1&limit=10&sort=popular`;
    const seriesUrl = `${backendUrl}/api/torrents/list?category=series&page=1&limit=10&sort=popular`;
    const recentUrl = `${backendUrl}/api/torrents/list?page=1&limit=20`;
    
    console.log('[DASHBOARD] 📡 Récupération des données en parallèle depuis le backend...');
    
    // Fonction helper pour faire une requête avec timeout
    const fetchWithTimeout = async (url: string, timeout: number = 5000): Promise<Response | null> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`[DASHBOARD] ⚠️ Timeout lors de la récupération de ${url} (${timeout}s)`);
        } else {
          console.error(`[DASHBOARD] ❌ Erreur lors de la récupération de ${url}:`, error);
        }
        return null;
      }
    };
    
    // Faire toutes les requêtes en parallèle
    const [filmsResponse, seriesResponse, recentResponse] = await Promise.all([
      fetchWithTimeout(filmsUrl, 5000),
      fetchWithTimeout(seriesUrl, 5000),
      fetchWithTimeout(recentUrl, 5000),
    ]);
    
    // Traiter les films
    let popularMovies: ContentItem[] = [];
    if (filmsResponse && filmsResponse.ok) {
      try {
        const filmsData = await filmsResponse.json();
        if (filmsData.success && Array.isArray(filmsData.data)) {
          popularMovies = filmsData.data
            .filter((torrent: any) => torrent && (torrent.id || torrent.infoHash))
            .map((torrent: any) => {
              const releaseDate = torrent.releaseDate || torrent.release_date;
              return {
                id: torrent.id || torrent.infoHash,
                title: torrent.cleanTitle || torrent.name || 'Sans titre',
                type: 'movie' as const,
                poster: torrent.imageUrl || torrent.poster_url,
                backdrop: torrent.heroImageUrl || torrent.hero_image_url,
                year: releaseDate ? new Date(releaseDate).getFullYear() : undefined,
                overview: torrent.synopsis || torrent.description,
                rating: torrent.voteAverage || torrent.vote_average,
                releaseDate: releaseDate,
              };
            });
          console.log(`[DASHBOARD] ✅ ${popularMovies.length} film(s) récupéré(s)`);
        }
      } catch (error) {
        console.warn('[DASHBOARD] ⚠️ Erreur lors du parsing des films:', error);
      }
    }
    
    // Traiter les séries
    let popularSeries: ContentItem[] = [];
    if (seriesResponse && seriesResponse.ok) {
      try {
        const seriesData = await seriesResponse.json();
        if (seriesData.success && Array.isArray(seriesData.data)) {
          popularSeries = seriesData.data
            .filter((torrent: any) => torrent && (torrent.id || torrent.infoHash))
            .map((torrent: any) => {
              const releaseDate = torrent.releaseDate || torrent.release_date;
              return {
                id: torrent.id || torrent.infoHash,
                title: torrent.cleanTitle || torrent.name || 'Sans titre',
                type: 'tv' as const,
                poster: torrent.imageUrl || torrent.poster_url,
                backdrop: torrent.heroImageUrl || torrent.hero_image_url,
                year: releaseDate ? new Date(releaseDate).getFullYear() : undefined,
                overview: torrent.synopsis || torrent.description,
                rating: torrent.voteAverage || torrent.vote_average,
                firstAirDate: releaseDate,
              };
            });
          console.log(`[DASHBOARD] ✅ ${popularSeries.length} série(s) récupérée(s)`);
        }
      } catch (error) {
        console.warn('[DASHBOARD] ⚠️ Erreur lors du parsing des séries:', error);
      }
    }
    
    // Traiter les ajouts récents
    let recentAdditions: ContentItem[] = [];
    if (recentResponse && recentResponse.ok) {
      try {
        const recentData = await recentResponse.json();
        if (recentData.success && Array.isArray(recentData.data)) {
          recentAdditions = recentData.data
            .filter((torrent: any) => torrent && (torrent.id || torrent.infoHash))
            .map((torrent: any) => {
              const releaseDate = torrent.releaseDate || torrent.release_date;
              return {
                id: torrent.id || torrent.infoHash,
                title: torrent.cleanTitle || torrent.name || 'Sans titre',
                type: (torrent.category === 'series' || torrent.tmdbType === 'tv') ? 'tv' as const : 'movie' as const,
                poster: torrent.imageUrl || torrent.poster_url,
                backdrop: torrent.heroImageUrl || torrent.hero_image_url,
                year: releaseDate ? new Date(releaseDate).getFullYear() : undefined,
                overview: torrent.synopsis || torrent.description,
                rating: torrent.voteAverage || torrent.vote_average,
                releaseDate: releaseDate,
                firstAirDate: (torrent.category === 'series' || torrent.tmdbType === 'tv') ? releaseDate : undefined,
              };
            });
          console.log(`[DASHBOARD] ✅ ${recentAdditions.length} ajout(s) récent(s) récupéré(s)`);
        }
      } catch (error) {
        console.warn('[DASHBOARD] ⚠️ Erreur lors du parsing des ajouts récents:', error);
      }
    }

    // Sélectionner le hero (premier film ou série avec backdrop)
    const hero = [...popularMovies, ...popularSeries]
      .find(item => item.backdrop) || popularMovies[0] || popularSeries[0];

    const dashboardData: DashboardData = {
      hero: hero,
      continueWatching: [], // TODO: Implémenter avec l'historique de lecture de l'utilisateur
      popularMovies: popularMovies.slice(0, 10),
      popularSeries: popularSeries.slice(0, 10),
      recentAdditions: recentAdditions.slice(0, 20),
    };

    console.log('[DASHBOARD] ✅ Données du dashboard préparées:', {
      hasHero: !!dashboardData.hero,
      popularMoviesCount: dashboardData.popularMovies.length,
      popularSeriesCount: dashboardData.popularSeries.length,
      recentAdditionsCount: dashboardData.recentAdditions.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: dashboardData,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[DASHBOARD] ❌ Erreur:', error);
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
