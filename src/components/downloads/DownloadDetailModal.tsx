import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { 
  ArrowLeft, Download, Upload, Sprout, Users, Play, Pause, 
  Trash2, Info, Film, Clock, HardDrive, Copy, X, Pencil, 
  PlusCircle, ExternalLink, Settings2, ChevronDown, ChevronUp,
  FileText as LogsIcon
} from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { clientApi } from '../../lib/client/api';
import { TorrentProgressBar, TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';
import { saveDownloadClientStats } from '../../lib/utils/download-meta-storage';

interface DownloadDetailModalProps {
  torrent: ClientTorrentStats;
  onClose: () => void;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string, deleteFiles: boolean) => Promise<boolean>;
  onShowLogs: (infoHash: string) => void;
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

export function DownloadDetailModal({ 
  torrent, 
  onClose, 
  onPause, 
  onResume, 
  onRemove, 
  onShowLogs,
  posterUrl,
  backdropUrl 
}: DownloadDetailModalProps) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isRemovingRef = useRef(false);
  
  const [statsV1, setStatsV1] = useState<Record<string, any> | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTrackerUrl, setNewTrackerUrl] = useState('');
  const [addTrackerLoading, setAddTrackerLoading] = useState(false);

  // Background stats polling
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsV1(await clientApi.getTorrentStatsV1(torrent.info_hash));
      } catch (e) {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [torrent.info_hash]);

  // Fetch path and trackers once
  useEffect(() => {
    (async () => {
      try {
        setDownloadPath(await clientApi.getTorrentDownloadPath(torrent.info_hash));
        setTrackers(await clientApi.getTorrentTrackers(torrent.info_hash));
      } catch (e) {}
    })();
  }, [torrent.info_hash]);

  const live = statsV1?.live;
  const downSpeed = live?.download_speed?.human_readable || formatSpeed(torrent.download_speed);
  const upSpeed = live?.upload_speed?.human_readable || formatSpeed(torrent.upload_speed);
  const eta = live?.time_remaining?.human_readable || formatETA(torrent.eta_seconds);
  const peers = live?.snapshot?.peer_stats?.live ?? (torrent.peers_connected || 0);

  // Focus management
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleAddTracker = async () => {
    if (!newTrackerUrl.trim()) return;
    setAddTrackerLoading(true);
    try {
      await clientApi.addTracker(torrent.info_hash, newTrackerUrl.trim());
      setTrackers(await clientApi.getTorrentTrackers(torrent.info_hash));
      setNewTrackerUrl('');
    } catch (e) {} finally { setAddTrackerLoading(false); }
  };

  const StatCard = ({ icon: Icon, label, value, colorClass }: any) => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col gap-1 backdrop-blur-sm group hover:bg-white/10 transition-all">
      <div className="flex items-center gap-2 text-[var(--ds-text-tertiary)] group-hover:text-white/80 transition-colors">
        <Icon size={16} className={colorClass} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg sm:text-2xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );

  const ActionTile = ({ icon: Icon, label, onClick, className = "", danger = false }: any) => (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border transition-all duration-300 gap-3 
        ${danger 
          ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40' 
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        } ${className}`}
    >
      <div className={`p-3 rounded-full transition-transform group-hover:scale-110 ${danger ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-white'}`}>
        <Icon size={24} />
      </div>
      <span className={`text-sm font-bold tracking-wide ${danger ? 'text-red-400' : 'text-white/90'}`}>{label}</span>
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 tv:p-12 animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Immersive backdrop */}
      <div className="absolute inset-0 bg-black/90 pointer-events-none" />
      {backdropUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-[60px] scale-110 pointer-events-none"
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}

      <div className="relative w-full max-w-7xl max-h-[90vh] bg-neutral-900/50 border border-white/10 rounded-3xl backdrop-blur-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-white/5">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-semibold">{t('common.back')}</span>
          </button>
          <TorrentStatusBadge state={torrent.state} className="scale-110" />
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Sidebar - Poster & Basic Info */}
          <div className="w-full lg:w-96 p-8 border-b lg:border-b-0 lg:border-r border-white/5 bg-white/[0.02]">
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl mb-8 group">
              {posterUrl ? (
                <img src={posterUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={torrent.name} />
              ) : (
                <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                  <Film size={80} className="text-white/10" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-4 line-clamp-2 leading-tight">
              {torrent.name}
            </h1>

            <div className="space-y-6">
              <TorrentProgressBar 
                progress={torrent.progress} 
                downloadedBytes={torrent.downloaded_bytes} 
                totalBytes={torrent.total_bytes} 
                statusLabel="Progression"
                progressColor={torrent.state === 'downloading' ? 'blue' : 'green'}
              />
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40 uppercase tracking-widest font-bold">Taille Totale</span>
                <span className="text-white font-mono">{formatBytes(torrent.total_bytes)}</span>
              </div>
            </div>
          </div>

          {/* Main Content - Stats & Actions */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={Download} label="Download" value={downSpeed} colorClass="text-blue-400" />
              <StatCard icon={Upload} label="Upload" value={upSpeed} colorClass="text-emerald-400" />
              <StatCard icon={Users} label="Peers" value={peers} colorClass="text-purple-400" />
              <StatCard icon={Clock} label="ETA" value={eta} colorClass="text-amber-400" />
            </div>

            <div className="mb-10">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">Commandes</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {torrent.state === 'paused' ? (
                  <ActionTile icon={Play} label="Reprendre" onClick={() => onResume(torrent.info_hash)} className="bg-emerald-500/10 border-emerald-500/20" />
                ) : (
                  <ActionTile icon={Pause} label="Pause" onClick={() => onPause(torrent.info_hash)} />
                )}
                <ActionTile icon={LogsIcon || Info} label="Logs" onClick={() => onShowLogs(torrent.info_hash)} />
                <ActionTile icon={ExternalLink} label="Détail" onClick={() => (window.location.href = `/torrents?infoHash=${torrent.info_hash}`)} />
                <ActionTile icon={Trash2} label="Supprimer" onClick={() => onRemove(torrent.info_hash, false)} danger />
              </div>
            </div>

            {/* Advanced Toggle */}
            <div className="bg-white/[0.03] rounded-3xl border border-white/5 overflow-hidden">
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl text-white/60">
                    <Settings2 size={20} />
                  </div>
                  <span className="font-bold text-white/80">Informations Techniques</span>
                </div>
                {showAdvanced ? <ChevronUp className="text-white/40" /> : <ChevronDown className="text-white/40" />}
              </button>

              {showAdvanced && (
                <div className="p-6 pt-0 space-y-8 animate-in slide-in-from-top-4 duration-300">
                  <div className="grid gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Lien du Torrent (Info Hash)</label>
                       <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                         <span className="font-mono text-sm text-white/50 truncate flex-1">{torrent.info_hash}</span>
                         <button onClick={() => navigator.clipboard.writeText(torrent.info_hash)} className="p-2 hover:bg-white/5 rounded-lg text-white/40 transition-colors"><Copy size={16}/></button>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Chemin de Téléchargement</label>
                       <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5 text-white/50 text-sm font-mono break-all capitalize">
                         <HardDrive size={16} className="shrink-0" />
                         {downloadPath || "Chemin inconnu"}
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Trackers Actifs</label>
                      <span className="text-xs bg-white/5 px-2 py-1 rounded-full text-white/40">{trackers.length} actifs</span>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newTrackerUrl} 
                        onChange={(e: any) => setNewTrackerUrl(e.target.value)}
                        placeholder="Ajouter un tracker (URL)..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[var(--ds-accent-violet)]"
                      />
                      <button 
                        onClick={handleAddTracker}
                        disabled={addTrackerLoading}
                        className="p-2 bg-[var(--ds-accent-violet)] rounded-xl text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <PlusCircle size={20} />
                      </button>
                    </div>
                    <ul className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {trackers.map((t, i) => (
                        <li key={i} className="text-[10px] font-mono text-white/30 truncate py-1 border-b border-white/5 last:border-0">{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
