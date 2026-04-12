import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Download, Upload, Pause, Play, Trash2, Plus, FileText as LogsIcon, Link2, X, HardDrive, Info } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import type { ClientTorrentStats, ContentItem, TorrentLogEntry } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { getDownloadMeta } from '../../lib/utils/download-meta-storage';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { HeroSection } from '../dashboard/components/HeroSection';
import { DownloadCard } from './DownloadCard';
import { DownloadDetailModal } from './DownloadDetailModal';

const REFRESH_INTERVAL = 2000;

const tmdbImageCache = new Map<string, { posterUrl: string | null; backdropUrl: string | null }>();

function buildImageMapFromList(data: { data?: Array<Record<string, any>> }) {
  const map: Record<string, any> = {};
  if (!data?.data) return map;
  for (const t of data.data) {
    const key = ((t.infoHash ?? t.info_hash) || '').toLowerCase();
    if (!key) continue;
    map[key] = {
       posterUrl: t.imageUrl ?? t.poster_url ?? t.poster ?? null,
       backdropUrl: t.heroImageUrl ?? t.hero_image_url ?? t.backdrop ?? null,
       title: t.tmdb_title ?? t.title ?? t.name ?? null,
       tmdbType: t.tmdb_type ?? t.type ?? null
    };
  }
  return map;
}

function buildImageMapFromLibrary(data: { data?: Array<Record<string, any>> }) {
  const images: Record<string, any> = {}, titles: Record<string, string> = {}, types: Record<string, any> = {};
  if (!data?.data) return { images, titles, types };
  for (const item of data.data) {
    const key = ((item.info_hash ?? item.infoHash) || '').toLowerCase();
    if (!key) continue;
    images[key] = { posterUrl: item.poster_url ?? item.poster ?? null, backdropUrl: item.hero_image_url ?? item.backdrop ?? null };
    if (item.tmdb_title ?? item.title) titles[key] = (item.tmdb_title ?? item.title).trim();
    if (item.tmdb_type ?? item.type) types[key] = item.tmdb_type ?? item.type;
  }
  return { images, titles, types };
}

function filterLogs(logs: TorrentLogEntry[]): TorrentLogEntry[] {
  return [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

export default function DownloadsList() {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<ClientTorrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMagnetModal, setShowAddMagnetModal] = useState(false);
  const [magnetLink, setMagnetLink] = useState('');
  const [addingTorrent, setAddingTorrent] = useState(false);
  
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [logs, setLogs] = useState<TorrentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [imageMap, setImageMap] = useState<Record<string, any>>({});
  const [displayTitleMap, setDisplayTitleMap] = useState<Record<string, string>>({});
  const [tmdbTypeMap, setTmdbTypeMap] = useState<Record<string, any>>({});

  const [selectedTorrent, setSelectedTorrent] = useState<ClientTorrentStats | null>(null);
  const [selectedTorrentPoster, setSelectedTorrentPoster] = useState<string | null>(null);
  const [selectedTorrentBackdrop, setSelectedTorrentBackdrop] = useState<string | null>(null);

  const [showSessionLogsModal, setShowSessionLogsModal] = useState(false);
  const [sessionLogsLines, setSessionLogsLines] = useState<string[]>([]);
  const sessionLogsAbortRef = useRef<AbortController | null>(null);

  const heroItems = useMemo<ContentItem[]>(() => {
    return torrents.slice(0, 5).map(tor => {
      const key = tor.info_hash.toLowerCase();
      const meta = imageMap[key];
      const title = displayTitleMap[key] || tor.name;
      return {
        id: `download-${key}`,
        title,
        tmdbTitle: title,
        type: tmdbTypeMap[key] || 'movie',
        poster: meta?.posterUrl || undefined,
        backdrop: meta?.backdropUrl || undefined,
        progress: tor.progress
      };
    }).filter(it => it.backdrop || it.poster);
  }, [torrents, imageMap, displayTitleMap, tmdbTypeMap]);

  const loadTorrents = useCallback(async () => {
    try {
      const list = await clientApi.listTorrents();
      setTorrents(list);
      if (loading) {
        setLoading(false);
        const enriched = await clientApi.listTorrentsEnriched();
        const images: any = {}, titles: any = {}, types: any = {};
        for (const t of enriched) {
          const key = t.info_hash.toLowerCase();
          images[key] = { posterUrl: t.poster_url, backdropUrl: t.hero_image_url };
          if (t.tmdb_title) titles[key] = t.tmdb_title;
          if (t.tmdb_type) types[key] = t.tmdb_type;
        }
        setImageMap(prev => ({...prev, ...images}));
        setDisplayTitleMap(prev => ({...prev, ...titles}));
        setTmdbTypeMap(prev => ({...prev, ...types}));
      }
    } catch (e) { console.error(e); }
  }, [loading]);

  useEffect(() => {
    loadTorrents();
    const interval = setInterval(loadTorrents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTorrents]);

  useEffect(() => {
    if (torrents.length === 0) return;
    (async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const response = await serverApi.getLibrary();
        if (response?.success) {
          const { images, titles, types } = buildImageMapFromLibrary(response as any);
          setImageMap(prev => ({...prev, ...images}));
          setDisplayTitleMap(prev => ({...prev, ...titles}));
          setTmdbTypeMap(prev => ({...prev, ...types}));
        }
      } catch {}
    })();
  }, [torrents.length]);

  const moviesTorrents = useMemo(() => torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'movie'), [torrents, tmdbTypeMap]);
  const seriesTorrents = useMemo(() => torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'tv'), [torrents, tmdbTypeMap]);
  const otherTorrents = useMemo(() => torrents.filter(t => {
     const type = tmdbTypeMap[t.info_hash.toLowerCase()];
     return type !== 'movie' && type !== 'tv';
  }), [torrents, tmdbTypeMap]);

  const handleOpenDetail = (tor, p, b) => { setSelectedTorrent(tor); setSelectedTorrentPoster(p); setSelectedTorrentBackdrop(b); };
  const handleCloseDetail = () => { setSelectedTorrent(null); };

  const handleShowLogs = async (h) => { 
    setSelectedTorrentHash(h); setShowLogsModal(true); setLogsLoading(true);
    try { setLogs(filterLogs(await clientApi.getTorrentLogs(h))); } catch { } finally { setLogsLoading(false); }
  };

  const renderCarousel = (title, items) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="px-12 mb-4 flex items-center gap-4">
          <h2 className="text-3xl font-bold text-white">{title}</h2>
          <span className="px-3 py-1 bg-white/5 rounded-full text-xs font-bold text-white/40 border border-white/10">{items.length}</span>
        </div>
        <div className="flex gap-6 overflow-x-auto scrollbar-hide px-12 pb-8 pt-2" style={{ scrollSnapType: 'x mandatory' }}>
          {items.map((torrent) => (
            <div key={torrent.info_hash} className="shrink-0 w-[420px]" style={{ scrollSnapAlign: 'start' }}>
              <DownloadCard
                torrent={torrent}
                posterUrl={imageMap[torrent.info_hash.toLowerCase()]?.posterUrl}
                backdropUrl={imageMap[torrent.info_hash.toLowerCase()]?.backdropUrl}
                displayTitle={displayTitleMap[torrent.info_hash.toLowerCase()]}
                onOpenDetail={handleOpenDetail}
              />
            </div>
          ))}
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

      <div className="pt-8 pb-12 flex-1 safe-area-bottom">
        <div className="px-12 mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 tracking-tight">{t('downloads.title')}</h1>
            <p className="text-white/40 text-lg font-medium">{t('downloads.activeDownloads', { count: torrents.length, plural: torrents.length > 1 ? 's' : '' })}</p>
          </div>
          <div className="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl">
             <button onClick={() => setShowAddMagnetModal(true)} className="w-12 h-12 rounded-2xl hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"><Link2 size={24} /></button>
             <button onClick={() => setShowSessionLogsModal(true)} className="w-12 h-12 rounded-2xl hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"><LogsIcon size={24} /></button>
          </div>
        </div>

        {torrents.length === 0 ? (
          <div className="px-12 mt-12 flex flex-col items-center justify-center py-32 text-center bg-white/[0.02] border border-white/5 rounded-[3rem] mx-12 backdrop-blur-sm">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-inner">
               <HardDrive size={40} className="text-white/20" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">{t('downloads.noActiveDownloads')}</h2>
            <p className="text-white/30 text-lg max-w-md">{t('downloads.torrentsWillAppear')}</p>
          </div>
        ) : (
          <div>
            {renderCarousel("Films", moviesTorrents)}
            {renderCarousel("Séries", seriesTorrents)}
            {renderCarousel("Autres", otherTorrents)}
          </div>
        )}
      </div>

      {showAddMagnetModal && createPortal(
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={(e)=>e.target===e.currentTarget&&setShowAddMagnetModal(false)}>
            <div className="bg-neutral-900 border border-white/10 p-10 rounded-[2.5rem] max-w-2xl w-full shadow-2xl transition-transform">
               <h2 className="text-4xl font-bold mb-8 text-white">{t('downloads.addMagnetLink')}</h2>
               <textarea value={magnetLink} onChange={(e)=>setMagnetLink(e.target.value)} className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-6 text-white placeholder-white/10 mb-8 focus:outline-none focus:border-[var(--ds-accent-violet)] transition-colors" placeholder="magnet:?xt=urn:btih:..." />
               <div className="flex justify-end gap-4">
                 <button onClick={()=>setShowAddMagnetModal(false)} className="px-10 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors">Annuler</button>
                 <button onClick={async ()=>{
                    setAddingTorrent(true);
                    try {
                        const name = magnetLink.match(/dn=([^&]+)/) ? decodeURIComponent(magnetLink.match(/dn=([^&]+)/)![1]) : 'Torrent';
                        await clientApi.addMagnetLink(magnetLink, name, false);
                        setShowAddMagnetModal(false); setMagnetLink(''); loadTorrents();
                    } catch(e) { } finally { setAddingTorrent(false); }
                 }} className="px-10 py-4 rounded-2xl bg-[var(--ds-accent-violet)] text-white font-bold shadow-lg shadow-purple-500/20">{addingTorrent ? 'Ajout...' : 'Ajouter'}</button>
               </div>
            </div>
          </div>, document.body
      )}

      {showLogsModal && createPortal(
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={()=>setShowLogsModal(false)}>
          <div className="bg-neutral-900 border border-white/10 p-10 rounded-[2.5rem] max-w-5xl w-full h-[80vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
             <div className="flex justify-between items-center mb-8">
               <h2 className="text-3xl font-bold text-white">Logs du Torrent</h2>
               <button onClick={()=>setShowLogsModal(false)} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-white/50 hover:text-white transition-all"><X size={24}/></button>
             </div>
             <div className="flex-1 overflow-y-auto bg-black/40 rounded-3xl p-6 font-mono text-sm text-white/60 custom-scrollbar border border-white/5">
                {logsLoading ? <div className="flex items-center justify-center h-full"><HLSLoadingSpinner size="md" /></div> : (
                  logs.length > 0 ? logs.map((l, i) => (
                    <div key={i} className={`py-1 border-b border-white/5 last:border-0 ${l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARN' ? 'text-amber-400' : ''}`}>
                      <span className="opacity-30">[{new Date(l.timestamp).toLocaleTimeString()}]</span> <span className="font-bold opacity-50">[{l.level}]</span> {l.message}
                    </div>
                  )) : "Aucun log disponible"
                )}
             </div>
          </div>
        </div>, document.body
      )}

      {showSessionLogsModal && createPortal(
         <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={()=>setShowSessionLogsModal(false)}>
            <div className="bg-neutral-900 border border-white/10 p-10 rounded-[2.5rem] max-w-5xl w-full h-[80vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
               <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-bold text-white">Logs Session</h2>
                  <button onClick={()=>setShowSessionLogsModal(false)} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-white/50 hover:text-white transition-all"><X size={24}/></button>
               </div>
               <div className="flex-1 overflow-y-auto bg-black/40 rounded-3xl p-6 font-mono text-sm text-white/40 custom-scrollbar border border-white/5 whitespace-pre-wrap">
                  {sessionLogsLines.length > 0 ? sessionLogsLines.join('\n') : "En attente de logs..."}
               </div>
            </div>
         </div>, document.body
      )}

      {selectedTorrent && (
        <DownloadDetailModal 
          torrent={selectedTorrent} 
          onClose={handleCloseDetail} 
          onPause={(h) => { clientApi.pauseTorrent(h); loadTorrents(); }} 
          onResume={(h) => { clientApi.resumeTorrent(h); loadTorrents(); }} 
          onRemove={async (h, d) => { if(confirm("Supprimer ?")) { await clientApi.removeTorrent(h, d); loadTorrents(); return true; } return false; }} 
          onShowLogs={handleShowLogs} 
          posterUrl={selectedTorrentPoster} 
          backdropUrl={selectedTorrentBackdrop} 
        />
      )}
    </div>
  );
}