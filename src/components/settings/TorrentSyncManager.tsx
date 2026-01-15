import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { RefreshCw } from 'lucide-preact';
import type { Indexer } from '../../lib/client/types';

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

export default function TorrentSyncManager() {
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

  // Évite les appels concurrents (polling + clics) et réduit les boucles de logs
  const loadStatusInFlight = useRef(false);
  const loadIndexersInFlight = useRef(false);
  const lastLoggedSettingsKey = useRef<string>('');

  useEffect(() => {
    loadStatus();
    loadIndexers();
  }, []);

  // Sync local textarea state from backend settings (quand la réponse arrive)
  useEffect(() => {
    const s = status?.settings;
    if (!s) return;
    const films = Array.isArray(s.sync_queries_films) ? s.sync_queries_films : [];
    const series = Array.isArray(s.sync_queries_series) ? s.sync_queries_series : [];
    const filmsText = films.join('\n');
    const seriesText = series.join('\n');
    setFilmsQueriesText((prev) => (prev === filmsText ? prev : filmsText));
    setSeriesQueriesText((prev) => (prev === seriesText ? prev : seriesText));
  }, [status?.settings]);

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

  // Animation des compteurs
  useEffect(() => {
    if (status?.stats) {
      Object.entries(status.stats).forEach(([category, targetCount]) => {
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
  }, [status?.stats]);

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
          };
        } else {
          const settingsKey = JSON.stringify({
            sync_frequency_minutes: response.data.settings.sync_frequency_minutes,
            is_enabled: response.data.settings.is_enabled,
            max_torrents_per_category: response.data.settings.max_torrents_per_category,
          });
          if (lastLoggedSettingsKey.current !== settingsKey) {
            console.log('[TORRENT SYNC MANAGER] ✅ Settings récupérés:', {
              sync_frequency_minutes: response.data.settings.sync_frequency_minutes,
              is_enabled: response.data.settings.is_enabled,
              max_torrents_per_category: response.data.settings.max_torrents_per_category,
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
          loadIndexers();
          setAnimatedCounts({});
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
        setSuccess('Synchronisation démarrée avec succès');
        setPreviousStats({});
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        // Améliorer le message d'erreur pour les erreurs 400
        let errorMessage = response.message || 'Erreur lors du démarrage de la synchronisation';
        if (response.error === 'BadRequest' || errorMessage.includes('indexer') || errorMessage.includes('TMDB')) {
          if (errorMessage.includes('indexer')) {
            errorMessage = '⚠️ Aucun indexer activé dans le backend Rust. Les indexers configurés dans le wizard doivent être synchronisés avec le backend.';
          } else if (errorMessage.includes('TMDB')) {
            errorMessage = '⚠️ Aucun token TMDB configuré dans le backend Rust. La clé TMDB doit être synchronisée avec le backend.';
          }
        }
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Erreur lors du démarrage de la synchronisation:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du démarrage de la synchronisation');
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
        setSuccess('Synchronisation arrêtée avec succès');
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        setError(response.message || 'Erreur lors de l\'arrêt de la synchronisation');
      }
    } catch (err) {
      console.error('Erreur lors de l\'arrêt de la synchronisation:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'arrêt de la synchronisation');
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
        setSuccess('Paramètres mis à jour avec succès');
        loadStatus();
      } else {
        setError(response.message || 'Erreur lors de la mise à jour des paramètres');
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour des paramètres:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour des paramètres');
    }
  };

  const parseQueries = (text: string): string[] => {
    return text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 50);
  };

  const clearTorrents = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tous les torrents synchronisés ? Cette action est irréversible.')) {
      return;
    }

    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      
      const response = await serverApi.clearSyncTorrents();
      
      if (response.success) {
        const count = typeof response.data === 'number' ? response.data : 0;
        setSuccess(`✅ ${count} torrent(s) supprimé(s) avec succès`);
        setTimeout(() => {
          loadStatus();
          loadIndexers();
        }, 1000);
      } else {
        setError(response.message || 'Erreur lors de la suppression des torrents');
      }
    } catch (err) {
      console.error('Erreur lors de la suppression des torrents:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression des torrents');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return 'Jamais';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFrequency = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      return `${hours} heure${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(minutes / 1440);
      return `${days} jour${days > 1 ? 's' : ''}`;
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
    if (!status?.sync_in_progress) return 0;
    
    const totalCurrent = Object.values(currentStats || {}).reduce((sum, count) => sum + count, 0);
    const totalPrevious = Object.values(previousStats || {}).reduce((sum, count) => sum + count, 0);
    
    if (totalPrevious === 0) {
      return totalCurrent > 0 ? 10 : 0;
    }
    
    const estimatedTotal = totalPrevious * 2;
    const progress = Math.min(95, Math.floor((totalCurrent / estimatedTotal) * 100));
    
    return progress;
  };

  if (loading && !status) {
    return (
      <div class="flex flex-col justify-center items-center py-12 space-y-4">
        <span class="loading loading-spinner loading-lg"></span>
        <p class="text-gray-400 text-sm">Chargement du statut de synchronisation...</p>
      </div>
    );
  }

  if (!status && !loading) {
    return (
      <div class="alert alert-error">
        <span>Impossible de charger le statut de synchronisation</span>
        {error && (
          <div class="mt-2 text-sm">
            <strong>Erreur:</strong> {error}
          </div>
        )}
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const totalTorrents = Object.values(status.stats || {}).reduce((sum, count) => sum + count, 0);
  const progress = calculateProgress(status.stats, previousStats);
  
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
          <span>{error}</span>
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
                    <span class="animate-pulse">Synchronisation en cours</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Synchronisation</span>
                  </>
                )}
              </h2>
              <p class="text-gray-400 text-sm">
                {status.sync_in_progress 
                  ? `En cours depuis ${formatElapsedTime(elapsedTime)}`
                  : status.last_sync_date 
                    ? `Dernière sync: ${formatDate(status.last_sync_date)}`
                    : 'Aucune synchronisation effectuée'}
              </p>
            </div>
            
            {/* Badge de statut */}
            <div class="badge badge-lg">
              {status.sync_in_progress ? (
                <span class="badge badge-warning animate-pulse">En cours...</span>
              ) : (
                <span class="badge badge-success">Inactif</span>
              )}
            </div>

            {/* Bouton actualiser */}
            <button
              class="btn btn-sm btn-ghost"
              onClick={loadStatus}
              disabled={loading}
            >
              <RefreshCw class={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Section de synchronisation active avec animations */}
          {status.sync_in_progress && (
            <div class="space-y-6 animate-fade-in">
              {/* Informations de progression en temps réel */}
              {status.progress && (
                <div class="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-6 border-2 border-blue-500/50">
                  <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Synchronisation en cours
                  </h3>
                  
                  <div class="space-y-3">
                    {/* Indexer actuel */}
                    {status.progress.current_indexer && (
                      <div class="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                        <div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <div class="flex-1">
                          <p class="text-gray-400 text-xs">Indexer actuel</p>
                          <p class="text-white font-semibold text-sm">{status.progress.current_indexer}</p>
                        </div>
                        {status.progress.indexer_torrents[status.progress.current_indexer] !== undefined && (
                          <div class="text-right">
                            <p class="text-primary font-bold text-lg">{status.progress.indexer_torrents[status.progress.current_indexer]}</p>
                            <p class="text-gray-400 text-xs">torrents</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Catégorie actuelle */}
                    {status.progress.current_category && (
                      <div class="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                        <div class="text-2xl">
                          {status.progress.current_category === 'films' ? '🎬' : status.progress.current_category === 'series' ? '📺' : '📦'}
                        </div>
                        <div class="flex-1">
                          <p class="text-gray-400 text-xs">Catégorie</p>
                          <p class="text-white font-semibold text-sm capitalize">{status.progress.current_category}</p>
                        </div>
                        {status.progress.category_torrents[status.progress.current_category] !== undefined && (
                          <div class="text-right">
                            <p class="text-primary font-bold text-lg">{status.progress.category_torrents[status.progress.current_category]}</p>
                            <p class="text-gray-400 text-xs">torrents</p>
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
                          <p class="text-gray-400 text-xs">Requête de recherche</p>
                          <p class="text-white font-semibold text-sm">"{status.progress.current_query}"</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Progression du traitement */}
                    {status.progress.total_to_process > 0 && (
                      <div class="bg-gray-800/50 rounded-lg p-3">
                        <div class="flex justify-between items-center mb-2">
                          <p class="text-gray-400 text-xs">Traitement des torrents</p>
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
                          ⚠️ Erreurs récentes ({status.progress.errors.length})
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
              
              {/* Indexers actifs */}
              {indexers.length > 0 && (
                <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Indexers actifs ({indexers.length})
                  </h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {indexers.map((indexer, idx) => {
                      const isCurrent = status.progress?.current_indexer === indexer.name;
                      const torrentCount = status.progress?.indexer_torrents[indexer.name] || 0;
                      return (
                        <div 
                          key={indexer.id} 
                          class={`rounded-lg p-4 border transition-all duration-300 ${
                            isCurrent 
                              ? 'bg-primary/20 border-primary border-2' 
                              : 'bg-gray-900/50 border-gray-700 hover:border-primary/50'
                          }`}
                        >
                          <div class="flex items-center gap-3">
                            <div class="relative">
                              {isCurrent ? (
                                <>
                                  <div class="w-3 h-3 bg-primary rounded-full animate-ping"></div>
                                  <div class="absolute top-0 left-0 w-3 h-3 bg-primary rounded-full"></div>
                                </>
                              ) : (
                                <div class="w-3 h-3 bg-gray-500 rounded-full"></div>
                              )}
                            </div>
                            <div class="flex-1 min-w-0">
                              <p class="text-white font-semibold text-sm truncate">{indexer.name}</p>
                              <p class="text-gray-400 text-xs truncate">{indexer.baseUrl}</p>
                            </div>
                            {torrentCount > 0 && (
                              <div class="text-right">
                                <p class="text-primary font-bold text-sm">{torrentCount}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Barre de progression animée */}
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-white font-semibold">Progression</span>
                  <span class="text-primary font-bold text-xl">{progress}%</span>
                </div>
                <div class="relative h-6 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                    style={`width: ${progress}%`}
                  >
                    {progress > 10 && (
                      <span class="text-xs text-white font-bold">{progress}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Compteurs par catégorie avec animations */}
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(status.stats || {}).map(([category, count]) => {
                  const animatedCount = Math.floor(animatedCounts[category] || 0);
                  const previousCount = previousStats[category] || 0;
                  const newCount = Math.max(0, count - previousCount);
                  const icon = category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦';
                  
                  return (
                    <div 
                      key={category} 
                      class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border-2 border-gray-700 hover:border-primary/50 transition-all duration-300 transform hover:scale-105"
                    >
                      <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                          <span class="text-3xl">{icon}</span>
                          <span class="text-white font-semibold text-sm capitalize">
                            {category === 'films' ? 'Films' : category === 'series' ? 'Séries' : 'Autres'}
                          </span>
                        </div>
                        {newCount > 0 && (
                          <span class="badge badge-success badge-sm animate-bounce">
                            +{newCount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div class="text-4xl font-bold text-primary mb-2">
                        {animatedCount.toLocaleString()}
                      </div>
                      <div class="text-xs text-gray-400">
                        torrents synchronisés
                      </div>
                    </div>
                  );
                })}
                
                {/* Carte TMDB - Ratio enrichi */}
                {status.tmdb_stats && (() => {
                  const tmdbTotal = status.tmdb_stats.with_tmdb + status.tmdb_stats.without_tmdb;
                  const tmdbPercentage = tmdbTotal > 0 ? Math.round((status.tmdb_stats.with_tmdb / tmdbTotal) * 100) : 0;
                  return tmdbTotal > 0 && (
                    <div 
                      class="bg-gradient-to-br from-blue-800/50 to-purple-900/50 rounded-xl p-6 border-2 border-blue-500/50 hover:border-blue-400 transition-all duration-300 transform hover:scale-105"
                    >
                      <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span class="text-white font-semibold text-sm">TMDB</span>
                        </div>
                        {tmdbPercentage === 100 && (
                          <span class="badge badge-success badge-sm">100%</span>
                        )}
                      </div>
                      <div class="text-4xl font-bold text-blue-400 mb-2">
                        {status.tmdb_stats.with_tmdb.toLocaleString()}
                      </div>
                      <div class="text-xs text-gray-400 mb-1">
                        sur {tmdbTotal.toLocaleString()} torrents
                      </div>
                      <div class="text-xs font-semibold text-blue-300">
                        {tmdbPercentage}% enrichis
                      </div>
                    </div>
                  );
                })()}
                {Object.keys(status.stats || {}).length === 0 && (
                  <div class="col-span-full">
                    <div class="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-6 text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-yellow-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p class="text-yellow-400 font-semibold mb-2">Aucun torrent trouvé</p>
                      <p class="text-gray-400 text-sm mb-4">La synchronisation est en cours mais aucun résultat n'a été retourné pour le moment.</p>
                      
                      {indexers.length > 0 && (
                        <div class="mt-4 space-y-2">
                          <p class="text-gray-300 text-xs font-semibold">Indexers interrogés:</p>
                          <div class="flex flex-wrap gap-2 justify-center">
                            {indexers.map((indexer) => (
                              <span key={indexer.id} class="badge badge-info badge-sm">
                                {indexer.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {elapsedTime > 30 && (
                        <div class="mt-4 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                          <p class="text-red-400 text-xs font-semibold mb-1">⚠️ Aucun résultat après {formatElapsedTime(elapsedTime)}</p>
                          <p class="text-gray-400 text-xs">Vérifiez les logs du backend ou testez les indexers individuellement.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Total avec animation */}
              <div class="bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl p-6 border border-primary/30">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span class="text-white font-semibold">Total synchronisé</span>
                  </div>
                  <span class="text-primary font-bold text-3xl">
                    {totalTorrents.toLocaleString()}
                  </span>
                </div>
              </div>
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
                          {category === 'films' ? 'Films' : category === 'series' ? 'Séries' : 'Autres'}
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
                          sur {tmdbTotal.toLocaleString()}
                        </div>
                        <div class="text-blue-300 font-semibold text-xs">
                          {tmdbPercentage}% avec TMDB
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
                    Enrichissement TMDB
                  </h3>
                  
                  <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-green-900/30 rounded-lg p-4 border border-green-500/30">
                      <div class="text-green-400 text-sm font-semibold mb-1">Avec ID TMDB</div>
                      <div class="text-white font-bold text-2xl">{status.tmdb_stats.with_tmdb.toLocaleString()}</div>
                      <div class="text-gray-400 text-xs mt-1">
                        {totalTorrents > 0 
                          ? `${Math.round((status.tmdb_stats.with_tmdb / totalTorrents) * 100)}% des torrents`
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
                        Sans ID TMDB
                      </div>
                      <div class={`font-bold text-2xl ${
                        status.tmdb_stats.without_tmdb > 0 ? 'text-yellow-300' : 'text-gray-300'
                      }`}>
                        {status.tmdb_stats.without_tmdb.toLocaleString()}
                      </div>
                      <div class="text-gray-400 text-xs mt-1">
                        {totalTorrents > 0 
                          ? `${Math.round((status.tmdb_stats.without_tmdb / totalTorrents) * 100)}% des torrents`
                          : '0%'}
                      </div>
                    </div>
                  </div>

                  {/* Liste des torrents sans TMDB ID */}
                  {status.tmdb_stats.without_tmdb > 0 && (
                    <div class="mt-4">
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-yellow-400 text-sm font-semibold">
                          Torrents sans ID TMDB ({status.tmdb_stats.missing_tmdb.length > 0 ? status.tmdb_stats.missing_tmdb.length : status.tmdb_stats.without_tmdb})
                        </p>
                        {status.tmdb_stats.without_tmdb > 50 && (
                          <p class="text-gray-400 text-xs">
                            (Affichage des 50 premiers)
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
                              Aucun torrent sans ID TMDB trouvé
                            </p>
                          )}
                        </div>
                      </div>
                      {status.tmdb_stats.without_tmdb > 0 && (
                        <p class="text-gray-400 text-xs mt-2">
                          💡 Ces torrents n'ont pas pu être enrichis avec les métadonnées TMDB. 
                          Vérifiez que la clé API TMDB est configurée et relancez une synchronisation.
                        </p>
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
                        ✓ Tous les torrents ont un ID TMDB et sont enrichis avec les métadonnées
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
                  <p class="text-yellow-400 text-lg font-semibold mb-2">Aucun torrent synchronisé</p>
                  <p class="text-gray-400 text-sm mb-4">La dernière synchronisation n'a retourné aucun résultat</p>
                  
                  {indexers.length > 0 ? (
                    <div class="mt-6 space-y-3">
                      <p class="text-gray-300 text-sm font-semibold">Indexers actifs ({indexers.length}):</p>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {indexers.map((indexer) => (
                          <div key={indexer.id} class="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                            <div class="flex items-center gap-2">
                              <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                              <div class="flex-1 min-w-0">
                                <p class="text-white text-sm font-medium truncate">{indexer.name}</p>
                                <p class="text-gray-500 text-xs truncate">{indexer.baseUrl}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div class="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                      <p class="text-red-400 text-sm font-semibold mb-2">⚠️ Aucun indexer activé</p>
                      <p class="text-gray-400 text-xs mb-3">Vous devez configurer et activer au moins un indexer pour synchroniser des torrents.</p>
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
                    Arrêt en cours...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Arrêter la synchronisation
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
                      Démarrage...
                    </>
                  ) : (
                    <>
                      <RefreshCw class="w-4 h-4" />
                      Lancer une synchronisation
                    </>
                  )}
                </button>
                {hasTorrents && (
                  <button
                    class="btn btn-error flex-1 sm:flex-none"
                    onClick={clearTorrents}
                    disabled={syncing || status.sync_in_progress}
                    title="Supprimer tous les torrents synchronisés de la base de données"
                  >
                    {syncing ? (
                      <>
                        <span class="loading loading-spinner loading-sm"></span>
                        Suppression...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Vider les torrents
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Paramètres */}
      {status.settings ? (
        <div class="card bg-base-200">
          <div class="card-body p-6">
            <h2 class="card-title text-2xl mb-4">Paramètres</h2>
            <div class="space-y-4">
              <div>
                <label class="label">
                  <span class="label-text font-semibold">Fréquence de synchronisation automatique</span>
                </label>
                <select
                  class="select select-bordered w-full"
                  value={status.settings.sync_frequency_minutes || 60}
                  onChange={(e) => {
                    const value = parseInt((e.target as HTMLSelectElement).value);
                    updateSettings({ sync_frequency_minutes: value });
                  }}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 heure</option>
                  <option value={120}>2 heures</option>
                  <option value={240}>4 heures</option>
                  <option value={480}>8 heures</option>
                  <option value={1440}>24 heures</option>
                </select>
                <p class="text-xs text-gray-400 mt-1">
                  Actuellement : {formatFrequency(status.settings.sync_frequency_minutes || 60)}
                </p>
              </div>

              <div>
                <label class="label cursor-pointer">
                  <span class="label-text">Synchronisation automatique activée</span>
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
                  <span class="label-text font-semibold">Nombre maximum de torrents par catégorie</span>
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

              <div class="divider">Avancé</div>

              <div>
                <label class="label cursor-pointer">
                  <span class="label-text">
                    RSS Torznab (incremental) — rattraper les nouveaux torrents entre deux sync
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    checked={(status.settings.rss_incremental_enabled || 0) === 1}
                    onChange={(e) => {
                      updateSettings({ rss_incremental_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 });
                    }}
                  />
                </label>
                <p class="text-xs text-gray-400 mt-1">
                  Recommandé si tu utilises Torznab/Jackett. (N’affecte pas les indexers non‑Torznab)
                </p>
              </div>

              <div>
                <label class="label">
                  <span class="label-text font-semibold">Mots‑clés de synchronisation — Films (1 par ligne)</span>
                </label>
                <textarea
                  class="textarea textarea-bordered w-full h-28"
                  value={filmsQueriesText}
                  placeholder="Ex: *\n2024\n2023\nnouveau\nrecent"
                  onInput={(e) => setFilmsQueriesText((e.target as HTMLTextAreaElement).value)}
                  onBlur={() => updateSettings({ sync_queries_films: parseQueries(filmsQueriesText) })}
                />
                <p class="text-xs text-gray-400 mt-1">
                  Laisse vide pour utiliser les valeurs par défaut côté serveur.
                </p>
              </div>

              <div>
                <label class="label">
                  <span class="label-text font-semibold">Mots‑clés de synchronisation — Séries (1 par ligne)</span>
                </label>
                <textarea
                  class="textarea textarea-bordered w-full h-28"
                  value={seriesQueriesText}
                  placeholder="Ex: *\n2024\n2023\nnouvelle\nrecente"
                  onInput={(e) => setSeriesQueriesText((e.target as HTMLTextAreaElement).value)}
                  onBlur={() => updateSettings({ sync_queries_series: parseQueries(seriesQueriesText) })}
                />
                <p class="text-xs text-gray-400 mt-1">
                  Laisse vide pour utiliser les valeurs par défaut côté serveur.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div class="card bg-base-200">
          <div class="card-body p-6">
            <div class="alert alert-warning">
              <span>⚠️ Les paramètres de synchronisation ne sont pas disponibles. Rechargez la page.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
