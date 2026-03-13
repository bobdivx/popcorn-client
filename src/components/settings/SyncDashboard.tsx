/**
 * SyncDashboard — Page complète de synchronisation
 * Design wizard unifié avec Chart.js pour les graphiques animés.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  Chart,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
} from 'chart.js';
import { Play, Square, RotateCcw, Settings, ChevronDown, ChevronUp, FileDown, Trash2, RefreshCw, AlertTriangle, Check, Activity, Database, Film, Tv2, Package } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import {
  getSyncStatusStore,
  subscribeSyncStatusStore,
  refreshSyncStatusStore,
} from '../../lib/sync-status-store';
import type { SyncStatusStore } from '../../lib/sync-status-store';
import { calculateSyncProgress } from '../../lib/utils/sync-progress';
import { useI18n } from '../../lib/i18n/useI18n';
import type { Indexer } from '../../lib/client/types';
import { useNativeNotifications } from '../../hooks/useNativeNotifications';

Chart.register(ArcElement, DoughnutController, Tooltip, Legend);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Graphique donut animé                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncDonutChart({ films, series, others }: { films: number; series: number; others: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const total = films + series + others;

  // Créer le chart une seule fois
  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Films', 'Séries', 'Autres'],
        datasets: [{
          data: [films || 0.001, series || 0.001, others || 0.001],
          backgroundColor: [
            'rgba(251,191,36,0.88)',
            'rgba(139,92,246,0.88)',
            'rgba(34,197,94,0.88)',
          ],
          borderColor: 'rgba(255,255,255,0.04)',
          borderWidth: 2,
          hoverOffset: 10,
        }],
      },
      options: {
        cutout: '74%',
        animation: { duration: 800, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(10,10,20,0.92)',
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => `  ${ctx.label}: ${ctx.parsed.toLocaleString()}`,
            },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  // Mettre à jour les données
  useEffect(() => {
    if (!chartRef.current) return;
    const d = chartRef.current.data.datasets[0];
    d.data = [films || 0.001, series || 0.001, others || 0.001];
    chartRef.current.update('active');
  }, [films, series, others]);

  return (
    <div class="sync-donut-wrap">
      <canvas ref={canvasRef} />
      {total > 0 && (
        <div class="sync-donut-center">
          <span class="sync-donut-total">{total.toLocaleString()}</span>
          <span class="sync-donut-label">total</span>
        </div>
      )}
      {total === 0 && (
        <div class="sync-donut-center">
          <Database class="w-7 h-7" style="opacity:0.25" />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Compteur animé                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    if (start === value) return;
    const diff = value - start;
    const steps = 24;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const t = step / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + diff * eased);
      setDisplay(next);
      if (step >= steps) {
        clearInterval(iv);
        setDisplay(value);
        prevRef.current = value;
      }
    }, 600 / steps);
    return () => clearInterval(iv);
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Barre de progression animée                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncProgressBar({ percent, animated = false }: { percent: number; animated?: boolean }) {
  return (
    <div class="sync-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div
        class={`sync-progress-fill${animated ? ' sync-progress-fill--pulse' : ''}`}
        style={`width:${percent}%`}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Utilitaires                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatLastSync(ts: number | null, language: string): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts * 1000));
  } catch {
    return new Date(ts * 1000).toLocaleString();
  }
}

function formatFrequency(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? '1 h' : `${h} h`;
  }
  return `${minutes} min`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Composant principal                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function SyncDashboard() {
  const { t, language } = useI18n();
  const [status, setStatus] = useState<SyncStatusStore | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedIndexerIds, setSelectedIndexerIds] = useState<string[] | null>(null);
  const [filmsQueriesText, setFilmsQueriesText] = useState('');
  const [seriesQueriesText, setSeriesQueriesText] = useState('');
  const prevSyncRef = useRef(false);
  const loadIndexersRef = useRef(false);

  const { notifySyncStart, notifySyncError } = useNativeNotifications();

  /* Abonnement au store */
  useEffect(() => {
    const unsub = subscribeSyncStatusStore(({ status: s }) => {
      setStatus(s);
      if (s?.settings) {
        const sq = s.settings as Record<string, unknown>;
        if (Array.isArray(sq.sync_queries_films)) setFilmsQueriesText((sq.sync_queries_films as string[]).join('\n'));
        if (Array.isArray(sq.sync_queries_series)) setSeriesQueriesText((sq.sync_queries_series as string[]).join('\n'));
      }
    });
    refreshSyncStatusStore();
    return unsub;
  }, []);

  /* Timer elapsed */
  useEffect(() => {
    if (!status?.sync_in_progress) {
      setElapsedTime(0);
      return;
    }
    const start = status.sync_start_time ? status.sync_start_time * 1000 : Date.now();
    setElapsedTime(Math.floor((Date.now() - start) / 1000));
    const iv = setInterval(() => setElapsedTime(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [status?.sync_in_progress, status?.sync_start_time]);

  /* Recharger les indexers quand la sync se termine */
  useEffect(() => {
    const inProgress = Boolean(status?.sync_in_progress);
    if (prevSyncRef.current && !inProgress) {
      setTimeout(() => { refreshSyncStatusStore(); loadIndexers(); }, 1000);
    }
    prevSyncRef.current = inProgress;
  }, [status?.sync_in_progress]);

  /* Chargement des indexers */
  const loadIndexers = useCallback(async () => {
    if (loadIndexersRef.current) return;
    loadIndexersRef.current = true;
    try {
      const r = await serverApi.getIndexers();
      if (r.success && r.data) setIndexers(r.data.filter((i: Indexer) => i.isEnabled));
    } finally {
      loadIndexersRef.current = false;
    }
  }, []);

  useEffect(() => { loadIndexers(); }, []);

  /* ── Sync du backend (indexers Rust) avant démarrage ── */
  const syncIndexersToBackend = useCallback(async () => {
    try {
      const r = await serverApi.getIndexers();
      if (!r.success || !r.data) return;
      const enabled = r.data.filter((i: Indexer) => i.isEnabled);
      if (!enabled.length) return;
      const { getBackendUrlAsync } = await import('../../lib/backend-url.js');
      const backendUrl = await getBackendUrlAsync();
      await Promise.all(enabled.map(async (idx: Indexer) => {
        try {
          await fetch(`${backendUrl}/api/client/admin/indexers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idx.id, name: idx.name, base_url: idx.baseUrl, api_key: idx.apiKey || null, is_enabled: true, is_default: idx.isDefault || false, priority: idx.priority || 0 }),
            signal: AbortSignal.timeout(2000),
          });
        } catch { /* silent */ }
      }));
    } catch { /* silent */ }
  }, []);

  /* ── Actions ── */
  const handleStartSync = async () => {
    try {
      setSyncing(true); setError(''); setSuccess('');
      await syncIndexersToBackend();
      const r = await serverApi.getIndexers();
      const enabledIds = r.success && r.data ? (r.data as Indexer[]).filter(i => i.isEnabled).map(i => i.id) : [];
      const idsToSync = selectedIndexerIds === null || selectedIndexerIds.length === indexers.length
        ? (enabledIds.length > 0 ? enabledIds : undefined)
        : selectedIndexerIds.length > 0 ? selectedIndexerIds : undefined;
      if ((idsToSync !== undefined && !idsToSync.length) || (idsToSync === undefined && !enabledIds.length)) {
        setError(t('torrentSyncManager.mustConfigureIndexer'));
        return;
      }
      const res = await serverApi.startSync(idsToSync);
      if (res.success) {
        setSuccess(t('torrentSyncManager.syncStarted'));
        setTimeout(() => setSuccess(''), 5000);
        await notifySyncStart();
        refreshSyncStatusStore();
        setTimeout(() => { refreshSyncStatusStore(); loadIndexers(); }, 1500);
      } else {
        const msg = res.message || res.error || 'Erreur lors du démarrage';
        setError(msg);
        await notifySyncError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setError(msg);
      await notifySyncError(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleStopSync = async () => {
    if (!confirm(t('torrentSyncManager.stopSyncConfirm'))) return;
    try {
      setSyncing(true); setError(''); setSuccess('');
      const res = await serverApi.stopSync();
      if (res.success) {
        setSuccess(t('torrentSyncManager.syncStopped'));
        setTimeout(() => setSuccess(''), 4000);
        setStatus(prev => prev ? { ...prev, sync_in_progress: false, sync_start_time: null, progress: undefined } : prev);
        setTimeout(() => refreshSyncStatusStore(), 800);
      } else {
        setError(res.message || res.error || 'Erreur');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleClearTorrents = async () => {
    if (!confirm(t('torrentSyncManager.confirmClearAll'))) return;
    try {
      setSyncing(true); setError(''); setSuccess('');
      const res = await serverApi.clearSyncTorrents();
      if (res.success) {
        setSuccess(t('torrentSyncManager.torrentsCleared'));
        setTimeout(() => setSuccess(''), 4000);
        refreshSyncStatusStore();
      } else {
        setError(res.message || res.error || 'Erreur');
      }
    } finally {
      setSyncing(false);
    }
  };

  const updateSettings = async (patch: Record<string, unknown>) => {
    try {
      await serverApi.updateSyncSettings(patch);
      refreshSyncStatusStore();
    } catch { /* silent */ }
  };

  /* ── Données calculées ── */
  const films = Number(status?.stats?.films ?? 0);
  const series = Number(status?.stats?.series ?? 0);
  const others = Number(status?.stats?.others ?? 0);
  const total = films + series + others;
  const inProgress = Boolean(status?.sync_in_progress);
  const syncSettings = status?.settings as Record<string, unknown> | undefined;
  const progressPercent = calculateSyncProgress({
    sync_in_progress: inProgress,
    stats: status?.stats,
    progress: status?.progress,
  });
  const logLines = status?.progress?.log_lines?.slice(-10) ?? [];
  const currentIndexer = status?.progress?.current_indexer;
  const currentCategory = status?.progress?.current_category;
  const currentQuery = status?.progress?.current_query;
  const tmdb = status?.tmdb_stats;
  const tmdbTotal = tmdb ? tmdb.with_tmdb + tmdb.without_tmdb : 0;
  const tmdbPercent = tmdbTotal > 0 ? Math.round((tmdb!.with_tmdb / tmdbTotal) * 100) : 0;
  const hasTorrents = total > 0;
  const trigger = status?.progress?.sync_trigger;
  const isEnabled = Number(syncSettings?.is_enabled ?? 1) === 1;
  const frequencyMin = Number(syncSettings?.sync_frequency_minutes ?? 60);

  // Phase
  const toProcess = status?.progress?.total_to_process ?? 0;
  const processed = status?.progress?.total_processed ?? 0;
  const phase = toProcess > 0 ? 2 : 1;

  if (!status) {
    return (
      <div class="sync-dash-loading">
        <span class="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
      </div>
    );
  }

  return (
    <div class="sync-dash">

      {/* Bannière erreur/succès */}
      {error && (
        <div class="sync-banner sync-banner--error" role="alert">
          <AlertTriangle class="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button type="button" class="ml-auto" onClick={() => setError('')} aria-label="Fermer">✕</button>
        </div>
      )}
      {success && (
        <div class="sync-banner sync-banner--success" role="status">
          <Check class="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ── HERO CARD ─────────────────────────────────────── */}
      <div class={`sync-hero sc-frame${inProgress ? ' sync-hero--active' : ''}`}>
        <div class="sync-hero-content">
          <div class="sync-hero-info">
            {/* Status badge */}
            <div class={`sync-status-badge${inProgress ? ' sync-status-badge--live' : ''}`}>
              {inProgress ? (
                <>
                  <span class="sync-pulse-dot" />
                  {t('torrentSyncManager.inProgress')}
                  {trigger === 'scheduled' && <span class="sync-trigger-tag">{t('torrentSyncManager.syncTriggerScheduled')}</span>}
                  {trigger === 'manual' && <span class="sync-trigger-tag">{t('torrentSyncManager.syncTriggerManual')}</span>}
                </>
              ) : (
                <>
                  <span class="sync-idle-dot" />
                  {t('torrentSyncManager.inactive')}
                </>
              )}
            </div>

            {/* Infos timing */}
            <div class="sync-hero-meta">
              {inProgress && elapsedTime > 0 && (
                <div class="sync-meta-item">
                  <Activity class="w-3.5 h-3.5" />
                  <span>{t('torrentSyncManager.elapsedSince')} {formatElapsed(elapsedTime)}</span>
                </div>
              )}
              <div class="sync-meta-item">
                <RefreshCw class="w-3.5 h-3.5" />
                <span>{t('torrentSyncManager.lastSync')}: {formatLastSync(status.last_sync_date, language)}</span>
              </div>
              {isEnabled && !inProgress && (
                <div class="sync-meta-item">
                  <span>Auto: {formatFrequency(frequencyMin)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bouton principal PLAY/STOP */}
          <div class="sync-hero-actions">
            {!inProgress ? (
              <button
                type="button"
                class="sync-btn-play"
                onClick={() => void handleStartSync()}
                disabled={syncing}
                aria-label={t('torrentSyncManager.launchSync')}
              >
                {syncing
                  ? <span class="loading loading-spinner loading-sm" />
                  : <Play class="w-7 h-7" fill="currentColor" />
                }
                <span>{t('torrentSyncManager.launchSync')}</span>
              </button>
            ) : (
              <button
                type="button"
                class="sync-btn-stop"
                onClick={() => void handleStopSync()}
                disabled={syncing}
                aria-label={t('torrentSyncManager.stopSync')}
              >
                {syncing
                  ? <span class="loading loading-spinner loading-sm" />
                  : <Square class="w-5 h-5" fill="currentColor" />
                }
                <span>{t('torrentSyncManager.stopSync')}</span>
              </button>
            )}
            <button
              type="button"
              class="sync-btn-icon"
              onClick={() => serverApi.downloadSyncLog?.()}
              title={t('torrentSyncManager.downloadLog')}
              aria-label={t('torrentSyncManager.downloadLog')}
            >
              <FileDown class="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barre de progression (pendant sync) */}
        {inProgress && (
          <div class="sync-hero-progress">
            <div class="sync-progress-header">
              <span class="sync-phase-tag">Phase {phase}/2</span>
              {currentIndexer && (
                <span class="sync-current-info">
                  <span class="font-medium text-[var(--ds-accent-violet)]">{currentIndexer}</span>
                  {currentCategory && <span class="text-[var(--ds-text-tertiary)]"> · {currentCategory}</span>}
                  {currentQuery && <span class="text-[var(--ds-text-tertiary)] truncate max-w-[160px]"> · {currentQuery}</span>}
                </span>
              )}
              <span class="ml-auto text-xs font-bold text-[var(--ds-accent-violet)]">{progressPercent}%</span>
            </div>
            <SyncProgressBar percent={progressPercent} animated={progressPercent < 5} />
            {toProcess > 0 && (
              <p class="text-xs text-[var(--ds-text-tertiary)] mt-1">
                {t('torrentSyncManager.torrentProcessing')}: {processed.toLocaleString()} / {toProcess.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── STATS ──────────────────────────────────────────── */}
      <div class="sync-stats-grid">
        <div class="sync-stat-card sync-stat-card--yellow">
          <div class="sync-stat-icon">🎬</div>
          <div class="sync-stat-value"><AnimatedNumber value={films} /></div>
          <div class="sync-stat-label">{t('torrentSyncManager.films')}</div>
        </div>
        <div class="sync-stat-card sync-stat-card--violet">
          <div class="sync-stat-icon">📺</div>
          <div class="sync-stat-value"><AnimatedNumber value={series} /></div>
          <div class="sync-stat-label">{t('torrentSyncManager.series')}</div>
        </div>
        <div class="sync-stat-card sync-stat-card--green">
          <div class="sync-stat-icon">📦</div>
          <div class="sync-stat-value"><AnimatedNumber value={others} /></div>
          <div class="sync-stat-label">{t('torrentSyncManager.others')}</div>
        </div>
        <div class="sync-stat-card sync-stat-card--neutral">
          <div class="sync-stat-icon">
            <Database class="w-6 h-6" />
          </div>
          <div class="sync-stat-value"><AnimatedNumber value={total} /></div>
          <div class="sync-stat-label">{t('torrentSyncManager.totalSynced')}</div>
        </div>
      </div>

      {/* ── GRAPHIQUES ─────────────────────────────────────── */}
      {hasTorrents && (
        <div class="sync-charts-row">
          {/* Donut */}
          <div class="sc-frame sync-donut-card">
            <div class="sc-frame-header">
              <div class="sc-frame-title">{t('torrentSyncManager.distributionChart')}</div>
            </div>
            <div class="sc-frame-body sync-charts-content">
              <SyncDonutChart films={films} series={series} others={others} />
              <div class="sync-legend">
                <div class="sync-legend-item">
                  <span class="sync-legend-dot" style="background:rgba(251,191,36,0.9)" />
                  <span class="sync-legend-name">Films</span>
                  <span class="sync-legend-val">{films.toLocaleString()}</span>
                </div>
                <div class="sync-legend-item">
                  <span class="sync-legend-dot" style="background:rgba(139,92,246,0.9)" />
                  <span class="sync-legend-name">Séries</span>
                  <span class="sync-legend-val">{series.toLocaleString()}</span>
                </div>
                <div class="sync-legend-item">
                  <span class="sync-legend-dot" style="background:rgba(34,197,94,0.9)" />
                  <span class="sync-legend-name">Autres</span>
                  <span class="sync-legend-val">{others.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* TMDB */}
          {tmdb && tmdbTotal > 0 && (
            <div class="sc-frame sync-tmdb-card">
              <div class="sc-frame-header">
                <div class="sc-frame-title">TMDB</div>
                <div class="sc-frame-desc">{t('torrentSyncManager.tmdbEnrichmentThisIndexer')}</div>
              </div>
              <div class="sc-frame-body">
                {/* Ring % */}
                <div class="sync-tmdb-pct-ring">
                  <svg viewBox="0 0 44 44" class="sync-tmdb-ring-svg">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5" />
                    <circle
                      cx="22" cy="22" r="18" fill="none"
                      stroke="var(--ds-accent-green)"
                      stroke-width="5"
                      stroke-dasharray={`${(tmdbPercent / 100) * 113} 113`}
                      stroke-linecap="round"
                      transform="rotate(-90 22 22)"
                      style="transition:stroke-dasharray 0.8s ease"
                    />
                  </svg>
                  <div class="sync-tmdb-ring-center">
                    <span class="sync-tmdb-pct">{tmdbPercent}%</span>
                    <span class="sync-tmdb-pct-label">enrichi</span>
                  </div>
                </div>
                <div class="sync-tmdb-stats">
                  <div class="sync-tmdb-row sync-tmdb-row--green">
                    <div class="sync-tmdb-row-label">✓ avec TMDB</div>
                    <div class="sync-tmdb-row-val">{tmdb.with_tmdb.toLocaleString()}</div>
                  </div>
                  <div class="sync-tmdb-row sync-tmdb-row--amber">
                    <div class="sync-tmdb-row-label">⚠ sans TMDB</div>
                    <div class="sync-tmdb-row-val">{tmdb.without_tmdb.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PROGRESSION EN TEMPS RÉEL ────────────────────── */}
      {inProgress && logLines.length > 0 && (
        <div class="sc-frame sync-log-card">
          <div class="sc-frame-header">
            <div class="sc-frame-icon">
              <Activity class="w-5 h-5" aria-hidden />
            </div>
            <div>
              <div class="sc-frame-title">{t('torrentSyncManager.activityLogTitle')}</div>
              <div class="sc-frame-desc">{t('torrentSyncManager.recentActivity')}</div>
            </div>
          </div>
          <div class="sc-frame-body">
            <div class="sync-log-lines">
              {logLines.map((line, i) => (
                <div key={i} class="sync-log-line">
                  <span class="sync-log-dot" />
                  <span class="sync-log-text">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ÉTAT VIDE ────────────────────────────────────── */}
      {!hasTorrents && !inProgress && (
        <div class="sc-frame sync-empty-card">
          <div class="sc-frame-body" style="text-align:center;padding:2rem 1rem">
            <div class="sync-empty-icon">
              <Database class="w-10 h-10" style="opacity:0.3" />
            </div>
            <p class="text-[var(--ds-text-secondary)] font-medium mt-3">
              {t('torrentSyncManager.noTorrentsSynced')}
            </p>
            <p class="text-[var(--ds-text-tertiary)] text-sm mt-1">
              {indexers.length === 0
                ? t('torrentSyncManager.mustConfigureIndexer')
                : t('torrentSyncManager.noContentInDatabase')}
            </p>
          </div>
        </div>
      )}

      {/* ── INDEXERS ─────────────────────────────────────── */}
      {indexers.length > 0 && (
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-icon">
              <Activity class="w-5 h-5" aria-hidden />
            </div>
            <div>
              <div class="sc-frame-title">{t('torrentSyncManager.activeIndexers')}</div>
              <div class="sc-frame-desc">{indexers.length} indexer{indexers.length > 1 ? 's' : ''} actif{indexers.length > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="sc-frame-body">
            <div class="sync-indexers-grid">
              {indexers.map((idx) => {
                const byCat = status.stats_by_indexer?.[idx.name] ?? status.stats_by_indexer?.[idx.id] ?? {};
                const iFilms = Number(byCat.films ?? 0);
                const iSeries = Number(byCat.series ?? 0);
                const iOthers = Number(byCat.others ?? 0);
                const iTotal = iFilms + iSeries + iOthers;
                const isCurrent = inProgress && (status.progress?.current_indexer === idx.name || status.progress?.current_indexer === idx.id);
                return (
                  <div key={idx.id} class={`sync-indexer-card${isCurrent ? ' sync-indexer-card--active' : ''}`}>
                    <div class="sync-indexer-header">
                      <div class="sync-indexer-icon">
                        <Activity class="w-4 h-4" />
                      </div>
                      <div class="sync-indexer-name">{idx.name}</div>
                      {isCurrent && (
                        <div class="sync-indexer-live">
                          <span class="sync-pulse-dot sync-pulse-dot--sm" />
                          live
                        </div>
                      )}
                    </div>
                    <div class="sync-indexer-stats">
                      <div class="sync-indexer-stat">
                        <span class="sync-indexer-stat-icon">🎬</span>
                        <span><AnimatedNumber value={iFilms} /></span>
                      </div>
                      <div class="sync-indexer-stat">
                        <span class="sync-indexer-stat-icon">📺</span>
                        <span><AnimatedNumber value={iSeries} /></span>
                      </div>
                      <div class="sync-indexer-stat">
                        <span class="sync-indexer-stat-icon">📦</span>
                        <span><AnimatedNumber value={iOthers} /></span>
                      </div>
                    </div>
                    <div class="sync-indexer-total">
                      Total : <strong>{iTotal.toLocaleString()}</strong>
                    </div>
                    {isCurrent && inProgress && (
                      <div class="mt-2">
                        <SyncProgressBar percent={progressPercent} animated />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── PARAMÈTRES (collapsible) ─────────────────────── */}
      <div class="sc-frame sync-settings-panel">
        <button
          type="button"
          class="sync-settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
        >
          <div class="sc-frame-icon">
            <Settings class="w-5 h-5" aria-hidden />
          </div>
          <div style="flex:1">
            <div class="sc-frame-title">{t('torrentSyncManager.settings')}</div>
          </div>
          {showSettings
            ? <ChevronUp class="w-5 h-5 text-[var(--ds-text-tertiary)]" />
            : <ChevronDown class="w-5 h-5 text-[var(--ds-text-tertiary)]" />
          }
        </button>

        {showSettings && syncSettings && (
          <div class="sc-frame-body sync-settings-content">

            {/* Sélection d'indexers pour la sync */}
            {indexers.length > 1 && (
              <div class="sync-setting-group">
                <h4 class="sync-setting-title">{t('torrentSyncManager.syncIndexersTitle')}</h4>
                <label class="sync-setting-check">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    checked={selectedIndexerIds === null}
                    onChange={(e) => {
                      if ((e.target as HTMLInputElement).checked) setSelectedIndexerIds(null);
                      else setSelectedIndexerIds(indexers.map(i => i.id));
                    }}
                  />
                  <span>{t('torrentSyncManager.allIndexers')}</span>
                </label>
                {selectedIndexerIds !== null && (
                  <div class="sync-setting-checkboxes">
                    {indexers.map(idx => (
                      <label key={idx.id} class="sync-setting-check">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          checked={selectedIndexerIds.includes(idx.id)}
                          onChange={(e) => {
                            const checked = (e.target as HTMLInputElement).checked;
                            setSelectedIndexerIds(prev =>
                              prev === null ? [idx.id]
                                : checked ? [...prev, idx.id] : prev.filter(id => id !== idx.id)
                            );
                          }}
                        />
                        <span>{idx.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Paramètres de fréquence et options */}
            <div class="sync-settings-grid">
              <div class="sync-setting-field">
                <label class="sync-setting-label">{t('torrentSyncManager.syncFrequency')}</label>
                <select
                  class="select select-sm bg-black/30 border border-white/10 text-[var(--ds-text-primary)] rounded-lg w-full"
                  value={String(frequencyMin)}
                  onChange={(e) => updateSettings({ sync_frequency_minutes: parseInt((e.target as HTMLSelectElement).value) })}
                >
                  {[15,30,60,120,240,480,1440].map(v => (
                    <option key={v} value={String(v)}>{formatFrequency(v)}</option>
                  ))}
                </select>
              </div>
              <div class="sync-setting-field">
                <label class="sync-setting-label">{t('torrentSyncManager.maxTorrentsPerCategory')}</label>
                <input
                  type="number"
                  class="input input-sm bg-black/30 border border-white/10 text-[var(--ds-text-primary)] rounded-lg w-full"
                  min="0" max="100000"
                  value={Number(syncSettings.max_torrents_per_category ?? 0)}
                  onChange={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!isNaN(v) && v >= 0) updateSettings({ max_torrents_per_category: v });
                  }}
                />
                <p class="sync-setting-hint">{t('torrentSyncManager.maxTorrentsPerCategoryHint')}</p>
              </div>
              <div class="sync-setting-field sync-setting-field--toggle">
                <label class="sync-setting-label">{t('torrentSyncManager.autoSyncEnabled')}</label>
                <input
                  type="checkbox"
                  class="toggle toggle-primary"
                  checked={isEnabled}
                  onChange={(e) => updateSettings({ is_enabled: (e.target as HTMLInputElement).checked ? 1 : 0 })}
                />
              </div>
            </div>

            {/* Mots-clés */}
            <div class="sync-settings-keywords">
              <div class="sync-setting-field">
                <label class="sync-setting-label">{t('torrentSyncManager.filmKeywords')}</label>
                <textarea
                  class="textarea textarea-sm bg-black/30 border border-white/10 text-[var(--ds-text-primary)] rounded-lg w-full h-24 text-xs"
                  value={filmsQueriesText}
                  placeholder="Ex: *&#10;2024&#10;2023"
                  onInput={(e) => setFilmsQueriesText((e.target as HTMLTextAreaElement).value)}
                  onBlur={() => updateSettings({ sync_queries_films: filmsQueriesText.split('\n').map(s => s.trim()).filter(Boolean) })}
                />
              </div>
              <div class="sync-setting-field">
                <label class="sync-setting-label">{t('torrentSyncManager.seriesKeywords')}</label>
                <textarea
                  class="textarea textarea-sm bg-black/30 border border-white/10 text-[var(--ds-text-primary)] rounded-lg w-full h-24 text-xs"
                  value={seriesQueriesText}
                  placeholder="Ex: *&#10;2024&#10;2023"
                  onInput={(e) => setSeriesQueriesText((e.target as HTMLTextAreaElement).value)}
                  onBlur={() => updateSettings({ sync_queries_series: seriesQueriesText.split('\n').map(s => s.trim()).filter(Boolean) })}
                />
              </div>
            </div>

            {/* Vider les torrents */}
            {hasTorrents && !inProgress && (
              <div class="sync-danger-zone">
                <button
                  type="button"
                  class="sync-btn-danger"
                  onClick={() => void handleClearTorrents()}
                  disabled={syncing}
                >
                  <Trash2 class="w-4 h-4" />
                  {t('torrentSyncManager.clearTorrents')}
                </button>
                <p class="sync-danger-hint">{t('torrentSyncManager.confirmClearAll')}</p>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
