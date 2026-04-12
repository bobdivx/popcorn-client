import { useState, useEffect, useRef } from 'preact/hooks';
import { Download, Upload, Sprout, Users, Film } from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { FocusableCard } from '../ui/FocusableCard';
import { useI18n } from '../../lib/i18n/useI18n';
import { getBackendUrl } from '../../lib/backend-config';
import { TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';

/** Nettoie le nom brut du torrent pour affichage (sans codec, résolution, etc.) */
function cleanTorrentName(name: string | undefined): string {
  if (!name || !name.trim()) return '';
  return name
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:x264|x265|HEVC|HDR|DTS|AC3|BluRay|WEB-DL|REMUX|4K|1080p|720p|480p|BDRip|WEBRip|DVDRip|FRENCH|VOSTFR|VF)\b/gi, '')
    .replace(/S\d{2}E\d{2}/gi, '')
    .replace(/Season\s+\d+/gi, '')
    .trim();
}

interface DownloadCardProps {
  torrent: ClientTorrentStats;
  /** Images fournies par la liste (évite un fetch par carte) */
  posterUrl?: string | null;
  backdropUrl?: string | null;
  /** Titre nettoyé (ex. depuis MediaDetail), sinon dérivé de torrent.name */
  displayTitle?: string | null;
  onOpenDetail?: (torrent: ClientTorrentStats, posterUrl?: string | null, backdropUrl?: string | null) => void;
}

export function DownloadCard({ torrent, posterUrl: posterUrlProp, backdropUrl: backdropUrlProp, displayTitle: displayTitleProp, onOpenDetail }: DownloadCardProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [posterUrlLocal, setPosterUrlLocal] = useState<string | null>(null);
  const [backdropUrlLocal, setBackdropUrlLocal] = useState<string | null>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const posterUrl = posterUrlProp ?? posterUrlLocal;
  const backdropUrl = backdropUrlProp ?? backdropUrlLocal;
  const displayTitle = (displayTitleProp && displayTitleProp.trim()) || cleanTorrentName(torrent.name) || torrent.name || '';

  // Fallback : charger l'image TMDB seulement si la liste n'a pas fourni d'images
  useEffect(() => {
    if (posterUrlProp != null || backdropUrlProp != null) return;
    if (posterUrlLocal && backdropUrlLocal) return;

    const loadTmdbImage = async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const baseUrl = (getBackendUrl() || serverApi.getServerUrl()).trim().replace(/\/$/, '');
        const token = serverApi.getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        
        // Chercher par info_hash dans la liste des torrents enrichis (plus fiable que par nom)
        const response = await fetch(`${baseUrl}/api/torrents/list?limit=200`, { headers });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.data && Array.isArray(data.data)) {
            // Chercher par info_hash d'abord (correspondance exacte, plus rapide et fiable)
            let matchingTorrent = data.data.find((t: any) => 
              t.infoHash === torrent.info_hash || 
              t.info_hash === torrent.info_hash ||
              (t.infoHash && t.infoHash.toLowerCase() === torrent.info_hash.toLowerCase()) ||
              (t.info_hash && t.info_hash.toLowerCase() === torrent.info_hash.toLowerCase())
            );
            
            // Si pas trouvé par info_hash, chercher par nom nettoyé (fallback)
            if (!matchingTorrent && torrent.name) {
              const cleanTitle = torrent.name
                .replace(/\./g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/\b\d{4}\b/g, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\(.*?\)/g, '')
                .replace(/\b(?:x264|x265|HEVC|HDR|DTS|AC3|BluRay|WEB-DL|REMUX|4K|1080p|720p|480p|BDRip|WEBRip|DVDRip|FRENCH|VOSTFR|VF)\b/gi, '')
                .replace(/S\d{2}E\d{2}/gi, '')
                .replace(/Season\s+\d+/gi, '')
                .trim();
              
              if (cleanTitle && cleanTitle.length >= 3) {
                const cleanLower = cleanTitle.toLowerCase();
                matchingTorrent = data.data.find((t: any) => {
                  const torrentName = (t.name || t.cleanTitle || '').toLowerCase();
                  const torrentCleanTitle = (t.cleanTitle || t.name || '').toLowerCase();
                  
                  const nameMatch = torrentName.includes(cleanLower) || 
                                    cleanLower.includes(torrentName.split(' ')[0] || '') ||
                                    torrentCleanTitle.includes(cleanLower) ||
                                    cleanLower.includes(torrentCleanTitle.split(' ')[0] || '');
                  
                  const hasImage = t.imageUrl || t.heroImageUrl || t.poster_url || t.hero_image_url;
                  
                  return nameMatch && hasImage;
                });
              }
            }
            
            if (matchingTorrent) {
              const image = matchingTorrent.imageUrl || matchingTorrent.poster_url || matchingTorrent.poster;
              const backdrop = matchingTorrent.heroImageUrl || matchingTorrent.hero_image_url || matchingTorrent.backdrop;
              
              if (image && typeof image === 'string' && image.length > 0) {
                setPosterUrl(image);
              }
              if (backdrop && typeof backdrop === 'string' && backdrop.length > 0) {
                setBackdropUrl(backdrop);
              }
            }
          }
        }
      } catch {
        // Échec silencieux : requête cross-origin (CORS) ou API indisponible ; l’image reste optionnelle
      }
    };

    loadTmdbImage();
  }, [torrent.info_hash, torrent.name, posterUrlProp, backdropUrlProp, posterUrlLocal, backdropUrlLocal]);

  const progressColor = torrent.state === 'downloading' ? 'bg-[var(--ds-accent-violet)]' :
                        torrent.state === 'seeding' ? 'bg-[var(--ds-accent-green)]' :
                        torrent.state === 'completed' ? 'bg-[var(--ds-accent-green)]' :
                        'bg-[var(--ds-surface-elevated)]';

  const isActive = torrent.state === 'downloading' || torrent.state === 'seeding';
  const showPulse = isActive && (torrent.download_speed > 0 || torrent.upload_speed > 0);
  const showOverlay = isHovered || isFocused;

  return (
    <div
      ref={cardContainerRef}
      data-torrent-card
      className="relative w-full max-w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className={`group text-left rounded-2xl overflow-hidden border transition focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] w-full block ${
           isFocused || isHovered ? 'border-[var(--ds-accent-violet)]/50 bg-[var(--ds-accent-violet)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}
        tabIndex={0}
        ariaLabel={displayTitle || torrent.name}
        onFocus={(e) => {
          setIsFocused(true);
          setIsHovered(true);
          (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'center' });
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsHovered(false);
        }}
        onClick={(e) => {
          if (onOpenDetail && !(e.target as HTMLElement).closest('button, a')) {
            onOpenDetail(torrent, posterUrl, backdropUrl);
          }
        }}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-black/30">
          {/* Background image: priority to backdrop, otherwise fallback to blurred poster */}
          {backdropUrl ? (
            <img src={backdropUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover z-0" />
          ) : posterUrl ? (
            <>
              <div
                className="absolute inset-0 opacity-50 z-0"
                style={{
                  backgroundImage: `url(${posterUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(20px)',
                }}
              />
              <img src={posterUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain z-0" />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-white/10 via-black/40 to-black/80 z-0 p-2 text-white/20">
               <Film className="w-8 h-8 tv:w-10 tv:h-10 mb-2 shrink-0" size={40} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />

          {/* Badge d'état en haut à gauche */}
          <div className="absolute left-3 top-3 z-20">
            <TorrentStatusBadge state={torrent.state} className="px-2.5 py-1 rounded-full text-[10px] tv:text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90" />
          </div>

          {/* Badges de stats, top right */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 items-end">
            {torrent.download_speed > 0 && (
              <div className="bg-[var(--ds-accent-violet)]/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg border border-white/15">
                <Download className="w-3 h-3 tv:w-3.5 tv:h-3.5" strokeWidth={2.5} size={14} />
                <span className="font-semibold tracking-wide">{formatSpeed(torrent.download_speed)}</span>
              </div>
            )}
            {torrent.upload_speed > 0 && (
              <div className="bg-[var(--ds-accent-green)]/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg border border-white/15">
                <Upload className="w-3 h-3 tv:w-3.5 tv:h-3.5" strokeWidth={2.5} size={14} />
                <span className="font-semibold tracking-wide">{formatSpeed(torrent.upload_speed)}</span>
              </div>
            )}
            {torrent.seeders > 0 && (
              <div className="bg-[var(--ds-accent-green)]/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg border border-white/15">
                <Sprout className="w-3 h-3 tv:w-3.5 tv:h-3.5" strokeWidth={2.5} size={14} />
                <span className="font-semibold">{torrent.seeders}</span>
              </div>
            )}
            {(torrent.peers_connected > 0 || torrent.peers_total > 0) && (
              <div className="bg-[var(--ds-accent-violet-muted)] backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5 text-[10px] tv:text-xs text-[var(--ds-accent-violet)] shadow-lg border border-[var(--ds-accent-violet)]/30">
                <Users className="w-3 h-3 tv:w-3.5 tv:h-3.5" strokeWidth={2.5} size={14} />
                <span className="font-semibold">{torrent.peers_connected || torrent.peers_total}</span>
              </div>
            )}
            {torrent.is_private && (
              <div className="bg-[var(--ds-accent-yellow)]/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1.5 text-[10px] tv:text-xs text-black shadow-lg border border-[var(--ds-accent-yellow)]/30">
                <span className="font-medium text-[10px]">🔒 Privé</span>
              </div>
            )}
          </div>

          <div className="absolute right-3 bottom-4 w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-black/40 text-white/90 group-hover:bg-[var(--ds-accent-violet)] group-hover:text-white transition z-20 shadow-lg">
             <Film className="w-5 h-5 ml-0.5" strokeWidth={2} />
          </div>

          {/* Barre de progression */}
          <div className="absolute bottom-0 left-0 right-0 h-1 tv:h-1.5 bg-black/40 z-20">
            <div
              className={`${progressColor} h-full transition-all duration-500 ${showPulse ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}`}
              style={{ width: `${torrent.progress * 100}%` }}
            />
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-transparent relative z-10 text-left">
          <div className="text-base font-semibold text-white/90 truncate" title={displayTitle}>
            {displayTitle || torrent.name}
          </div>
          
          <div className="flex flex-wrap items-center gap-[6px] text-xs text-white/50 mt-1.5">
            <span>{formatBytes(torrent.downloaded_bytes)} / {formatBytes(torrent.total_bytes)}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="font-medium text-white/70">{(torrent.progress * 100).toFixed(1)}%</span>
            {torrent.eta_seconds && torrent.eta_seconds > 0 ? (
              <>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>ETA: {formatETA(torrent.eta_seconds)}</span>
              </>
            ) : null}
          </div>
          
          {torrent.status_reason && (
             <div className="text-xs text-[var(--ds-accent-yellow)] mt-1.5 line-clamp-1 opacity-80">
                {torrent.status_reason}
             </div>
          )}
        </div>
      </FocusableCard>
    </div>
  );
}
