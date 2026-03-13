/**
 * SyncDashboard — Page complète de synchronisation
 * Design wizard unifié avec Chart.js pour les graphiques animés.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  Chart,
  ArcElement,
  DoughnutController,
  BarController,
  LineController,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Play, Square, Settings, ChevronDown, ChevronUp, FileDown, Trash2, RefreshCw, AlertTriangle, Check, Activity, Database } from 'lucide-preact';
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
import type { SyncHistoryEntry } from '../../lib/client/server-api/sync.js';

Chart.register(ArcElement, DoughnutController, BarController, LineController, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers Chart.js communs                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
const TOOLTIP_BASE = {
  backgroundColor: 'rgba(8,8,18,0.95)',
  padding: 10,
  cornerRadius: 10,
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  titleColor: 'rgba(255,255,255,0.5)',
  bodyColor: 'rgba(255,255,255,0.85)',
};

function reAnimate(chart: Chart) {
  chart.reset();
  chart.update();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Graphique historique des syncs (line + bar mixte)                          */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncHistoryChart({ history, animKey }: { history: SyncHistoryEntry[]; animKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const buildData = (h: SyncHistoryEntry[]) => ({
    labels: h.map(e => {
      const d = new Date(e.synced_at);
      return [
        d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      ];
    }),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Torrents',
        data: h.map(e => e.total_count),
        backgroundColor: h.map(e => e.success ? 'rgba(139,92,246,0.65)' : 'rgba(239,68,68,0.55)'),
        borderColor: h.map(e => e.success ? 'rgba(167,139,250,0.9)' : 'rgba(239,68,68,0.9)'),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Tendance',
        data: h.map(e => e.total_count),
        borderColor: 'rgba(251,191,36,0.7)',
        backgroundColor: 'rgba(251,191,36,0.05)',
        borderWidth: 1.5,
        pointRadius: h.map(e => e.success ? 3 : 4),
        pointBackgroundColor: h.map(e => e.success ? 'rgba(167,139,250,0.9)' : 'rgba(239,68,68,0.9)'),
        pointBorderWidth: 0,
        tension: 0.35,
        fill: false,
        yAxisID: 'y',
        order: 1,
      },
    ],
  });

  useEffect(() => {
    if (!canvasRef.current || history.length === 0) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: buildData(history),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_BASE,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx === undefined) return '';
                const e = history[idx];
                return new Date(e.synced_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
              },
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const e = history[idx];
                if (ctx.datasetIndex === 1) return '';
                return [
                  `  ${e.total_count.toLocaleString()} torrents`,
                  `  Durée : ${e.duration_secs < 60 ? e.duration_secs + 's' : Math.floor(e.duration_secs / 60) + 'min'}`,
                  `  ${e.success ? '✓ Réussite' : `✗ ${e.error_count} erreur(s)`}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255,255,255,0.35)',
              font: { size: 9.5 },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: true,
              autoSkipPadding: 6,
            },
            border: { display: false },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: 'rgba(255,255,255,0.28)', font: { size: 10 }, callback: (v) => Number(v).toLocaleString() },
            border: { color: 'rgba(255,255,255,0.05)' },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [history.length]);

  useEffect(() => {
    if (!chartRef.current || history.length === 0) return;
    const d = buildData(history);
    chartRef.current.data = d;
    chartRef.current.update('active');
  }, [JSON.stringify(history.map(e => e.total_count + e.synced_at))]);

  useEffect(() => {
    if (!chartRef.current || animKey === 0) return;
    reAnimate(chartRef.current);
  }, [animKey]);

  return <div class="sync-chart-wrap" style="height:140px"><canvas ref={canvasRef} /></div>;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Mini donut — tuile individuelle                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncMiniDonut({ value, total, color, label, animKey }: {
  value: number; total: number; color: string; label: string; animKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const rest = Math.max(total - value, 0);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [value || 0.001, rest || 0.001],
          backgroundColor: [color, 'rgba(255,255,255,0.06)'],
          borderWidth: 0,
          hoverOffset: 0,
        }],
      },
      options: {
        cutout: '76%',
        animation: { duration: 700, easing: 'easeInOutQuart' },
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.datasets[0].data = [value || 0.001, Math.max(total - value, 0.001)];
    chartRef.current.update('active');
  }, [value, total]);

  useEffect(() => {
    if (!chartRef.current || animKey === 0) return;
    reAnimate(chartRef.current);
  }, [animKey]);

  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div class="sync-mini-donut-wrap">
      <canvas ref={canvasRef} style="width:64px;height:64px" />
      <div class="sync-mini-donut-center">
        <span class="sync-mini-pct">{pct}%</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Donut de répartition (grand)                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncDonutChart({ films, series, others, animKey }: {
  films: number; series: number; others: number; animKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Films', 'Séries', 'Autres'],
        datasets: [{
          data: [films || 0.001, series || 0.001, others || 0.001],
          backgroundColor: ['rgba(251,191,36,0.88)', 'rgba(139,92,246,0.88)', 'rgba(34,197,94,0.88)'],
          borderColor: 'rgba(255,255,255,0.03)',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        cutout: '72%',
        animation: { duration: 900, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { ...TOOLTIP_BASE, callbacks: { label: (ctx) => `  ${ctx.label}: ${ctx.parsed.toLocaleString()}` } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.datasets[0].data = [films || 0.001, series || 0.001, others || 0.001];
    chartRef.current.update('active');
  }, [films, series, others]);

  useEffect(() => {
    if (!chartRef.current || animKey === 0) return;
    reAnimate(chartRef.current);
  }, [animKey]);

  const total = films + series + others;
  return (
    <div class="sync-donut-wrap">
      <canvas ref={canvasRef} />
      <div class="sync-donut-center">
        {total > 0 ? (
          <>
            <span class="sync-donut-total">{total.toLocaleString()}</span>
            <span class="sync-donut-label">total</span>
          </>
        ) : (
          <Database class="w-6 h-6" style="opacity:0.2" />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Bar chart horizontal                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
interface BarChartItem { label: string; value: number; color: string; }

function SyncBarChart({ items, animKey }: { items: BarChartItem[]; animKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const max = Math.max(...items.map(i => i.value), 1);
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: items.map(i => i.label),
        datasets: [{
          data: items.map(i => i.value),
          backgroundColor: items.map(i => i.color),
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        animation: { duration: 900, easing: 'easeInOutQuart' },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...TOOLTIP_BASE, callbacks: { label: (ctx) => `  ${ctx.parsed.x.toLocaleString()}` } },
        },
        scales: {
          x: {
            max,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: 'rgba(255,255,255,0.28)', font: { size: 10 }, callback: (v) => Number(v).toLocaleString() },
            border: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 11 } },
            border: { display: false },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const max = Math.max(...items.map(i => i.value), 1);
    chartRef.current.data.datasets[0].data = items.map(i => i.value);
    (chartRef.current.options.scales!.x as Record<string, unknown>).max = max;
    chartRef.current.update('active');
  }, [items.map(i => i.value).join(',')]);

  useEffect(() => {
    if (!chartRef.current || animKey === 0) return;
    reAnimate(chartRef.current);
  }, [animKey]);

  return (
    <div class="sync-chart-wrap" style="height:88px">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Bar chart groupé par indexer                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function SyncIndexerBarChart({ indexers, statsByIndexer, animKey }: {
  indexers: Indexer[];
  statsByIndexer?: Record<string, Record<string, number>>;
  animKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const getStats = (idx: Indexer) => {
    const s = statsByIndexer?.[idx.name] ?? statsByIndexer?.[idx.id] ?? {};
    return { films: Number(s.films ?? 0), series: Number(s.series ?? 0), others: Number(s.others ?? 0) };
  };

  const buildData = () => ({
    labels: indexers.map(i => i.name),
    datasets: [
      { label: '🎬 Films',  data: indexers.map(i => getStats(i).films),  backgroundColor: 'rgba(251,191,36,0.8)',  borderRadius: 5, borderSkipped: false },
      { label: '📺 Séries', data: indexers.map(i => getStats(i).series), backgroundColor: 'rgba(139,92,246,0.8)',  borderRadius: 5, borderSkipped: false },
      { label: '📦 Autres', data: indexers.map(i => getStats(i).others), backgroundColor: 'rgba(34,197,94,0.75)',  borderRadius: 5, borderSkipped: false },
    ],
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: buildData(),
      options: {
        animation: { duration: 900, easing: 'easeInOutQuart' },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, boxWidth: 8, padding: 10 } },
          tooltip: { ...TOOLTIP_BASE, callbacks: { label: (ctx) => `  ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 } }, border: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: (v) => Number(v).toLocaleString() }, border: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [indexers.map(i => i.id).join(',')]);

  useEffect(() => {
    if (!chartRef.current) return;
    const d = buildData();
    chartRef.current.data.datasets[0].data = d.datasets[0].data;
    chartRef.current.data.datasets[1].data = d.datasets[1].data;
    chartRef.current.data.datasets[2].data = d.datasets[2].data;
    chartRef.current.update('active');
  }, [JSON.stringify(statsByIndexer)]);

  useEffect(() => {
    if (!chartRef.current || animKey === 0) return;
    reAnimate(chartRef.current);
  }, [animKey]);

  const height = Math.max(110, indexers.length * 32 + 55);
  return (
    <div class="sync-chart-wrap" style={`height:${height}px`}>
      <canvas ref={canvasRef} />
    </div>
  );
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

function formatNextSync(lastSync: number | null, frequencyMin: number): string {
  if (!lastSync) return 'bientôt';
  const nextTs = lastSync * 1000 + frequencyMin * 60 * 1000;
  const diff = Math.round((nextTs - Date.now()) / 1000);
  if (diff <= 0) return 'imminent';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
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
  const [animKey, setAnimKey] = useState(0);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const prevSyncRef = useRef(false);
  const syncStartRef = useRef<{ time: number } | null>(null);
  const loadIndexersRef = useRef(false);

  const { notifySyncStart, notifySyncError } = useNativeNotifications();

  /* Charger l'historique depuis l'API backend */
  useEffect(() => {
    serverApi.getSyncHistory(50).then(r => {
      if (r.success && r.data) setSyncHistory(r.data);
    }).catch(() => { /* silencieux */ });
  }, []);

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

  /* Animer les charts + sauvegarder historique quand la sync change d'état */
  useEffect(() => {
    const nowInProgress = Boolean(status?.sync_in_progress);
    if (prevSyncRef.current !== nowInProgress) {
      setAnimKey(k => k + 1);
      if (nowInProgress) {
        // Sync démarre — noter le timestamp de départ
        syncStartRef.current = { time: Date.now() };
      } else if (prevSyncRef.current && !nowInProgress) {
        // Sync vient de se terminer — sauvegarder dans la DB
        const duration = syncStartRef.current
          ? Math.round((Date.now() - syncStartRef.current.time) / 1000)
          : 0;
        syncStartRef.current = null;
        const errorsArr = status?.progress?.errors ?? [];
        const entry = {
          synced_at: Date.now(),
          total_count: Number(status?.stats?.films ?? 0) + Number(status?.stats?.series ?? 0) + Number(status?.stats?.others ?? 0),
          duration_secs: duration,
          success: errorsArr.length === 0,
          error_count: errorsArr.length,
        };
        serverApi.addSyncHistory(entry).then(r => {
          if (r.success && r.data) {
            setSyncHistory(prev => [...prev.slice(-49), r.data!]);
          }
        }).catch(() => { /* silencieux */ });
        setTimeout(() => { refreshSyncStatusStore(); loadIndexers(); }, 1000);
      }
    }
    prevSyncRef.current = nowInProgress;
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

      {/* ── HERO BAR ─────────────────────────────────────── */}
      <div class={`sync-hero sc-frame${inProgress ? ' sync-hero--active' : ''}`}>
        <div class="sync-hero-row">
          <div class="sync-hero-left">
            <div class={`sync-status-badge${inProgress ? ' sync-status-badge--live' : ''}`}>
              {inProgress
                ? <><span class="sync-pulse-dot" />{t('torrentSyncManager.inProgress')}{trigger && <span class="sync-trigger-tag">{trigger}</span>}</>
                : <><span class="sync-idle-dot" />{t('torrentSyncManager.inactive')}</>
              }
            </div>
            <div class="sync-hero-meta">
              {inProgress && elapsedTime > 0 && <span class="sync-meta-item"><Activity class="w-3 h-3" />{formatElapsed(elapsedTime)}</span>}
              <span class="sync-meta-item"><RefreshCw class="w-3 h-3" />{formatLastSync(status.last_sync_date, language)}</span>
              {isEnabled && !inProgress && <span class="sync-meta-item">Auto · {formatFrequency(frequencyMin)}</span>}
            </div>
          </div>
          <div class="sync-hero-actions">
            {error && <span class="sync-inline-error"><AlertTriangle class="w-3.5 h-3.5" /><span>{error}</span><button type="button" onClick={() => setError('')}>✕</button></span>}
            {success && <span class="sync-inline-success"><Check class="w-3.5 h-3.5" /></span>}
            <button type="button" class="sync-btn-icon" onClick={() => serverApi.downloadSyncLog?.()} title={t('torrentSyncManager.downloadLog')}><FileDown class="w-4 h-4" /></button>
            {!inProgress ? (
              <button type="button" class="sync-btn-play" onClick={() => void handleStartSync()} disabled={syncing}>
                {syncing ? <span class="loading loading-spinner loading-xs" /> : <Play class="w-4 h-4" fill="currentColor" />}
                <span>{t('torrentSyncManager.launchSync')}</span>
              </button>
            ) : (
              <button type="button" class="sync-btn-stop" onClick={() => void handleStopSync()} disabled={syncing}>
                {syncing ? <span class="loading loading-spinner loading-xs" /> : <Square class="w-3.5 h-3.5" fill="currentColor" />}
                <span>{t('torrentSyncManager.stopSync')}</span>
              </button>
            )}
          </div>
        </div>

        {inProgress && (
          <div class="sync-hero-progress">
            <div class="sync-progress-header">
              <span class="sync-phase-tag">Phase {phase}/2</span>
              {currentIndexer && (
                <span class="sync-current-info">
                  <span style="color:var(--ds-accent-violet);font-weight:600">{currentIndexer}</span>
                  {currentCategory && <span> · {currentCategory}</span>}
                  {currentQuery && <span class="truncate"> · {currentQuery}</span>}
                </span>
              )}
              <span style="margin-left:auto;font-weight:700;color:var(--ds-accent-violet);font-size:11px">{progressPercent}%</span>
            </div>
            <SyncProgressBar percent={progressPercent} animated={progressPercent < 5} />
            {toProcess > 0 && <p class="sync-progress-count">{processed.toLocaleString()} / {toProcess.toLocaleString()}</p>}
          </div>
        )}
      </div>

      {hasTorrents ? (<>

        {/* ── TUILES — 4 KPIs uniques ─────────────────────── */}
        <div class="sync-tiles-grid">

          {/* KPI 1 : Total synchronisé */}
          <div class="sync-tile sync-tile--violet">
            <span class="sync-tile-label">Total synchronisé</span>
            <span class="sync-tile-value sync-tile-value--xl">{total.toLocaleString()}</span>
            <span class="sync-tile-sub">torrents</span>
          </div>

          {/* KPI 2 : Enrichissement TMDB */}
          {tmdb && tmdbTotal > 0 ? (
            <div class="sync-tile sync-tile--green">
              <span class="sync-tile-label">Enrichissement TMDB</span>
              <SyncMiniDonut value={tmdb.with_tmdb} total={tmdbTotal} color="rgba(34,197,94,0.85)" label="TMDB" animKey={animKey} />
              <span class="sync-tile-value">{tmdbPercent}%</span>
              <span class="sync-tile-sub">{tmdb.with_tmdb.toLocaleString()} / {tmdbTotal.toLocaleString()}</span>
            </div>
          ) : (
            <div class="sync-tile sync-tile--neutral">
              <span class="sync-tile-label">TMDB</span>
              <span class="sync-tile-value" style="opacity:0.3">—</span>
              <span class="sync-tile-sub">non disponible</span>
            </div>
          )}

          {/* KPI 3 : Indexers actifs */}
          <div class="sync-tile sync-tile--yellow">
            <span class="sync-tile-label">Indexers actifs</span>
            <span class="sync-tile-value sync-tile-value--xl">{indexers.length}</span>
            <div class="sync-tile-chips">
              {indexers.slice(0, 3).map(idx => (
                <span key={idx.id} class="sync-tile-chip">{idx.name}</span>
              ))}
              {indexers.length > 3 && <span class="sync-tile-chip">+{indexers.length - 3}</span>}
            </div>
          </div>

          {/* KPI 4 : Prochaine sync auto */}
          <div class="sync-tile sync-tile--neutral">
            <span class="sync-tile-label">Prochaine sync</span>
            {isEnabled && !inProgress ? (
              <>
                <span class="sync-tile-value" style="font-size:1rem">{formatNextSync(status.last_sync_date, frequencyMin)}</span>
                <span class="sync-tile-sub">Auto · {formatFrequency(frequencyMin)}</span>
              </>
            ) : inProgress ? (
              <>
                <span class="sync-tile-value" style="font-size:1rem;color:var(--ds-accent-violet)">En cours</span>
                <span class="sync-tile-sub">{elapsedTime > 0 ? formatElapsed(elapsedTime) : '…'}</span>
              </>
            ) : (
              <>
                <span class="sync-tile-value" style="opacity:0.3">—</span>
                <span class="sync-tile-sub">Auto désactivé</span>
              </>
            )}
          </div>
        </div>

        {/* ── GRAPHIQUES — 3 vues différentes ─────────────── */}
        <div class="sync-charts-grid">

          {/* Chart 1 : Répartition par type (films/séries/autres) */}
          <div class="sync-chart-card">
            <div class="sync-chart-card-title">Répartition par type</div>
            <div class="sync-chart-card-body sync-chart-card-body--donut">
              <SyncDonutChart films={films} series={series} others={others} animKey={animKey} />
              <div class="sync-legend">
                <div class="sync-legend-item"><span class="sync-legend-dot" style="background:rgba(251,191,36,0.9)" /><span class="sync-legend-name">Films</span><span class="sync-legend-val">{films.toLocaleString()}</span></div>
                <div class="sync-legend-item"><span class="sync-legend-dot" style="background:rgba(139,92,246,0.9)" /><span class="sync-legend-name">Séries</span><span class="sync-legend-val">{series.toLocaleString()}</span></div>
                <div class="sync-legend-item"><span class="sync-legend-dot" style="background:rgba(34,197,94,0.9)" /><span class="sync-legend-name">Autres</span><span class="sync-legend-val">{others.toLocaleString()}</span></div>
              </div>
            </div>
          </div>

          {/* Chart 2 : Par indexer — vrai breakdown par source */}
          <div class="sync-chart-card">
            <div class="sync-chart-card-title">{t('torrentSyncManager.statsByIndexer')}</div>
            <div class="sync-chart-card-body">
              <SyncIndexerBarChart indexers={indexers} statsByIndexer={status.stats_by_indexer} animKey={animKey} />
            </div>
          </div>

          {/* Chart 3 : Historique des syncs — pleine largeur */}
          <div class="sync-chart-card sync-chart-card--wide">
            <div class="sync-chart-card-title">
              Historique des synchronisations
              {syncHistory.length > 0 && (() => {
                const ok = syncHistory.filter(e => e.success).length;
                const pct = Math.round((ok / syncHistory.length) * 100);
                return (
                  <span class={`sync-history-rate sync-history-rate--${pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad'}`}>
                    {pct}% réussite
                  </span>
                );
              })()}
            </div>
            <div class="sync-chart-card-body">
              {syncHistory.length >= 2 ? (
                <SyncHistoryChart history={syncHistory} animKey={animKey} />
              ) : (
                <div class="sync-history-empty">
                  <span>Aucun historique — les données s'accumulent à chaque sync.</span>
                  <div class="sync-history-legend">
                    <span class="sync-history-dot sync-history-dot--ok" />Réussite
                    <span class="sync-history-dot sync-history-dot--err" style="margin-left:0.75rem" />Erreur
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── LOG + LIVE INFO pendant sync ─────────────────── */}
        {inProgress && (logLines.length > 0 || currentIndexer) && (
          <div class="sc-frame">
            <div class="sync-log-panel">
              {currentIndexer && (
                <div class="sync-indexer-live-row">
                  <span class="sync-pulse-dot" />
                  <span style="color:var(--ds-accent-violet);font-weight:600">{currentIndexer}</span>
                  {currentCategory && <span style="color:rgba(255,255,255,0.35)">· {currentCategory}</span>}
                  {currentQuery && <span style="color:rgba(255,255,255,0.28);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">· {currentQuery}</span>}
                </div>
              )}
              {logLines.length > 0 && (
                <div class="sync-log-lines">
                  {logLines.slice(-5).map((line, i) => (
                    <div key={i} class="sync-log-line">
                      <span class="sync-log-dot" />
                      <span class="sync-log-text">{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </>) : !inProgress && (
        /* ── ÉTAT VIDE ── */
        <div class="sc-frame">
          <div class="sync-empty-body">
            <Database class="w-8 h-8" style="opacity:0.2" />
            <p style="color:rgba(255,255,255,0.45);font-size:13px;font-weight:500">{t('torrentSyncManager.noTorrentsSynced')}</p>
            <p style="color:rgba(255,255,255,0.22);font-size:11px">
              {indexers.length === 0 ? t('torrentSyncManager.mustConfigureIndexer') : t('torrentSyncManager.noContentInDatabase')}
            </p>
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
          <Settings class="w-4 h-4" style="opacity:0.5;flex-shrink:0" aria-hidden />
          <span class="sync-settings-toggle-label">{t('torrentSyncManager.settings')}</span>
          {showSettings
            ? <ChevronUp class="w-4 h-4" style="opacity:0.35;margin-left:auto" />
            : <ChevronDown class="w-4 h-4" style="opacity:0.35;margin-left:auto" />
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
