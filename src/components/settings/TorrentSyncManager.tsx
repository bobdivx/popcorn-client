import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { syncSyncSettingsToCloud } from '../../lib/utils/cloud-sync';
import { RefreshCw, Sparkles } from 'lucide-preact';
import { suggestTmdbEnrichmentRules } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import type { Indexer } from '../../lib/client/types';
import { useNativeNotifications } from '../../hooks/useNativeNotifications';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

interface SyncSettings {
  sync_frequency_minutes: number;
  is_enabled: number;
  last_sync_date: number | null;
  sync_in_progress: number;
  max_torrents_per_category: number;
  // Nouveaux paramètres (backend Rust)
  rss_incremental_enabled?: number;
  sync_queries_films?: string[];
  sync_queries_series?: string[];
}

interface SyncProgress {
  current_indexer?: string | null;
  current_category?: string | null;
  current_query?: string | null;
  indexer_torrents: Record<string, number>;
  category_torrents: Record<string, number>;
  total_processed: number;
  total_to_process: number;
  fetched_pages?: number;
  errors: string[];
}

interface TmdbStats {
  with_tmdb: number;
  without_tmdb: number;
  missing_tmdb: Array<[string, string]>; // [name, category]
}

interface SyncStatus {
  sync_in_progress: boolean;
  last_sync_date: number | null;
  settings: SyncSettings;
  stats: Record<string, number>;
  sync_start_time?: number | null;
  progress?: SyncProgress;
  tmdb_stats?: TmdbStats;
}

interface TorrentSyncManagerProps {
  /** Afficher uniquement les paramètres (pour le sous-menu Indexers) */
  section?: 'all' | 'settings';
}

export default function TorrentSyncManager({ section = 'all' }: TorrentSyncManagerProps = {}) {
  const { t, language } = useI18n();
  // Initialiser loading à false pour que l'interface s'affiche immédiatement
  // Le statut par défaut sera créé dans loadStatus si nécessaire
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [animatedCounts, setAnimatedCounts] = useState<Record<string, number>>({});
  const [previousStats, setPreviousStats] = useState<Record<string, number>>({});
  const [syncStartTime, setSyncStartTime] = useState<number | null>(null);
  const [filmsQueriesText, setFilmsQueriesText] = useState('');
  const [seriesQueriesText, setSeriesQueriesText] = useState('');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [hasCloudToken, setHasCloudToken] = useState(false);

  // Hook pour les notifications natives
  const {
    notifySyncStart,
    notifySyncProgress,
    notifySyncError,
    notifySyncComplete,
  } = useNativeNotifications();

  // Évite les appels concurrents (polling + clics) et réduit les boucles de logs
  const loadStatusInFlight = useRef(false);
  const loadIndexersInFlight = useRef(false);
  const lastLoggedSettingsKey = useRef<string>('');

  useEffect(() => {
    loadStatus();
    loadIndexers();
  }, []);

  useEffect(() => {
    setHasCloudToken(!!TokenManager.getCloudAccessToken());
  }, [status?.tmdb_stats?.without_tmdb]);

  // Sync local textarea state from backend settings (quand la réponse arrive)
  useEffect(() => {
    const s = status?.settings;
    if (!s) {
      // Si pas de settings, initialiser avec des valeurs vides
      setFilmsQueriesText('');
      setSeriesQueriesText('');
      return;
    }
    const films = Array.isArray(s.sync_queries_films) ? s.sync_queries_films : [];
    const series = Array.isArray(s.sync_queries_series) ? s.sync_queries_series : [];
    const filmsText = films.join('\n');
    const seriesText = series.join('\n');
    // Toujours mettre à jour pour s'assurer que les valeurs sont hydratées
    setFilmsQueriesText(filmsText);
    setSeriesQueriesText(seriesText);
  }, [status?.settings?.sync_queries_films, status?.settings?.sync_queries_series]);

  // Timer pour le temps écoulé
  useEffect(() => {
    if (status?.sync_in_progress && syncStartTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() / 1000) - syncStartTime));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [status?.sync_in_progress, syncStartTime]);

  // Animation des compteurs (cible = stats fusionnés avec total_processed pendant la sync)
  useEffect(() => {
    const targetStats: Record<string, number> = { ...(status?.stats || {}) };
    if (status?.sync_in_progress && status?.progress?.current_category && typeof status?.progress?.total_processed === 'number') {
      targetStats[status.progress.current_category] = status.progress.total_processed;
    }
    if (Object.keys(targetStats).length > 0) {
      Object.entries(targetStats).forEach(([category, targetCount]) => {
        const currentCount = animatedCounts[category] || 0;
        if (currentCount !== targetCount) {
          const diff = targetCount - currentCount;
          const step = Math.ceil(Math.abs(diff) / 20); // Animation en 20 étapes
          const increment = diff > 0 ? step : -step;

          const interval = setInterval(() => {
            setAnimatedCounts(prev => {
              const current = prev[category] || 0;
              const next = diff > 0
                ? Math.min(current + increment, targetCount)
                : Math.max(current + increment, targetCount);

              if (next === targetCount) {
                clearInterval(interval);
              }

              return { ...prev, [category]: next };
            });
          }, 50);

          return () => clearInterval(interval);
        }
      });
    }
  }, [status?.stats, status?.sync_in_progress, status?.progress?.current_category, status?.progress?.total_processed]);

  // Rafraîchir le statut automatiquement si une sync est en cours
  useEffect(() => {
    if (status?.sync_in_progress) {
      if (!syncStartTime && status.sync_start_time) {
        setSyncStartTime(status.sync_start_time);
        setAnimatedCounts({});
      }
      // Rafraîchir toutes les 2 secondes pendant la sync
      const interval = setInterval(() => {
        loadStatus();
      }, 2000);
      return () => clearInterval(interval);
    } else {
      // Si la sync vient de se terminer, recharger le statut une dernière fois
      if (syncStartTime) {
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
        setSyncStartTime(null);
        setPreviousStats({});
        setElapsedTime(0);
      }
    }
  }, [status?.sync_in_progress, status?.sync_start_time]);

  const syncIndexersToBackend = async () => {
    try {
      // Récupérer tous les indexers activés depuis la DB locale
      const response = await serverApi.getIndexers();
      if (!response.success || !response.data) {
        return;
      }

      const enabledIndexers = response.data.filter((idx: Indexer) => idx.isEnabled === true);
      if (enabledIndexers.length === 0) {
        return;
      }

      console.log(`[SYNC MANAGER] 🔄 Synchronisation de ${enabledIndexers.length} indexer(s) activé(s) vers le backend Rust...`);
      
      // Récupérer l'URL du backend
      const { getBackendUrlAsync } = await import('../../lib/backend-url.js');
      const backendUrl = await getBackendUrlAsync();
      
      // Synchroniser chaque indexer
      const syncPromises = enabledIndexers.map(async (indexer: Indexer) => {
        try {
          // Côté backend Rust, l'endpoint de création/màj est:
          //   POST /api/client/admin/indexers
          // (et /api/client/admin/indexers/:id pour GET/PUT/DELETE).
          // Ici, "/sync" était interprété comme un :id="sync" => POST non autorisé => 405.
          const syncUrl = `${backendUrl}/api/client/admin/indexers`;
          const syncController = new AbortController();
          const syncTimeout = setTimeout(() => syncController.abort(), 2000);
          
          const syncResponse = await fetch(syncUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: indexer.id,
              name: indexer.name,
              base_url: indexer.baseUrl,
              api_key: indexer.apiKey || null,
              jackett_indexer_name: indexer.jackettIndexerName || null,
              is_enabled: indexer.isEnabled === true,
              is_default: indexer.isDefault || false,
              priority: indexer.priority || 0,
              indexer_type_id: indexer.indexerTypeId || null,
              config_json: indexer.configJson || null,
            }),
            signal: syncController.signal,
          });
          
          clearTimeout(syncTimeout);
          
          if (syncResponse.ok) {
            console.log(`[SYNC MANAGER] ✅ Indexer ${indexer.name} synchronisé avec succès`);
            return true;
          } else {
            const errorText = await syncResponse.text().catch(() => '');
            console.warn(`[SYNC MANAGER] ⚠️ Erreur lors de la synchronisation de ${indexer.name}:`, errorText);
            return false;
          }
        } catch (syncError) {
          if (syncError instanceof Error && syncError.name === 'AbortError') {
            console.warn(`[SYNC MANAGER] ⚠️ Timeout lors de la synchronisation de ${indexer.name} (2s)`);
          } else {
            console.warn(`[SYNC MANAGER] ⚠️ Erreur lors de la synchronisation de ${indexer.name}:`, syncError);
          }
          return false;
        }
      });
      
      const results = await Promise.all(syncPromises);
      const successful = results.filter(r => r).length;
      console.log(`[SYNC MANAGER] 📊 Synchronisation des indexers terminée: ${successful}/${enabledIndexers.length} réussi(s)`);
    } catch (err) {
      console.warn('[SYNC MANAGER] ⚠️ Erreur lors de la synchronisation des indexers:', err);
      // Ne pas bloquer si la synchronisation échoue
    }
  };

  const loadIndexers = async () => {
    if (loadIndexersInFlight.current) return;
    loadIndexersInFlight.current = true;
    try {
      const response = await serverApi.getIndexers();
      if (response.success && response.data) {
        setIndexers(response.data.filter((idx: Indexer) => idx.isEnabled === true));
      }
    } catch (err) {
      console.error('Erreur lors du chargement des indexers:', err);
      // Ne pas bloquer si on ne peut pas charger les indexers
    } finally {
      loadIndexersInFlight.current = false;
    }
  };

  const loadStatus = async () => {
    if (loadStatusInFlight.current) return;
    loadStatusInFlight.current = true;
    
    try {
      // Ne pas mettre loading à true si on a déjà un statut (pour ne pas bloquer l'interface)
      // Si on n'a pas de statut, créer un statut par défaut IMMÉDIATEMENT pour éviter le blocage
      if (!status) {
        // Créer un statut par défaut immédiatement pour que l'interface s'affiche
        setStatus({
          sync_in_progress: false,
          last_sync_date: null,
          settings: {
            sync_frequency_minutes: 60,
            is_enabled: 0,
            last_sync_date: null,
            sync_in_progress: 0,
            max_torrents_per_category: 1000,
            sync_queries_films: [],
            sync_queries_series: [],
          },
          stats: {},
          sync_start_time: null,
        });
        // Ne pas mettre loading à true pour ne pas bloquer l'interface
        // setLoading(true); // DÉSACTIVÉ pour éviter le blocage
      }
      setError('');
      
      // Ajouter un timeout côté client pour éviter de bloquer trop longtemps
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout'));
        }, 3000); // Réduire à 3 secondes pour être plus réactif
      });
      
      const response = await Promise.race([
        serverApi.getSyncStatus(),
        timeoutPromise,
      ]) as any;
      
      if (response.success && response.data) {
        const newStats = response.data.stats || {};
        
        // Log pour debug : vérifier si settings est présent
        if (!response.data.settings) {
          console.warn('[TORRENT SYNC MANAGER] ⚠️ Pas de settings dans la réponse:', response.data);
          // Si pas de settings, créer des valeurs par défaut pour éviter les erreurs
          response.data.settings = {
            sync_frequency_minutes: 60,
            is_enabled: 0,
            last_sync_date: null,
            sync_in_progress: 0,
            max_torrents_per_category: 1000,
            sync_queries_films: [],
            sync_queries_series: [],
          };
        } else {
          // S'assurer que sync_queries_films et sync_queries_series sont des tableaux
          if (!Array.isArray(response.data.settings.sync_queries_films)) {
            response.data.settings.sync_queries_films = [];
          }
          if (!Array.isArray(response.data.settings.sync_queries_series)) {
            response.data.settings.sync_queries_series = [];
          }
          
          const settingsKey = JSON.stringify({
            sync_frequency_minutes: response.data.settings.sync_frequency_minutes,
            is_enabled: response.data.settings.is_enabled,
            max_torrents_per_category: response.data.settings.max_torrents_per_category,
            sync_queries_films: response.data.settings.sync_queries_films,
            sync_queries_series: response.data.settings.sync_queries_series,
          });
          if (lastLoggedSettingsKey.current !== settingsKey) {
            console.log('[TORRENT SYNC MANAGER] ✅ Settings récupérés:', {
              sync_frequency_minutes: response.data.settings.sync_frequency_minutes,
              is_enabled: response.data.settings.is_enabled,
              max_torrents_per_category: response.data.settings.max_torrents_per_category,
              sync_queries_films: response.data.settings.sync_queries_films,
              sync_queries_series: response.data.settings.sync_queries_series,
            });
            lastLoggedSettingsKey.current = settingsKey;
          }
        }
        
        // Initialiser previousStats si c'est le début d'une sync
        if (Object.keys(previousStats).length === 0 && response.data.sync_in_progress) {
          setPreviousStats(newStats);
        }

        if (response.data.sync_in_progress) {
          if (response.data.sync_start_time) {
            setSyncStartTime(response.data.sync_start_time);
            if (!syncStartTime) {
              setPreviousStats(newStats);
            }
          } else {
            setSyncStartTime(null);
          }
        } else if (!response.data.sync_in_progress && syncStartTime) {
          setSyncStartTime(null);
          setPreviousStats({});
        }

        // Si la synchronisation vient de se terminer
        const wasInProgress = status?.sync_in_progress || false;
        const isNowInProgress = response.data.sync_in_progress;
        
        if (wasInProgress && !isNowInProgress) {
          // Notification native de complétion
          const totalAdded = Object.values(newStats).reduce((sum, count) => sum + (count || 0), 0);
          const previousTotal = Object.values(previousStats).reduce((sum, count) => sum + (count || 0), 0);
          const newTorrents = totalAdded - previousTotal;
          if (newTorrents > 0) {
            notifySyncComplete(newTorrents).catch(console.error);
          }
          loadIndexers();
          setAnimatedCounts({});
        }

        // Notification de progression (toutes les 10-20 torrents)
        if (isNowInProgress && response.data.progress) {
          const totalProcessed = response.data.progress.total_processed || 0;
          if (totalProcessed > 0 && totalProcessed % 15 === 0) {
            notifySyncProgress(totalProcessed).catch(console.error);
          }
        }
        
        setStatus(response.data);
        setError('');
      } else {
        // Si c'est un timeout, une erreur réseau ou backend indisponible, utiliser des valeurs par défaut
        if (response.error === 'Timeout' || response.error === 'NetworkError' || response.error === 'BackendUnavailable') {
          const errorMsg = response.error === 'BackendUnavailable' 
            ? 'Le backend Rust n\'est pas accessible. Vérifiez qu\'il est démarré sur le port 3000.'
            : 'Le backend ne répond pas. Utilisation des valeurs par défaut. Vérifiez que le backend est démarré.';
          setError(errorMsg);
          console.warn('[TORRENT SYNC MANAGER] ⚠️', errorMsg);
          
          // Créer un statut par défaut pour permettre l'affichage de l'interface
          if (!status) {
            setStatus({
              sync_in_progress: false,
              last_sync_date: null,
              settings: {
                sync_frequency_minutes: 60,
                is_enabled: 0,
                last_sync_date: null,
                sync_in_progress: 0,
                max_torrents_per_category: 1000,
              },
              stats: {},
              sync_start_time: null,
            });
          }
        } else {
          setError(response.message || 'Erreur lors du chargement du statut');
          // Même en cas d'erreur, essayer de garder les paramètres précédents si disponibles
          if (status?.settings) {
            console.log('[TORRENT SYNC MANAGER] ⚠️ Erreur mais conservation des paramètres précédents');
          } else if (!status) {
            // Créer un statut par défaut si on n'a pas de statut précédent
            setStatus({
              sync_in_progress: false,
              last_sync_date: null,
              settings: {
                sync_frequency_minutes: 60,
                is_enabled: 0,
                last_sync_date: null,
                sync_in_progress: 0,
                max_torrents_per_category: 1000,
              },
              stats: {},
              sync_start_time: null,
            });
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors du chargement du statut:', err);
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors du chargement du statut';
      
      // Si c'est un timeout, utiliser des valeurs par défaut pour ne pas bloquer l'interface
      if (errorMsg === 'Timeout' || errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        console.warn('[TORRENT SYNC MANAGER] ⚠️ Timeout lors du chargement du statut, utilisation de valeurs par défaut');
        setError('Le backend ne répond pas rapidement. L\'interface reste accessible.');
        
        // S'assurer qu'on a un statut (déjà créé au début, mais on le recrée au cas où)
        if (!status) {
          setStatus({
            sync_in_progress: false,
            last_sync_date: null,
            settings: {
              sync_frequency_minutes: 60,
              is_enabled: 0,
              last_sync_date: null,
              sync_in_progress: 0,
              max_torrents_per_category: 1000,
            },
            stats: {},
            sync_start_time: null,
          });
        }
      } else {
        setError(errorMsg);
        // Même en cas d'erreur, s'assurer qu'on a un statut
        if (!status) {
          setStatus({
            sync_in_progress: false,
            last_sync_date: null,
            settings: {
              sync_frequency_minutes: 60,
              is_enabled: 0,
              last_sync_date: null,
              sync_in_progress: 0,
              max_torrents_per_category: 1000,
            },
            stats: {},
            sync_start_time: null,
          });
        }
      }
    } finally {
      // Toujours mettre loading à false pour débloquer l'interface
      setLoading(false);
      loadStatusInFlight.current = false;
    }
  };

  const startSync = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      
      // Synchroniser les indexers activés vers le backend Rust avant de démarrer la sync
      console.log('[SYNC MANAGER] 🔄 Synchronisation des indexers avant démarrage de la sync...');
      await syncIndexersToBackend();
      
      const response = await serverApi.startSync();
      
      if (response.success) {
        const msg = (response.data && typeof response.data === 'string' ? response.data : null) || t('torrentSyncManager.syncStarted');
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 5000);
        await notifySyncStart();
        setPreviousStats({});
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        // Logger la réponse complète pour le debug
        console.error('[TorrentSyncManager] Erreur lors du démarrage de la sync:', {
          success: response.success,
          error: response.error,
          message: response.message,
          fullResponse: response,
        });
        
        // Améliorer le message d'erreur pour les erreurs 400
        let errorMessage = response.message || response.error || 'Erreur lors du démarrage de la synchronisation';
        
        // Messages d'erreur spécifiques selon le contenu
        if (errorMessage.includes('indexer') || errorMessage.toLowerCase().includes('aucun indexer')) {
          errorMessage = '⚠️ Aucun indexer activé dans le backend Rust. Les indexers configurés dans le wizard doivent être synchronisés avec le backend.';
        } else if (errorMessage.includes('TMDB') || errorMessage.toLowerCase().includes('token') || errorMessage.toLowerCase().includes('clé')) {
          errorMessage = '⚠️ Aucun token TMDB configuré dans le backend Rust. La clé TMDB doit être synchronisée avec le backend.';
        } else if (errorMessage.includes('déjà en cours') || errorMessage.toLowerCase().includes('already')) {
          errorMessage = '⚠️ Une synchronisation est déjà en cours. Veuillez attendre qu\'elle se termine.';
        }
        
        setError(errorMessage);
        // Notification native d'erreur
        await notifySyncError(errorMessage);
      }
    } catch (err) {
      console.error('Erreur lors du démarrage de la synchronisation:', err);
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors du démarrage de la synchronisation';
      setError(errorMsg);
      // Notification native d'erreur
      await notifySyncError(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const stopSync = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      
      const response = await serverApi.stopSync();
      
      if (response.success) {
        setSuccess(t('torrentSyncManager.syncStopped'));
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        setError(response.message || t('torrentSyncManager.errorStopping'));
      }
    } catch (err) {
      console.error('Erreur lors de l\'arrêt de la synchronisation:', err);
      setError(err instanceof Error ? err.message : t('torrentSyncManager.errorStopping'));
    } finally {
      setSyncing(false);
    }
  };

  const updateSettings = async (updates: Partial<SyncSettings>) => {
    try {
      setError('');
      setSuccess('');
      
      const response = await serverApi.updateSyncSettings(updates);
      
      if (response.success) {
        setSuccess(t('torrentSyncManager.settingsSaved'));
        loadStatus();
        syncSyncSettingsToCloud();
      } else {
        setError(response.message || t('torrentSyncManager.errorUpdating'));
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour des paramètres:', err);
      setError(err instanceof Error ? err.message : t('torrentSyncManager.errorUpdating'));
    }
  };

  const parseQueries = (text: string): string[] => {
    return text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 50);
  };

  const improveWithGemini = async () => {
    if (!TokenManager.getCloudAccessToken()) {
      setError(t('torrentSyncManager.improveWithGeminiAdminOnly'));
      return;
    }
    try {
      setGeminiLoading(true);
      setError('');
      setSuccess('');
      const result = await suggestTmdbEnrichmentRules();
      if (result.success) {
        const msg = result.inserted != null
          ? t('torrentSyncManager.improveWithGeminiSuccess') + ` (${result.inserted} règle(s))`
          : t('torrentSyncManager.improveWithGeminiSuccess');
        setSuccess(msg);
        loadStatus();
      } else {
        const msg = result.message || result.error || t('torrentSyncManager.improveWithGeminiError');
        const isAdminOnly =
          result.status === 401 ||
          result.status === 403 ||
          (typeof msg === 'string' && (msg.toLowerCase().includes('admin') || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('403')));
        const isConfigError = result.status === 400;
        if (isAdminOnly) {
          setError(t('torrentSyncManager.improveWithGeminiAdminOnly'));
        } else if (isConfigError && !msg.toLowerCase().includes('gemini')) {
          setError(t('torrentSyncManager.improveWithGeminiConfigError'));
        } else {
          setError(msg);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('torrentSyncManager.improveWithGeminiError'));
    } finally {
      setGeminiLoading(false);
    }
  };

  const clearTorrents = async () => {
    if (!confirm(t('torrentSyncManager.confirmClearAll'))) {
      return;
    }

    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      
      const response = await serverApi.clearSyncTorrents();
      
      if (response.success) {
        const count = typeof response.data === 'number' ? response.data : 0;
        setSuccess(t('torrentSyncManager.torrentsCleared', { count }));
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        setError(response.message || t('torrentSyncManager.errorClearing'));
      }
    } catch (err) {
      console.error('Erreur lors de la suppression des torrents:', err);
      setError(err instanceof Error ? err.message : t('torrentSyncManager.errorClearing'));
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return t('torrentSyncManager.never');
    const date = new Date(timestamp * 1000);
    const locale = language === 'en' ? 'en-US' : 'fr-FR';
    return date.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFrequency = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} ${t('torrentSyncManager.minutes')}`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      return `${hours} ${t('torrentSyncManager.hours')}`;
    } else {
      const days = Math.floor(minutes / 1440);
      return `${days} ${t('torrentSyncManager.days')}`;
    }
  };

  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const calculateProgress = (currentStats: Record<string, number>, previousStats: Record<string, number>): number => {
    if (!status) return 0;
    
    // Utiliser la fonction utilitaire partagée pour garantir la cohérence avec Navbar
    return calculateSyncProgress(
      {
        sync_in_progress: status.sync_in_progress,
        stats: currentStats,
        progress: status.progress,
      },
      previousStats
    );
  };

  if (loading && !status) {
    return (
      <div class="flex flex-col justify-center items-center py-12 space-y-4">
        <HLSLoadingSpinner size="lg" text={t('common.loading')} />
      </div>
    );
  }

  if (!status && !loading) {
    return (
      <div class="alert alert-error">
        <span>{t('errors.generic')}</span>
        {error && (
          <div class="mt-2 text-sm">
            <strong>{t('common.error')}:</strong> {error}
          </div>
        )}
      </div>
    );
  }

  if (!status) {
    return null;
  }

  // Mode settings only : afficher uniquement les paramètres
  if (section === 'settings') {
    return (
      <div class="space-y-6">
        {error && (
          <div class="alert alert-error">
            <span>{error}</span>
            <button class="btn btn-sm btn-ghost" onClick={() => setError('')}>×</button>
          </div>
        )}
        {success && (
          <div class="alert alert-success">
            <span>{success}</span>
          </div>
        )}
        {status.settings ? (
          <div class="card bg-base-200">
            <div class="card-body p-6">
              <h2 class="card-title text-2xl mb-4">{t('torrentSyncManager.settings')}</h2>
              <div class="space-y-4">
                <div>
                  <label class="label">
                    <span class="label-text font-semibold">{t('torrentSyncManager.syncFrequency')}</span>
                  </label>
                  <select
                    class="select select-bordered w-full"
                    value={String(status.settings?.sync_frequency_minutes ?? 60)}
                    onChange={(e) => {
                      const value = parseInt((e.target as HTMLSelectElement).value);
                      updateSettings({ sync_frequency_minutes: value });
                    }}
                  >
                    <option value="15">15 {t('torrentSyncManager.minutes')}</option>
                    <option value="30">30 {t('torrentSyncManager.minutes')}</option>
                    <option value="60">1 {t('torrentSyncManager.hours')}</option>
                    <option value="120">2 {t('torrentSyncManager.hours')}</option>
                    <option value="240">4 {t('torrentSyncManager.hours')}</option>
                    <option value="480">8 {t('torrentSyncManager.hours')}</option>
                    <option value="1440">24 {t('torrentSyncManager.hours')}</option>
                    {status.settings?.sync_frequency_minutes &&
                     ![15, 30, 60, 120, 240, 480, 1440].includes(status.settings.sync_frequency_minutes) && (
                      <option value={String(status.settings.sync_frequency_minutes)}>
                        {formatFrequency(status.settings.sync_frequency_minutes)} ({language === 'fr' ? 'personnalisé' : 'custom'})
                      </option>
                    )}
                  </select>
                  <p class="text-xs text-gray-400 mt-1">
                    {t('torrentSyncManager.currently')} : {formatFrequency(status.settings?.sync_frequency_minutes ?? 60)}
                  </p>
                </div>
                <div>
                  <label class="label cursor-pointer">
                    <span class="label-text">{t('torrentSyncManager.autoSyncEnabled')}</span>
                    <input
                      type="checkbox"
                      class="toggle toggle-primary"
                      checked={status.settings.is_enabled === 1}
                      onChange={(e) => {
                        updateSettings({ is_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 });
                      }}
                    />
                  </label>
                </div>
                <div>
                  <label class="label">
                    <span class="label-text font-semibold">{t('torrentSyncManager.maxTorrentsPerCategory')}</span>
                  </label>
                  <input
                    type="number"
                    class="input input-bordered w-full"
                    min="1"
                    max="100000"
                    value={status.settings.max_torrents_per_category || 1000}
                    onChange={(e) => {
                      const value = parseInt((e.target as HTMLInputElement).value);
                      if (value >= 1 && value <= 100000) {
                        updateSettings({ max_torrents_per_category: value });
                      }
                    }}
                  />
                </div>
                <div class="divider">{language === 'fr' ? 'Avancé' : 'Advanced'}</div>
                <div>
                  <label class="label cursor-pointer">
                    <span class="label-text">{t('torrentSyncManager.rssIncremental')}</span>
                    <input
                      type="checkbox"
                      class="toggle toggle-primary"
                      checked={(status.settings.rss_incremental_enabled || 0) === 1}
                      onChange={(e) => {
                        updateSettings({ rss_incremental_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 });
                      }}
                    />
                  </label>
                  <p class="text-xs text-gray-400 mt-1">{t('torrentSyncManager.rssIncrementalNote')}</p>
                </div>
                <div>
                  <label class="label">
                    <span class="label-text font-semibold">{t('torrentSyncManager.filmKeywords')}</span>
                  </label>
                  <textarea
                    class="textarea textarea-bordered w-full h-28"
                    value={filmsQueriesText}
                    placeholder="Ex: *\n2024\n2023\nnouveau\nrecent"
                    onInput={(e) => setFilmsQueriesText((e.target as HTMLTextAreaElement).value)}
                    onBlur={() => updateSettings({ sync_queries_films: parseQueries(filmsQueriesText) })}
                  />
                  <p class="text-xs text-gray-400 mt-1">{t('torrentSyncManager.filmKeywordsNote')}</p>
                </div>
                <div>
                  <label class="label">
                    <span class="label-text font-semibold">{t('torrentSyncManager.seriesKeywords')}</span>
                  </label>
                  <textarea
                    class="textarea textarea-bordered w-full h-28"
                    value={seriesQueriesText}
                    placeholder="Ex: *\n2024\n2023\nnouvelle\nrecente"
                    onInput={(e) => setSeriesQueriesText((e.target as HTMLTextAreaElement).value)}
                    onBlur={() => updateSettings({ sync_queries_series: parseQueries(seriesQueriesText) })}
                  />
                  <p class="text-xs text-gray-400 mt-1">{t('torrentSyncManager.seriesKeywordsNote')}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div class="card bg-base-200">
            <div class="card-body p-6">
              <div class="alert alert-warning">
                <span>{t('torrentSyncManager.settingsNotAvailable')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pendant la sync, la DB n'est mise à jour qu'après écriture : stats reste 0 alors qu'on a déjà
  // traité des torrents (total_processed). On fusionne pour l'affichage.
  const effectiveStats: Record<string, number> = { ...(status.stats || {}) };
  if (status.sync_in_progress && status.progress?.current_category && typeof status.progress.total_processed === 'number') {
    effectiveStats[status.progress.current_category] = status.progress.total_processed;
  }
  const totalTorrents = Object.values(effectiveStats).reduce((sum, count) => sum + count, 0);
  const progress = calculateProgress(
    status.sync_in_progress ? effectiveStats : (status.stats || {}),
    previousStats
  );

  // Vérifier s'il y a des torrents même si stats est vide (pour afficher le bouton de suppression)
  // On peut aussi vérifier via tmdb_stats qui compte les torrents
  const hasTorrents = totalTorrents > 0 ||
    (status.tmdb_stats && (status.tmdb_stats.with_tmdb > 0 || status.tmdb_stats.without_tmdb > 0));

  return (
    <div class="space-y-6">
      {/* Messages d'alerte */}
      {error && (
        <div class="alert alert-error animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex-1">
            <span>{error}</span>
            {(error.includes('TMDB') || error.includes('tmdb') || error.toLowerCase().includes('clé') || error.toLowerCase().includes('token')) && (
              <div class="mt-3">
                <a href="/settings/indexers" class="btn btn-sm btn-primary">
                  {t('sync.configureTmdbKey')}
                </a>
              </div>
            )}
          </div>
          <button class="btn btn-sm btn-ghost" onClick={() => setError('')}>×</button>
        </div>
      )}

      {success && (
        <div class="alert alert-success animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
          <button class="btn btn-sm btn-ghost" onClick={() => setSuccess('')}>×</button>
        </div>
      )}

      {/* Carte principale de synchronisation */}
      <div class="card bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700 shadow-2xl">
        <div class="card-body p-6">
          {/* En-tête avec statut */}
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div class="flex-1">
              <h2 class="text-2xl sm:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                {status.sync_in_progress ? (
                  <>
                    <span class="loading loading-spinner loading-md text-primary animate-spin"></span>
                    <span class="animate-pulse">{t('torrentSyncManager.synchronizationInProgress')}</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{t('torrentSyncManager.status')}</span>
                  </>
                )}
              </h2>
              <p class="text-gray-400 text-sm">
                {status.sync_in_progress 
                  ? t('torrentSyncManager.elapsedSince', { time: formatElapsedTime(elapsedTime) })
                  : status.last_sync_date 
                    ? t('torrentSyncManager.lastSync', { date: formatDate(status.last_sync_date) })
                    : t('torrentSyncManager.neverSynced')}
              </p>
            </div>
            
            {/* Badge de statut retiré (doublon visuel) */}

            {/* Bouton actualiser */}
            <button
              class="btn btn-sm btn-ghost"
              onClick={loadStatus}
              disabled={loading}
            >
              <RefreshCw class={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {/* Télécharger le journal de synchronisation */}
            <button
              class="btn btn-sm btn-ghost"
              onClick={async () => {
                const res = await serverApi.downloadSyncLog();
                if (!res.success) setError(res.message || t('torrentSyncManager.downloadLogError'));
              }}
              title={t('torrentSyncManager.downloadLog')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="hidden sm:inline">{t('torrentSyncManager.downloadLog')}</span>
            </button>
            <a
              href="/settings/debug-sync"
              class="btn btn-sm btn-ghost text-gray-400 hover:text-white"
              title={t('settingsPages.debugSync.debugLink')}
            >
              <span class="hidden sm:inline">{t('settingsPages.debugSync.debugLink')}</span>
            </a>
          </div>

          {/* Section sync en cours : récupérés → en base (infos fiables) */}
          {status.sync_in_progress && (
            <div class="space-y-4 animate-fade-in">
              <p class="text-gray-400 text-xs">{t('torrentSyncManager.fetchThenEnrich')}</p>

              {/* Bannière phase : expliquer pourquoi "0 en base" pendant la récupération */}
              {status.progress && (() => {
                const totalToProcess = status.progress.total_to_process ?? 0;
                const fetchedCount = status.progress.category_torrents
                  ? Object.values(status.progress.category_torrents).reduce((s, n) => s + (n || 0), 0)
                  : 0;
                const isPhaseFetch = totalToProcess === 0 && fetchedCount > 0;
                if (isPhaseFetch) {
                  return (
                    <div class="bg-blue-900/40 border border-blue-500/50 rounded-lg p-4">
                      <p class="text-blue-300 font-semibold text-sm flex items-center gap-2">
                        <span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                        {t('torrentSyncManager.phaseFetch')}
                        {status.progress.current_query && (
                          <span class="text-blue-200/90 font-normal">— {status.progress.current_query}</span>
                        )}
                      </p>
                      <p class="text-gray-300 text-xs mt-2">{t('torrentSyncManager.phaseFetchExplanation')}</p>
                    </div>
                  );
                }
                if (totalToProcess > 0) {
                  return (
                    <p class="text-green-400/90 text-xs font-medium flex items-center gap-2">
                      <span class="w-1.5 h-1.5 bg-green-400 rounded-full" />
                      {t('torrentSyncManager.phaseEnrich')} : {t('torrentSyncManager.phaseEnrichProgress', {
                        current: (status.progress.total_processed ?? 0).toLocaleString(),
                        total: totalToProcess.toLocaleString(),
                      })}
                    </p>
                  );
                }
                return null;
              })()}

              {/* Informations de progression en temps réel */}
              {status.progress && (
                <div class="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-6 border-2 border-blue-500/50">
                  <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('torrentSyncManager.synchronizationInProgress')}
                  </h3>
                  
                  <div class="space-y-3">
                    {/* Indexer actuel */}
                    {status.progress.current_indexer && (
                      <div class="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                        <div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <div class="flex-1">
                          <p class="text-gray-400 text-xs">{t('torrentSyncManager.currentIndexer')}</p>
                          <p class="text-white font-semibold text-sm">{status.progress.current_indexer}</p>
                          {status.progress.indexer_torrents[status.progress.current_indexer] !== undefined && status.progress.total_to_process > 0 && (
                            <p class="text-gray-500 text-xs mt-1">
                              {status.progress.indexer_torrents[status.progress.current_indexer].toLocaleString()} {t('torrentSyncManager.fetchedFromIndexers')} → {status.progress.total_to_process} {t('torrentSyncManager.toProcess')}
                            </p>
                          )}
                        </div>
                          {status.progress.indexer_torrents[status.progress.current_indexer] !== undefined && (
                          <div class="text-right">
                            <p class="text-primary font-bold text-lg">{status.progress.indexer_torrents[status.progress.current_indexer]}</p>
                            <p class="text-gray-400 text-xs">{t('torrentSyncManager.fetchedFromIndexers')}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Catégorie actuelle : X récupérés → Y en base */}
                    {status.progress.current_category && (
                      <div class="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                        <div class="text-2xl">
                          {status.progress.current_category === 'films' ? '🎬' : status.progress.current_category === 'series' ? '📺' : '📦'}
                        </div>
                        <div class="flex-1">
                          <p class="text-gray-400 text-xs">{t('torrentSyncManager.category')}</p>
                          <p class="text-white font-semibold text-sm capitalize">{status.progress.current_category}</p>
                          {status.progress.category_torrents[status.progress.current_category] !== undefined && (
                            <p class="text-gray-500 text-xs mt-1">
                              {status.progress.category_torrents[status.progress.current_category].toLocaleString()} {t('torrentSyncManager.fetchedFromIndexers')} → {(effectiveStats[status.progress.current_category] ?? 0).toLocaleString()} {t('torrentSyncManager.inDatabase')}
                            </p>
                          )}
                        </div>
                        {status.progress.category_torrents[status.progress.current_category] !== undefined && (
                          <div class="text-right">
                            <p class="text-primary font-bold text-lg">{status.progress.category_torrents[status.progress.current_category]}</p>
                            <p class="text-gray-400 text-xs">→ {(effectiveStats[status.progress.current_category] ?? 0).toLocaleString()} {t('torrentSyncManager.inDatabase')}</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Requête actuelle */}
                    {status.progress.current_query && (
                      <div class="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <div class="flex-1">
                          <p class="text-gray-400 text-xs">{t('torrentSyncManager.searchQuery')}</p>
                          <p class="text-white font-semibold text-sm">"{status.progress.current_query}"</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Progression du traitement */}
                    {status.progress.total_to_process > 0 && (
                      <div class="bg-gray-800/50 rounded-lg p-3">
                        <div class="flex justify-between items-center mb-2">
                          <div>
                            <p class="text-gray-400 text-xs">Traitement des torrents</p>
                            <p class="text-gray-500 text-xs mt-0.5">
                              Après filtrage et enrichissement TMDB
                            </p>
                          </div>
                          <p class="text-primary font-bold text-sm">
                            {status.progress.total_processed} / {status.progress.total_to_process}
                          </p>
                        </div>
                        <div class="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            class="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300"
                            style={`width: ${Math.min(100, (status.progress.total_processed / status.progress.total_to_process) * 100)}%`}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    {/* Erreurs récentes */}
                    {status.progress.errors && status.progress.errors.length > 0 && (
                      <div class="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                        <p class="text-red-400 text-xs font-semibold mb-2">
                          ⚠️ {t('torrentSyncManager.recentErrors')} ({status.progress.errors.length})
                        </p>
                        <div class="space-y-1 max-h-32 overflow-y-auto">
                          {status.progress.errors.slice(-5).map((error, idx) => (
                            <p key={idx} class="text-red-300 text-xs truncate" title={error}>{error}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Indexers en pills compacts */}
              {indexers.length > 0 && (
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-gray-400 text-xs">{t('torrentSyncManager.activeIndexers')}:</span>
                  {indexers.map((indexer) => {
                    const isCurrent = status.progress?.current_indexer === indexer.name;
                    const n = status.progress?.indexer_torrents?.[indexer.name] ?? 0;
                    return (
                      <span
                        key={indexer.id}
                        class={`badge badge-sm ${isCurrent ? 'badge-primary' : 'badge-ghost'} transition-all`}
                        title={indexer.baseUrl}
                      >
                        {isCurrent && <span class="w-1 h-1 rounded-full bg-white mr-1 animate-pulse" />}
                        {indexer.name}
                        {n > 0 && <span class="ml-1 opacity-80">({n.toLocaleString()})</span>}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Barre de progression */}
              <div class="flex items-center gap-3">
                <div class="flex-1 h-2.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out"
                    style={`width: ${Math.min(100, progress)}%`}
                  />
                </div>
                <span class="text-primary font-bold tabular-nums min-w-[3ch]">{progress}%</span>
              </div>

              {/* Catégories : récupérés (indexeurs) → en base — évite "600 sync mais 0 films" */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['films', 'series', 'others'] as const).map((category) => {
                  const fetched = status.progress?.category_torrents?.[category] ?? 0;
                  const inBase = Math.floor(animatedCounts[category] ?? effectiveStats[category] ?? 0);
                  const isCurrent = status.progress?.current_category === category;
                  const icon = category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦';
                  const label = category === 'films' ? t('torrentSyncManager.films') : category === 'series' ? t('torrentSyncManager.series') : t('torrentSyncManager.others');
                  const enriching = fetched > 0 && inBase === 0;
                  return (
                    <div
                      key={category}
                      class={`rounded-lg p-3 border transition-all duration-300 ${
                        isCurrent ? 'bg-primary/15 border-primary ring-1 ring-primary/50' : 'bg-gray-800/50 border-gray-700'
                      }`}
                    >
                      <div class="flex items-center justify-between gap-2 mb-1.5">
                        <span class="text-base">{icon}</span>
                        <span class="text-white font-semibold text-sm">{label}</span>
                        {isCurrent && <span class="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                      </div>
                      <div class="flex items-baseline gap-2 flex-wrap text-xs">
                        <span class="text-gray-400">{t('torrentSyncManager.fetchedFromIndexers')}:</span>
                        <span class="font-bold text-white">{fetched.toLocaleString()}</span>
                        <span class="text-gray-500">→</span>
                        <span class="text-gray-400">{t('torrentSyncManager.inDatabase')}:</span>
                        <span class="font-bold text-primary tabular-nums">{inBase.toLocaleString()}</span>
                      </div>
                      {enriching && (
                        <p class="text-xs text-blue-400 mt-1.5 animate-pulse">{t('torrentSyncManager.enrichingInProgress')}</p>
                      )}
                    </div>
                  );
                })}
                
                {/* Carte TMDB compacte */}
                {status.tmdb_stats && (() => {
                  const tmdbTotal = status.tmdb_stats.with_tmdb + status.tmdb_stats.without_tmdb;
                  const tmdbPercentage = tmdbTotal > 0 ? Math.round((status.tmdb_stats.with_tmdb / tmdbTotal) * 100) : 0;
                  return tmdbTotal > 0 && (
                    <div class="bg-gradient-to-br from-blue-800/50 to-purple-900/50 rounded-lg p-3 border border-blue-500/50">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-white font-semibold text-sm">TMDB</span>
                        {tmdbPercentage === 100 && <span class="badge badge-success badge-sm">100%</span>}
                      </div>
                      <div class="text-2xl font-bold text-blue-400 mt-1">
                        {status.tmdb_stats.with_tmdb.toLocaleString()}
                        <span class="text-gray-400 text-sm font-normal ml-1">/ {tmdbTotal.toLocaleString()}</span>
                      </div>
                      <div class="text-xs text-blue-300 mt-0.5">{tmdbPercentage}% {t('torrentSyncManager.enriched')}</div>
                    </div>
                  );
                })()}
                {(() => {
                  // Calculer le total de torrents récupérés depuis progress
                  const fetchedTotal = status.progress?.indexer_torrents
                    ? Object.values(status.progress.indexer_torrents).reduce((sum, n) => sum + (n || 0), 0)
                    : 0;
                  const hasFetchedTorrents = fetchedTotal > 0;
                  const hasInsertedTorrents = Object.keys(status.stats || {}).length > 0;
                  
                  // "Aucun torrent trouvé" uniquement si vraiment rien récupéré (affiché plus bas en compact)
                  return null;
                })()}
              </div>

              {/* Total en base */}
              <div class="flex justify-between items-center pt-1 border-t border-gray-700">
                <span class="text-gray-400 text-sm">{t('torrentSyncManager.totalSynced')}</span>
                <span class="text-primary font-bold text-xl tabular-nums">{totalTorrents.toLocaleString()}</span>
              </div>

              {/* Message si aucun torrent récupéré du tout */}
              {(() => {
                const fetchedTotal = status.progress?.indexer_torrents
                  ? Object.values(status.progress.indexer_torrents).reduce((s, n) => s + (n || 0), 0)
                  : 0;
                if (fetchedTotal > 0 || totalTorrents > 0) return null;
                return (
                  <div class="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
                    <p class="text-yellow-400 text-sm font-medium">{t('torrentSyncManager.noTorrentsFound')}</p>
                    <p class="text-gray-400 text-xs mt-1">{t('torrentSyncManager.syncInProgressNoResults')}</p>
                    {elapsedTime > 30 && (
                      <p class="text-red-400/90 text-xs mt-2">{t('torrentSyncManager.noResultsAfter', { time: formatElapsedTime(elapsedTime) })}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Section inactive */}
          {!status.sync_in_progress && (
            <div class="space-y-4">
              {/* Statistiques rapides */}
              {totalTorrents > 0 && (
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries(status.stats || {}).map(([category, count]) => {
                    const icon = category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦';
                    return (
                      <div key={category} class="bg-gray-800/50 rounded-lg p-4 text-center border border-gray-700">
                        <div class="text-3xl mb-1">{icon}</div>
                        <div class="text-white font-bold text-xl">{count.toLocaleString()}</div>
                        <div class="text-gray-400 text-xs capitalize">
                          {category === 'films' ? t('torrentSyncManager.films') : category === 'series' ? t('torrentSyncManager.series') : t('torrentSyncManager.others')}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Carte TMDB - Ratio enrichi (section inactive) */}
                  {status.tmdb_stats && (() => {
                    const tmdbTotal = status.tmdb_stats.with_tmdb + status.tmdb_stats.without_tmdb;
                    const tmdbPercentage = tmdbTotal > 0 ? Math.round((status.tmdb_stats.with_tmdb / tmdbTotal) * 100) : 0;
                    return tmdbTotal > 0 && (
                      <div class="bg-gradient-to-br from-blue-800/50 to-purple-900/50 rounded-lg p-4 text-center border-2 border-blue-500/50">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto mb-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div class="text-white font-bold text-xl mb-1">
                          {status.tmdb_stats.with_tmdb.toLocaleString()}
                        </div>
                        <div class="text-gray-300 text-xs mb-1">
                          {language === 'fr' ? 'sur' : 'of'} {tmdbTotal.toLocaleString()}
                        </div>
                        <div class="text-blue-300 font-semibold text-xs">
                          {tmdbPercentage}% {language === 'fr' ? 'avec TMDB' : 'with TMDB'}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Statistiques TMDB */}
              {status.tmdb_stats && totalTorrents > 0 && (
                <div class="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-6 border-2 border-blue-500/50">
                  <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {language === 'fr' ? 'Enrichissement TMDB' : 'TMDB Enrichment'}
                  </h3>
                  
                  <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-green-900/30 rounded-lg p-4 border border-green-500/30">
                      <div class="text-green-400 text-sm font-semibold mb-1">{t('torrentSyncManager.withTmdb')}</div>
                      <div class="text-white font-bold text-2xl">{status.tmdb_stats.with_tmdb.toLocaleString()}</div>
                      <div class="text-gray-400 text-xs mt-1">
                        {totalTorrents > 0 
                          ? `${Math.round((status.tmdb_stats.with_tmdb / totalTorrents) * 100)}% ${t('torrentSyncManager.ofTorrents')}`
                          : '0%'}
                      </div>
                    </div>
                    
                    <div class={`rounded-lg p-4 border ${
                      status.tmdb_stats.without_tmdb > 0 
                        ? 'bg-yellow-900/30 border-yellow-500/30' 
                        : 'bg-gray-900/30 border-gray-700'
                    }`}>
                      <div class={`text-sm font-semibold mb-1 ${
                        status.tmdb_stats.without_tmdb > 0 ? 'text-yellow-400' : 'text-gray-400'
                      }`}>
                        {t('torrentSyncManager.withoutTmdb')}
                      </div>
                      <div class={`font-bold text-2xl ${
                        status.tmdb_stats.without_tmdb > 0 ? 'text-yellow-300' : 'text-gray-300'
                      }`}>
                        {status.tmdb_stats.without_tmdb.toLocaleString()}
                      </div>
                      <div class="text-gray-400 text-xs mt-1">
                        {totalTorrents > 0 
                          ? `${Math.round((status.tmdb_stats.without_tmdb / totalTorrents) * 100)}% ${t('torrentSyncManager.ofTorrents')}`
                          : '0%'}
                      </div>
                    </div>
                  </div>

                  {/* Liste des torrents sans TMDB ID */}
                  {status.tmdb_stats.without_tmdb > 0 && (
                    <div class="mt-4">
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-yellow-400 text-sm font-semibold">
                          {t('torrentSyncManager.torrentsWithoutTmdb')} ({status.tmdb_stats.missing_tmdb.length > 0 ? status.tmdb_stats.missing_tmdb.length : status.tmdb_stats.without_tmdb})
                        </p>
                        {status.tmdb_stats.without_tmdb > 50 && (
                          <p class="text-gray-400 text-xs">
                            {t('torrentSyncManager.displayingFirst')}
                          </p>
                        )}
                      </div>
                      <div class="bg-gray-900/50 rounded-lg p-3 max-h-64 overflow-y-auto">
                        <div class="space-y-2">
                          {status.tmdb_stats.missing_tmdb.length > 0 ? (
                            status.tmdb_stats.missing_tmdb.map(([name, category], idx) => (
                              <div key={idx} class="flex items-center gap-2 text-sm">
                                <span class="text-gray-400 text-xs w-16 capitalize truncate">
                                  {category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦'} {category}
                                </span>
                                <span class="text-gray-300 flex-1 truncate" title={name}>{name}</span>
                              </div>
                            ))
                          ) : (
                            <p class="text-gray-400 text-sm text-center py-2">
                              {t('torrentSyncManager.noneWithoutTmdb')}
                            </p>
                          )}
                        </div>
                      </div>
                      {status.tmdb_stats.without_tmdb > 0 && (
                        <p class="text-gray-400 text-xs mt-2">
                          {t('torrentSyncManager.tipNoTmdb')}
                        </p>
                      )}
                      {status.tmdb_stats.without_tmdb > 0 && hasCloudToken && (
                        <div class="mt-3">
                          <button
                            type="button"
                            class="btn btn-sm btn-primary gap-2"
                            onClick={improveWithGemini}
                            disabled={geminiLoading || status.sync_in_progress}
                            title={t('torrentSyncManager.improveWithGemini')}
                          >
                            {geminiLoading ? (
                              <span class="loading loading-spinner loading-sm"></span>
                            ) : (
                              <Sparkles class="w-4 h-4" />
                            )}
                            {t('torrentSyncManager.improveWithGemini')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message de succès si tous les torrents ont un ID TMDB */}
                  {status.tmdb_stats.without_tmdb === 0 && status.tmdb_stats.with_tmdb > 0 && (
                    <div class="mt-4 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                      <p class="text-green-400 text-sm font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('torrentSyncManager.allHaveTmdb')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {totalTorrents === 0 && (
                <div class="text-center py-12 bg-gray-800/30 rounded-xl border border-yellow-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mx-auto text-yellow-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p class="text-yellow-400 text-lg font-semibold mb-2">{t('torrentSyncManager.noTorrentsSynced')}</p>
                  <p class="text-gray-400 text-sm mb-4">{t('torrentSyncManager.lastSyncNoResults')}</p>
                  
                  {indexers.length > 0 ? (
                    <div class="mt-6 space-y-3">
                      <p class="text-gray-300 text-sm font-semibold">{t('torrentSyncManager.activeIndexersCount', { count: indexers.length })}</p>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {indexers.map((indexer) => (
                          <div key={indexer.id} class="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                            <div class="flex items-center gap-2">
                              <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                              <div class="flex-1 min-w-0">
                                <p class="text-white text-sm font-medium truncate" title={indexer.name}>{indexer.name}</p>
                                <p class="text-gray-500 text-xs truncate" title={indexer.baseUrl}>{indexer.baseUrl}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div class="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                      <p class="text-red-400 text-sm font-semibold mb-2">{t('torrentSyncManager.noIndexerActivated')}</p>
                      <p class="text-gray-400 text-xs mb-3">{t('torrentSyncManager.mustConfigureIndexer')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div class="flex flex-wrap gap-3 mt-6">
            {status.sync_in_progress ? (
              <button
                class="btn btn-error flex-1 sm:flex-none"
                onClick={stopSync}
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <span class="loading loading-spinner loading-sm"></span>
                    {t('torrentSyncManager.stopping')}
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    {t('torrentSyncManager.stopSync')}
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  class="btn btn-primary flex-1 sm:flex-none"
                  onClick={startSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <>
                      <span class="loading loading-spinner loading-sm"></span>
                      {t('sync.starting')}
                    </>
                  ) : (
                    <>
                      <RefreshCw class="w-4 h-4" />
                      {t('torrentSyncManager.launchSync')}
                    </>
                  )}
                </button>
                {hasTorrents && (
                  <button
                    class="btn btn-error flex-1 sm:flex-none"
                    onClick={clearTorrents}
                    disabled={syncing || status.sync_in_progress}
                    title={t('torrentSyncManager.clearTorrents')}
                  >
                    {syncing ? (
                      <>
                        <span class="loading loading-spinner loading-sm"></span>
                        {t('torrentSyncManager.clearing')}
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {t('torrentSyncManager.clearTorrents')}
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Paramètres de synchronisation (visible sur la page Sync) */}
          {status.settings && (
            <div class="mt-6 pt-6 border-t border-gray-700">
              <h3 class="text-lg font-semibold text-white mb-4">{t('torrentSyncManager.settings')}</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label class="label py-0">
                    <span class="label-text font-semibold">{t('torrentSyncManager.syncFrequency')}</span>
                  </label>
                  <select
                    class="select select-bordered w-full select-sm"
                    value={String(status.settings?.sync_frequency_minutes ?? 60)}
                    onChange={(e) => {
                      const value = parseInt((e.target as HTMLSelectElement).value);
                      updateSettings({ sync_frequency_minutes: value });
                    }}
                  >
                    <option value="15">15 {t('torrentSyncManager.minutes')}</option>
                    <option value="30">30 {t('torrentSyncManager.minutes')}</option>
                    <option value="60">1 {t('torrentSyncManager.hours')}</option>
                    <option value="120">2 {t('torrentSyncManager.hours')}</option>
                    <option value="240">4 {t('torrentSyncManager.hours')}</option>
                    <option value="480">8 {t('torrentSyncManager.hours')}</option>
                    <option value="1440">24 {t('torrentSyncManager.hours')}</option>
                    {status.settings?.sync_frequency_minutes &&
                     ![15, 30, 60, 120, 240, 480, 1440].includes(status.settings.sync_frequency_minutes) && (
                      <option value={String(status.settings.sync_frequency_minutes)}>
                        {formatFrequency(status.settings.sync_frequency_minutes)} ({language === 'fr' ? 'personnalisé' : 'custom'})
                      </option>
                    )}
                  </select>
                </div>
                <div>
                  <label class="label py-0">
                    <span class="label-text font-semibold">{t('torrentSyncManager.maxTorrentsPerCategory')}</span>
                  </label>
                  <input
                    type="number"
                    class="input input-bordered w-full input-sm"
                    min={1}
                    max={100000}
                    value={status.settings.max_torrents_per_category || 1000}
                    onBlur={(e) => {
                      const value = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(value) && value >= 1 && value <= 100000) {
                        updateSettings({ max_torrents_per_category: value });
                      }
                    }}
                  />
                  <p class="text-xs text-gray-400 mt-1">{t('torrentSyncManager.maxTorrentsPerCategoryHint')}</p>
                </div>
                <div class="flex items-end pb-1">
                  <label class="label cursor-pointer flex-1 flex items-center gap-3">
                    <input
                      type="checkbox"
                      class="toggle toggle-primary toggle-sm"
                      checked={status.settings.is_enabled === 1}
                      onChange={(e) => {
                        updateSettings({ is_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 });
                      }}
                    />
                    <span class="label-text">{t('torrentSyncManager.autoSyncEnabled')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
