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

  // Le focus est géré par `FocusableCard` (onFocus/onBlur) pour éviter des listeners DOM par carte.

  return (
    <div
      ref={cardContainerRef}
      data-torrent-card
      className="relative group cursor-pointer torrent-poster min-w-0 w-full max-w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full max-w-full"
        tabIndex={0}
        ariaLabel={displayTitle || torrent.name}
        onFocus={(e) => {
          setIsFocused(true);
          setIsHovered(true);
          (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
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
        <div className="relative aspect-[2/3] overflow-hidden bg-[var(--ds-surface)] shadow-lg rounded-[var(--ds-radius-sm)] tv:rounded-xl w-full">
          {/* Image backdrop en arrière-plan avec blur */}
          {backdropUrl && (
            <div
              className="absolute inset-0 opacity-30 z-0 transition-opacity duration-300"
              style={{
                backgroundImage: `url(${backdropUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(20px)',
              }}
            />
          )}
          
          {/* Poster TMDB au premier plan */}
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={torrent.name}
              className="w-full h-full object-cover relative z-10"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[var(--ds-surface)] to-[var(--ds-surface-elevated)] relative z-10 p-2 tv:p-3">
              <Film className="w-8 h-8 tv:w-10 tv:h-10 mb-1 tv:mb-2 text-[var(--ds-text-tertiary)] shrink-0" size={40} />
              <p className="text-[10px] tv:text-xs ds-text-secondary line-clamp-2 text-center w-full">{displayTitle || torrent.name}</p>
              <p className="text-[9px] tv:text-[10px] ds-text-tertiary mt-1 text-center leading-tight" title={t('downloads.notLinkedToTmdb')}>
                {t('downloads.notLinkedToTmdbShort')}
              </p>
            </div>
          )}

          {/* Badge d'état en haut à gauche - compact sur TV */}
          <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 tv:top-2 tv:left-2 z-20">
            <TorrentStatusBadge state={torrent.state} className="px-1.5 py-0.5 tv:px-2 tv:py-1 text-[10px] tv:text-xs shadow-lg" />
          </div>

          {/* Badges de stats */}
          <div className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 tv:top-2 tv:right-2 z-20 flex flex-col gap-1 tv:gap-1.5 items-end">
            {torrent.download_speed > 0 && (
              <div className="bg-[var(--ds-accent-violet)]/90 backdrop-blur-sm rounded-[var(--ds-radius-sm)] px-1.5 py-0.5 tv:px-2 tv:py-1 flex items-center gap-1 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg">
                <Download className="w-2.5 h-2.5 tv:w-3 tv:h-3" size={14} />
                <span className="font-semibold">{formatSpeed(torrent.download_speed)}</span>
              </div>
            )}
            {torrent.upload_speed > 0 && (
              <div className="bg-[var(--ds-accent-green)]/90 backdrop-blur-sm rounded-[var(--ds-radius-sm)] px-1.5 py-0.5 tv:px-2 tv:py-1 flex items-center gap-1 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg">
                <Upload className="w-2.5 h-2.5 tv:w-3 tv:h-3" size={14} />
                <span className="font-semibold">{formatSpeed(torrent.upload_speed)}</span>
              </div>
            )}
            {torrent.seeders > 0 && (
              <div className="bg-[var(--ds-accent-green)]/90 backdrop-blur-sm rounded-[var(--ds-radius-sm)] px-1.5 py-0.5 tv:px-2 tv:py-1 flex items-center gap-1 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg">
                <Sprout className="w-2.5 h-2.5 tv:w-3 tv:h-3" size={14} />
                <span className="font-semibold">{torrent.seeders}</span>
              </div>
            )}
            {(torrent.peers_connected > 0 || torrent.peers_total > 0) && (
              <div className="bg-[var(--ds-accent-violet-muted)] backdrop-blur-sm rounded-[var(--ds-radius-sm)] px-1.5 py-0.5 tv:px-2 tv:py-1 flex items-center gap-1 text-[10px] tv:text-xs text-[var(--ds-accent-violet)] shadow-lg border border-[var(--ds-border)]">
                <Users className="w-2.5 h-2.5 tv:w-3 tv:h-3" size={14} />
                <span className="font-semibold">{torrent.peers_connected || torrent.peers_total}</span>
              </div>
            )}
          </div>

          {/* Barre de progression */}
          <div className="absolute bottom-0 left-0 right-0 h-1 tv:h-1.5 bg-[var(--ds-surface)]/80 z-20">
            <div
              className={`${progressColor} h-full transition-all duration-500 ${showPulse ? 'animate-pulse' : ''}`}
              style={{ width: `${torrent.progress * 100}%` }}
            />
          </div>

          {/* Overlay au survol/focus */}
          {showOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end p-2 lg:p-3 tv:p-3 transition-opacity pointer-events-none z-30">
              <div className="space-y-1 tv:space-y-2">
                <h3 className="text-[var(--ds-text-primary)] font-semibold text-xs lg:text-sm tv:text-sm line-clamp-2">
                  {displayTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 tv:gap-2 text-[10px] tv:text-xs ds-text-secondary">
                  <span>{formatBytes(torrent.downloaded_bytes)} / {formatBytes(torrent.total_bytes)}</span>
                  <span>•</span>
                  <span className="font-semibold">{(torrent.progress * 100).toFixed(1)}%</span>
                  {torrent.eta_seconds && torrent.eta_seconds > 0 && (
                    <>
                      <span>•</span>
                      <span>ETA: {formatETA(torrent.eta_seconds)}</span>
                    </>
                  )}
                </div>
                {torrent.status_reason && (
                  <div className="text-[10px] tv:text-xs text-[var(--ds-accent-yellow)] mt-0.5 line-clamp-2">
                    {torrent.status_reason}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Badge privé */}
          {torrent.is_private && (
            <div className="absolute bottom-1.5 left-1.5 lg:bottom-2 lg:left-2 tv:bottom-2 tv:left-2 z-20">
              <div className="bg-[var(--ds-accent-yellow)]/90 backdrop-blur-sm rounded-[var(--ds-radius-sm)] px-1.5 py-0.5 tv:px-2 tv:py-1 text-[10px] tv:text-xs text-[var(--ds-text-on-accent)] shadow-lg flex items-center gap-1">
                <span>🔒</span>
                <span className="font-medium">{t('downloads.private')}</span>
              </div>
            </div>
          )}
        </div>
        {/* Titre sous le poster */}
        {displayTitle && (
          <p className="mt-1.5 tv:mt-2 text-[10px] sm:text-xs tv:text-xs ds-text-secondary line-clamp-2 px-0.5" title={displayTitle}>
            {displayTitle}
          </p>
        )}
      </FocusableCard>
    </div>
  );
}
