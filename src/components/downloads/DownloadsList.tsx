import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { Download, Pause, Play, Trash2, Plus, FileText, Link2, X, FileText as LogsIcon, Lock } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import type { ClientTorrentStats, TorrentLogEntry } from '../../lib/client/types';
import { FocusableCard } from '../ui/FocusableCard';
import { getBackendUrl } from '../../lib/backend-config';

const REFRESH_INTERVAL = 2000; // Rafraîchir toutes les 2 secondes

interface TorrentCardProps {
  torrent: ClientTorrentStats;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string, deleteFiles: boolean) => void;
  onShowLogs: (infoHash: string) => void;
}

/**
 * Composant pour afficher une carte de téléchargement
 */
function TorrentCard({ torrent, onPause, onResume, onRemove, onShowLogs }: TorrentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tmdbImage, setTmdbImage] = useState<string | null>(null);
  
  // Animation de progression
  const progressBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressBarRef.current && torrent.state === 'downloading') {
      // Animation fluide de la barre de progression
      progressBarRef.current.style.transition = 'width 0.5s ease-out';
    }
  }, [torrent.progress, torrent.state]);
  
  // Indicateur visuel d'activité
  const isActive = torrent.state === 'downloading' || torrent.state === 'seeding';
  const showPulse = isActive && (torrent.download_speed > 0 || torrent.upload_speed > 0);
  
  // Charger l'image TMDB depuis le nom du torrent (même logique que sync torrent backend)
  useEffect(() => {
    if (!torrent.name || tmdbImage) return;

    const loadTmdbImage = async () => {
      try {
        // Nettoyer le nom du torrent (même logique que sync torrent backend)
        const cleanTitle = torrent.name
          .replace(/\./g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\b\d{4}\b/g, '') // Supprimer l'année (mot entier)
          .replace(/\[.*?\]/g, '') // Supprimer les tags [1080p], [HDR], etc.
          .replace(/\(.*?\)/g, '') // Supprimer les parenthèses
          .replace(/\b(?:x264|x265|HEVC|HDR|DTS|AC3|BluRay|WEB-DL|REMUX|4K|1080p|720p|480p|BDRip|WEBRip|DVDRip|FRENCH|VOSTFR|VF)\b/gi, '') // Supprimer les qualités/codecs/langues
          .replace(/S\d{2}E\d{2}/gi, '') // Supprimer S01E01 pour les séries
          .replace(/Season\s+\d+/gi, '') // Supprimer Season 1
          .trim();

        if (!cleanTitle || cleanTitle.length < 3) return;

        // Rechercher dans les torrents enrichis via /api/torrents/list
        // Cet endpoint retourne les torrents depuis cached_torrents avec données TMDB enrichies
        const { serverApi } = await import('../../lib/client/server-api');
        // /api/torrents/list est exposé par le backend Rust (pas par Astro en dev).
        // Donc on utilise l'URL backend configurée pour éviter les 404 sur localhost:4326.
        const baseUrl = (getBackendUrl() || serverApi.getServerUrl()).trim().replace(/\/$/, '');
        const token = serverApi.getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        
        // Utiliser /api/torrents/list (list_torrents_enriched) qui retourne les torrents enrichis depuis la DB
        // Limiter à 200 résultats pour rechercher un match par nom
        const response = await fetch(`${baseUrl}/api/torrents/list?limit=200`, { headers });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.data && Array.isArray(data.data) && data.data.length > 0) {
            // Chercher un torrent avec un nom similaire qui a une image TMDB
            const cleanLower = cleanTitle.toLowerCase();
            const matchingTorrent = data.data.find((t: any) => {
              const torrentName = (t.name || t.cleanTitle || '').toLowerCase();
              const torrentCleanTitle = (t.cleanTitle || t.name || '').toLowerCase();
              
              // Match si le nom nettoyé est contenu dans le nom du torrent ou vice versa
              const nameMatch = torrentName.includes(cleanLower) || 
                                cleanLower.includes(torrentName.split(' ')[0] || '') ||
                                torrentCleanTitle.includes(cleanLower) ||
                                cleanLower.includes(torrentCleanTitle.split(' ')[0] || '');
              
              // Vérifier qu'il a une image TMDB
              const hasImage = t.imageUrl || t.heroImageUrl;
              
              return nameMatch && hasImage;
            });
            
            if (matchingTorrent) {
              const image = matchingTorrent.imageUrl || matchingTorrent.heroImageUrl;
              if (image && typeof image === 'string' && image.length > 0) {
                setTmdbImage(image);
              }
            }
          }
        }
      } catch (error) {
        console.debug('Erreur lors de la recherche TMDB pour le torrent:', error);
      }
    };

    loadTmdbImage();
  }, [torrent.name, tmdbImage]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatETA = (seconds: number | null): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getStateLabel = (state: ClientTorrentStats['state']): string => {
    const labels: Record<ClientTorrentStats['state'], string> = {
      queued: 'En attente',
      downloading: 'Téléchargement',
      seeding: 'Partage',
      paused: 'En pause',
      completed: 'Terminé',
      error: 'Erreur',
    };
    return labels[state] || state;
  };

  const getStateColor = (state: ClientTorrentStats['state']): string => {
    const colors: Record<ClientTorrentStats['state'], string> = {
      queued: 'text-gray-400 bg-gray-800',
      downloading: 'text-blue-400 bg-blue-900/20',
      seeding: 'text-green-400 bg-green-900/20',
      paused: 'text-yellow-400 bg-yellow-900/20',
      completed: 'text-green-500 bg-green-900/20',
      error: 'text-red-400 bg-red-900/20',
    };
    return colors[state] || 'text-gray-400 bg-gray-800';
  };

  const progressColor = torrent.state === 'downloading' ? 'bg-blue-500' : 
                        torrent.state === 'seeding' ? 'bg-green-500' : 
                        torrent.state === 'completed' ? 'bg-green-600' : 
                        'bg-gray-600';

  return (
    <FocusableCard
      className="glass-panel border border-gray-800 rounded-lg p-4 lg:p-6 tv:p-8 hover:border-primary-600 hover:shadow-primary transition-all duration-300 focus-within:border-primary-600 focus-within:ring-4 focus-within:ring-primary-600 focus-within:ring-opacity-50 focus-within:shadow-primary-lg relative overflow-hidden"
      tabIndex={0}
    >
      {/* Image TMDB en arrière-plan avec effet glassmorphic */}
      {tmdbImage && (
        <div
          className="absolute inset-0 opacity-20 z-0 transition-opacity duration-300"
          style={{
            backgroundImage: `url(${tmdbImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px)',
          }}
        />
      )}
      <div
        className="relative z-10"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* En-tête avec nom et statut */}
        <div className="flex items-start justify-between mb-4 tv:mb-6 relative z-10">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2 mb-1 tv:mb-2">
              <h3 className="text-base lg:text-lg tv:text-xl font-semibold text-white line-clamp-2 drop-shadow-lg">
                {torrent.name || 'Sans nom'}
              </h3>
              {torrent.is_private && (
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-900/30 border border-orange-600/50 rounded-full text-orange-400 text-xs tv:text-sm font-medium flex-shrink-0" title="Torrent privé - DHT désactivé, utilisation uniquement des trackers HTTP/HTTPS">
                  <Lock className="w-3 h-3 tv:w-4 tv:h-4" size={16} />
                  <span>Privé</span>
                </div>
              )}
            </div>
          </div>
          <div className={`px-3 py-1.5 tv:px-4 tv:py-2 rounded-full text-xs lg:text-sm tv:text-base font-medium ${getStateColor(torrent.state)} border border-current/20 flex-shrink-0 drop-shadow-lg`}>
            {getStateLabel(torrent.state)}
          </div>
        </div>

        {/* Barre de progression avec animation */}
        <div className="mb-4 tv:mb-6">
          <div className="flex justify-between text-sm tv:text-base mb-2 tv:mb-3">
            <span className="text-gray-300">
              {formatBytes(torrent.downloaded_bytes)} / {formatBytes(torrent.total_bytes)}
            </span>
            <span className={`font-semibold ${showPulse ? 'text-blue-400 animate-pulse' : 'text-white'}`}>
              {(torrent.progress * 100).toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 tv:h-3 overflow-hidden relative">
            <div
              ref={progressBarRef}
              className={`${progressColor} h-full rounded-full transition-all duration-500 shadow-lg`}
              style={`width: ${torrent.progress * 100}%`}
            ></div>
            {/* Animation de "shimmer" pour les téléchargements actifs */}
            {showPulse && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style="width: 200%;"></div>
              </div>
            )}
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 tv:gap-4 mb-4 tv:mb-6 text-sm tv:text-base">
          <div className="bg-gray-800/50 rounded-lg p-2 tv:p-3">
            <span className="text-gray-400 block mb-1">Vitesse DL</span>
            <span className="font-semibold text-white">{formatSpeed(torrent.download_speed)}</span>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 tv:p-3">
            <span className="text-gray-400 block mb-1">Vitesse UL</span>
            <span className="font-semibold text-white">{formatSpeed(torrent.upload_speed)}</span>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 tv:p-3">
            <span className="text-gray-400 block mb-1">Peers</span>
            <span className="font-semibold text-white">{torrent.peers_connected}</span>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 tv:p-3">
            <span className="text-gray-400 block mb-1">ETA</span>
            <span className="font-semibold text-white">{formatETA(torrent.eta_seconds)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 tv:gap-3">
          {torrent.state === 'paused' ? (
            <button
              onClick={() => onResume(torrent.info_hash)}
              className="px-4 py-2 tv:px-6 tv:py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2"
              tabIndex={0}
            >
              <Play className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
              <span>Reprendre</span>
            </button>
          ) : torrent.state !== 'completed' && torrent.state !== 'seeding' ? (
            <button
              onClick={() => onPause(torrent.info_hash)}
              className="px-4 py-2 tv:px-6 tv:py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2"
              tabIndex={0}
            >
              <Pause className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
              <span>Pause</span>
            </button>
          ) : null}

          <button
            onClick={() => onRemove(torrent.info_hash, false)}
            className="px-4 py-2 tv:px-6 tv:py-3 bg-primary hover:bg-primary-700 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2"
            tabIndex={0}
          >
            <Trash2 className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
            <span>Supprimer</span>
          </button>

          {(torrent.state === 'completed' || torrent.state === 'seeding') && (
            <button
              onClick={() => onRemove(torrent.info_hash, true)}
              className="px-4 py-2 tv:px-6 tv:py-3 bg-primary-800 hover:bg-primary-900 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2 border border-primary-700"
              tabIndex={0}
            >
              <Trash2 className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
              <span>Supprimer avec fichiers</span>
            </button>
          )}

          <a
            href={`/torrents?slug=${torrent.info_hash}`}
            className="px-4 py-2 tv:px-6 tv:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2 inline-block"
            tabIndex={0}
          >
            <FileText className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
            <span>Ouvrir</span>
          </a>
          
          <button
            onClick={() => onShowLogs(torrent.info_hash)}
            className="px-4 py-2 tv:px-6 tv:py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm tv:text-base font-medium transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[40px] tv:min-h-[48px] flex items-center gap-2"
            tabIndex={0}
          >
            <LogsIcon className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
            <span>Journal</span>
          </button>
        </div>
      </div>
    </FocusableCard>
  );
}

/**
 * Filtre et nettoie les logs pour éliminer les répétitions tout en gardant les informations importantes
 * Amélioration : groupe les messages similaires pour réduire les répétitions
 */
function filterLogs(logs: TorrentLogEntry[]): TorrentLogEntry[] {
  const filtered: TorrentLogEntry[] = [];
  const seenMessages = new Map<string, { count: number; lastSeen: number; firstLog: TorrentLogEntry }>(); // message -> {count, lastSeen, firstLog}
  const MESSAGE_TIMEOUT = 30000; // 30 secondes pour considérer un message comme répétitif
  
  for (const log of logs) {
    // Normaliser le message (supprimer les timestamps dynamiques, IDs variables, valeurs variables, etc.)
    const normalizedMessage = log.message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, '[TIMESTAMP]')
      .replace(/peer="[^"]+"/g, 'peer="[PEER]"')
      .replace(/addr="[^"]+"/g, 'addr="[ADDR]"')
      .replace(/info_hash="[^"]+"/g, 'info_hash="[HASH]"')
      .replace(/duration="[^"]+"/g, 'duration="[DURATION]"')
      .replace(/\d+\.\d+\.\d+\.\d+:\d+/g, '[IP:PORT]')
      .replace(/0x[0-9a-fA-F]+/g, '[HEX]')
      .replace(/\d+ bytes/g, '[BYTES]')
      .replace(/progress=\d+\.\d+%/g, 'progress=[PROGRESS]%')
      .replace(/speed=\d+\.\d+ MB\/s/g, 'speed=[SPEED] MB/s')
      .replace(/peers=\d+\/\d+/g, 'peers=[PEERS]')
      .replace(/seeders=\d+/g, 'seeders=[SEEDERS]')
      .replace(/leechers=\d+/g, 'leechers=[LEECHERS]')
      .replace(/\d+\.\d+ MB/g, '[SIZE] MB')
      .replace(/\d+ log\(s\)/g, '[COUNT] log(s)')
      .trim();
    
    const existing = seenMessages.get(normalizedMessage);
    const now = log.timestamp;
    
    // Garder le log si :
    // 1. C'est la première fois qu'on le voit
    // 2. Ça fait plus de 30 secondes depuis la dernière occurrence
    // 3. C'est un message important (WARN, ERROR, ou contient des mots-clés importants)
    const isImportant = log.level === 'WARN' || log.level === 'ERROR' || 
                       normalizedMessage.includes('PROBLÈME') || 
                       normalizedMessage.includes('ERROR') ||
                       normalizedMessage.includes('CRITIQUE') ||
                       normalizedMessage.includes('DIAGNOSTIC') ||
                       normalizedMessage.includes('SOLUTION') ||
                       normalizedMessage.includes('🚀') ||
                       normalizedMessage.includes('✅') ||
                       normalizedMessage.includes('⚠️') ||
                       normalizedMessage.includes('🔍');
    
    if (!existing) {
      // Première occurrence
      seenMessages.set(normalizedMessage, { count: 1, lastSeen: now, firstLog: log });
      filtered.push(log);
    } else if ((now - existing.lastSeen) > MESSAGE_TIMEOUT) {
      // Nouvelle occurrence après le timeout - ajouter un résumé si répété
      if (existing.count > 1 && !isImportant) {
        // Chercher la première occurrence dans filtered et la remplacer par un résumé
        const firstIndex = filtered.findIndex(l => 
          l.timestamp === existing.firstLog.timestamp && 
          l.message === existing.firstLog.message
        );
        if (firstIndex >= 0 && !filtered[firstIndex].message.includes('(répété')) {
          filtered[firstIndex] = {
            ...existing.firstLog,
            message: `${existing.firstLog.message} (répété ${existing.count} fois dans les ${Math.round((existing.lastSeen - existing.firstLog.timestamp) / 1000)}s)`
          };
        }
      }
      // Réinitialiser pour cette nouvelle occurrence
      seenMessages.set(normalizedMessage, { count: 1, lastSeen: now, firstLog: log });
      filtered.push(log);
    } else if (isImportant) {
      // Message important, toujours garder
      existing.count++;
      existing.lastSeen = now;
      filtered.push(log);
    } else {
      // Message répétitif non-important, juste incrémenter le compteur
      existing.count++;
      existing.lastSeen = now;
    }
  }
  
  // Finaliser : ajouter les résumés pour les messages répétitifs non encore ajoutés
  seenMessages.forEach((data, normalizedMessage) => {
    if (data.count > 1) {
      const firstIndex = filtered.findIndex(l => 
        l.timestamp === data.firstLog.timestamp && 
        l.message === data.firstLog.message &&
        !l.message.includes('(répété')
      );
      if (firstIndex >= 0) {
        const timeSpan = Math.round((data.lastSeen - data.firstLog.timestamp) / 1000);
        filtered[firstIndex] = {
          ...data.firstLog,
          message: `${data.firstLog.message} (répété ${data.count} fois${timeSpan > 0 ? ` dans les ${timeSpan}s` : ''})`
        };
      }
    }
  });
  
  // Trier par timestamp décroissant (plus récent en premier)
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Formate un log pour l'affichage
 */
function formatLogEntry(log: TorrentLogEntry): string {
  const date = new Date(log.timestamp);
  const timeStr = date.toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
  
  return `[${timeStr}] [${log.level}] ${log.message}`;
}

export default function DownloadsList() {
  const [torrents, setTorrents] = useState<ClientTorrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMagnetModal, setShowAddMagnetModal] = useState(false);
  const [magnetLink, setMagnetLink] = useState('');
  const [addingTorrent, setAddingTorrent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const magnetInputRef = useRef<HTMLTextAreaElement | null>(null);
  
  // États pour la modale de logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [logs, setLogs] = useState<TorrentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadTorrents = useCallback(async () => {
    try {
      const list = await clientApi.listTorrents();
      setTorrents(list);
      setError(null);
    } catch (err) {
      console.error('Erreur lors du chargement des téléchargements:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTorrents();
    const interval = setInterval(loadTorrents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTorrents]);

  // Focus sur le textarea du magnet link quand le modal s'ouvre
  useEffect(() => {
    if (showAddMagnetModal && magnetInputRef.current) {
      setTimeout(() => {
        magnetInputRef.current?.focus();
      }, 100);
    }
  }, [showAddMagnetModal]);

  const handlePause = async (infoHash: string) => {
    try {
      await clientApi.pauseTorrent(infoHash);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la mise en pause:', err);
    }
  };

  const handleResume = async (infoHash: string) => {
    try {
      await clientApi.resumeTorrent(infoHash);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la reprise:', err);
    }
  };

  const handleRemove = async (infoHash: string, deleteFiles: boolean = false) => {
    if (!confirm(`Voulez-vous supprimer ce torrent${deleteFiles ? ' et ses fichiers' : ''} ?`)) {
      return;
    }

    try {
      await clientApi.removeTorrent(infoHash, deleteFiles);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      alert('Erreur lors de la suppression: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
    }
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setAddingTorrent(true);
      setError(null);
      await clientApi.addTorrentFile(file, false);
      await loadTorrents();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Erreur lors de l\'ajout du fichier torrent:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout du fichier torrent');
    } finally {
      setAddingTorrent(false);
    }
  };

  const handleAddMagnet = async () => {
    if (!magnetLink.trim()) {
      setError('Voulez entrer un lien magnet');
      return;
    }

    try {
      setAddingTorrent(true);
      setError(null);
      const nameMatch = magnetLink.match(/dn=([^&]+)/);
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Torrent';
      await clientApi.addMagnetLink(magnetLink.trim(), name, false);
      await loadTorrents();
      setMagnetLink('');
      setShowAddMagnetModal(false);
    } catch (err) {
      console.error('Erreur lors de l\'ajout du magnet link:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout du magnet link');
    } finally {
      setAddingTorrent(false);
    }
  };

  const handlePauseAll = async () => {
    try {
      for (const torrent of torrents) {
        if (torrent.state !== 'paused' && torrent.state !== 'completed' && torrent.state !== 'seeding') {
          try {
            await clientApi.pauseTorrent(torrent.info_hash);
          } catch (err) {
            console.error(`Erreur lors de la pause du torrent ${torrent.info_hash}:`, err);
          }
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la pause de tous les torrents:', err);
    }
  };

  const handleResumeAll = async () => {
    try {
      for (const torrent of torrents) {
        if (torrent.state === 'paused') {
          try {
            await clientApi.resumeTorrent(torrent.info_hash);
          } catch (err) {
            console.error(`Erreur lors de la reprise du torrent ${torrent.info_hash}:`, err);
          }
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la reprise de tous les torrents:', err);
    }
  };

  const handleRemoveAll = async () => {
    if (!confirm(`Voulez-vous supprimer tous les torrents ?`)) {
      return;
    }

    try {
      for (const torrent of torrents) {
        try {
          await clientApi.removeTorrent(torrent.info_hash, false);
        } catch (err) {
          console.error(`Erreur lors de la suppression du torrent ${torrent.info_hash}:`, err);
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la suppression de tous les torrents:', err);
    }
  };
  
  const handleShowLogs = async (infoHash: string) => {
    setSelectedTorrentHash(infoHash);
    setShowLogsModal(true);
    setLogsLoading(true);
    setLogsError(null);
    
    try {
      const torrentLogs = await clientApi.getTorrentLogs(infoHash);
      const filteredLogs = filterLogs(torrentLogs);
      setLogs(filteredLogs);
    } catch (err) {
      console.error('Erreur lors de la récupération des logs:', err);
      setLogsError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLogsLoading(false);
    }
  };
  
  // Rafraîchir les logs toutes les 5 secondes si la modale est ouverte
  useEffect(() => {
    if (!showLogsModal || !selectedTorrentHash) return;
    
    const interval = setInterval(async () => {
      try {
        const torrentLogs = await clientApi.getTorrentLogs(selectedTorrentHash);
        const filteredLogs = filterLogs(torrentLogs);
        setLogs(filteredLogs);
      } catch (err) {
        console.error('Erreur lors de la récupération des logs:', err);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [showLogsModal, selectedTorrentHash]);

  if (loading && torrents.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="flex flex-col items-center justify-center py-20 tv:py-32">
          <span className="loading loading-spinner loading-lg tv:loading-xl text-primary-600 mb-4"></span>
          <p className="text-gray-400 text-lg tv:text-xl">Chargement des téléchargements...</p>
        </div>
      </div>
    );
  }

  if (error && torrents.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16 py-12 tv:py-16">
          <div className="bg-primary-900/20 border border-primary-500 rounded-lg p-6 tv:p-8 max-w-2xl mx-auto glass-panel">
            <p className="text-primary-300 text-base tv:text-lg mb-4">{error}</p>
            <button
              onClick={loadTorrents}
              className="bg-primary hover:bg-primary-700 text-white px-6 py-3 tv:px-8 tv:py-4 rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
              tabIndex={0}
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white w-full">
      {/* Section Hero moderne */}
      <div className="relative w-full min-h-[250px] tv:min-h-[300px] mb-8 overflow-hidden bg-gradient-to-b from-primary-900/20 via-black to-black">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(124, 58, 237, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(124, 58, 237, 0.2) 0%, transparent 50%)'
          }}></div>
        </div>
        
        <div className="relative z-10 h-full flex flex-col justify-center px-4 sm:px-6 lg:px-16 tv:px-24 py-8 tv:py-12">
          <div className="max-w-6xl tv:max-w-7xl mx-auto w-full">
            {/* Titre */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tv:text-8xl font-bold text-white mb-6 tv:mb-8 drop-shadow-2xl">
              Téléchargements
            </h1>

            {/* Barre d'actions */}
            <div className="flex flex-wrap gap-3 tv:gap-4 items-center">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".torrent"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                  disabled={addingTorrent}
                />
                <span className={`px-6 py-3 tv:px-8 tv:py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center gap-2 inline-block ${addingTorrent ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <FileText className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  <span>{addingTorrent ? 'Ajout en cours...' : 'Ajouter fichier .torrent'}</span>
                </span>
              </label>
              
              <button
                onClick={() => setShowAddMagnetModal(true)}
                className="px-6 py-3 tv:px-8 tv:py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center gap-2"
                disabled={addingTorrent}
                tabIndex={0}
              >
                <Link2 className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                <span>Ajouter magnet link</span>
              </button>

              {torrents.length > 0 && (
                <>
                  <button
                    onClick={handlePauseAll}
                    className="px-6 py-3 tv:px-8 tv:py-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center gap-2"
                    disabled={torrents.every(t => t.state === 'paused' || t.state === 'completed' || t.state === 'seeding')}
                    tabIndex={0}
                  >
                    <Pause className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>Pause tous</span>
                  </button>
                  <button
                    onClick={handleResumeAll}
                    className="px-6 py-3 tv:px-8 tv:py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center gap-2"
                    disabled={torrents.every(t => t.state !== 'paused')}
                    tabIndex={0}
                  >
                    <Play className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>Reprendre tous</span>
                  </button>
                  <button
                    onClick={handleRemoveAll}
                    className="px-6 py-3 tv:px-8 tv:py-4 bg-primary hover:bg-primary-700 text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center gap-2"
                    tabIndex={0}
                  >
                    <Trash2 className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>Supprimer tous</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16 pb-8 tv:pb-12">
        {/* Message d'erreur */}
        {error && !showAddMagnetModal && (
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 tv:p-6 mb-6">
            <div className="flex items-start justify-between">
              <p className="text-yellow-300 text-sm tv:text-base flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-4 text-yellow-400 hover:text-yellow-300 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded p-1"
                tabIndex={0}
                aria-label="Masquer l'erreur"
              >
                <X className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
              </button>
            </div>
          </div>
        )}

        {/* État vide */}
        {torrents.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
            <div className="text-center max-w-2xl tv:max-w-3xl">
              <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">📥</div>
              <h2 className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6">
                Aucun téléchargement actif
              </h2>
              <p className="text-gray-400 text-base tv:text-lg mb-6 tv:mb-8">
                Les torrents que vous ajoutez apparaîtront ici
              </p>
            </div>
          </div>
        )}

        {/* Liste des téléchargements */}
        {torrents.length > 0 && (
          <>
            <div className="text-sm tv:text-base text-gray-400 mb-4 tv:mb-6">
              {torrents.length} téléchargement{torrents.length > 1 ? 's' : ''} actif{torrents.length > 1 ? 's' : ''}
            </div>

            <div className="grid gap-4 tv:gap-6">
              {torrents.map((torrent) => (
                <TorrentCard
                  key={torrent.info_hash}
                  torrent={torrent}
                  onPause={handlePause}
                  onResume={handleResume}
                  onRemove={handleRemove}
                  onShowLogs={handleShowLogs}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal pour ajouter un magnet link */}
      {showAddMagnetModal && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 tv:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddMagnetModal(false);
              setMagnetLink('');
              setError(null);
            }
          }}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 tv:p-8 max-w-2xl tv:max-w-3xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6 tv:mb-8">
              <h2 className="text-2xl tv:text-3xl font-bold text-white">Ajouter un magnet link</h2>
              <button
                onClick={() => {
                  setShowAddMagnetModal(false);
                  setMagnetLink('');
                  setError(null);
                }}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 rounded p-1"
                tabIndex={0}
                aria-label="Fermer le modal"
              >
                <X className="w-6 h-6 tv:w-8 tv:h-8" size={32} />
              </button>
            </div>
            <div className="space-y-6 tv:space-y-8">
              <div>
                <label className="block text-sm tv:text-base font-medium mb-2 tv:mb-3 text-gray-300">
                  Lien magnet:
                </label>
                <textarea
                  ref={magnetInputRef}
                  value={magnetLink}
                  onChange={(e) => setMagnetLink((e.target as HTMLTextAreaElement).value)}
                  className="w-full px-4 py-3 tv:px-6 tv:py-4 bg-gray-800 border-2 border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-sm tv:text-base min-h-[120px] tv:min-h-[150px] transition-all duration-200 glass-panel"
                  rows={4}
                  placeholder="magnet:?xt=urn:btih:..."
                  disabled={addingTorrent}
                  tabIndex={0}
                />
              </div>
              {error && (
                <div className="bg-primary-900/20 border border-primary-500 rounded-lg p-4 tv:p-6 glass-panel">
                  <p className="text-primary-300 text-sm tv:text-base">{error}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 tv:gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowAddMagnetModal(false);
                    setMagnetLink('');
                    setError(null);
                  }}
                  className="w-full sm:w-auto px-6 py-3 tv:px-8 tv:py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
                  disabled={addingTorrent}
                  tabIndex={0}
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddMagnet}
                  className="w-full sm:w-auto px-6 py-3 tv:px-8 tv:py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-lg hover:shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px] flex items-center justify-center gap-2"
                  disabled={addingTorrent || !magnetLink.trim()}
                  tabIndex={0}
                >
                  {addingTorrent ? (
                    <>
                      <span className="loading loading-spinner loading-sm tv:loading-md"></span>
                      <span>Ajout en cours...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                      <span>Ajouter</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modale pour afficher les logs filtrés */}
      {showLogsModal && selectedTorrentHash && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 tv:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowLogsModal(false);
              setSelectedTorrentHash(null);
              setLogs([]);
              setLogsError(null);
            }
          }}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 tv:p-8 max-w-5xl tv:max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-6 tv:mb-8 flex-shrink-0">
              <h2 className="text-2xl tv:text-3xl font-bold text-white">
                Journal de diagnostic - {torrents.find(t => t.info_hash === selectedTorrentHash)?.name || selectedTorrentHash.substring(0, 16) + '...'}
              </h2>
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setSelectedTorrentHash(null);
                  setLogs([]);
                  setLogsError(null);
                }}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 rounded p-1"
                tabIndex={0}
                aria-label="Fermer le modal"
              >
                <X className="w-6 h-6 tv:w-8 tv:h-8" size={32} />
              </button>
            </div>
            
            {logsLoading && logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1">
                <span className="loading loading-spinner loading-lg tv:loading-xl text-primary-600 mb-4"></span>
                <p className="text-gray-400 text-lg tv:text-xl">Chargement des logs...</p>
              </div>
            ) : logsError ? (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 tv:p-6 flex-1">
                <p className="text-red-300 text-sm tv:text-base">{logsError}</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1">
                <p className="text-gray-400 text-lg tv:text-xl">Aucun log disponible</p>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="mb-4 flex-shrink-0">
                  <p className="text-gray-400 text-sm tv:text-base">
                    {logs.length} log(s) affiché(s) (répétitions filtrées) • Mise à jour automatique toutes les 5 secondes
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-950 border border-gray-800 rounded-lg p-4 tv:p-6 font-mono text-xs tv:text-sm">
                  <div className="space-y-1">
                    {logs.map((log, index) => {
                      const isError = log.level === 'ERROR';
                      const isWarning = log.level === 'WARN';
                      const isImportant = log.message.includes('PROBLÈME') || 
                                         log.message.includes('CRITIQUE') || 
                                         log.message.includes('DIAGNOSTIC') ||
                                         log.message.includes('SOLUTION');
                      
                      const textColor = isError ? 'text-red-400' : 
                                       isWarning ? 'text-yellow-400' : 
                                       isImportant ? 'text-blue-400' : 
                                       'text-gray-300';
                      
                      return (
                        <div key={index} className={`${textColor} break-words whitespace-pre-wrap leading-relaxed`}>
                          {formatLogEntry(log)}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {logsLoading && logs.length > 0 && (
                  <div className="mt-4 flex-shrink-0 text-center">
                    <span className="loading loading-spinner loading-sm text-primary-600"></span>
                    <span className="text-gray-400 text-xs tv:text-sm ml-2">Actualisation...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}