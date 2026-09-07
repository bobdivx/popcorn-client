import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { clientApi } from '../../../lib/client/api';
import { buildStreamUrl } from '../player-core/utils/buildStreamUrl';

/** Voiture / Tesla : uniquement flux progressif MP4 (pas de HLS). */
export type CarStreamMode = 'direct';

export interface CarMediaSource {
  title: string;
  posterUrl: string | null;
  infoHash: string;
  filePath: string;
  fileName: string;
  fileIndex: number | null;
  streamUrl: string;
  mode: CarStreamMode;
  slug: string;
}

function isVideoName(name: string): boolean {
  return /\.(mkv|mp4|m4v|webm|avi|mov|ts|m2ts)(\?|$)/i.test(name);
}

function pickTitle(data: Record<string, unknown>, fallback: string): string {
  const clean = data.cleanTitle || data.tmdbTitle || data.title || data.name || data.main_title;
  return typeof clean === 'string' && clean.trim() ? clean.trim() : fallback;
}

function pickPoster(data: Record<string, unknown>): string | null {
  const keys = ['imageUrl', 'poster', 'poster_url', 'posterUrl', 'heroImageUrl', 'backdrop'];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickInfoHash(data: Record<string, unknown>): string | null {
  for (const k of ['infoHash', 'info_hash'] as const) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const id = data.id;
  if (typeof id === 'string' && id.trim()) {
    if (id.startsWith('local_') || /^[a-fA-F0-9]{32,40}$/.test(id)) return id.trim();
  }
  return null;
}

function pickDownloadPath(data: Record<string, unknown>): string | null {
  const keys = ['downloadPath', 'download_path', 'file_path', 'filePath', 'path'];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function dedupeLibraryMediaPrefix(filePath: string): string {
  let normalized = filePath.replace(/\\/g, '/');
  while (normalized.toLowerCase().startsWith('media/media/')) {
    normalized = normalized.slice(6);
  }
  return normalized;
}

/**
 * Résout slug → URL de stream progressif MP4 (`/api/local/stream/...`).
 * Pas de HLS / Lucie / MSE — le Chromium Tesla lit mal le HLS (écran noir + son ou erreur).
 */
function readCarQueryOverrides(): {
  path: string | null;
  infoHash: string | null;
  fileIndex: number | null;
  searchKey: string;
} {
  try {
    const params = new URLSearchParams(window.location.search);
    const path = params.get('path');
    const infoHash = params.get('infoHash');
    const idxQ = params.get('fileIndex');
    let fileIndex: number | null = null;
    if (idxQ != null && idxQ !== '') {
      const n = Number(idxQ);
      if (Number.isFinite(n)) fileIndex = n;
    }
    return {
      path: path?.trim() || null,
      infoHash: infoHash?.trim() || null,
      fileIndex,
      searchKey: `${path || ''}|${infoHash || ''}|${idxQ || ''}`,
    };
  } catch {
    return { path: null, infoHash: null, fileIndex: null, searchKey: '' };
  }
}

export function useCarMediaSource(slug: string | null) {
  const [source, setSource] = useState<CarMediaSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryKey, setQueryKey] = useState('');

  useEffect(() => {
    const overrides = readCarQueryOverrides();
    setQueryKey(overrides.searchKey);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError(null);
      setSource(null);
      return;
    }

    let cancelled = false;
    const overrides = readCarQueryOverrides();

    (async () => {
      setLoading(true);
      setError(null);
      setSource(null);

      try {
        const baseUrl = serverApi.getServerUrl();
        let media: Record<string, unknown> | null = null;

        // Bibliothèque : path + infoHash locaux suffisent sans fiche torrent catalogue
        if (overrides.path && (overrides.infoHash || slug.startsWith('local_'))) {
          const infoHash = overrides.infoHash || slug;
          const filePath = dedupeLibraryMediaPrefix(overrides.path);
          const fileName = filePath.split(/[/\\]/).pop() || 'video';
          const built = buildStreamUrl({
            baseUrl,
            infoHash,
            filePath,
            fileName,
            fileIndex: overrides.fileIndex,
            isDirectMode: true,
            isLucieMode: false,
          });
          if (cancelled) return;
          setSource({
            title: fileName,
            posterUrl: null,
            infoHash,
            filePath,
            fileName,
            fileIndex: overrides.fileIndex,
            streamUrl: built.streamUrl,
            mode: 'direct',
            slug,
          });
          setLoading(false);
          // Enrichir titre/poster en arrière-plan si possible
          void (async () => {
            try {
              const byId = await serverApi.getTorrentById(slug);
              if (cancelled || !byId.success || !byId.data) return;
              const m = byId.data as Record<string, unknown>;
              setSource((prev) =>
                prev
                  ? {
                      ...prev,
                      title: pickTitle(m, prev.title),
                      posterUrl: pickPoster(m) || prev.posterUrl,
                    }
                  : prev,
              );
            } catch {
              // ignore
            }
          })();
          return;
        }

        const byId = await serverApi.getTorrentById(slug);
        if (byId.success && byId.data) {
          media = byId.data as Record<string, unknown>;
        }

        if (!media) {
          const group = await serverApi.getTorrentGroup(slug);
          if (group.success && group.data) {
            const g = group.data as Record<string, unknown>;
            const variants = (g.variants || g.torrents || []) as Record<string, unknown>[];
            media = (variants[0] as Record<string, unknown>) || g;
          }
        }

        if (!media) {
          throw new Error('Média introuvable pour ce slug.');
        }

        let infoHash =
          overrides.infoHash ||
          pickInfoHash(media) ||
          (typeof media.slug === 'string' && media.slug.startsWith('local_') ? media.slug : null) ||
          (slug.startsWith('local_') || /^[a-fA-F0-9]{32,40}$/.test(slug) ? slug : null);

        if (!infoHash) {
          infoHash = slug;
        }

        let filePath = overrides.path || pickDownloadPath(media);
        let fileName =
          (typeof media.name === 'string' && media.name) || filePath?.split(/[/\\]/).pop() || 'video';
        let fileIndex: number | null = overrides.fileIndex;

        if (overrides.path) {
          fileName = overrides.path.split(/[/\\]/).pop() || fileName;
        }

        if ((!filePath || !filePath.trim()) && infoHash.startsWith('local_')) {
          try {
            const res = await serverApi.findLocalMediaByInfoHash(infoHash);
            const item = res?.success
              ? (res.data as { file_path?: string; file_name?: string } | null)
              : null;
            if (item?.file_path) {
              filePath = String(item.file_path).trim();
              fileName = item.file_name || filePath.split(/[/\\]/).pop() || fileName;
            }
          } catch {
            // ignore
          }
        }

        if ((!filePath || !filePath.trim()) && infoHash && !infoHash.startsWith('local_')) {
          try {
            const backendFiles = await clientApi.getTorrentFiles(infoHash);
            if (Array.isArray(backendFiles) && backendFiles.length > 0) {
              const videos = backendFiles.filter(
                (f) => f.is_video || isVideoName(String(f.path || '')),
              );
              const first = videos[0] || backendFiles[0];
              if (first?.path) {
                filePath = first.path;
                fileName = first.path.split(/[/\\]/).pop() || fileName;
                fileIndex = backendFiles.indexOf(first);
              }
            }
          } catch {
            // ignore
          }

          if (!filePath) {
            const list = await serverApi.getTorrentFileList({ infoHash });
            if (list.success && Array.isArray(list.data) && list.data.length > 0) {
              const videos = list.data.filter((f) => isVideoName(f.name));
              const first = videos[0] || list.data[0];
              filePath = first.name;
              fileName = first.name.split(/[/\\]/).pop() || first.name;
              fileIndex = list.data.indexOf(first);
            }
          }
        }

        if (!filePath) {
          throw new Error(
            'Aucun fichier vidéo disponible. Ouvrez le média depuis la bibliothèque (fichier local prêt).',
          );
        }

        filePath = dedupeLibraryMediaPrefix(filePath);
        const built = buildStreamUrl({
          baseUrl,
          infoHash,
          filePath,
          fileName,
          fileIndex,
          isDirectMode: true,
          isLucieMode: false,
        });

        if (cancelled) return;

        setSource({
          title: pickTitle(media, slug),
          posterUrl: pickPoster(media),
          infoHash,
          filePath,
          fileName,
          fileIndex,
          streamUrl: built.streamUrl,
          mode: 'direct',
          slug,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, queryKey]);

  return { source, loading, error };
}
