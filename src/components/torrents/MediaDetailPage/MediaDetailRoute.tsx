import { useEffect, useMemo, useState } from 'preact/hooks';
import MediaDetailPage from './index';
import type { MediaDetailPageProps } from './types';
import { serverApi } from '../../../lib/client/server-api';

type Torrent = MediaDetailPageProps['torrent'];

function getContentIdFromLocation(): string {
  if (typeof window === 'undefined') return '';

  // Query params
  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery =
    urlParams.get('slug') || urlParams.get('contentId') || urlParams.get('id') || urlParams.get('infoHash');
  if (fromQuery) return fromQuery;

  // Path fallback: /torrents/<slug> (quand on arrive via 404)
  const pathname = window.location.pathname;
  const torrentsMatch = pathname.match(/^\/torrents\/(.+)$/);
  if (torrentsMatch?.[1]) return torrentsMatch[1];

  return '';
}

function normalizeSeedCount(t: any): number {
  return Number(t?.seedCount ?? t?.seed_count ?? 0) || 0;
}

/**
 * Convertit un variant du backend en objet torrent pour le frontend
 */
function convertVariantToTorrent(variant: any): Torrent {
  // Parser genres si c'est une string JSON
  let genres: string[] | null = null;
  if (variant.genres) {
    try {
      if (typeof variant.genres === 'string') {
        genres = JSON.parse(variant.genres);
      } else if (Array.isArray(variant.genres)) {
        genres = variant.genres;
      }
    } catch (e) {
      console.warn('[MediaDetailRoute] Erreur lors du parsing de genres:', e);
    }
  }

  // Parser quality si c'est une string JSON (format depuis la DB)
  let qualityObj: any = null;
  if (variant.quality) {
    try {
      if (typeof variant.quality === 'string') {
        qualityObj = JSON.parse(variant.quality);
      } else if (typeof variant.quality === 'object') {
        qualityObj = variant.quality;
      }
    } catch (e) {
      console.warn('[MediaDetailRoute] Erreur lors du parsing de quality:', e);
    }
  }

  // Construire l'objet quality avec priorité aux données de la DB, puis fallback sur quality parsé, puis extraction
  const quality = {
    resolution: variant.resolution || qualityObj?.resolution || null,
    source: variant.source_format || variant.format || qualityObj?.source || null,
    codec: variant.video_codec || variant.codec || qualityObj?.codec || null,
    audio: variant.audio_codec || qualityObj?.audio || null,
    language: variant.language || qualityObj?.language || null,
    full: qualityObj?.full || variant.quality || null,
  };

  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash: variant.info_hash || variant.infoHash || null,
    name: variant.name || '',
    cleanTitle: variant.clean_title || variant.cleanTitle || null,
    description: variant.description || null,
    category: variant.category || null,
    imageUrl: variant.poster_url || variant.posterUrl || variant.image_url || variant.imageUrl || null,
    heroImageUrl: variant.hero_image_url || variant.heroImageUrl || null,
    trailerKey: variant.trailer_key || variant.trailerKey || null,
    fileSize: variant.file_size || variant.fileSize || 0,
    seedCount: variant.seed_count || variant.seedCount || 0,
    leechCount: variant.leech_count || variant.leechCount || 0,
    _externalLink: variant._externalLink || variant.external_link || null,
    _externalMagnetUri: variant._externalMagnetUri || variant.external_magnet_uri || null,
    _guid: (variant as any)._guid || null, // GUID Torznab pour téléchargement via API
    indexerId: (variant as any).indexer_id || (variant as any).indexerId || null,
    indexerName: (variant as any).indexer_name || (variant as any).indexerName || null,
    language: variant.language || null,
    format: variant.format || variant.source_format || null,
    codec: variant.codec || variant.video_codec || null,
    quality: quality,
    // Données TMDB
    synopsis: variant.synopsis || null,
    releaseDate: variant.release_date || variant.releaseDate || null,
    genres: genres,
    voteAverage: variant.vote_average || variant.voteAverage || null,
    runtime: variant.runtime || null,
    tmdbId: variant.tmdb_id || variant.tmdbId || null,
    tmdbType: variant.tmdb_type || variant.tmdbType || null,
  } as Torrent;
}

function pickBestTorrentFromGroupPayload(payload: any): Torrent | null {
  // Payloads possibles selon backend / versions:
  // - { success, torrents: [...] }
  // - { success, data: { torrents: [...] } }
  // - { success, data: { variants: [...] } }
  // - { success, data: { success, data: { torrents: [...] } } } (double imbrication)
  // - { success, data: { success, data: { variants: [...] } } } (double imbrication)
  
  // Gérer la double imbrication (data.data)
  let data = payload?.data;
  if (data && data.success && data.data) {
    data = data.data;
  }
  
  const torrents =
    payload?.torrents ??
    data?.torrents ??
    data?.variants ??
    data?.items ??
    data;

  if (Array.isArray(torrents) && torrents.length > 0) {
    const best = torrents.slice().sort((a: any, b: any) => normalizeSeedCount(b) - normalizeSeedCount(a))[0];
    // Convertir le variant en objet torrent avec toutes les données nettoyées
    const converted = convertVariantToTorrent(best);
    console.log('[MediaDetailRoute] Meilleur torrent sélectionné et converti:', {
      id: converted.id,
      name: converted.name,
      cleanTitle: converted.cleanTitle,
      quality: converted.quality,
      language: converted.language,
      format: converted.format,
      codec: converted.codec,
      releaseDate: converted.releaseDate,
      hasExternalLink: !!converted._externalLink,
      hasTrailerKey: !!converted.trailerKey,
    });
    return converted;
  }

  // Si la donnée est déjà un torrent unique
  if (torrents && typeof torrents === 'object' && (torrents.infoHash || torrents.info_hash || torrents.id)) {
    // Convertir si c'est un variant, sinon retourner tel quel
    const converted = convertVariantToTorrent(torrents);
    console.log('[MediaDetailRoute] Torrent unique converti:', {
      id: converted.id,
      name: converted.name,
      cleanTitle: converted.cleanTitle,
      quality: converted.quality,
    });
    return converted;
  }

  return null;
}

export default function MediaDetailRoute() {
  const contentId = useMemo(() => getContentIdFromLocation(), []);
  const [torrent, setTorrent] = useState<Torrent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!contentId) {
        setLoading(false);
        setError('Aucun contenu spécifié');
        return;
      }

      setLoading(true);
      setError(null);
      setTorrent(null);

      try {
        // 1) Essayer group/<slug> via serverApi (gère automatiquement l'auth et le refresh token)
        const groupResponse = await serverApi.getTorrentGroup(contentId);
        console.log('[MediaDetailRoute] Réponse getTorrentGroup complète:', JSON.stringify(groupResponse, null, 2));
        if (groupResponse.success && groupResponse.data) {
          const data = groupResponse.data as any;
          console.log('[MediaDetailRoute] Structure data:', {
            hasVariants: !!data.variants,
            variantsCount: data.variants?.length,
            variants: data.variants,
            variantCount: data.variant_count,
            slug: data.slug,
            mainTitle: data.main_title,
          });
          
          const best = pickBestTorrentFromGroupPayload(groupResponse);
          if (best && !cancelled) {
            console.log('[MediaDetailRoute] Torrent final sélectionné:', {
              id: best.id,
              name: best.name,
              hasExternalLink: !!(best as any)._externalLink,
              externalLink: (best as any)._externalLink,
              hasExternalMagnetUri: !!(best as any)._externalMagnetUri,
              hasGuid: !!(best as any)._guid,
              guid: (best as any)._guid,
              allKeys: Object.keys(best as any),
            });
            setTorrent(best);
            setLoading(false);
            return;
          }
          
          // Si le groupe existe mais est vide, vérifier les raisons
          if (data.variants && Array.isArray(data.variants) && data.variants.length === 0) {
            if (contentId.startsWith('external_')) {
              console.warn('[MediaDetailRoute] Groupe externe vide détecté:', {
                slug: data.slug,
                mainTitle: data.main_title,
                variantCount: data.variant_count,
                message: 'Le torrent externe existe mais aucune variante n\'a été trouvée dans la base de données. Le torrent peut ne pas encore être synchronisé.',
              });
              if (!cancelled) {
                setError('Torrent externe trouvé mais aucune variante disponible. Le torrent peut ne pas encore être synchronisé dans la base de données.');
                setLoading(false);
                return;
              }
            } else {
              console.warn('[MediaDetailRoute] Groupe vide détecté (non-externe):', {
                slug: data.slug,
                mainTitle: data.main_title,
                variantCount: data.variant_count,
              });
            }
          }
        }

        // 2) Fallback /api/torrents/<id> via serverApi (seulement si pas un slug external_)
        if (!contentId.startsWith('external_')) {
          const byIdResponse = await serverApi.getTorrentById(contentId);
          if (byIdResponse.success && byIdResponse.data) {
            const t: Torrent | null =
              (byIdResponse.data?.torrent as Torrent) ||
              (byIdResponse.data as Torrent) ||
              null;

            if (t && !cancelled) {
              setTorrent(t);
              setLoading(false);
              return;
            }
          }

          if (!cancelled) {
            setError(groupResponse.message || byIdResponse?.message || 'Torrent non trouvé');
            setLoading(false);
            return;
          }
        } else {
          // Pour les slugs external_, on ne peut pas utiliser le fallback
          if (!cancelled) {
            setError(groupResponse.message || 'Torrent externe non trouvé');
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur lors du chargement');
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mb-4 mx-auto">
            <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-white/80">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-3">{error}</h1>
          <a href="/dashboard" className="text-blue-400 hover:text-blue-300">
            Retour au dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!torrent) return null;
  return <MediaDetailPage torrent={torrent} />;
}

