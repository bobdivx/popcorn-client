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

  const progressColor = torrent.state === 'downloading' ? 'bg-blue-500' :
                        torrent.state === 'seeding' ? 'bg-green-500' :
                        torrent.state === 'completed' ? 'bg-green-600' :
                        'bg-gray-600';

  const isActive = torrent.state === 'downloading' || torrent.state === 'seeding';
  const showPulse = isActive && (torrent.download_speed > 0 || torrent.upload_speed > 0);
  const showOverlay = isHovered || isFocused;

  // Gérer le focus pour l'overlay (survol / focus TV)
  useEffect(() => {
    const container = cardContainerRef.current;
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (container.contains(target) && (target.matches('.card-tv') || target.tabIndex >= 0)) {
        setIsFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!container.contains(relatedTarget)) {
        setIsFocused(false);
      }
    };

    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);

    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

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
        tabIndex={showOverlay ? -1 : 0}
        onClick={(e) => {
          if (onOpenDetail && !(e.target as HTMLElement).closest('button, a')) {
            onOpenDetail(torrent, posterUrl, backdropUrl);
          }
        }}
      >
        <div className="relative aspect-[2/3] overflow-hidden bg-gray-900 shadow-lg rounded-lg w-full">
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
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 relative z-10">
              <div className="text-center p-4">
                <Film className="w-12 h-12 mb-2 text-gray-400 mx-auto" size={48} />
                <p className="text-xs text-gray-400 line-clamp-2">{displayTitle || torrent.name}</p>
              </div>
            </div>
          )}

          {/* Badge d'état en haut à gauche */}
          <div className="absolute top-2 left-2 lg:top-3 lg:left-3 tv:top-4 tv:left-4 z-20">
            <TorrentStatusBadge state={torrent.state} className="px-2 py-1 text-xs tv:text-sm shadow-lg" />
          </div>

          {/* Badges de stats conditionnelles en haut à droite */}
          <div className="absolute top-2 right-2 lg:top-3 lg:right-3 tv:top-4 tv:right-4 z-20 flex flex-col gap-1.5 tv:gap-2 items-end">
            {/* Download speed - uniquement si > 0 */}
            {torrent.download_speed > 0 && (
              <div className="bg-blue-600/90 backdrop-blur-sm rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 tv:gap-2 text-xs tv:text-sm text-white shadow-lg">
                <Download className="w-3 h-3 tv:w-4 tv:h-4" size={16} />
                <span className="font-semibold">{formatSpeed(torrent.download_speed)}</span>
              </div>
            )}
            
            {/* Upload speed - uniquement si > 0 */}
            {torrent.upload_speed > 0 && (
              <div className="bg-green-600/90 backdrop-blur-sm rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 tv:gap-2 text-xs tv:text-sm text-white shadow-lg">
                <Upload className="w-3 h-3 tv:w-4 tv:h-4" size={16} />
                <span className="font-semibold">{formatSpeed(torrent.upload_speed)}</span>
              </div>
            )}
            
            {/* Seeds - uniquement si > 0 */}
            {torrent.seeders > 0 && (
              <div className="bg-green-500/90 backdrop-blur-sm rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 tv:gap-2 text-xs tv:text-sm text-white shadow-lg">
                <Sprout className="w-3 h-3 tv:w-4 tv:h-4" size={16} />
                <span className="font-semibold">{torrent.seeders}</span>
              </div>
            )}
            
            {/* Peers - uniquement si > 0 */}
            {(torrent.peers_connected > 0 || torrent.peers_total > 0) && (
              <div className="bg-blue-500/90 backdrop-blur-sm rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-1.5 tv:gap-2 text-xs tv:text-sm text-white shadow-lg">
                <Users className="w-3 h-3 tv:w-4 tv:h-4" size={16} />
                <span className="font-semibold">{torrent.peers_connected || torrent.peers_total}</span>
              </div>
            )}
          </div>

          {/* Barre de progression en bas */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 tv:h-2 bg-gray-900/50 z-20">
            <div
              className={`${progressColor} h-full transition-all duration-500 ${showPulse ? 'animate-pulse' : ''}`}
              style={{ width: `${torrent.progress * 100}%` }}
            />
          </div>

          {/* Overlay au survol/focus avec infos et actions */}
          {showOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 transition-opacity pointer-events-none z-30">
              <div className="space-y-2 tv:space-y-3">
                <h3 className="text-white font-semibold text-sm lg:text-base tv:text-lg line-clamp-2">
                  {displayTitle}
                </h3>
                
                {/* Infos de progression */}
                <div className="flex items-center gap-2 text-xs lg:text-sm tv:text-base text-gray-300">
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
                  <div className="text-xs lg:text-sm tv:text-base text-yellow-300 mt-1 line-clamp-2">
                    {torrent.status_reason}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Badge privé si applicable */}
          {torrent.is_private && (
            <div className="absolute bottom-2 left-2 lg:bottom-3 lg:left-3 tv:bottom-4 tv:left-4 z-20">
              <div className="bg-orange-600/90 backdrop-blur-sm rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 text-xs tv:text-sm text-white shadow-lg flex items-center gap-1">
                <span>🔒</span>
                <span className="font-medium">{t('downloads.private')}</span>
              </div>
            </div>
          )}
        </div>
        {/* Titre nettoyé sous le poster */}
        {displayTitle && (
          <p className="mt-2 text-xs sm:text-sm tv:text-base text-gray-300 line-clamp-2 px-0.5" title={displayTitle}>
            {displayTitle}
          </p>
        )}
      </FocusableCard>
    </div>
  );
}
