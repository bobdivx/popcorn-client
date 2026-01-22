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
        // Vérifier si c'est du JSON valide avant de parser
        // Si ça commence par { ou [, c'est probablement du JSON
        const trimmed = variant.quality.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          qualityObj = JSON.parse(variant.quality);
        } else {
          // Ce n'est pas du JSON, c'est probablement juste une chaîne simple comme "1080P"
          // On l'utilisera directement dans le champ "full"
          qualityObj = null;
        }
      } else if (typeof variant.quality === 'object') {
        qualityObj = variant.quality;
      }
    } catch (e) {
      // Erreur de parsing JSON, ce n'est probablement pas du JSON
      // On ignore l'erreur et on utilisera la valeur directement
      console.debug('[MediaDetailRoute] quality n\'est pas du JSON valide, utilisation directe:', variant.quality);
      qualityObj = null;
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

  const infoHash = variant.info_hash || variant.infoHash || null;
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailRoute.tsx:87',message:'infoHash extrait du variant',data:{infoHash,variantId:variant.id,variantInfoHash:variant.info_hash,variantInfoHashAlt:variant.infoHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash: infoHash,
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
        // Détecter si c'est un média local (slug commence par "local_")
        const isLocalMedia = contentId.startsWith('local_');
        
        // Si c'est un média local, récupérer depuis la bibliothèque
        if (isLocalMedia) {
          console.log('[MediaDetailRoute] Détection d\'un média local, récupération depuis la bibliothèque:', contentId);
          const libraryResponse = await serverApi.getLibrary();
          if (libraryResponse.success && libraryResponse.data) {
            const libraryItems = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
            // Trouver le média correspondant au slug
            const localMedia = libraryItems.find((item: any) => 
              item.info_hash === contentId || item.slug === contentId
            );
            
            if (localMedia && !cancelled) {
              console.log('[MediaDetailRoute] Média local trouvé:', localMedia);
              // Convertir le média local en objet Torrent
              const t: Torrent = {
                id: localMedia.info_hash || localMedia.slug || contentId,
                slug: localMedia.slug || null,
                // Pour les médias locaux, utiliser contentId (qui contient "local_...") si info_hash n'est pas disponible
                infoHash: localMedia.info_hash || (contentId.startsWith('local_') ? contentId : null),
                name: localMedia.name || '',
                cleanTitle: localMedia.name || null,
                description: localMedia.synopsis || null,
                category: localMedia.category || null,
                imageUrl: localMedia.poster_url || null,
                heroImageUrl: localMedia.hero_image_url || null,
                trailerKey: null,
                fileSize: localMedia.file_size || 0,
                seedCount: 0,
                leechCount: 0,
                _externalLink: null,
                _externalMagnetUri: null,
                _guid: null,
                indexerId: null,
                indexerName: null,
                language: localMedia.language || null,
                format: localMedia.source_format || null,
                codec: localMedia.video_codec || null,
                quality: {
                  resolution: localMedia.resolution || null,
                  source: localMedia.source_format || null,
                  codec: localMedia.video_codec || null,
                  audio: localMedia.audio_codec || null,
                  language: localMedia.language || null,
                  full: localMedia.quality || null,
                },
                synopsis: localMedia.synopsis || null,
                releaseDate: localMedia.release_date || null,
                genres: (() => {
                  if (!localMedia.genres) return null;
                  if (typeof localMedia.genres === 'string') {
                    try {
                      return JSON.parse(localMedia.genres);
                    } catch {
                      return [localMedia.genres];
                    }
                  }
                  return Array.isArray(localMedia.genres) ? localMedia.genres : null;
                })(),
                voteAverage: localMedia.vote_average || null,
                runtime: localMedia.runtime || null,
                tmdbId: localMedia.tmdb_id || null,
                tmdbType: localMedia.tmdb_type || null,
                // Chemin du fichier local
                downloadPath: localMedia.download_path || null,
              } as Torrent;
              
              setTorrent(t);
              setLoading(false);
              return;
            } else {
              console.warn('[MediaDetailRoute] Média local non trouvé dans la bibliothèque:', contentId);
              if (!cancelled) {
                setError('Média local non trouvé dans la bibliothèque. Le fichier peut avoir été supprimé ou déplacé.');
                setLoading(false);
                return;
              }
            }
          } else {
            // Erreur lors de la récupération de la bibliothèque
            if (!cancelled) {
              setError(libraryResponse.message || 'Erreur lors de la récupération de la bibliothèque');
              setLoading(false);
              return;
            }
          }
        }

        // Détecter si contentId ressemble à un info_hash
        // Un info_hash fait généralement 40 caractères (hex) ou 32 caractères (base32)
        const looksLikeInfoHash = !contentId.startsWith('external_') && !isLocalMedia &&
          (contentId.length === 40 || contentId.length === 32) && 
          /^[a-fA-F0-9]+$/.test(contentId);

        // Si c'est un info_hash, essayer directement getTorrentById (pour les médias de la bibliothèque)
        if (looksLikeInfoHash) {
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
        }

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
                contentId,
                looksLikeInfoHash,
              });
              
              // Si le groupe est vide mais que contentId ressemble à un info_hash,
              // essayer getTorrentById comme fallback (cas des médias de la bibliothèque)
              if (looksLikeInfoHash) {
                console.log('[MediaDetailRoute] Tentative de fallback avec getTorrentById pour info_hash:', contentId);
                const byIdResponse = await serverApi.getTorrentById(contentId);
                if (byIdResponse.success && byIdResponse.data) {
                  const t: Torrent | null =
                    (byIdResponse.data?.torrent as Torrent) ||
                    (byIdResponse.data as Torrent) ||
                    null;

                  if (t && !cancelled) {
                    console.log('[MediaDetailRoute] Torrent trouvé via getTorrentById fallback');
                    setTorrent(t);
                    setLoading(false);
                    return;
                  }
                }
              }
              
              // Si pas un info_hash ou si getTorrentById a échoué, afficher l'erreur
              if (!cancelled) {
                setError('Aucun torrent trouvé pour ce slug. Le torrent peut ne pas encore être synchronisé dans la base de données.');
                setLoading(false);
                return;
              }
            }
          }
        }

        // 2) Fallback final pour les slugs qui ne sont pas des info_hash
        // (seulement si on n'a pas déjà essayé getTorrentById)
        if (!looksLikeInfoHash) {
          if (!cancelled) {
            setError(groupResponse?.message || 'Torrent non trouvé');
            setLoading(false);
          }
        } else {
          // Si c'était un info_hash mais qu'on n'a rien trouvé, afficher l'erreur
          if (!cancelled) {
            setError(groupResponse?.message || 'Torrent non trouvé');
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

