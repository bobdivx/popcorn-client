import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n/useI18n';

interface SyncStatus {
  sync_in_progress: boolean;
  stats: Record<string, number>;
  progress?: {
    current_indexer?: string | null;
    current_category?: string | null;
    current_query?: string | null;
    indexer_torrents: Record<string, number>;
    category_torrents: Record<string, number>;
    fetched_pages?: number;
    fetched_torrents?: number;
    total_processed: number;
    total_to_process: number;
  };
  sync_start_time?: number | null;
}

interface SyncProgressProps {
  /** Mode compact : affiche uniquement le pourcentage en haut de page */
  compact?: boolean;
  /** Statut fourni par le parent (ex. useSyncStatus). Si fourni, aucun fetch ni polling ici. */
  externalStatus?: SyncStatus | null;
}

export function SyncProgress({ compact = false, externalStatus }: SyncProgressProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [animatedCounts, setAnimatedCounts] = useState<Record<string, number>>({});

  const effectiveStatus = externalStatus !== undefined ? externalStatus : status;
  const useExternal = externalStatus !== undefined;

  // Charger le statut initial + polling uniquement quand on n'a pas de statut externe
  useEffect(() => {
    if (useExternal) return;
    loadStatus();
    const t1 = setTimeout(loadStatus, 400);
    const t2 = setTimeout(loadStatus, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [useExternal]);

  // Au repos : 30 s. Pendant une sync réelle : 2 s (pas quand on a seulement des stats).
  const POLL_IDLE_MS = 30000;
  const POLL_ACTIVE_MS = 2000;
  const syncReallyInProgress = effectiveStatus?.sync_in_progress === true;
  const pollIntervalMs = syncReallyInProgress ? POLL_ACTIVE_MS : POLL_IDLE_MS;

  useEffect(() => {
    if (useExternal) return;
    const interval = setInterval(() => {
      if (syncReallyInProgress || !effectiveStatus) loadStatus();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [useExternal, effectiveStatus, pollIntervalMs, syncReallyInProgress]);

  // Timer pour le temps écoulé
  useEffect(() => {
    if ((effectiveStatus?.sync_in_progress || (effectiveStatus?.stats && Object.keys(effectiveStatus.stats).length > 0)) && effectiveStatus.sync_start_time) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() / 1000) - effectiveStatus.sync_start_time!));
      }, 1000);
      return () => clearInterval(interval);
    } else if (effectiveStatus?.sync_in_progress && !effectiveStatus.sync_start_time) {
      const startRef = Date.now() / 1000;
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() / 1000) - startRef));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [effectiveStatus?.sync_in_progress, effectiveStatus?.sync_start_time, effectiveStatus?.stats]);

  // Note : on n'utilise plus beforeunload car la sync se fait côté serveur et continue
  // en arrière-plan. De plus, avec Astro (navigation full page load), le beforeunload
  // se déclenchait à tort lors du simple changement de page (Films → Series, etc.).

  // Animation des compteurs
  useEffect(() => {
    if (effectiveStatus?.stats) {
      Object.entries(effectiveStatus.stats).forEach(([category, targetCount]) => {
        const currentCount = animatedCounts[category] || 0;
        if (currentCount !== targetCount) {
          const diff = targetCount - currentCount;
          const step = Math.ceil(Math.abs(diff) / 20);
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
  }, [effectiveStatus?.stats]);

  const loadStatus = async () => {
    try {
      const response = await serverApi.getSyncStatus();
      if (response.success && response.data) {
        setStatus(response.data);
      } else {
        // Si la réponse n'est pas un succès, garder le statut précédent pour éviter de perdre l'affichage
        console.warn('[SYNC PROGRESS] Réponse non réussie:', response.message);
      }
    } catch (err) {
      // En cas d'erreur (timeout, etc.), garder le statut précédent pour continuer l'affichage
      // Ne pas logger comme une erreur critique car c'est normal si le backend est lent
      if (err instanceof Error && (err.message.includes('Timeout') || err.message.includes('504'))) {
        console.log('[SYNC PROGRESS] ⚠️ Backend lent, conservation du statut précédent');
      } else {
        console.warn('[SYNC PROGRESS] Erreur lors du chargement du statut:', err);
      }
      // Ne pas réinitialiser le statut en cas d'erreur pour garder l'affichage
    }
  };

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Si on n'a pas de statut mais qu'on est censé afficher la sync, afficher un message de chargement
  // Cela peut arriver si le backend n'est pas encore démarré ou s'il est lent à répondre
  if (!effectiveStatus) {
    if (compact) {
      return (
        <div className="px-4 py-3 bg-blue-900/30 border-b border-blue-500/30 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-blue-400 text-sm">{t('syncProgress.starting')}</span>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-6 border-2 border-blue-500/50">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <h3 className="text-lg font-semibold text-white">{t('syncProgress.starting')}</h3>
          </div>
          <p className="text-gray-400 text-sm text-center">
            {t('syncProgress.backendConnecting')}
          </p>
        </div>
      </div>
    );
  }

  const hasStatsDisplay = effectiveStatus && Object.keys(effectiveStatus.stats || {}).length > 0;
  const isActuallySyncing = effectiveStatus.sync_in_progress || hasStatsDisplay;

  if (!isActuallySyncing) {
    return null;
  }

  const totalTorrents = Object.values(effectiveStatus.stats || {}).reduce((sum, count) => sum + count, 0);
  const fetchedTotal =
    effectiveStatus.progress?.indexer_torrents
      ? Object.values(effectiveStatus.progress.indexer_torrents).reduce((sum, n) => sum + (n || 0), 0)
      : 0;

  let progress = 0;
  if (effectiveStatus.progress) {
    if (effectiveStatus.progress.total_to_process > 0) {
      const maxProgress = Math.max(
        effectiveStatus.progress.total_processed,
        totalTorrents
      );
      const phases23Progress = Math.min(1, maxProgress / effectiveStatus.progress.total_to_process);
      progress = Math.round(33 + (phases23Progress * 67));
    } else if (fetchedTotal > 0) {
      progress = Math.min(33, Math.round((fetchedTotal / 1000) * 33));
    }
  }

  // Mode compact : barre en haut avec juste le pourcentage
  if (compact) {
    return (
      <div className="px-4 py-3 bg-blue-900/30 border-b border-blue-500/30 flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2 mb-1">
            <span className="text-blue-400 text-sm truncate">{t('syncProgress.inProgress')}</span>
            <span className="text-primary-600 font-bold text-sm flex-shrink-0">{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary-600 to-primary-600/80 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {elapsedTime > 0 && (
          <span className="text-gray-400 text-xs flex-shrink-0">{formatElapsedTime(elapsedTime)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* En-tête avec temps écoulé */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-6 border-2 border-blue-500/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isActuallySyncing ? t('syncProgress.inProgress') : t('syncProgress.pending')}
          </h3>
          {elapsedTime > 0 && (
            <span className="text-blue-400 text-sm font-semibold">
              {formatElapsedTime(elapsedTime)}
            </span>
          )}
        </div>

        {/* Informations de progression */}
        {effectiveStatus.progress && (
          <div className="space-y-3">
            {effectiveStatus.progress.total_to_process === 0 && fetchedTotal > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-400 text-xs">{t('syncProgress.fetching')}</p>
                <p className="text-white font-semibold text-sm">
                  {fetchedTotal.toLocaleString()} {t('syncProgress.torrentsFetched')}
                  {typeof effectiveStatus.progress.fetched_pages === 'number' ? ` • ${effectiveStatus.progress.fetched_pages} ${t('syncProgress.pages')}` : ''}
                </p>
              </div>
            )}

            {effectiveStatus.progress.current_indexer && (
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse"></div>
                <div className="flex-1">
                  <p className="text-gray-400 text-xs">{t('syncProgress.currentIndexer')}</p>
                  <p className="text-white font-semibold text-sm">{effectiveStatus.progress.current_indexer}</p>
                </div>
                {effectiveStatus.progress.indexer_torrents[effectiveStatus.progress.current_indexer] !== undefined && (
                  <div className="text-right">
                    <p className="text-primary-600 font-bold text-lg">{effectiveStatus.progress.indexer_torrents[effectiveStatus.progress.current_indexer]}</p>
                    <p className="text-gray-400 text-xs">{t('syncProgress.torrents')}</p>
                  </div>
                )}
              </div>
            )}

            {effectiveStatus.progress.current_category && (
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                <div className="text-2xl">
                  {effectiveStatus.progress.current_category === 'films' ? '🎬' : effectiveStatus.progress.current_category === 'series' ? '📺' : '📦'}
                </div>
                <div className="flex-1">
                  <p className="text-gray-400 text-xs">{t('syncProgress.category')}</p>
                  <p className="text-white font-semibold text-sm capitalize">{effectiveStatus.progress.current_category}</p>
                </div>
                {effectiveStatus.progress.category_torrents[effectiveStatus.progress.current_category] !== undefined && (
                  <div className="text-right">
                    <p className="text-primary-600 font-bold text-lg">{effectiveStatus.progress.category_torrents[effectiveStatus.progress.current_category]}</p>
                    <p className="text-gray-400 text-xs">{t('syncProgress.torrents')}</p>
                  </div>
                )}
              </div>
            )}

            {effectiveStatus.progress.total_to_process > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-gray-400 text-xs">{t('syncProgress.processing')}</p>
                  <p className="text-primary-600 font-bold text-sm">
                    {effectiveStatus.progress.total_processed} / {effectiveStatus.progress.total_to_process}
                  </p>
                </div>
                <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary-600 to-primary-600/80 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (effectiveStatus.progress.total_processed / effectiveStatus.progress.total_to_process) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barre de progression globale */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-white font-semibold text-sm">{t('syncProgress.globalProgress')}</span>
            <span className="text-primary-600 font-bold text-lg">{progress}%</span>
          </div>
          <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary-600 via-primary-600/80 to-primary-600 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
              style={{ width: `${progress}%` }}
            >
              {progress > 10 && (
                <span className="text-xs text-white font-bold">{progress}%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compteurs par catégorie avec animations */}
      {Object.keys(effectiveStatus.stats || {}).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(effectiveStatus.stats || {}).map(([category, count]) => {
            const animatedCount = Math.floor(animatedCounts[category] || 0);
            const icon = category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦';
            
            return (
              <div 
                key={category} 
                className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border-2 border-gray-700"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-3xl">{icon}</span>
                  <span className="text-white font-semibold text-sm capitalize">
                    {category === 'films' ? t('torrentSyncManager.films') : category === 'series' ? t('torrentSyncManager.series') : t('torrentSyncManager.others')}
                  </span>
                </div>
                <div className="text-4xl font-bold text-primary-600 mb-2">
                  {animatedCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">
                  {t('syncProgress.torrentsSynced')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Total */}
      {totalTorrents > 0 && (
        <div className="bg-gradient-to-r from-primary-600/20 to-primary-600/10 rounded-xl p-6 border border-primary-600/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-white font-semibold">{t('syncProgress.totalSynced')}</span>
            </div>
            <span className="text-primary-600 font-bold text-3xl">
              {totalTorrents.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Message si aucun résultat */}
      {totalTorrents === 0 && elapsedTime > 10 && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-6 text-center">
          <p className="text-yellow-400 font-semibold mb-2">{t('syncProgress.inProgress')}</p>
          <p className="text-gray-400 text-sm">
            {t('syncProgress.noTorrentsFound')}
          </p>
        </div>
      )}
    </div>
  );
}
