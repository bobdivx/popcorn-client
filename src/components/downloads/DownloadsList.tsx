import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Download, Upload, Pause, Play, Trash2, Plus, FileText, Link2, X, FileText as LogsIcon, HardDrive } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import type { ClientTorrentStats, ContentItem, TorrentLogEntry } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { getDownloadMeta } from '../../lib/utils/download-meta-storage';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { HeroSection } from '../dashboard/components/HeroSection';
import { DownloadCard } from './DownloadCard';
import { DownloadDetailModal } from './DownloadDetailModal';
import { DownloadVerificationPanel } from './DownloadVerificationPanel';

const REFRESH_INTERVAL = 2000; // Rafraîchir toutes les 2 secondes

// Cache pour les images TMDB par info_hash (modal détail)
const tmdbImageCache = new Map<string, { posterUrl: string | null; backdropUrl: string | null }>();

/** Construit une map info_hash -> meta à partir de la réponse API torrents/list */
function buildImageMapFromList(data: { data?: Array<Record<string, any>> }): Record<string, { posterUrl: string | null; backdropUrl: string | null; title: string | null; tmdbType: 'movie' | 'tv' | null }> {
  const map: Record<string, { posterUrl: string | null; backdropUrl: string | null; title: string | null; tmdbType: 'movie' | 'tv' | null }> = {};
  if (!data?.data || !Array.isArray(data.data)) return map;
  for (const t of data.data) {
    const hash = (t.infoHash ?? t.info_hash) as string | undefined;
    if (!hash || typeof hash !== 'string') continue;
    const key = hash.toLowerCase();
    const image = (t.imageUrl ?? t.poster_url ?? t.poster) as string | undefined;
    const backdrop = (t.heroImageUrl ?? t.hero_image_url ?? t.backdrop) as string | undefined;
    const tmdbType = (t.tmdb_type ?? t.type) as 'movie' | 'tv' | undefined;
    const title = (t.tmdb_title ?? t.title ?? t.name) as string | undefined;
    
    map[key] = { 
       posterUrl: image && typeof image === 'string' && image.length > 0 ? image : null,
       backdropUrl: backdrop && typeof backdrop === 'string' && backdrop.length > 0 ? backdrop : null,
       title: title && typeof title === 'string' && title.trim() ? title.trim() : null,
       tmdbType: tmdbType === 'movie' || tmdbType === 'tv' ? tmdbType : null
    };
  }
  return map;
}

/** Construit une map info_hash -> meta depuis /library */
function buildImageMapFromLibrary(data: { data?: Array<Record<string, any>> }): { images: Record<string, { posterUrl: string | null; backdropUrl: string | null }>; titles: Record<string, string>; types: Record<string, 'movie' | 'tv' | null> } {
  const images: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
  const titles: Record<string, string> = {};
  const types: Record<string, 'movie' | 'tv' | null> = {};
  if (!data?.data || !Array.isArray(data.data)) return { images, titles, types };
  for (const item of data.data) {
    const hash = (item.info_hash ?? item.infoHash) as string | undefined;
    if (!hash || typeof hash !== 'string') continue;
    const key = hash.toLowerCase();
    const image = (item.poster_url ?? item.poster ?? item.image_url ?? item.imageUrl) as string | undefined;
    const backdrop = (item.hero_image_url ?? item.heroImageUrl ?? item.backdrop ?? item.backdrop_url) as string | undefined;
    const title = (item.tmdb_title ?? item.clean_title ?? item.title ?? item.name) as string | undefined;
    const tmdbType = (item.tmdb_type ?? item.type) as 'movie' | 'tv' | undefined;
    
    if (image || backdrop) {
      images[key] = { posterUrl: image || null, backdropUrl: backdrop || null };
    }
    if (title && typeof title === 'string' && title.trim()) {
      titles[key] = title.trim();
    }
    if (tmdbType === 'movie' || tmdbType === 'tv') {
      types[key] = tmdbType;
    }
  }
  return { images, titles, types };
}

/**
 * Filtre et nettoie les logs...
 */
function filterLogs(logs: TorrentLogEntry[]): TorrentLogEntry[] {
  const filtered: TorrentLogEntry[] = [];
  const seenMessages = new Map<string, { count: number; lastSeen: number; firstLog: TorrentLogEntry }>();
  const MESSAGE_TIMEOUT = 30000;
  
  for (const log of logs) {
    const normalizedMessage = log.message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, '[TIMESTAMP]')
      .replace(/peer="[^"]+"/g, 'peer="[PEER]"')
      .replace(/addr="[^"]+"/g, 'addr="[ADDR]"')
      .replace(/info_hash="[^"]+"/g, 'info_hash="[HASH]"')
      .replace(/\d+\.\d+\.\d+\.\d+:\d+/g, '[IP:PORT]')
      .trim();
    
    const existing = seenMessages.get(normalizedMessage);
    const now = log.timestamp;
    const isImportant = log.level === 'WARN' || log.level === 'ERROR';
    
    if (!existing) {
      seenMessages.set(normalizedMessage, { count: 1, lastSeen: now, firstLog: log });
      filtered.push(log);
    } else if ((now - existing.lastSeen) > MESSAGE_TIMEOUT) {
      if (existing.count > 1 && !isImportant) {
        const firstIndex = filtered.findIndex(l => l.timestamp === existing.firstLog.timestamp && l.message === existing.firstLog.message);
        if (firstIndex >= 0 && !filtered[firstIndex].message.includes('(répété')) {
          filtered[firstIndex] = { ...existing.firstLog, message: `${existing.firstLog.message} (répété ${existing.count} fois)` };
        }
      }
      seenMessages.set(normalizedMessage, { count: 1, lastSeen: now, firstLog: log });
      filtered.push(log);
    } else if (isImportant) {
      existing.count++;
      existing.lastSeen = now;
      filtered.push(log);
    } else {
      existing.count++;
      existing.lastSeen = now;
    }
  }
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

function formatLogEntry(log: TorrentLogEntry): string {
  const date = new Date(log.timestamp);
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `[${timeStr}] [${log.level}] ${log.message}`;
}

export default function DownloadsList() {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<ClientTorrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMagnetModal, setShowAddMagnetModal] = useState(false);
  const [magnetLink, setMagnetLink] = useState('');
  const [addingTorrent, setAddingTorrent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const magnetInputRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [logs, setLogs] = useState<TorrentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [imageMap, setImageMap] = useState<Record<string, { posterUrl: string | null; backdropUrl: string | null }>>({});
  const [displayTitleMap, setDisplayTitleMap] = useState<Record<string, string>>({});
  const [tmdbTypeMap, setTmdbTypeMap] = useState<Record<string, 'movie' | 'tv' | null>>({});

  const [selectedTorrent, setSelectedTorrent] = useState<ClientTorrentStats | null>(null);
  const [selectedTorrentPoster, setSelectedTorrentPoster] = useState<string | null>(null);
  const [selectedTorrentBackdrop, setSelectedTorrentBackdrop] = useState<string | null>(null);

  const heroItems = useMemo<ContentItem[]>(() => {
    if (!torrents || torrents.length === 0) return [];
    const sorted = [...torrents].sort((a, b) => {
      const score = (x: ClientTorrentStats) => {
        if (x.state === 'downloading') return 0;
        if (x.state === 'seeding') return 1;
        if (x.state === 'paused') return 2;
        if (x.state === 'completed') return 3;
        return 4;
      };
      return score(a) - score(b);
    });

    const items: ContentItem[] = [];
    for (const tor of sorted) {
      const key = String(tor.info_hash || '').toLowerCase();
      const images = key ? imageMap[key] : undefined;
      const title = (displayTitleMap[key] && displayTitleMap[key].trim()) || tor.name || t('downloads.title');
      const backdrop = images?.backdropUrl ?? null;
      const poster = images?.posterUrl ?? null;
      if (!backdrop && !poster) continue;

      items.push({
        id: `download-${key || encodeURIComponent(title)}`,
        title,
        tmdbTitle: title,
        type: (tmdbTypeMap[key] as any) || 'movie',
        poster: poster || undefined,
        backdrop: backdrop || undefined,
        progress: typeof tor.progress === 'number' ? tor.progress : undefined,
      });

      if (items.length >= 5) break;
    }
    return items;
  }, [torrents, imageMap, displayTitleMap, tmdbTypeMap, t]);

  const [verificationInfoHash, setVerificationInfoHash] = useState<string | null>(null);
  const [verificationTorrentName, setVerificationTorrentName] = useState<string>('');
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [sessionStats, setSessionStats] = useState<Record<string, any> | null>(null);

  const [showSessionLogsModal, setShowSessionLogsModal] = useState(false);
  const [sessionLogsLines, setSessionLogsLines] = useState<string[]>([]);
  const [sessionLogsError, setSessionLogsError] = useState<string | null>(null);
  const [sessionLogsConnecting, setSessionLogsConnecting] = useState(false);
  const sessionLogsAbortRef = useRef<AbortController | null>(null);

  const handleCloseDetail = useCallback(() => {
    setSelectedTorrent(null);
    setSelectedTorrentPoster(null);
    setSelectedTorrentBackdrop(null);
  }, []);

  const initialLoadDoneRef = useRef(false);

  const loadTorrents = useCallback(async () => {
    const isInitial = !initialLoadDoneRef.current;
    try {
      const list = await clientApi.listTorrents();
      setTorrents(list);
      setError(null);
      if (isInitial) {
        initialLoadDoneRef.current = true;
        void (async () => {
          try {
            const enrichedList = await clientApi.listTorrentsEnriched();
            const images: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
            const titles: Record<string, string> = {};
            const types: Record<string, 'movie' | 'tv' | null> = {};
            for (const t of enrichedList) {
              const key = t.info_hash.toLowerCase();
              if (t.poster_url || t.hero_image_url) {
                images[key] = { posterUrl: t.poster_url ?? null, backdropUrl: t.hero_image_url ?? null };
              }
              if (t.tmdb_title && t.tmdb_title.trim()) titles[key] = t.tmdb_title.trim();
              if (t.tmdb_type) types[key] = t.tmdb_type as any;
            }
            setImageMap(prev => ({ ...prev, ...images }));
            setDisplayTitleMap(prev => ({ ...prev, ...titles }));
            setTmdbTypeMap(prev => ({ ...prev, ...types }));
          } catch (e) {
            console.debug('Background enrichment failed', e);
          }
        })();
      }
    } catch (err) {
      if (isInitial) initialLoadDoneRef.current = true;
      console.error('Erreur chargement:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTorrents();
    const interval = setInterval(loadTorrents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTorrents]);

  // sessionStorage sync
  useEffect(() => {
    if (torrents.length === 0) return;
    const stored = getDownloadMeta();
    const initialImages: Record<string, any> = {};
    const initialTitles: Record<string, string> = {};
    for (const t of torrents) {
      const key = t.info_hash.toLowerCase();
      const s = stored[key];
      if (s) {
        if (s.posterUrl || s.backdropUrl) initialImages[key] = { posterUrl: s.posterUrl ?? null, backdropUrl: s.backdropUrl ?? null };
        if (s.cleanTitle) initialTitles[key] = s.cleanTitle;
      }
    }
    setImageMap(prev => ({ ...initialImages, ...prev }));
    setDisplayTitleMap(prev => ({ ...initialTitles, ...prev }));
  }, [torrents.length]);

  // Backend API sync
  useEffect(() => {
    if (torrents.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const { getBackendUrl } = await import('../../lib/backend-config');
        const baseUrl = (getBackendUrl() || serverApi.getServerUrl()).trim().replace(/\/$/, '');
        const token = serverApi.getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(`${baseUrl}/api/torrents/list?limit=200`, { headers });
        if (cancelled || !response.ok) return;
        const data = await response.json();
        if (cancelled || !data?.success) return;
        const map = buildImageMapFromList(data);
        const newImages: any = {}, newTitles: any = {}, newTypes: any = {};
        for (const [hash, meta] of Object.entries(map)) {
          tmdbImageCache.set(hash, { posterUrl: meta.posterUrl, backdropUrl: meta.backdropUrl });
          newImages[hash] = { posterUrl: meta.posterUrl, backdropUrl: meta.backdropUrl };
          if (meta.title) newTitles[hash] = meta.title;
          if (meta.tmdbType) newTypes[hash] = meta.tmdbType;
        }
        setImageMap(prev => ({ ...prev, ...newImages }));
        setDisplayTitleMap(prev => ({ ...prev, ...newTitles }));
        setTmdbTypeMap(prev => ({ ...prev, ...newTypes }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [torrents.length]);

  // Library sync
  useEffect(() => {
    if (torrents.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const response = await serverApi.getLibrary();
        if (cancelled || !response?.success) return;
        const { images, titles, types } = buildImageMapFromLibrary(response as any);
        if (cancelled) return;
        setImageMap(prev => ({ ...prev, ...images }));
        setDisplayTitleMap(prev => ({ ...prev, ...titles }));
        setTmdbTypeMap(prev => ({ ...prev, ...types }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [torrents.length]);

  useEffect(() => {
    const fetchSession = async () => { setSessionStats(await clientApi.getLibrqbitSessionStats()); };
    fetchSession();
    const interval = setInterval(fetchSession, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const moviesTorrents = useMemo(() => torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'movie'), [torrents, tmdbTypeMap]);
  const seriesTorrents = useMemo(() => torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'tv'), [torrents, tmdbTypeMap]);
  const otherTorrents = useMemo(() => torrents.filter(t => {
     const type = tmdbTypeMap[t.info_hash.toLowerCase()];
     return type !== 'movie' && type !== 'tv';
  }), [torrents, tmdbTypeMap]);

  const handlePause = async (h) => { await clientApi.pauseTorrent(h); loadTorrents(); };
  const handleResume = async (h) => { await clientApi.resumeTorrent(h); loadTorrents(); };
  const handleRemove = async (h, d = false) => { if (!confirm(t('downloads.confirmRemove'))) return false; await clientApi.removeTorrent(h, d); loadTorrents(); return true; };

  const handleOpenDetail = (torrent, poster, backdrop) => {
    setSelectedTorrent(torrent);
    const cached = tmdbImageCache.get(torrent.info_hash);
    setSelectedTorrentPoster(poster || cached?.posterUrl || null);
    setSelectedTorrentBackdrop(backdrop || cached?.backdropUrl || null);
  };

  const handleShowLogs = async (h) => { setSelectedTorrentHash(h); setShowLogsModal(true); setLogsLoading(true); try { setLogs(filterLogs(await clientApi.getTorrentLogs(h))); } catch { setLogsError('Error'); } finally { setLogsLoading(false); } };

  const renderCarousel = (title, items) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-12 animate-[fade-in-up_0.5s_ease-out_forwards]">
        <div className="px-12 mb-4">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            {title} <span className="text-sm font-medium text-[var(--ds-text-tertiary)] bg-white/5 py-0.5 px-2.5 rounded-full">{items.length}</span>
          </h2>
        </div>
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide px-12 pb-6 pt-2" style={{ scrollSnapType: 'x mandatory' }}>
            {items.map((torrent) => (
              <div key={torrent.info_hash} className="shrink-0 w-[400px]" style={{ scrollSnapAlign: 'start' }}>
                <DownloadCard
                  torrent={torrent}
                  posterUrl={imageMap[torrent.info_hash.toLowerCase()]?.posterUrl || undefined}
                  backdropUrl={imageMap[torrent.info_hash.toLowerCase()]?.backdropUrl || undefined}
                  displayTitle={displayTitleMap[torrent.info_hash.toLowerCase()]}
                  onOpenDetail={handleOpenDetail}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading && torrents.length === 0) return <div className="flex-1 flex items-center justify-center min-h-[400px]"><HLSLoadingSpinner size="lg" text={t('downloads.loadingDownloads')} /></div>;

  return (
    <div className="flex flex-col">
      {heroItems.length > 0 && (
        <HeroSection items={heroItems} onPlay={(it) => {
            const h = it.id.replace('download-', '');
            const tor = torrents.find(t=>t.info_hash.toLowerCase()===h);
            if(tor) handleOpenDetail(tor, it.poster, it.backdrop);
        }} onPrimaryAction={(it) => {
            const h = it.id.replace('download-', '');
            const tor = torrents.find(t=>t.info_hash.toLowerCase()===h);
            if(tor) handleOpenDetail(tor, it.poster, it.backdrop);
        }} primaryButtonLabel={t('common.details')} size="large" />
      )}

      <div className="pt-4 pb-12 flex-1 safe-area-bottom">
        <div className="px-12 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2">{t('downloads.title')}</h1>
            <p className="text-[var(--ds-text-secondary)] text-lg">{t('downloads.activeDownloads', { count: torrents.length, plural: torrents.length > 1 ? 's' : '' })}</p>
          </div>
          <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 p-1.5 backdrop-blur-xl">
            <button onClick={() => setShowAddMagnetModal(true)} className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center text-[var(--ds-text-tertiary)] hover:text-white"><Link2 size={24} /></button>
            <button onClick={() => setShowSessionLogsModal(true)} className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center text-[var(--ds-text-tertiary)] hover:text-white"><LogsIcon size={24} /></button>
          </div>
        </div>

        {torrents.length === 0 ? (
          <div className="px-12 mt-12 flex flex-col items-center justify-center py-20 text-center bg-white/[0.02] border border-white/5 rounded-3xl mx-12">
            <HardDrive className="w-12 h-12 text-[var(--ds-text-tertiary)] mb-4" />
            <h2 className="text-2xl font-bold text-white">{t('downloads.noActiveDownloads')}</h2>
            <p className="text-[var(--ds-text-secondary)]">{t('downloads.torrentsWillAppear')}</p>
          </div>
        ) : (
          <div className="mt-10">
            {renderCarousel("Films", moviesTorrents)}
            {renderCarousel("Séries", seriesTorrents)}
            {renderCarousel("Autres", otherTorrents)}
          </div>
        )}
      </div>

      {showAddMagnetModal && createPortal(
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={(e)=>e.target===e.currentTarget&&setShowAddMagnetModal(false)}>
            <div className="bg-[var(--ds-surface-elevated)] border border-white/10 p-8 rounded-3xl max-w-2xl w-full shadow-2xl">
               <h2 className="text-3xl font-bold mb-6">{t('downloads.addMagnetLink')}</h2>
               <textarea value={magnetLink} onChange={(e)=>setMagnetLink(e.target.value)} className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-white/20 mb-6" placeholder="magnet:?xt=urn:btih:..." />
               <div className="flex justify-end gap-4">
                 <button onClick={()=>setShowAddMagnetModal(false)} className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
                 <button onClick={async ()=>{
                    setAddingTorrent(true);
                    try {
                        const nameMatch = magnetLink.match(/dn=([^&]+)/);
                        const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Torrent';
                        await clientApi.addMagnetLink(magnetLink, name, false);
                        setShowAddMagnetModal(false); setMagnetLink(''); loadTorrents();
                    } catch(e) { setError(e.message); } finally { setAddingTorrent(false); }
                 }} className="px-8 py-3 rounded-xl bg-[var(--ds-accent-violet)] text-white font-bold">{addingTorrent ? 'Adding...' : 'Add'}</button>
               </div>
            </div>
          </div>, document.body
      )}

      {selectedTorrent && (
        <DownloadDetailModal torrent={selectedTorrent} onClose={handleCloseDetail} onPause={handlePause} onResume={handleResume} onRemove={handleRemove} onShowLogs={handleShowLogs} posterUrl={selectedTorrentPoster} backdropUrl={selectedTorrentBackdrop} />
      )}
    </div>
  );
}