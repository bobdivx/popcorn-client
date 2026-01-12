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

    // Récupérer les films populaires (premiers 10, triés par popularité)
    const filmsUrl = `${backendUrl}/api/torrents/list?category=films&page=1&limit=10&sort=popular`;
    console.log('[DASHBOARD] 📡 Récupération des films depuis:', filmsUrl);
    
    let popularMovies: ContentItem[] = [];
    try {
      const filmsController = new AbortController();
      const filmsTimeout = setTimeout(() => filmsController.abort(), 10000);
      const filmsResponse = await fetch(filmsUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: filmsController.signal,
      });
      clearTimeout(filmsTimeout);
      
      if (filmsResponse.ok) {
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
      }
    } catch (filmsError) {
      console.error('[DASHBOARD] ❌ Erreur lors de la récupération des films:', filmsError);
    }

    // Récupérer les séries populaires (premiers 10, triés par popularité)
    const seriesUrl = `${backendUrl}/api/torrents/list?category=series&page=1&limit=10&sort=popular`;
    console.log('[DASHBOARD] 📡 Récupération des séries depuis:', seriesUrl);
    
    let popularSeries: ContentItem[] = [];
    try {
      const seriesResponse = await fetch(seriesUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (seriesResponse.ok) {
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
      }
    } catch (seriesError) {
      console.error('[DASHBOARD] ❌ Erreur lors de la récupération des séries:', seriesError);
    }

    // Récupérer les ajouts récents (tous torrents, triés par date de création décroissante)
    // Le backend trie par created_at DESC par défaut si sort n'est pas "popular"
    const recentUrl = `${backendUrl}/api/torrents/list?page=1&limit=20`;
    console.log('[DASHBOARD] 📡 Récupération des ajouts récents depuis:', recentUrl);
    
    let recentAdditions: ContentItem[] = [];
    try {
      const recentController = new AbortController();
      const recentTimeout = setTimeout(() => recentController.abort(), 10000);
      const recentResponse = await fetch(recentUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: recentController.signal,
      });
      clearTimeout(recentTimeout);
      
      if (recentResponse.ok) {
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
      }
    } catch (recentError) {
      console.error('[DASHBOARD] ❌ Erreur lors de la récupération des ajouts récents:', recentError);
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
