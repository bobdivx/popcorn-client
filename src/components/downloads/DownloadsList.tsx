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

/** Construit une map info_hash -> { posterUrl, backdropUrl } à partir de la réponse API torrents/list */
function buildImageMapFromList(data: { data?: Array<Record<string, unknown>> }): Record<string, { posterUrl: string | null; backdropUrl: string | null }> {
  const map: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
  if (!data?.data || !Array.isArray(data.data)) return map;
  for (const t of data.data) {
    const hash = (t.infoHash ?? t.info_hash) as string | undefined;
    if (!hash || typeof hash !== 'string') continue;
    const key = hash.toLowerCase();
    const image = (t.imageUrl ?? t.poster_url ?? t.poster) as string | undefined;
    const backdrop = (t.heroImageUrl ?? t.hero_image_url ?? t.backdrop) as string | undefined;
    const posterUrl = image && typeof image === 'string' && image.length > 0 ? image : null;
    const backdropUrl = backdrop && typeof backdrop === 'string' && backdrop.length > 0 ? backdrop : null;
    map[key] = { posterUrl, backdropUrl };
  }
  return map;
}

/** Construit une map info_hash -> { posterUrl, backdropUrl, title } depuis /library */
function buildImageMapFromLibrary(
  data: { data?: Array<Record<string, unknown>> }
): {
  images: Record<string, { posterUrl: string | null; backdropUrl: string | null }>;
  titles: Record<string, string>;
} {
  const images: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
  const titles: Record<string, string> = {};
  if (!data?.data || !Array.isArray(data.data)) return { images, titles };
  for (const item of data.data) {
    const hash = (item.info_hash ?? item.infoHash) as string | undefined;
    if (!hash || typeof hash !== 'string') continue;
    const key = hash.toLowerCase();
    const image = (item.poster_url ?? item.poster ?? item.image_url ?? item.imageUrl) as
      | string
      | undefined;
    const backdrop = (item.hero_image_url ??
      item.heroImageUrl ??
      item.backdrop ??
      item.backdrop_url) as string | undefined;
    const posterUrl = image && typeof image === 'string' && image.length > 0 ? image : null;
    const backdropUrl = backdrop && typeof backdrop === 'string' && backdrop.length > 0 ? backdrop : null;
    const title = (item.tmdb_title ?? item.title ?? item.name) as string | undefined;
    if (posterUrl || backdropUrl) {
      images[key] = { posterUrl, backdropUrl };
    }
    if (title && typeof title === 'string' && title.trim()) {
      titles[key] = title;
    }
  }
  return { images, titles };
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
  
  // États pour la modale de logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [logs, setLogs] = useState<TorrentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Map info_hash -> images pour les cartes (sessionStorage + API)
  const [imageMap, setImageMap] = useState<Record<string, { posterUrl: string | null; backdropUrl: string | null }>>({});
  // Titre nettoyé par info_hash (sessionStorage depuis MediaDetail)
  const [displayTitleMap, setDisplayTitleMap] = useState<Record<string, string>>({});

  // États pour le modal de détails
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
        type: 'movie',
        poster: poster || undefined,
        backdrop: backdrop || undefined,
        progress: typeof tor.progress === 'number' ? tor.progress : undefined,
      });

      if (items.length >= 5) break;
    }
    return items;
  }, [torrents, imageMap, displayTitleMap, t]);

  const handleHeroOpen = useCallback((item: ContentItem) => {
    const raw = String(item.id || '');
    const key = raw.startsWith('download-') ? raw.slice('download-'.length) : null;
    if (!key) return;
    const tor = torrents.find((x) => String(x.info_hash || '').toLowerCase() === key);
    if (!tor) return;
    const images = imageMap[key];
    setSelectedTorrent(tor);
    setSelectedTorrentPoster(images?.posterUrl ?? null);
    setSelectedTorrentBackdrop(images?.backdropUrl ?? null);
  }, [torrents, imageMap]);

  // Panneau de vérification après ajout d'un torrent
  const [verificationInfoHash, setVerificationInfoHash] = useState<string | null>(null);
  const [verificationTorrentName, setVerificationTorrentName] = useState<string>('');
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [sessionStats, setSessionStats] = useState<Record<string, unknown> | null>(null);

  // Logs session (flux SSE client librqbit)
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
      if (isInitial) {
        // Au premier affichage, on veut que la page "arrive" vite même
        // si l'enrichissement posters/titres est lent (dépend de librqbit).
        const list = await clientApi.listTorrents();
        setTorrents(list);
        setError(null);
        initialLoadDoneRef.current = true;

        // Enrichissement en arrière-plan : poster/titre.
        void (async () => {
          try {
            const enrichedList = await clientApi.listTorrentsEnriched();
            const images: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
            const titles: Record<string, string> = {};
            for (const t of enrichedList) {
              const key = t.info_hash.toLowerCase();
              if (t.poster_url || t.hero_image_url) {
                images[key] = {
                  posterUrl: t.poster_url ?? null,
                  backdropUrl: t.hero_image_url ?? null,
                };
              }
              if (t.tmdb_title && t.tmdb_title.trim()) {
                titles[key] = t.tmdb_title.trim();
              }
            }
            setImageMap((prev) => ({ ...prev, ...images }));
            setDisplayTitleMap((prev) => ({ ...prev, ...titles }));
          } catch {
            // Echec silencieux : on garde la liste sans posters/titres enrichis.
          }
        })();
      } else {
        const list = await clientApi.listTorrents();
        setTorrents(list);
        setError(null);
      }
    } catch (err) {
      if (isInitial) {
        initialLoadDoneRef.current = true;
      }
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

  // Dès qu’on a des torrents : afficher tout de suite poster/titre depuis sessionStorage (ajout depuis MediaDetail)
  useEffect(() => {
    if (torrents.length === 0) {
      setImageMap({});
      setDisplayTitleMap({});
      return;
    }
    const stored = getDownloadMeta();
    const initialImages: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
    const initialTitles: Record<string, string> = {};
    for (const t of torrents) {
      const key = t.info_hash.toLowerCase();
      const s = stored[key];
      if (s) {
        if (s.posterUrl || s.backdropUrl) {
          initialImages[key] = { posterUrl: s.posterUrl ?? null, backdropUrl: s.backdropUrl ?? null };
        }
        if (s.cleanTitle) initialTitles[key] = s.cleanTitle;
      }
    }
    setImageMap((prev) => ({ ...initialImages, ...prev }));
    setDisplayTitleMap((prev) => ({ ...initialTitles, ...prev }));
  }, [torrents.length, torrents.map((t) => t.info_hash).join(',')]);

  // Fetch API backend pour enrichir les images (fusionne avec le cache sessionStorage)
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
        if (cancelled || !data?.success || !data?.data) return;
        const map = buildImageMapFromList(data);
        for (const [hash, urls] of Object.entries(map)) {
          tmdbImageCache.set(hash, urls);
        }
        setImageMap((prev) => ({ ...prev, ...map }));
      } catch {
        // Échec silencieux : CORS ou API indisponible
      }
    })();
    return () => { cancelled = true; };
  }, [torrents.length, torrents.map((t) => t.info_hash).join(',')]);

  // Fallback via /library pour récupérer les posters TMDB déjà en DB
  useEffect(() => {
    if (torrents.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const response = await serverApi.getLibrary();
        if (cancelled || !response?.success || !Array.isArray(response.data)) return;
        const { images, titles } = buildImageMapFromLibrary(response as { data?: Array<Record<string, unknown>> });
        if (cancelled) return;
        setImageMap((prev) => ({ ...prev, ...images }));
        setDisplayTitleMap((prev) => ({ ...prev, ...titles }));
      } catch {
        // Échec silencieux
      }
    })();
    return () => { cancelled = true; };
  }, [torrents.length, torrents.map((t) => t.info_hash).join(',')]);

  useEffect(() => {
    const fetchSession = async () => {
      const v = await clientApi.getLibrqbitSessionStats();
      setSessionStats(v);
    };
    fetchSession();
    const interval = setInterval(fetchSession, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Focus sur le textarea du magnet link quand le modal s'ouvre
  useEffect(() => {
    if (showAddMagnetModal && magnetInputRef.current) {
      setTimeout(() => {
        magnetInputRef.current?.focus();
      }, 100);
    }
  }, [showAddMagnetModal]);

  // Gérer le bouton retour de la télécommande pour fermer les modales
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (selectedTorrent) {
        handleCloseDetail();
        customEvent.preventDefault();
      } else if (showAddMagnetModal) {
        setShowAddMagnetModal(false);
        setMagnetLink('');
        setError(null);
        customEvent.preventDefault();
      } else if (showLogsModal) {
        setShowLogsModal(false);
        setSelectedTorrentHash(null);
        setLogs([]);
        setLogsError(null);
        customEvent.preventDefault();
      } else if (showSessionLogsModal) {
        setShowSessionLogsModal(false);
        customEvent.preventDefault();
      }
    };

    document.addEventListener('tv-back-button', handleBackButton as EventListener);
    return () => {
      document.removeEventListener('tv-back-button', handleBackButton as EventListener);
    };
  }, [showAddMagnetModal, showLogsModal, showSessionLogsModal, selectedTorrent, handleCloseDetail]);

  // Navigation clavier TV : flèches gauche/droite dans la barre d'actions
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const getFocusables = (): HTMLElement[] =>
      Array.from(
        toolbar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a, label, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const focusables = getFocusables();
      const current = focusables.indexOf(document.activeElement as HTMLElement);
      if (current < 0) return;
      const next = e.key === 'ArrowRight' ? current + 1 : current - 1;
      const target = focusables[next >= focusables.length ? 0 : next < 0 ? focusables.length - 1 : next];
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };

    toolbar.addEventListener('keydown', handleKeyDown);
    return () => toolbar.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const handleRemove = async (infoHash: string, deleteFiles: boolean = false): Promise<boolean> => {
    if (!confirm(t('downloads.confirmRemove', { withFiles: deleteFiles ? t('downloads.andFiles') : '' }))) {
      return false;
    }

    try {
      await clientApi.removeTorrent(infoHash, deleteFiles);
      await loadTorrents();
      return true;
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      alert('Erreur lors de la suppression: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
      return false;
    }
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setAddingTorrent(true);
      setError(null);
      const result = await clientApi.addTorrentFile(file, false);
      await loadTorrents();
      if (result?.info_hash) {
        setVerificationInfoHash(result.info_hash);
        setVerificationTorrentName(file.name.replace(/\.torrent$/i, ''));
        setShowVerificationPanel(true);
      }
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
      const result = await clientApi.addMagnetLink(magnetLink.trim(), name, false);
      await loadTorrents();
      if (result?.info_hash) {
        setVerificationInfoHash(result.info_hash);
        setVerificationTorrentName(name);
        setShowVerificationPanel(true);
      }
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
    if (!confirm(t('downloads.confirmRemoveAll'))) {
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
  
  const handleOpenDetail = async (torrent: ClientTorrentStats, posterUrl?: string | null, backdropUrl?: string | null) => {
    setSelectedTorrent(torrent);
    
    // Vérifier le cache d'abord
    const cached = tmdbImageCache.get(torrent.info_hash);
    const finalPosterUrl = posterUrl || cached?.posterUrl || null;
    const finalBackdropUrl = backdropUrl || cached?.backdropUrl || null;
    
    // Utiliser les images déjà chargées si disponibles
    if (finalPosterUrl) {
      setSelectedTorrentPoster(finalPosterUrl);
    }
    if (finalBackdropUrl) {
      setSelectedTorrentBackdrop(finalBackdropUrl);
    }

    // Si les images ne sont pas déjà chargées, les charger maintenant
    if (!finalPosterUrl || !finalBackdropUrl) {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const { getBackendUrl } = await import('../../lib/backend-config');
        const baseUrl = (getBackendUrl() || serverApi.getServerUrl()).trim().replace(/\/$/, '');
        const token = serverApi.getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        
        // Chercher par info_hash dans la liste des torrents enrichis
        const response = await fetch(`${baseUrl}/api/torrents/list?limit=200`, { headers });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.data && Array.isArray(data.data)) {
            // Chercher par info_hash d'abord (plus rapide et fiable)
            let matchingTorrent = data.data.find((t: any) => 
              t.infoHash === torrent.info_hash || 
              t.info_hash === torrent.info_hash ||
              (t.infoHash && t.infoHash.toLowerCase() === torrent.info_hash.toLowerCase()) ||
              (t.info_hash && t.info_hash.toLowerCase() === torrent.info_hash.toLowerCase())
            );
            
            // Si pas trouvé par info_hash, chercher par nom nettoyé
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
              
              const newPosterUrl = image && typeof image === 'string' && image.length > 0 ? image : null;
              const newBackdropUrl = backdrop && typeof backdrop === 'string' && backdrop.length > 0 ? backdrop : null;
              
              // Mettre en cache
              tmdbImageCache.set(torrent.info_hash, { posterUrl: newPosterUrl, backdropUrl: newBackdropUrl });
              
              // Ne mettre à jour que si pas déjà défini
              if (!finalPosterUrl && newPosterUrl) {
                setSelectedTorrentPoster(newPosterUrl);
              }
              if (!finalBackdropUrl && newBackdropUrl) {
                setSelectedTorrentBackdrop(newBackdropUrl);
              }
            } else {
              // Mettre null en cache pour éviter de recharger
              tmdbImageCache.set(torrent.info_hash, { posterUrl: null, backdropUrl: null });
            }
          }
        }
      } catch (error) {
        console.debug('Erreur lors de la recherche TMDB pour le modal:', error);
      }
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

  useEffect(() => {
    if (!showSessionLogsModal) {
      sessionLogsAbortRef.current?.abort();
      sessionLogsAbortRef.current = null;
      return;
    }
    setSessionLogsLines([]);
    setSessionLogsError(null);
    setSessionLogsConnecting(true);
    const ctrl = new AbortController();
    sessionLogsAbortRef.current = ctrl;

    (async () => {
      try {
        const url = await clientApi.getLibrqbitStreamLogsUrl();
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) {
          setSessionLogsError(`HTTP ${res.status}`);
          setSessionLogsConnecting(false);
          return;
        }
        setSessionLogsConnecting(false);
        const reader = res.body?.getReader();
        if (!reader) {
          setSessionLogsError('Pas de flux');
          return;
        }
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          if (lines.length) {
            setSessionLogsLines((prev) => [...prev, ...lines].slice(-2000));
          }
        }
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setSessionLogsError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setSessionLogsConnecting(false);
        if (sessionLogsAbortRef.current === ctrl) sessionLogsAbortRef.current = null;
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [showSessionLogsModal]);

  if (loading && torrents.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6 flex flex-col items-center justify-center min-h-[300px]">
          <HLSLoadingSpinner size="lg" text={t('downloads.loadingDownloads')} />
        </div>
      </div>
    );
  }

  if (error && torrents.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
          <div className="sc-frame-wrap">
            <div className="sc-frame">
              <div className="sc-frame-header">
                <div className="sc-frame-icon">
                  <Download className="w-5 h-5" strokeWidth={1.8} aria-hidden />
                </div>
                <div>
                  <div className="sc-frame-title">{t('downloads.title')}</div>
                </div>
              </div>
              <div className="sc-frame-body">
                <p className="ds-text-secondary text-sm mb-4">{error}</p>
                <button
                  onClick={loadTorrents}
                  className="btn btn-primary min-h-[40px] tv:min-h-[48px]"
                  tabIndex={0}
                >
                  {t('common.retry')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {heroItems.length > 0 && (
        <HeroSection
          items={heroItems}
          onPlay={handleHeroOpen}
          onPrimaryAction={handleHeroOpen}
          primaryButtonLabel={t('common.details')}
          size="large"
        />
      )}

      <div
        className="pt-2 sm:pt-3 pb-8 tv:pb-12 flex-1 safe-area-bottom animate-[fade-in-up_0.5s_ease-out_forwards] opacity-0"
        style={{ paddingBottom: 'max(2rem, var(--safe-area-inset-bottom))' }}
      >
        <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-4 sm:pt-6 pb-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl tv:text-5xl font-bold text-white mb-2">
            {t('downloads.title')}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">{t('downloads.torrentsWillAppear')}</p>
        </div>

        {/* Toolbar dans un sc-frame */}
        <div className="sc-frame-wrap mb-4 sm:mb-6 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <div className="sc-frame">
            <div className="sc-frame-header">
              <div className="sc-frame-icon">
                <Download className="w-5 h-5" strokeWidth={1.8} aria-hidden />
              </div>
              <div>
                <div className="sc-frame-title">{t('downloads.actions') ?? 'Actions'}</div>
              </div>
            </div>
            <div className="sc-frame-body">
              {/* Barre d'actions */}
              <div
                ref={toolbarRef}
                role="toolbar"
                aria-label={t('downloads.actions') ?? 'Actions'}
                className="flex flex-wrap items-stretch gap-2 tv:gap-2 tv:flex-nowrap"
              >
            {/* Groupe Ajouter */}
            <div className="flex flex-wrap tv:flex-nowrap gap-2 items-stretch">
              <label className="cursor-pointer flex">
                <input
                  type="file"
                  accept=".torrent"
                  onChange={handleFileSelect}
                  className="sr-only"
                  ref={fileInputRef}
                  disabled={addingTorrent}
                />
                <span
                  className={`
                    inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl
                    bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]
                    hover:opacity-90 active:opacity-80
                    disabled:opacity-60 disabled:cursor-not-allowed
                    font-medium text-xs tv:text-sm
                    min-h-[40px] tv:min-h-[44px]
                    transition-opacity duration-200
                    focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ds-accent-violet)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--ds-surface)]
                    outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)]
                    ${addingTorrent ? 'opacity-60 cursor-not-allowed' : ''}
                  `}
                  tabIndex={0}
                >
                  <FileText className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
                  <span>{addingTorrent ? t('downloads.adding') : t('downloads.addTorrentFile')}</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowAddMagnetModal(true)}
                disabled={addingTorrent}
                tabIndex={0}
                className="inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)] hover:bg-[var(--ds-accent-violet)] hover:text-[var(--ds-text-on-accent)] disabled:opacity-60 text-[var(--ds-text-primary)] font-medium text-xs tv:text-sm min-h-[40px] tv:min-h-[44px] transition-colors duration-200 outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
              >
                <Link2 className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
                <span>{t('downloads.addMagnetLink')}</span>
              </button>
            </div>

            <div className="hidden tv:block w-px bg-[var(--ds-border)] self-stretch min-h-[28px]" aria-hidden="true" />

            {/* Logs client */}
            <button
              type="button"
              onClick={() => setShowSessionLogsModal(true)}
              tabIndex={0}
              className="inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl bg-[var(--ds-surface-elevated)] hover:bg-white/10 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] font-medium text-xs tv:text-sm min-h-[40px] tv:min-h-[44px] transition-colors duration-200 outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
            >
              <LogsIcon className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
              <span>{t('downloads.clientLogs') ?? 'Logs client'}</span>
            </button>

            {torrents.length > 0 && (
              <>
                <div className="hidden tv:block w-px bg-[var(--ds-border)] self-stretch min-h-[28px]" aria-hidden="true" />
                <div className="flex flex-wrap tv:flex-nowrap gap-2 items-stretch">
                  <button
                    type="button"
                    onClick={handlePauseAll}
                    disabled={torrents.every(t => t.state === 'paused' || t.state === 'completed' || t.state === 'seeding')}
                    tabIndex={0}
                    className="inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl bg-[var(--ds-accent-yellow)]/20 text-[var(--ds-accent-yellow)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs tv:text-sm min-h-[40px] tv:min-h-[44px] transition-opacity duration-200 outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
                  >
                    <Pause className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
                    <span>{t('downloads.pauseAll')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResumeAll}
                    disabled={torrents.every(t => t.state !== 'paused')}
                    tabIndex={0}
                    className="inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl bg-[var(--ds-accent-green)]/25 text-[var(--ds-accent-green)] hover:opacity-90 disabled:opacity-50 font-medium text-xs tv:text-sm min-h-[40px] tv:min-h-[44px] transition-opacity duration-200 outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
                  >
                    <Play className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
                    <span>{t('downloads.resumeAll')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveAll}
                    tabIndex={0}
                    className="inline-flex items-center gap-1.5 tv:gap-2 px-3 py-2 tv:px-4 tv:py-2.5 rounded-[var(--ds-radius-sm)] tv:rounded-xl bg-[var(--ds-accent-red-muted)] text-[var(--ds-accent-red)] hover:opacity-90 font-medium text-xs tv:text-sm min-h-[40px] tv:min-h-[44px] transition-opacity duration-200 outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
                  >
                    <Trash2 className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" size={18} />
                    <span>{t('downloads.removeAll')}</span>
                  </button>
                </div>
              </>
            )}
          </div>

              {/* Stats session librqbit */}
              {sessionStats && (
                <div className="mt-3 tv:mt-4 flex flex-wrap items-center gap-3 tv:gap-4 text-xs tv:text-sm ds-text-tertiary">
                  {(sessionStats.download_speed as { human_readable?: string } | undefined)?.human_readable != null && (
                    <span className="flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-[var(--ds-accent-violet)]" size={16} />
                      <span>↓ {(sessionStats.download_speed as { human_readable: string }).human_readable}</span>
                    </span>
                  )}
                  {(sessionStats.upload_speed as { human_readable?: string } | undefined)?.human_readable != null && (
                    <span className="flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-[var(--ds-accent-green)]" size={16} />
                      <span>↑ {(sessionStats.upload_speed as { human_readable: string }).human_readable}</span>
                    </span>
                  )}
                  {typeof sessionStats.uptime_seconds === 'number' && (
                    <span>
                      {t('downloads.sessionUptime') ?? 'Uptime'}: {Math.floor((sessionStats.uptime_seconds as number) / 60)} min
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Message d'erreur */}
        {error && !showAddMagnetModal && (
          <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
            <div className="rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent-red-muted)] border border-[var(--ds-accent-red)]/30 p-4 tv:p-5 mb-4 tv:mb-6">
              <div className="flex items-start justify-between">
                <p className="text-[var(--ds-accent-red)] text-sm tv:text-base flex-1">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="ml-4 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] rounded p-1"
                  tabIndex={0}
                  aria-label="Masquer l'erreur"
                >
                  <X className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* État vide */}
        {torrents.length === 0 && !loading && (
          <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
            <div className="sc-frame-wrap">
              <div className="sc-frame">
                <div className="sc-frame-body flex flex-col items-center justify-center py-12 tv:py-16 text-center">
                  <div className="sc-frame-icon w-14 h-14 mb-4 tv:mb-5 mx-auto">
                    <HardDrive className="w-6 h-6" strokeWidth={1.5} aria-hidden />
                  </div>
                  <h2 className="sc-frame-title text-base mb-2">
                    {t('downloads.noActiveDownloads')}
                  </h2>
                  <p className="sc-frame-desc">
                    {t('downloads.torrentsWillAppear')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Liste des téléchargements */}
        {torrents.length > 0 && (
          <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
            <section className="mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm sm:text-base md:text-lg font-semibold text-white/90 uppercase tracking-wide">
                  {t('downloads.activeDownloads', { count: torrents.length, plural: torrents.length > 1 ? 's' : '' })}
                </h3>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </section>

            <div className="sc-frame-wrap">
              <div className="sc-frame">
                <div className="sc-frame-body">
                  <div
                    data-carousel
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 tv:grid-cols-6 gap-2 sm:gap-3 md:gap-4 tv:gap-4"
                  >
                    {torrents.map((torrent) => {
                      const key = torrent.info_hash.toLowerCase();
                      const images = imageMap[key];
                      return (
                        <DownloadCard
                          key={torrent.info_hash}
                          torrent={torrent}
                          posterUrl={images?.posterUrl ?? undefined}
                          backdropUrl={images?.backdropUrl ?? undefined}
                          displayTitle={displayTitleMap[key]}
                          onOpenDetail={handleOpenDetail}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal pour ajouter un magnet link */}
      {showAddMagnetModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="magnet-modal-title"
          className="fixed inset-0 bg-[var(--ds-surface-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 tv:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddMagnetModal(false);
              setMagnetLink('');
              setError(null);
            }
          }}
          onKeyDown={(e) => {
            const target = e.target as HTMLElement;
            const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (e.key === 'Backspace' && inInput) return;
            if (e.key === 'Escape' || e.key === 'Backspace') {
              setShowAddMagnetModal(false);
              setMagnetLink('');
              setError(null);
            }
          }}
        >
          <div className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] p-6 tv:p-8 max-w-2xl tv:max-w-3xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6 tv:mb-8">
              <h2 id="magnet-modal-title" className="ds-title-page">{t('downloads.addMagnetLink')}</h2>
              <button
                onClick={() => {
                  setShowAddMagnetModal(false);
                  setMagnetLink('');
                  setError(null);
                }}
                className="ds-text-tertiary hover:text-[var(--ds-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] rounded p-1"
                tabIndex={0}
                aria-label="Fermer le modal"
              >
                <X className="w-6 h-6 tv:w-8 tv:h-8" size={32} />
              </button>
            </div>
            <div className="space-y-6 tv:space-y-8">
              <div>
                <label className="block text-sm tv:text-base font-medium mb-2 tv:mb-3 ds-text-secondary">
                  {t('downloads.magnetLinkLabel')}
                </label>
                <textarea
                  ref={magnetInputRef}
                  value={magnetLink}
                  onChange={(e) => setMagnetLink((e.target as HTMLTextAreaElement).value)}
                  className="w-full px-4 py-3 tv:px-6 tv:py-4 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:border-[var(--ds-accent-violet)] focus:ring-2 focus:ring-[var(--ds-accent-violet)]/30 text-sm tv:text-base min-h-[120px] tv:min-h-[150px] transition-all duration-200"
                  rows={4}
                  placeholder="magnet:?xt=urn:btih:..."
                  disabled={addingTorrent}
                  tabIndex={0}
                />
              </div>
              {error && (
                <div className="rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent-red-muted)] border border-[var(--ds-accent-red)] p-4 tv:p-6">
                  <p className="text-[var(--ds-accent-red)] text-sm tv:text-base">{error}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 tv:gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowAddMagnetModal(false);
                    setMagnetLink('');
                    setError(null);
                  }}
                  className="w-full sm:w-auto px-6 py-3 tv:px-8 tv:py-4 bg-[var(--ds-surface-elevated)] hover:bg-white/10 text-[var(--ds-text-primary)] rounded-[var(--ds-radius-sm)] font-semibold text-base tv:text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] min-h-[48px] tv:min-h-[56px]"
                  disabled={addingTorrent}
                  tabIndex={0}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddMagnet}
                  className="w-full sm:w-auto px-6 py-3 tv:px-8 tv:py-4 bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed rounded-[var(--ds-radius-sm)] font-semibold text-base tv:text-lg transition-opacity flex items-center justify-center gap-2 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
                  disabled={addingTorrent || !magnetLink.trim()}
                  tabIndex={0}
                >
                  {addingTorrent ? (
                    <>
                      <span className="loading loading-spinner loading-sm tv:loading-md text-[var(--ds-text-on-accent)]"></span>
                      <span>{t('downloads.adding')}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                      <span>{t('common.add')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Modal de détails du téléchargement */}
      {selectedTorrent && (
        <DownloadDetailModal
          torrent={selectedTorrent}
          onClose={handleCloseDetail}
          onPause={handlePause}
          onResume={handleResume}
          onRemove={handleRemove}
          onShowLogs={handleShowLogs}
          posterUrl={selectedTorrentPoster}
          backdropUrl={selectedTorrentBackdrop}
        />
      )}

      {/* Modale pour afficher les logs filtrés */}
      {showLogsModal && selectedTorrentHash && createPortal(
        <div
          className="fixed inset-0 bg-[var(--ds-surface-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 tv:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowLogsModal(false);
              setSelectedTorrentHash(null);
              setLogs([]);
              setLogsError(null);
            }
          }}
        >
          <div className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] p-6 tv:p-8 max-w-5xl tv:max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-6 tv:mb-8 flex-shrink-0">
              <h2 id="logs-modal-title" className="ds-title-page">
                {t('downloads.logsTitle')} - {torrents.find(torrent => torrent.info_hash === selectedTorrentHash)?.name || selectedTorrentHash.substring(0, 16) + '...'}
              </h2>
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setSelectedTorrentHash(null);
                  setLogs([]);
                  setLogsError(null);
                }}
                className="ds-text-tertiary hover:text-[var(--ds-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] rounded p-1"
                tabIndex={0}
                aria-label="Fermer le modal"
              >
                <X className="w-6 h-6 tv:w-8 tv:h-8" size={32} />
              </button>
            </div>

            {logsLoading && logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1">
                <HLSLoadingSpinner size="lg" text={t('downloads.loadingLogs')} />
              </div>
            ) : logsError ? (
              <div className="rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent-red-muted)] border border-[var(--ds-accent-red)] p-4 tv:p-6 flex-1">
                <p className="text-[var(--ds-accent-red)] text-sm tv:text-base">{logsError}</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1">
                <p className="ds-text-secondary text-lg tv:text-xl">{t('downloads.noLogs')}</p>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="mb-4 flex-shrink-0">
                  <p className="ds-text-tertiary text-sm tv:text-base">
                    {t('downloads.logsFiltered', { count: logs.length })}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] p-4 tv:p-6 font-mono text-xs tv:text-sm">
                  <div className="space-y-1">
                    {logs.map((log, index) => {
                      const isError = log.level === 'ERROR';
                      const isWarning = log.level === 'WARN';
                      const isImportant = log.message.includes('PROBLÈME') || 
                                         log.message.includes('CRITIQUE') || 
                                         log.message.includes('DIAGNOSTIC') ||
                                         log.message.includes('SOLUTION');
                      
                      const textColor = isError ? 'text-[var(--ds-accent-red)]' :
                                       isWarning ? 'text-[var(--ds-accent-yellow)]' :
                                       isImportant ? 'text-[var(--ds-accent-violet)]' :
                                       'ds-text-secondary';
                      
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
                    <span className="loading loading-spinner loading-sm text-[var(--ds-accent-violet)]"></span>
                    <span className="ds-text-tertiary text-xs tv:text-sm ml-2">Actualisation...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modale Logs session (client librqbit) */}
      {showSessionLogsModal && createPortal(
        <div
          className="fixed inset-0 bg-[var(--ds-surface-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 tv:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSessionLogsModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Backspace') setShowSessionLogsModal(false);
          }}
        >
          <div className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] p-6 tv:p-8 max-w-5xl tv:max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4 tv:mb-6 flex-shrink-0">
              <h2 className="ds-title-page">
                {t('downloads.clientLogs') ?? 'Logs client'}
              </h2>
              <button
                onClick={() => setShowSessionLogsModal(false)}
                className="ds-text-tertiary hover:text-[var(--ds-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] rounded p-1"
                tabIndex={0}
                aria-label="Fermer"
              >
                <X className="w-6 h-6 tv:w-8 tv:h-8" size={32} />
              </button>
            </div>
            {sessionLogsConnecting && sessionLogsLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1">
                <HLSLoadingSpinner size="lg" text={t('downloads.loadingLogs')} />
              </div>
            ) : sessionLogsError ? (
              <div className="rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent-red-muted)] border border-[var(--ds-accent-red)] p-4 tv:p-6 flex-1">
                <p className="text-[var(--ds-accent-red)] text-sm tv:text-base">{sessionLogsError}</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] p-4 tv:p-6 font-mono text-xs tv:text-sm ds-text-secondary whitespace-pre-wrap break-words">
                {sessionLogsLines.length === 0 && !sessionLogsConnecting
                  ? (t('downloads.noLogs') ?? 'Aucun log')
                  : sessionLogsLines.join('\n')}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Panneau de vérification du téléchargement (après ajout d'un torrent) */}
      {showVerificationPanel && verificationInfoHash && createPortal(
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md md:left-6 md:right-auto">
          <DownloadVerificationPanel
            infoHash={verificationInfoHash}
            torrentName={verificationTorrentName || undefined}
            onComplete={() => {}}
            dismissible={true}
            onDismiss={() => {
              setShowVerificationPanel(false);
              setVerificationInfoHash(null);
              setVerificationTorrentName('');
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}