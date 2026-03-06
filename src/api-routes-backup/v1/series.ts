export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth/jwt.js';
import type { SeriesData } from '../../../lib/client/types.js';

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

export const GET: APIRoute = async ({ request }) => {
  // Vérifier l'authentification
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return new Response(JSON.stringify({ success: false, error: 'Token invalide' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { getBackendUrlAsync } = await import('../../../lib/backend-url.js');
    const backendUrl = getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());

    // Le backend Rust expose /api/torrents/list avec category=series
    const url = `${backendUrl}/api/torrents/list?category=series&sort=popular&limit=200&page=1`;
    const resp = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'BackendError',
          message: text || `Erreur ${resp.status}`,
        }),
        { status: resp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const backendData: any = await resp.json().catch(() => ({}));
    const rows: any[] = Array.isArray(backendData?.data) ? backendData.data : Array.isArray(backendData) ? backendData : [];

    const series: SeriesData[] = rows
      .map((raw: any) => {
        const id = raw?.slug || raw?.id || raw?.infoHash || raw?.info_hash || '';
        if (!id) return null;
        const firstAirDate = raw?.releaseDate || raw?.release_date;
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || '',
          type: 'tv',
          poster: raw?.imageUrl || raw?.image_url || raw?.poster_url || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || undefined,
          overview: raw?.synopsis || raw?.overview || raw?.description || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : typeof raw?.vote_average === 'number' ? raw.vote_average : undefined,
          firstAirDate: typeof firstAirDate === 'string' ? firstAirDate : undefined,
          year: typeof firstAirDate === 'string' ? new Date(firstAirDate).getFullYear() : undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : typeof raw?.seed_count === 'number' ? raw.seed_count : undefined,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : typeof raw?.leech_count === 'number' ? raw.leech_count : undefined,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : typeof raw?.file_size === 'number' ? raw.file_size : undefined,
        } satisfies SeriesData;
      })
      .filter(Boolean) as SeriesData[];

    return new Response(JSON.stringify({ success: true, data: series }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'SeriesError',
        message: e instanceof Error ? e.message : 'Erreur inconnue',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

