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

function pickBestTorrentFromGroupPayload(payload: any): Torrent | null {
  // Payloads possibles selon backend / versions:
  // - { success, torrents: [...] }
  // - { success, data: { torrents: [...] } }
  // - { success, data: { variants: [...] } }
  const torrents =
    payload?.torrents ??
    payload?.data?.torrents ??
    payload?.data?.variants ??
    payload?.data?.items ??
    payload?.data;

  if (Array.isArray(torrents) && torrents.length > 0) {
    return torrents.slice().sort((a: any, b: any) => normalizeSeedCount(b) - normalizeSeedCount(a))[0] as Torrent;
  }

  // Si la donnée est déjà un torrent unique
  if (torrents && typeof torrents === 'object' && (torrents.infoHash || torrents.info_hash || torrents.id)) {
    return torrents as Torrent;
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
        if (groupResponse.success && groupResponse.data) {
          const best = pickBestTorrentFromGroupPayload(groupResponse);
          if (best && !cancelled) {
            setTorrent(best);
            setLoading(false);
            return;
          }
        }

        // 2) Fallback /api/torrents/<id> via serverApi
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
          setError(groupResponse.message || byIdResponse.message || 'Torrent non trouvé');
          setLoading(false);
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
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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

