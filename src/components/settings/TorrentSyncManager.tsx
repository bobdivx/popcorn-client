import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { syncSyncSettingsToCloud } from '../../lib/utils/cloud-sync';
import {
  getSyncStatusStore,
  subscribeSyncStatusStore,
  refreshSyncStatusStore,
} from '../../lib/sync-status-store';
import { Sparkles, ChevronRight, FileDown, List, Settings, Play, Square, LayoutGrid } from 'lucide-preact';

const iconProps = { size: 20, strokeWidth: 1.5 };
const iconPropsSm = { size: 18, strokeWidth: 1.5 };
import { suggestTmdbEnrichmentRules } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import type { Indexer } from '../../lib/client/types';
import { useNativeNotifications } from '../../hooks/useNativeNotifications';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { Modal } from '../ui/Modal';
import { DsIconButton, DsMetricCard, DsBarChart } from '../ui/design-system';

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
  /** Nombre total de pages à traiter pour la catégorie en cours (pour % = fetched_pages / total_pages) */
  total_pages?: number;
  /** Nombre de torrents récupérés depuis les indexers (cette run) */
  fetched_torrents?: number;
  /** Nombre de torrents enrichis avec un ID TMDB (cette run) */
  total_enriched_tmdb?: number;
  /** Nombre de torrents enregistrés en base (cette run) */
  total_synced_run?: number;
  errors: string[];
  log_lines?: string[];
  sync_trigger?: string | null;
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
  /** indexer_name -> category -> count */
  stats_by_indexer?: Record<string, Record<string, number>>;
  sync_start_time?: number | null;
  progress?: SyncProgress;
  tmdb_stats?: TmdbStats;
  /** Stats TMDB par indexer (pour la modale détail : enrichissement de cet indexer uniquement) */
  tmdb_stats_by_indexer?: Record<string, TmdbStats>;
}

interface TorrentSyncManagerProps {
  /** Afficher uniquement les paramètres (pour le sous-menu Indexers) */
  section?: 'all' | 'settings';
}

/** Contenu de la modale Détails indexer : stats indexer + section Enrichissement TMDB + lancer sync (cet indexer) */
function IndexerDetailsModalContent({
  idx,
  status,
  totalTorrents,
  hasCloudToken,
  geminiLoading,
  onImproveWithGemini,
  onStartSyncForIndexer,
  syncing,
  onClose,
  t,
  language,
}: {
  idx: Indexer;
  status: SyncStatus | null;
  totalTorrents: number;
  hasCloudToken: boolean;
  geminiLoading: boolean;
  onImproveWithGemini: () => void;
  onStartSyncForIndexer?: (indexerId: string) => Promise<void>;
  syncing?: boolean;
  onClose: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
  language: string;
}) {
  const byCat = status?.stats_by_indexer?.[idx.name] ?? status?.stats_by_indexer?.[idx.id];
  const films = Number(byCat?.films ?? 0);
  const series = Number(byCat?.series ?? 0);
  const others = Number(byCat?.others ?? 0);
  const total = films + series + others;
  const isCurrent = status?.progress?.current_indexer === idx.name || status?.progress?.current_indexer === idx.id;
  const hasError = status?.sync_in_progress && isCurrent && status?.progress?.errors && status.progress.errors.length > 0;
  // Enrichissement TMDB pour cet indexer uniquement (pas les stats globales)
  const tmdb = status?.tmdb_stats_by_indexer?.[idx.name] ?? status?.tmdb_stats_by_indexer?.[idx.id];
  const tmdbTotal = tmdb ? tmdb.with_tmdb + tmdb.without_tmdb : 0;

  return (
    <div class="space-y-5 text-sm min-w-0 max-w-full overflow-hidden">
      <div class="min-w-0">
        <p class="text-[var(--ds-text-primary)] font-semibold text-base mb-3 truncate" title={idx.name}>{idx.name}</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="ds-box-surface p-3 text-center">
            <div class="text-2xl">🎬</div>
            <div class="text-[var(--ds-text-primary)] font-bold text-lg">{films.toLocaleString()}</div>
            <div class="text-[var(--ds-text-secondary)] text-xs">{t('torrentSyncManager.filmsCount')}</div>
          </div>
          <div class="ds-box-surface p-3 text-center">
            <div class="text-2xl">📺</div>
            <div class="text-[var(--ds-text-primary)] font-bold text-lg">{series.toLocaleString()}</div>
            <div class="text-[var(--ds-text-secondary)] text-xs">{t('torrentSyncManager.seriesCount')}</div>
          </div>
          <div class="ds-box-surface p-3 text-center">
            <div class="text-2xl">📦</div>
            <div class="text-[var(--ds-text-primary)] font-bold text-lg">{others.toLocaleString()}</div>
            <div class="text-[var(--ds-text-secondary)] text-xs">{t('torrentSyncManager.othersCount')}</div>
          </div>
        </div>
        <div class="flex justify-between items-center pt-3 mt-3 border-t border-[var(--ds-border)]">
          <span class="text-[var(--ds-text-secondary)]">{t('torrentSyncManager.totalInDb')}</span>
          <span class="font-bold text-[var(--ds-accent-violet)]">{total.toLocaleString()}</span>
        </div>
        {idx.baseUrl && (
          <div class="mt-3">
            <span class="text-[var(--ds-text-tertiary)] text-xs">{t('torrentSyncManager.sourceUrl')}</span>
            <p class="text-[var(--ds-text-secondary)] text-xs truncate mt-0.5" title={idx.baseUrl}>{idx.baseUrl}</p>
          </div>
        )}
        <p class="text-[var(--ds-text-tertiary)] text-xs mt-3">{t('torrentSyncManager.ratioShownOnMediaDetail')}</p>
        {hasError && status?.progress?.errors && status.progress.errors.length > 0 && (
          <div class="mt-3 ds-box-error p-3">
            <p class="text-[var(--ds-accent-red)] text-xs font-semibold mb-1">{t('torrentSyncManager.lastErrors')}</p>
            <ul class="list-disc list-inside text-xs text-[var(--ds-text-secondary)] space-y-0.5">
              {status.progress.errors.slice(-3).map((err, i) => (
                <li key={i} class="truncate" title={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Section Enrichissement TMDB : uniquement pour cet indexer */}
      {tmdb && tmdbTotal > 0 && (
        <div class="pt-4 border-t border-[var(--ds-border)]">
          <h4 class="text-[var(--ds-text-primary)] font-semibold mb-3 flex items-center gap-2">
            <span class="flex items-center justify-center w-7 h-7 rounded-full text-[var(--ds-text-on-accent)] bg-[var(--ds-accent-violet)]">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            {t('torrentSyncManager.tmdbEnrichmentThisIndexer')}
          </h4>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="ds-box-accent-green rounded-[var(--ds-radius-lg)] p-3">
              <div class="text-[var(--ds-text-on-accent)]/70 text-xs font-semibold">{t('torrentSyncManager.withTmdb')}</div>
              <div class="text-[var(--ds-text-on-accent)] font-bold text-xl">{tmdb.with_tmdb.toLocaleString()}</div>
              <div class="text-[var(--ds-text-on-accent)]/60 text-xs">
                {tmdbTotal > 0 ? `${Math.round((tmdb.with_tmdb / tmdbTotal) * 100)}% ${t('torrentSyncManager.ofTorrents')}` : '0%'}
              </div>
            </div>
            <div class={`rounded-[var(--ds-radius-lg)] p-3 border border-black/10 ${tmdb.without_tmdb > 0 ? 'ds-box-accent-yellow' : 'ds-box-accent'}`}>
              <div class="text-[var(--ds-text-on-accent)]/70 text-xs font-semibold">{t('torrentSyncManager.withoutTmdb')}</div>
              <div class="text-[var(--ds-text-on-accent)] font-bold text-xl">{tmdb.without_tmdb.toLocaleString()}</div>
              <div class="text-[var(--ds-text-on-accent)]/60 text-xs">
                {tmdbTotal > 0 ? `${Math.round((tmdb.without_tmdb / tmdbTotal) * 100)}% ${t('torrentSyncManager.ofTorrents')}` : '0%'}
              </div>
            </div>
          </div>
          {tmdb.without_tmdb > 0 && (
            <>
              <p class="text-amber-500 text-xs font-semibold mb-2">
                {t('torrentSyncManager.torrentsWithoutTmdb')} ({tmdb.missing_tmdb.length > 0 ? tmdb.missing_tmdb.length : tmdb.without_tmdb})
              </p>
              <div class="ds-box-surface p-3 max-h-48 overflow-y-auto mb-2">
                <div class="space-y-1.5">
                  {tmdb.missing_tmdb.length > 0 ? (
                    tmdb.missing_tmdb.map(([name, category], i) => (
                      <div key={i} class="flex items-center gap-2 text-xs">
                        <span class="text-[var(--ds-text-tertiary)] w-14 truncate">{category === 'films' ? '🎬' : category === 'series' ? '📺' : '📦'} {category}</span>
                        <span class="text-[var(--ds-text-secondary)] flex-1 truncate" title={name}>{name}</span>
                      </div>
                    ))
                  ) : (
                    <p class="text-[var(--ds-text-tertiary)] text-xs text-center py-2">{t('torrentSyncManager.noneWithoutTmdb')}</p>
                  )}
                </div>
              </div>
              {tmdb.without_tmdb > 50 && <p class="text-[var(--ds-text-secondary)] text-xs mb-2">{t('torrentSyncManager.displayingFirst')}</p>}
              <p class="text-[var(--ds-text-secondary)] text-xs mb-2">{t('torrentSyncManager.tipNoTmdb')}</p>
              {hasCloudToken && (
                <button
                  type="button"
                  class="ds-btn-accent btn btn-sm gap-2 px-4 py-2.5 font-semibold text-[var(--ds-text-on-accent)] disabled:opacity-50 min-h-[var(--ds-touch-target-sm)]"
                  onClick={onImproveWithGemini}
                  disabled={geminiLoading || (status?.sync_in_progress ?? false)}
                  title={t('torrentSyncManager.improveWithGemini')}
                >
                  {geminiLoading ? <span class="loading loading-spinner loading-sm" /> : <Sparkles {...iconPropsSm} />}
                  {t('torrentSyncManager.improveWithGemini')}
                </button>
              )}
            </>
          )}
          {tmdb.without_tmdb === 0 && tmdb.with_tmdb > 0 && (
            <div class="ds-box-accent-green rounded-[var(--ds-radius-lg)] p-3">
              <p class="text-[var(--ds-text-on-accent)] text-xs font-semibold flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('torrentSyncManager.allHaveTmdb')}
              </p>
            </div>
          )}
        </div>
      )}

      <div class="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-[var(--ds-border)]">
        {onStartSyncForIndexer && (
          <button
            type="button"
            class="ds-btn-accent btn btn-sm gap-2 px-4 py-2.5 font-semibold text-[var(--ds-text-on-accent)] disabled:opacity-50 min-h-[var(--ds-touch-target-sm)]"
            onClick={() => onStartSyncForIndexer(idx.id)}
            disabled={(syncing ?? false) || (status?.sync_in_progress ?? false)}
            title={t('torrentSyncManager.launchSyncThisIndexer')}
          >
            {syncing ? <span class="loading loading-spinner loading-sm" /> : null}
            {t('torrentSyncManager.launchSyncThisIndexer')}
          </button>
        )}
        <button
          type="button"
          class="ds-btn-secondary btn btn-sm px-4 py-2.5 font-semibold text-[var(--ds-text-primary)] min-h-[var(--ds-touch-target-sm)]"
          onClick={onClose}
        >
          {t('torrentSyncManager.close')}
        </button>
      </div>
    </div>
  );
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
  /** null = tous les indexers sélectionnés (défaut), string[] = seulement ceux-ci */
  const [selectedIndexerIdsForSync, setSelectedIndexerIdsForSync] = useState<string[] | null>(null);
  /** Indexer dont on affiche la modale de détails */
  const [selectedIndexerForModal, setSelectedIndexerForModal] = useState<Indexer | null>(null);
  /** Onglet actif : Vue d'ensemble | Paramètres */
  const [syncView, setSyncView] = useState<'overview' | 'settings'>('overview');

  // Hook pour les notifications natives
  const {
    notifySyncStart,
    notifySyncProgress,
    notifySyncError,
    notifySyncComplete,
  } = useNativeNotifications();

  const loadIndexersInFlight = useRef(false);
  const prevSyncInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    refreshSyncStatusStore();
    loadIndexers();
    // Second refresh après un court délai pour afficher une sync déjà en cours (ex. lancée par un autre onglet ou au démarrage)
    const t = setTimeout(() => refreshSyncStatusStore(), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const defaultStatus: SyncStatus = {
      sync_in_progress: false,
      last_sync_date: null,
      settings: {
        sync_frequency_minutes: 60,
        is_enabled: 0,
        last_sync_date: null,
        sync_in_progress: 0,
        max_torrents_per_category: 0,
        sync_queries_films: [],
        sync_queries_series: [],
      },
      stats: {},
      stats_by_indexer: {},
      sync_start_time: null,
    };
    const unsub = subscribeSyncStatusStore((storeState) => {
      const newData = storeState.status;
      const isNowInProgress = newData?.sync_in_progress ?? false;
      const wasInProgress = prevSyncInProgressRef.current;
      prevSyncInProgressRef.current = isNowInProgress;
      if (newData) {
        if (!wasInProgress && isNowInProgress) {
          setPreviousStats(newData.stats || {});
        }
        if (wasInProgress && !isNowInProgress) {
          const newStats = newData.stats || {};
          const totalAdded = Object.values(newStats).reduce((sum, c) => sum + (c || 0), 0);
          setPreviousStats((prev) => {
            const prevTotal = Object.values(prev).reduce((sum, c) => sum + (c || 0), 0);
            if (totalAdded - prevTotal > 0) notifySyncComplete(totalAdded - prevTotal).catch(console.error);
            return {};
          });
          loadIndexers();
          setAnimatedCounts({});
          setSyncStartTime(null);
          setElapsedTime(0);
        }
        setStatus(newData as SyncStatus);
      } else {
        setStatus(defaultStatus);
      }
    });
    return unsub;
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

  // Sync du store : mise à jour de syncStartTime / previousStats quand la sync démarre ou se termine
  useEffect(() => {
    if (status?.sync_in_progress) {
      if (!syncStartTime && status.sync_start_time) {
        setSyncStartTime(status.sync_start_time);
        setAnimatedCounts({});
      }
    } else {
      if (syncStartTime) {
        setTimeout(() => {
          refreshSyncStatusStore();
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

  const startSync = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      
      // Synchroniser les indexers activés vers le backend Rust avant de démarrer la sync
      console.log('[SYNC MANAGER] 🔄 Synchronisation des indexers avant démarrage de la sync...');
      await syncIndexersToBackend();
      
      // Récupérer les IDs des indexers activés (côté client, venant d'être synchronisés au backend).
      // En les passant explicitement, le backend utilise la branche "par IDs" et ne filtre pas par clé API,
      // ce qui évite l'erreur "Aucun indexer activé" quand des indexers sans clé (ex. types sans requires_api_key) sont utilisés.
      const indexersResponse = await serverApi.getIndexers();
      const enabledIndexerIds: string[] =
        indexersResponse.success && indexersResponse.data
          ? (indexersResponse.data as Indexer[])
              .filter((idx) => idx.isEnabled === true)
              .map((idx) => idx.id)
          : [];

      const indexerIdsToSync =
        selectedIndexerIdsForSync === null || selectedIndexerIdsForSync.length === indexers.length
          ? (enabledIndexerIds.length > 0 ? enabledIndexerIds : undefined)
          : selectedIndexerIdsForSync.length > 0
            ? selectedIndexerIdsForSync
            : undefined;

      if (indexerIdsToSync !== undefined && indexerIdsToSync.length === 0) {
        setError(t('torrentSyncManager.mustConfigureIndexer'));
        setSyncing(false);
        return;
      }
      if (indexerIdsToSync === undefined && enabledIndexerIds.length === 0) {
        setError(t('torrentSyncManager.mustConfigureIndexer'));
        setSyncing(false);
        return;
      }

      const response = await serverApi.startSync(indexerIdsToSync);
      
      if (response.success) {
        const msg = (response.data && typeof response.data === 'string' ? response.data : null) || t('torrentSyncManager.syncStarted');
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 5000);
        await notifySyncStart();
        setPreviousStats({});
        refreshSyncStatusStore();
        setTimeout(() => refreshSyncStatusStore(), 600);
        setTimeout(() => {
          refreshSyncStatusStore();
          loadIndexers();
        }, 1500);
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

  /** Lance la synchronisation pour un seul indexer (depuis la modale détail). */
  const startSyncForIndexer = async (indexerId: string) => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      await syncIndexersToBackend();
      const response = await serverApi.startSync(indexerId);
      if (response.success) {
        const msg = (response.data && typeof response.data === 'string' ? response.data : null) || t('torrentSyncManager.syncStarted');
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 5000);
        await notifySyncStart();
        setPreviousStats({});
        refreshSyncStatusStore();
        setTimeout(() => refreshSyncStatusStore(), 600);
        setTimeout(() => {
          refreshSyncStatusStore();
          loadIndexers();
        }, 1500);
      } else {
        setError(response.message || response.error || 'Erreur lors du démarrage de la synchronisation');
        await notifySyncError(response.message || response.error || '');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors du démarrage de la synchronisation';
      setError(errorMsg);
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
        // Mise à jour optimiste : l'interface reflète l'arrêt immédiat (plus de progression sur les cartes)
        setStatus((prev) => prev ? {
          ...prev,
          sync_in_progress: false,
          sync_start_time: null,
          progress: {
            current_indexer: null,
            current_category: null,
            current_query: null,
            indexer_torrents: {},
            category_torrents: {},
            total_processed: 0,
            total_to_process: 0,
            fetched_pages: 0,
            errors: [],
          },
        } : prev);
        setSyncStartTime(null);
        setPreviousStats({});
        setElapsedTime(0);
        setAnimatedCounts({});
        // Recharger tout de suite pour confirmer l'état serveur
        refreshSyncStatusStore();
        loadIndexers();
        setTimeout(() => {
          refreshSyncStatusStore();
        }, 500);
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
        refreshSyncStatusStore();
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
        refreshSyncStatusStore();
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
        // Notifier le dashboard (films/séries) pour qu'il recharge et affiche des listes vides
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('popcorn:torrents-cleared'));
        }
        setTimeout(() => {
          refreshSyncStatusStore();
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

  // Sans status mais chargement terminé : afficher quand même la structure (onglets) pour que le design soit visible
  if (!status && !loading) {
    return (
      <div class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p class="text-white font-semibold text-lg">{t('torrentSyncManager.noSyncInProgress')}</p>
        </header>
        {/* Même UX que la toolbar principale : deux icônes Vue d'ensemble / Paramètres */}
        <div class="sync-toolbar mb-6">
          <div class="flex flex-nowrap items-center gap-2 min-w-0">
            <DsIconButton
              icon={LayoutGrid}
              onClick={() => setSyncView('overview')}
              title={t('torrentSyncManager.tabOverview')}
              ariaLabel={t('torrentSyncManager.tabOverview')}
              aria-pressed={syncView === 'overview'}
              size="sm"
              className={'sync-toolbar__icon sync-toolbar__tab' + (syncView === 'overview' ? ' sync-toolbar__tab--active' : '')}
            />
            <DsIconButton
              icon={Settings}
              onClick={() => setSyncView('settings')}
              title={t('torrentSyncManager.tabSettings')}
              ariaLabel={t('torrentSyncManager.tabSettings')}
              aria-pressed={syncView === 'settings'}
              size="sm"
              className={'sync-toolbar__icon sync-toolbar__tab' + (syncView === 'settings' ? ' sync-toolbar__tab--active' : '')}
            />
          </div>
        </div>
        {syncView === 'overview' ? (
          <div class="sc-frame">
            <div class="sc-frame-body" style="text-align:center">
              <p class="ds-text-secondary mb-2">{t('errors.generic')}</p>
              {error && <p class="text-sm text-red-300">{error}</p>}
              <p class="text-sm mt-4 text-white/70">{t('torrentSyncManager.startBackendToSeeData')}</p>
            </div>
          </div>
        ) : (
          <div class="sc-frame">
            <div class="sc-frame-body" style="text-align:center">
              <p class="ds-text-secondary">{t('torrentSyncManager.settingsAvailableWhenBackendConnected')}</p>
            </div>
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
          <div class="sc-frame">
            <div class="sc-frame-header">
              <div class="sc-frame-title">{t('torrentSyncManager.settings')}</div>
            </div>
            <div class="sc-frame-body">
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
                        {formatFrequency(status.settings.sync_frequency_minutes)} ({t('torrentSyncManager.custom')})
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
                    min="0"
                    max="100000"
                    value={status.settings.max_torrents_per_category ?? 0}
                    onChange={(e) => {
                      const value = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(value) && value >= 0 && value <= 100000) {
                        updateSettings({ max_torrents_per_category: value });
                      }
                    }}
                  />
                  <p class="text-xs text-gray-400 mt-1">{t('torrentSyncManager.maxTorrentsPerCategoryHint')}</p>
                </div>
                <div class="divider">{t('torrentSyncManager.advanced')}</div>
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
          <div class="sc-frame">
            <div class="sc-frame-body">
              <div class="ds-status-badge ds-status-badge--warning w-fit" role="status">
                {t('torrentSyncManager.settingsNotAvailable')}
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

  const syncInProgress = status.sync_in_progress === true;

  return (
    <div class="space-y-6 min-w-0 max-w-full overflow-x-hidden">
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

      {/* Bannière "En cours depuis" — au-dessus de la toolbar, avec animation */}
      {syncInProgress && (
        <div class="sync-elapsed-banner" role="status" aria-live="polite">
          <span class="sync-elapsed-banner__dot" aria-hidden="true" />
          <span>
            {t('torrentSyncManager.elapsedSinceLabel')}{' '}
            <span class="sync-elapsed-banner__time">{formatElapsedTime(elapsedTime)}</span>
          </span>
        </div>
      )}

      {/* Barre Sync : deux icônes (Vue d'ensemble / Paramètres) + outils + start/stop sur une seule ligne */}
      <div class="sync-toolbar mb-6">
        <div class="flex flex-nowrap items-center gap-2 min-w-0">
          <DsIconButton
            icon={LayoutGrid}
            onClick={() => setSyncView('overview')}
            title={t('torrentSyncManager.tabOverview')}
            ariaLabel={t('torrentSyncManager.tabOverview')}
            aria-pressed={syncView === 'overview'}
            size="sm"
            className={'sync-toolbar__icon sync-toolbar__tab' + (syncView === 'overview' ? ' sync-toolbar__tab--active' : '')}
          />
          <DsIconButton
            icon={Settings}
            onClick={() => setSyncView('settings')}
            title={t('torrentSyncManager.tabSettings')}
            ariaLabel={t('torrentSyncManager.tabSettings')}
            aria-pressed={syncView === 'settings'}
            size="sm"
            className={'sync-toolbar__icon sync-toolbar__tab' + (syncView === 'settings' ? ' sync-toolbar__tab--active' : '')}
          />
          <div class="sync-toolbar__tools" role="group" aria-label={t('torrentSyncManager.toolsAriaLabel')}>
            <DsIconButton icon={FileDown} onClick={async () => { const res = await serverApi.downloadSyncLog(); if (!res.success) setError(res.message || t('torrentSyncManager.downloadLogError')); }} title={t('torrentSyncManager.downloadLog')} ariaLabel={t('torrentSyncManager.downloadLog')} size="sm" className="sync-toolbar__icon" />
          </div>
          <span class="sync-toolbar__separator" aria-hidden="true" />
          {syncInProgress ? (
            <DsIconButton
              icon={Square}
              onClick={stopSync}
              disabled={syncing}
              aria-busy={syncing}
              title={t('torrentSyncManager.stopSync')}
              ariaLabel={t('torrentSyncManager.stopSync')}
              size="md"
              className="sync-toolbar__btn sync-toolbar__btn--main sync-toolbar__btn--danger"
              iconClass={syncing ? 'animate-spin' : ''}
            />
          ) : (
            <DsIconButton
              icon={Play}
              onClick={startSync}
              disabled={syncing || (selectedIndexerIdsForSync !== null && selectedIndexerIdsForSync.length === 0)}
              aria-busy={syncing}
              title={t('torrentSyncManager.fullScan')}
              ariaLabel={t('torrentSyncManager.fullScan')}
              size="md"
              className="sync-toolbar__btn sync-toolbar__btn--main sync-toolbar__btn--primary"
              iconClass={syncing ? 'animate-spin' : ''}
            />
          )}
        </div>
      </div>

      {syncView === 'overview' && (
              <>
                <h2 class="ds-title-page mb-6">{t('torrentSyncManager.progressTitle')}</h2>

      {/* Panneau "Ce qui se passe" : uniquement pendant une sync — cet emplacement reste vide sinon */}
      {syncInProgress && (
        <div class="sync-activity-panel mb-6 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] overflow-hidden">
          <h3 class="sync-activity-panel__title px-4 py-3 text-sm font-semibold text-[var(--ds-text-primary)] border-b border-[var(--ds-border)]">
            {t('torrentSyncManager.activityTitle')}
          </h3>
          <div class="sync-activity-panel__body px-4 py-3 text-sm">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
              {status.progress?.sync_trigger && (
                <span class="font-medium text-[var(--ds-text-secondary)]">
                  {status.progress.sync_trigger === 'scheduled'
                    ? t('torrentSyncManager.syncTriggerScheduled')
                    : t('torrentSyncManager.syncTriggerManual')}
                </span>
              )}
              {(status.progress?.current_indexer ?? '').trim() && (
                <span class="text-[var(--ds-text-tertiary)]">
                  {t('torrentSyncManager.currentIndexer')}: <strong class="text-[var(--ds-text-primary)]">{status.progress?.current_indexer}</strong>
                </span>
              )}
              {(status.progress?.current_category ?? '').trim() && (
                <span class="text-[var(--ds-text-tertiary)]">
                  {t('torrentSyncManager.category')}: <strong class="text-[var(--ds-text-primary)]">{status.progress?.current_category}</strong>
                </span>
              )}
            </div>
            {Array.isArray(status.progress?.log_lines) && status.progress.log_lines.length > 0 && (
              <div class="sync-activity-panel__log">
                <p class="text-xs font-semibold text-[var(--ds-text-tertiary)] mb-1.5">{t('torrentSyncManager.activityLogTitle')}</p>
                <div class="sync-activity-panel__log-lines rounded-lg bg-[var(--ds-surface)] border border-[var(--ds-border)] p-3 max-h-40 overflow-y-auto font-mono text-xs text-[var(--ds-text-secondary)] space-y-0.5">
                  {status.progress.log_lines.slice(-12).map((line, i) => (
                    <div key={i} class="truncate" title={line}>
                      {line.replace(/^\[\d+\]\s*/, '')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3 cartes pipeline : Récupérés / Enrichis TMDB / Enregistrés en DB */}
      {/* Affichées uniquement quand la sync n'est pas en cours ; pendant la sync, la section sync-section-active plus bas affiche la progression. */}
      {!status.sync_in_progress && (
        <>
          <div class="mb-2">
            <p class="text-sm font-medium text-[var(--ds-text-secondary)]">
              {t('torrentSyncManager.totalsInDb')}
            </p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <DsMetricCard
              icon="📥"
              label={t('torrentSyncManager.fetched')}
              value={0}
              accent="blue"
              className="rounded-xl"
            />
            <DsMetricCard
              icon="🎬"
              label={t('torrentSyncManager.enrichedTmdb')}
              value={status.tmdb_stats?.with_tmdb ?? 0}
              accent="yellow"
              className="rounded-xl"
            />
            <DsMetricCard
              icon="💾"
              label={t('torrentSyncManager.savedInDb')}
              value={totalTorrents}
              accent="green"
              className="rounded-xl"
            />
          </div>
          <p class="text-xs text-[var(--ds-text-tertiary)] max-w-2xl mb-6">
            {t('torrentSyncManager.pipelineExplanation')}
          </p>
        </>
      )}

      {/* Cartes indexeurs (une par indexer) */}
      {indexers.length > 0 && (
        <div class="space-y-4 mb-6">
          {indexers.map((indexer) => {
            const currentKey = (status.progress?.current_indexer ?? '').trim();
            const isCurrent = !!currentKey && (currentKey === (indexer.name ?? '').trim() || currentKey === indexer.id || currentKey.toLowerCase() === (indexer.name ?? '').trim().toLowerCase());
            const fetched = status.progress?.indexer_torrents?.[indexer.name] ?? status.progress?.indexer_torrents?.[indexer.id] ?? 0;
            const byCat = status.stats_by_indexer?.[indexer.name] ?? status.stats_by_indexer?.[indexer.id];
            const films = byCat?.films ?? 0;
            const series = byCat?.series ?? 0;
            const others = byCat?.others ?? 0;
            const hasError = status.sync_in_progress && isCurrent && status.progress?.errors && status.progress.errors.length > 0;
            const totalSynced = films + series + others;

            // Pendant une sync en cours, ne jamais afficher 100% pour la carte de l'indexer courant
            // (même si le calcul global atteint 100%), pour éviter l'effet "100%" alors que les logs continuent.
            const globalProgressPercent = progress;
            const progressPercent =
              status.sync_in_progress && isCurrent
                ? Math.min(globalProgressPercent, 99)
                : totalSynced > 0
                  ? 100
                  : 0;

            // Infos de phase par carte (fetch vs enrichissement) pour l'indexer en cours
            const totalToProcess = status.progress?.total_to_process ?? 0;
            const isPhaseFetch = status.sync_in_progress && isCurrent && totalToProcess === 0 && fetched > 0;
            const isPhaseEnrich = status.sync_in_progress && isCurrent && totalToProcess > 0;
            const subtitle = status.sync_in_progress && isCurrent
              ? t('torrentSyncManager.newContentsFound', { count: fetched })
              : totalSynced > 0
                ? t('torrentSyncManager.filmsSeriesSynced', { films, series })
                : t('torrentSyncManager.noContentInDatabase');
            const isSyncingThisCard = status.sync_in_progress && isCurrent;
            return (
              <button
                key={indexer.id}
                type="button"
                onClick={() => setSelectedIndexerForModal(indexer)}
                class={`sync-indexer-card w-full text-left rounded-xl p-5 sm:p-6 transition-all duration-300 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] ${isSyncingThisCard ? 'sync-indexer-card--syncing' : ''} ${hasError ? 'sync-card-error' : 'ds-box-accent'}`}
                title={t('torrentSyncManager.clickForDetails')}
              >
                <div class="relative min-w-0">
                  <span class="absolute top-0 right-0 flex items-center gap-2">
                    {isSyncingThisCard && (
                      <span class="sync-indexer-card__badge flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[var(--ds-text-on-accent)] text-xs font-bold whitespace-nowrap bg-white/90 shadow-sm">
                        <span class="sync-indexer-card__badge-dot" aria-hidden="true" />
                        {t('torrentSyncManager.inProgress')}
                      </span>
                    )}
                    <span class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 bg-[var(--ds-surface-elevated)]">
                      <ChevronRight {...iconProps} class="text-[var(--ds-text-primary)]" />
                    </span>
                  </span>
                  <h3 class={`text-base sm:text-lg md:text-xl font-bold text-[var(--ds-text-on-accent)] truncate ${isSyncingThisCard ? 'pr-28 sm:pr-32' : 'pr-12 sm:pr-14'}`}>{indexer.name}</h3>
                  <p class="text-[var(--ds-text-on-accent)]/60 text-xs sm:text-sm mt-0.5 truncate">{subtitle}</p>
                  <div class="mt-4">
                    <div class="flex justify-between text-xs font-semibold text-[#1C1C1E] mb-1.5">
                      <span>{t('torrentSyncManager.progressLabel')}</span>
                      <span class="tabular-nums">{progressPercent}%</span>
                    </div>
                    {isPhaseFetch && (
                      <p class="text-[var(--ds-text-tertiary)] text-xs mb-1">
                        {t('torrentSyncManager.phaseFetch')}
                      </p>
                    )}
                    {isPhaseEnrich && (
                      <p class="text-[var(--ds-text-tertiary)] text-xs mb-1">
                        {t('torrentSyncManager.phaseEnrich')}
                      </p>
                    )}
                    <div class="h-2.5 rounded-full overflow-hidden bg-black/10 sync-indexer-card__track">
                      {isSyncingThisCard && totalSynced === 0 ? (
                        <div class="sync-indexer-card__bar sync-indexer-card__bar--indeterminate" />
                      ) : (
                        <div class="sync-indexer-card__bar transition-all duration-500 bg-[var(--ds-surface)]" style={{ width: `${Math.min(100, progressPercent)}%` }} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Graphique répartition */}
      {(status.stats?.films ?? 0) + (status.stats?.series ?? 0) + (status.stats?.others ?? 0) > 0 && (
        <div class="sc-frame" style="margin-bottom:1.5rem">
          <div class="sc-frame-header">
            <div class="sc-frame-title">{t('torrentSyncManager.distributionChart')}</div>
          </div>
          <div class="sc-frame-body">
            <DsBarChart
              items={[
                { label: t('torrentSyncManager.films'), value: status.stats?.films ?? 0, color: 'var(--ds-accent-yellow)' },
                { label: t('torrentSyncManager.series'), value: status.stats?.series ?? 0, color: 'var(--ds-accent-violet)' },
                { label: t('torrentSyncManager.others'), value: status.stats?.others ?? 0, color: 'var(--ds-accent-green)' },
              ]}
            />
          </div>
        </div>
      )}

      {/* Pendant la sync : phase + carte "Récupérés → TMDB → base" + Total synchronisé */}
      {status.sync_in_progress && (
        <section class="sync-section-active p-4 sm:p-6 mb-6 rounded-xl overflow-hidden min-w-0 bg-[var(--ds-surface-elevated)]">
              {/* Bannière phase */}
              {status.progress && (() => {
                const totalToProcess = status.progress.total_to_process ?? 0;
                const fetchedCount = status.progress.category_torrents
                  ? Object.values(status.progress.category_torrents).reduce((s, n) => s + (n || 0), 0)
                  : 0;
                const isPhaseFetch = totalToProcess === 0 && fetchedCount > 0;
                if (isPhaseFetch) {
                  return (
                    <div class="rounded-xl p-3 border border-[var(--ds-accent-violet)]/50 mb-4 bg-[var(--ds-accent-violet-muted)]">
                      <p class="text-[var(--ds-text-on-accent)] font-medium text-sm flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full animate-pulse bg-[var(--ds-accent-violet)]" />
                        {t('torrentSyncManager.phaseFetch')}
                        {status.progress.current_query && (
                          <span class="text-[var(--ds-text-secondary)] font-normal">— {status.progress.current_query}</span>
                        )}
                      </p>
                      <p class="text-[var(--ds-text-secondary)] text-xs mt-1">{t('torrentSyncManager.phaseFetchExplanation')}</p>
                    </div>
                  );
                }
                if (totalToProcess > 0) {
                  return (
                    <p class="text-green-400 text-sm font-medium flex items-center gap-2 mb-4">
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

              {/* Carte unique : Récupérés → enrichissement TMDB → en base (graphique + TMDB) */}
              <div class="sc-frame" style="margin-bottom:1rem">
                <div class="sc-frame-header">
                  <div class="sc-frame-title">{t('torrentSyncManager.fetchThenEnrich')}</div>
                </div>
                <div class="sc-frame-body">
                  {/* Graphique Films / Séries / Autres (en base) — même style que Répartition */}
                  <DsBarChart
                    items={[
                      { label: `🎬 ${t('torrentSyncManager.films')}`, value: Math.floor(animatedCounts.films ?? effectiveStats.films ?? 0), color: 'var(--ds-accent-yellow)' },
                      { label: `📺 ${t('torrentSyncManager.series')}`, value: Math.floor(animatedCounts.series ?? effectiveStats.series ?? 0), color: 'var(--ds-accent-violet)' },
                      { label: `📦 ${t('torrentSyncManager.others')}`, value: Math.floor(animatedCounts.others ?? effectiveStats.others ?? 0), color: 'var(--ds-accent-green)' },
                    ]}
                  />
                  {/* Ligne récap récupérés (indexeurs) → en base */}
                  <p class="text-xs text-[var(--ds-text-secondary)] mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{t('torrentSyncManager.fetchedFromIndexers')}:</span>
                    <span class="tabular-nums">
                      {t('torrentSyncManager.films')} {(status.progress?.category_torrents?.films ?? 0).toLocaleString()} → {(effectiveStats.films ?? 0).toLocaleString()}
                      {' · '}
                      {t('torrentSyncManager.series')} {(status.progress?.category_torrents?.series ?? 0).toLocaleString()} → {(effectiveStats.series ?? 0).toLocaleString()}
                      {' · '}
                      {t('torrentSyncManager.others')} {(status.progress?.category_torrents?.others ?? 0).toLocaleString()} → {(effectiveStats.others ?? 0).toLocaleString()}
                    </span>
                  </p>
                  {/* TMDB : enrichis / total */}
                  {status.tmdb_stats && (() => {
                    const tmdbTotal = status.tmdb_stats.with_tmdb + status.tmdb_stats.without_tmdb;
                    const tmdbPercentage = tmdbTotal > 0 ? Math.round((status.tmdb_stats.with_tmdb / tmdbTotal) * 100) : 0;
                    return tmdbTotal > 0 && (
                      <div class="mt-4 pt-3 border-t border-[var(--ds-border)] flex flex-wrap items-center justify-between gap-2">
                        <span class="font-semibold text-[var(--ds-text-primary)]">TMDB</span>
                        <span class="tabular-nums text-sm">
                          <span class="font-bold text-[var(--ds-accent-violet)]">{status.tmdb_stats.with_tmdb.toLocaleString()}</span>
                          <span class="text-[var(--ds-text-secondary)]"> / {tmdbTotal.toLocaleString()}</span>
                          <span class="text-[var(--ds-text-secondary)] ml-1">· {tmdbPercentage}% {t('torrentSyncManager.enriched')}</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Total synchronisé : carte avec graphique (comme Répartition) */}
              <div class="mt-4 pt-4 border-t border-white/10">
                <div class="sc-frame">
                  <div class="sc-frame-header">
                    <div class="sc-frame-title">{t('torrentSyncManager.totalSynced')}</div>
                  </div>
                  <div class="sc-frame-body">
                    <DsBarChart
                      items={[
                        { label: t('torrentSyncManager.films'), value: effectiveStats.films ?? 0, color: 'var(--ds-accent-yellow)' },
                        { label: t('torrentSyncManager.series'), value: effectiveStats.series ?? 0, color: 'var(--ds-accent-violet)' },
                        { label: t('torrentSyncManager.others'), value: effectiveStats.others ?? 0, color: 'var(--ds-accent-green)' },
                      ]}
                    />
                    <p class="text-sm text-[var(--ds-text-secondary)] mt-3 font-semibold tabular-nums">
                      {totalTorrents.toLocaleString()} {t('torrentSyncManager.synchronized')}
                    </p>
                  </div>
                </div>
              </div>

              {(() => {
                const fetchedTotal = status.progress?.indexer_torrents
                  ? Object.values(status.progress.indexer_torrents).reduce((s, n) => s + (n || 0), 0)
                  : 0;
                if (fetchedTotal > 0 || totalTorrents > 0) return null;
                return (
                  <div class="rounded-xl p-3 text-center mt-3 border border-amber-500/40 bg-amber-500/15">
                    <p class="text-amber-400 text-sm font-medium">{t('torrentSyncManager.noTorrentsFound')}</p>
                    <p class="text-[var(--ds-text-secondary)] text-xs mt-1">{t('torrentSyncManager.syncInProgressNoResults')}</p>
                    {elapsedTime > 30 && (
                      <p class="text-red-400 text-xs mt-2">{t('torrentSyncManager.noResultsAfter', { time: formatElapsedTime(elapsedTime) })}</p>
                    )}
                  </div>
                );
              })()}
        </section>
      )}

      {/* Résumé Enrichissement TMDB : détails dans la modale d’un indexer (pas sur la page principale) */}
      {!status.sync_in_progress && status.tmdb_stats && totalTorrents > 0 && (
        <p class="text-[var(--ds-text-secondary)] text-sm mb-6">
          {t('torrentSyncManager.tmdbEnrichmentPrefix')}
          <span class="text-[var(--ds-text-primary)]">{status.tmdb_stats.with_tmdb.toLocaleString()}</span> {t('torrentSyncManager.withTmdb').toLowerCase()}, <span class="text-[var(--ds-text-primary)]">{status.tmdb_stats.without_tmdb.toLocaleString()}</span> {t('torrentSyncManager.withoutTmdb').toLowerCase()}.
          {t('torrentSyncManager.clickIndexerCardAbove')}
        </p>
      )}

      {!status.sync_in_progress && (
        <>
          {totalTorrents === 0 && (
            <section class="rounded-xl p-8 text-center mb-8 border border-amber-500/30 bg-[var(--ds-surface-elevated)]">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-amber-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p class="text-amber-400 font-semibold mb-1">{t('torrentSyncManager.noTorrentsSynced')}</p>
              <p class="text-[var(--ds-text-secondary)] text-sm mb-4">{t('torrentSyncManager.lastSyncNoResults')}</p>
              {indexers.length > 0 ? (
                <p class="text-[var(--ds-text-primary)] text-sm">{t('torrentSyncManager.activeIndexersCount', { count: indexers.length })}</p>
              ) : (
                <p class="text-[var(--ds-accent-red)] text-sm">{t('torrentSyncManager.noIndexerActivated')}</p>
              )}
            </section>
          )}
        </>
      )}

              </>
            )}

      {syncView === 'settings' && (
              <>
      <div class="sc-frame" style="margin-bottom:1.5rem">
        {!status.sync_in_progress && indexers.length > 0 && (
          <div class="p-4 sm:p-6 border-b border-white/10">
            <h3 class="text-base font-semibold text-white mb-4 flex items-center gap-2">
<span class="flex items-center justify-center w-8 h-8 rounded-full text-[var(--ds-text-on-accent)] shrink-0 bg-[var(--ds-accent-violet)]">
              <List {...iconPropsSm} />
            </span>
              {t('torrentSyncManager.syncIndexersTitle')}
            </h3>
            <label class="label cursor-pointer justify-start gap-3 mb-2">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                checked={selectedIndexerIdsForSync === null}
                onChange={(e) => {
                  if ((e.target as HTMLInputElement).checked) setSelectedIndexerIdsForSync(null);
                  else setSelectedIndexerIdsForSync(indexers.map((i) => i.id));
                }}
              />
              <span class="label-text text-white/80">{t('torrentSyncManager.allIndexers')}</span>
            </label>
            {selectedIndexerIdsForSync !== null && (
              <div class="flex flex-wrap gap-2 ml-0 sm:ml-6 mt-2 min-w-0 max-w-full">
                {indexers.map((idx) => (
                  <label key={idx.id} class="label cursor-pointer gap-2 rounded-[var(--ds-radius-full)] px-3 py-2 border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      checked={selectedIndexerIdsForSync.includes(idx.id)}
                      onChange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        setSelectedIndexerIdsForSync((prev) => {
                          if (prev === null) return [idx.id];
                          if (checked) return prev.includes(idx.id) ? prev : [...prev, idx.id];
                          return prev.filter((id) => id !== idx.id);
                        });
                      }}
                    />
                    <span class="text-sm text-white/80 truncate max-w-[140px]" title={idx.name}>{idx.name}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedIndexerIdsForSync !== null && selectedIndexerIdsForSync.length === 0 && (
              <p class="text-amber-400 text-xs mt-2 ml-6">{t('torrentSyncManager.selectAtLeastOneIndexer')}</p>
            )}
          </div>
        )}
        {/* Bouton Vider (même carte) */}
        {hasTorrents && !status.sync_in_progress && (
          <div class="px-4 sm:px-6 py-4 border-b border-white/10">
            <button class="btn btn-sm gap-2 rounded-xl border border-red-500/40 bg-red-900/20 text-red-300 hover:bg-red-900/40 hover:border-red-500/60" onClick={clearTorrents} disabled={syncing}>
              {syncing ? <span class="loading loading-spinner loading-sm" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              {t('torrentSyncManager.clearTorrents')}
            </button>
          </div>
        )}
        {/* Sous-carte : Paramètres (toujours déployée) */}
        {status.settings && (
          <div class="p-4 sm:p-6">
            <h3 class="text-base font-semibold text-white flex items-center gap-2 mb-4">
              <span class="flex items-center justify-center w-8 h-8 rounded-full text-[var(--ds-text-on-accent)] shrink-0 bg-[var(--ds-accent-violet)]">
                <Settings {...iconPropsSm} />
              </span>
              {t('torrentSyncManager.settings')}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                <div>
                  <label class="label py-0"><span class="label-text font-medium text-white/90">{t('torrentSyncManager.syncFrequency')}</span></label>
                  <select
                    class="select w-full select-sm rounded-[var(--ds-radius-full)] border-[var(--ds-border)] text-[var(--ds-text-primary)] bg-[var(--ds-surface)]"
                    value={String(status.settings?.sync_frequency_minutes ?? 60)}
                    onChange={(e) => updateSettings({ sync_frequency_minutes: parseInt((e.target as HTMLSelectElement).value) })}
                  >
                    <option value="15">15 {t('torrentSyncManager.minutes')}</option>
                    <option value="30">30 {t('torrentSyncManager.minutes')}</option>
                    <option value="60">1 {t('torrentSyncManager.hours')}</option>
                    <option value="120">2 {t('torrentSyncManager.hours')}</option>
                    <option value="240">4 {t('torrentSyncManager.hours')}</option>
                    <option value="480">8 {t('torrentSyncManager.hours')}</option>
                    <option value="1440">24 {t('torrentSyncManager.hours')}</option>
                    {status.settings?.sync_frequency_minutes && ![15, 30, 60, 120, 240, 480, 1440].includes(status.settings.sync_frequency_minutes) && (
                      <option value={String(status.settings.sync_frequency_minutes)}>{formatFrequency(status.settings.sync_frequency_minutes)} ({t('torrentSyncManager.custom')})</option>
                    )}
                  </select>
                </div>
                <div>
                  <label class="label py-0"><span class="label-text font-medium text-white/90">{t('torrentSyncManager.maxTorrentsPerCategory')}</span></label>
                  <input
                    type="number"
                    class="input w-full input-sm rounded-[var(--ds-radius-full)] border-[var(--ds-border)] text-[var(--ds-text-primary)] bg-[var(--ds-surface)]"
                    min={0}
                    max={100000}
                    value={status.settings.max_torrents_per_category ?? 0}
                    onBlur={(e) => {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(v) && v >= 0 && v <= 100000) updateSettings({ max_torrents_per_category: v });
                    }}
                  />
                  <p class="text-xs text-white/50 mt-0.5">{t('torrentSyncManager.maxTorrentsPerCategoryHint')}</p>
                </div>
                <div class="flex items-end pb-1">
                  <label class="label cursor-pointer gap-3">
                    <input type="checkbox" class="toggle toggle-sm" checked={status.settings.is_enabled === 1} onChange={(e) => updateSettings({ is_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 })} />
                    <span class="label-text text-white/90">{t('torrentSyncManager.autoSyncEnabled')}</span>
                  </label>
                </div>
              </div>
          </div>
        )}
      </div>
              </>
            )}

      {/* Modal détails indexer (hors onglets pour rester visible au changement d’onglet) */}
      {selectedIndexerForModal != null && (
        <Modal
          key={selectedIndexerForModal.id}
          isOpen={true}
          onClose={() => setSelectedIndexerForModal(null)}
          title={t('torrentSyncManager.indexerDetails')}
          size="lg"
        >
          <IndexerDetailsModalContent
            idx={selectedIndexerForModal}
            status={status}
            totalTorrents={totalTorrents}
            hasCloudToken={hasCloudToken}
            geminiLoading={geminiLoading}
            onImproveWithGemini={improveWithGemini}
            onStartSyncForIndexer={startSyncForIndexer}
            syncing={syncing}
            onClose={() => setSelectedIndexerForModal(null)}
            t={t}
            language={language}
          />
        </Modal>
      )}
    </div>
  );
}
