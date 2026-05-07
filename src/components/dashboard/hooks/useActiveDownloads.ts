import { useState, useEffect, useCallback } from 'preact/hooks';
import { clientApi } from '../../../lib/client/api';
import type { ContentItem, ClientTorrentStats } from '../../../lib/client/types';

export function useActiveDownloads() {
  const [activeItems, setActiveItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActiveTorrents = useCallback(async () => {
    try {
      const torrents = await clientApi.listTorrentsEnriched();
      const active = torrents.filter(t => 
        t.state === 'downloading' || 
        (t.state === 'queued' && t.progress < 100)
      );

      const items: ContentItem[] = active.map(t => ({
        id: t.slug || `torrent-${t.info_hash}`,
        title: t.tmdb_title || t.name,
        type: t.tmdb_type || 'movie',
        poster: t.poster_url || undefined,
        backdrop: t.hero_image_url || undefined,
        progress: t.progress,
        isDownloading: true,
        infoHash: t.info_hash,
        downloadSpeed: t.download_speed,
        seeds: t.seeders,
        peers: t.peers_connected
      }));

      setActiveItems(items);
    } catch (e) {
      console.error('Failed to fetch active downloads:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveTorrents();
    const interval = setInterval(loadActiveTorrents, 5000);
    return () => clearInterval(interval);
  }, [loadActiveTorrents]);

  return { activeDownloads: activeItems, loading };
}
