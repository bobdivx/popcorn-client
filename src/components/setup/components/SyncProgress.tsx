import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n/useI18n';
import { DsLoader } from '../../ui/DsLoader';

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
  /** Stats TMDB (enrichis / sans TMDB) si renvoyées par l’API */
  tmdb_stats?: { with_tmdb: number; without_tmdb: number };
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
        <div className="sp-compact sticky top-0 z-[100] px-4 py-3 flex items-center gap-2">
          <style>{SYNC_PROGRESS_CSS}</style>
          <DsLoader size="xs" className="shrink-0" />
          <span className="sp-compact__label">{t('syncProgress.starting')}</span>
        </div>
      );
    }
    return (
      <div className="sp-root">
        <style>{SYNC_PROGRESS_CSS}</style>
        <div className="sp-panel sp-panel--center">
          <div className="sp-head sp-head--center">
            <DsLoader size="xs" className="shrink-0" />
            <h3 className="sp-title">{t('syncProgress.starting')}</h3>
          </div>
          <p className="sp-muted">{t('syncProgress.backendConnecting')}</p>
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

  // Mode compact : barre en haut avec juste le pourcentage (z-index au-dessus de la hero sur mobile)
  if (compact) {
    return (
      <div className="sp-compact sticky top-0 z-[100] px-4 py-3 flex items-center gap-3">
        <style>{SYNC_PROGRESS_CSS}</style>
        <DsLoader size="xs" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2 mb-1">
            <span className="sp-compact__label truncate">{t('syncProgress.inProgress')}</span>
            <span className="sp-value sp-value--sm flex-shrink-0">{progress}%</span>
          </div>
          <div className="sp-bar">
            <div className="sp-bar__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {elapsedTime > 0 && (
          <span className="sp-time flex-shrink-0">{formatElapsedTime(elapsedTime)}</span>
        )}
      </div>
    );
  }

  const categoryCode = (category: string) => (category === 'films' ? 'FILM' : category === 'series' ? 'TV' : '···');

  return (
    <div className="sp-root animate-fade-in">
      <style>{SYNC_PROGRESS_CSS}</style>
      {/* En-tête avec temps écoulé */}
      <div className="sp-panel">
        <div className="sp-head">
          <h3 className="sp-title">
            <DsLoader size="xs" className="shrink-0" />
            <span>{isActuallySyncing ? t('syncProgress.inProgress') : t('syncProgress.pending')}</span>
          </h3>
          {elapsedTime > 0 && (
            <span className="sp-time">{formatElapsedTime(elapsedTime)}</span>
          )}
        </div>

        {/* Informations de progression */}
        {effectiveStatus.progress && (
          <div className="sp-rows">
            {effectiveStatus.progress.total_to_process === 0 && fetchedTotal > 0 && (
              <div className="sp-row">
                <div className="sp-row__body">
                  <p className="sp-label">{t('syncProgress.fetching')}</p>
                  <p className="sp-row__value">
                    {fetchedTotal.toLocaleString()} {t('syncProgress.torrentsFetched')}
                    {typeof effectiveStatus.progress.fetched_pages === 'number' ? ` • ${effectiveStatus.progress.fetched_pages} ${t('syncProgress.pages')}` : ''}
                  </p>
                </div>
              </div>
            )}

            {effectiveStatus.progress.current_indexer && (
              <div className="sp-row">
                <span className="sp-dot" aria-hidden="true"></span>
                <div className="sp-row__body">
                  <p className="sp-label">{t('syncProgress.currentIndexer')}</p>
                  <p className="sp-row__value">{effectiveStatus.progress.current_indexer}</p>
                </div>
                {effectiveStatus.progress.indexer_torrents[effectiveStatus.progress.current_indexer] !== undefined && (
                  <div className="sp-row__aside">
                    <p className="sp-value">{effectiveStatus.progress.indexer_torrents[effectiveStatus.progress.current_indexer]}</p>
                    <p className="sp-label">{t('syncProgress.torrents')}</p>
                  </div>
                )}
              </div>
            )}

            {effectiveStatus.progress.current_category && (
              <div className="sp-row">
                <span className="sp-code" aria-hidden="true">{categoryCode(effectiveStatus.progress.current_category)}</span>
                <div className="sp-row__body">
                  <p className="sp-label">{t('syncProgress.category')}</p>
                  <p className="sp-row__value capitalize">{effectiveStatus.progress.current_category}</p>
                </div>
                {effectiveStatus.progress.category_torrents[effectiveStatus.progress.current_category] !== undefined && (
                  <div className="sp-row__aside">
                    <p className="sp-value">{effectiveStatus.progress.category_torrents[effectiveStatus.progress.current_category]}</p>
                    <p className="sp-label">{t('syncProgress.torrents')}</p>
                  </div>
                )}
              </div>
            )}

            {effectiveStatus.progress.total_to_process > 0 && (
              <div className="sp-row sp-row--col">
                <div className="sp-head" style={{ marginBottom: '10px' }}>
                  <p className="sp-label">{t('syncProgress.processing')}</p>
                  <p className="sp-value sp-value--sm">
                    {effectiveStatus.progress.total_processed} / {effectiveStatus.progress.total_to_process}
                  </p>
                </div>
                <div className="sp-bar">
                  <div
                    className="sp-bar__fill"
                    style={{ width: `${Math.min(100, (effectiveStatus.progress.total_processed / effectiveStatus.progress.total_to_process) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barre de progression globale */}
        <div className="sp-global">
          <div className="sp-head" style={{ marginBottom: '12px' }}>
            <span className="sp-label sp-label--ink">{t('syncProgress.globalProgress')}</span>
            <span className="sp-value">{progress}%</span>
          </div>
          <div className="sp-bar sp-bar--lg">
            <div className="sp-bar__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Films, Séries, Autres : une ligne par catégorie */}
      {Object.keys(effectiveStatus.stats || {}).length > 0 && (
        <div className="sp-list">
          {Object.entries(effectiveStatus.stats || {}).map(([category, count]) => {
            const animatedCount = Math.floor(animatedCounts[category] || 0);
            const label = category === 'films' ? t('torrentSyncManager.films') : category === 'series' ? t('torrentSyncManager.series') : t('torrentSyncManager.others');
            return (
              <div key={category} className="sp-stat">
                <div className="sp-stat__left">
                  <span className="sp-code" aria-hidden="true">{categoryCode(category)}</span>
                  <span className="sp-stat__label">{label}</span>
                </div>
                <span className="sp-value tabular-nums">{animatedCount.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* TMDB : enrichis si l’API renvoie tmdb_stats */}
      {effectiveStatus.tmdb_stats && (effectiveStatus.tmdb_stats.with_tmdb > 0 || effectiveStatus.tmdb_stats.without_tmdb > 0) && (
        <div className="sp-stat">
          <div className="sp-stat__left">
            <span className="sp-code" aria-hidden="true">TMDB</span>
            <span className="sp-stat__label">{t('torrentSyncManager.withTmdb')} / TMDB</span>
          </div>
          <span className="sp-value tabular-nums">
            {effectiveStatus.tmdb_stats.with_tmdb.toLocaleString()}
            <span className="sp-value__total"> / {(effectiveStatus.tmdb_stats.with_tmdb + effectiveStatus.tmdb_stats.without_tmdb).toLocaleString()}</span>
          </span>
        </div>
      )}

      {/* Total synchronisé (récap unique) */}
      {totalTorrents > 0 && (
        <div className="sp-stat sp-stat--total">
          <div className="sp-stat__left">
            <span className="sp-stat__label">{t('syncProgress.totalSynced')}</span>
          </div>
          <span className="sp-value sp-value--lg tabular-nums">{totalTorrents.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

/** Style éditorial (corail sur fond sombre), autonome : le composant sert aussi hors de l'assistant. */
const SYNC_PROGRESS_CSS = `
.sp-root { font-family: 'Jost', 'Inter', system-ui, sans-serif; font-weight: 300; color: #f4f1ec; }
.sp-root > * + * { margin-top: 12px; }
.sp-panel { padding: 22px 24px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.025); border-radius: 2px; }
.sp-panel--center { text-align: center; }
.sp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.sp-head--center { justify-content: center; }
.sp-head--center > * + * { margin-left: 12px; }
.sp-title { display: flex; align-items: center; margin: 0; font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-weight: 300; font-size: 0.78rem; letter-spacing: 0.26em; text-transform: uppercase; color: #f4f1ec; }
.sp-title > * + * { margin-left: 12px; }
.sp-muted { margin: 0; font-size: 0.85rem; line-height: 1.6; color: rgba(244,241,236,0.62); }
.sp-time { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.78rem; color: rgba(244,241,236,0.62); }
.sp-rows { border-top: 1px solid rgba(255,255,255,0.09); }
.sp-row { display: flex; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.09); }
.sp-row > * + * { margin-left: 14px; }
.sp-row--col { display: block; }
.sp-row--col > * + * { margin-left: 0; }
.sp-row__body { flex: 1; min-width: 0; }
.sp-row__value { margin: 4px 0 0; font-size: 0.9rem; color: #f4f1ec; overflow-wrap: anywhere; }
.sp-row__aside { text-align: right; flex-shrink: 0; }
.sp-label { margin: 0; font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-size: 0.6rem; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(244,241,236,0.38); }
.sp-label--ink { color: rgba(244,241,236,0.62); }
.sp-value { margin: 0; font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-weight: 300; font-size: 1.25rem; letter-spacing: 0.04em; color: #f2545b; font-variant-numeric: tabular-nums; }
.sp-value--sm { font-size: 0.85rem; }
.sp-value--lg { font-size: 1.9rem; font-weight: 200; }
.sp-value__total { color: rgba(244,241,236,0.62); font-size: 0.85em; }
.sp-dot { width: 6px; height: 6px; border-radius: 50%; background: #f2545b; flex-shrink: 0; }
.sp-code { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 26px; padding: 0 8px; border: 1px solid rgba(242,84,91,0.38); color: #f2545b; font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-size: 0.58rem; letter-spacing: 0.18em; flex-shrink: 0; }
.sp-global { margin-top: 20px; }
.sp-bar { height: 2px; background: rgba(242,84,91,0.18); overflow: hidden; }
.sp-bar--lg { height: 3px; }
.sp-bar__fill { height: 100%; background: #f2545b; transition: width 0.4s cubic-bezier(0.2,0.7,0.2,1); }
.sp-list { border-top: 1px solid rgba(255,255,255,0.09); }
.sp-list .sp-stat { border-top: 0; }
.sp-stat { display: flex; align-items: center; justify-content: space-between; padding: 16px 4px; border-bottom: 1px solid rgba(255,255,255,0.09); }
.sp-stat__left { display: flex; align-items: center; min-width: 0; }
.sp-stat__left > * + * { margin-left: 14px; }
.sp-stat__label { font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase; color: #f4f1ec; }
.sp-stat--total { padding: 20px 24px; border: 1px solid rgba(242,84,91,0.38); background: rgba(242,84,91,0.06); }
.sp-compact { background: rgba(12,13,16,0.96); border-bottom: 1px solid rgba(242,84,91,0.38); color: #f4f1ec; }
.sp-compact__label { font-family: 'Josefin Sans', 'Jost', system-ui, sans-serif; font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(244,241,236,0.78); }
`;
