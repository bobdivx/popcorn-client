import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api.ts';
import { getBackendUrl } from '../../lib/backend-config';
import { getPopcornWebBaseUrl, uploadScreenshotsToCloud } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import type { LibraryMediaEntry } from '../../lib/client/server-api/library';
import type {
  ActiveTorrentCreationEntry,
  MultiTrackerUploadResult,
  PublishedUploadMediaEntry,
  UploaderPreviewResponse,
} from '../../lib/client/server-api/upload-tracker';
import { useI18n } from '../../lib/i18n/useI18n';
import {
  DsBarChart,
  DsMetricCard,
  DsSettingsSectionCard,
  DsCard,
  DsCardSection,
  LoadingIcon,
  FullScreenLoadingOverlay,
} from '../ui/design-system';
import { Modal } from '../ui/Modal';
import { DescriptionPreview } from '../upload/DescriptionPreview';
import { ArrowLeft, ArrowRight, Check, Loader2, Search, Upload, Film, Radar, Images, Activity } from 'lucide-preact';
import { Chart, ArcElement, DoughnutController, Tooltip, Legend } from 'chart.js';

const SAVED_MASK = '********';
const WIZARD_STEPS = 3;
const TRACKERS = ['C411', 'TORR9', 'GF', 'G3MINI', 'PTP', 'BLU'] as const;
const TRACKER_SELECTION_STORAGE_KEY = 'upload.assistant.selectedTrackers.v1';
const TRACKER_REMOVED_STORAGE_KEY = 'upload.assistant.removedTrackers.v1';

function readStoredTrackerList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string => typeof v === 'string' && TRACKERS.includes(v as (typeof TRACKERS)[number])
    );
  } catch {
    return [];
  }
}

function writeStoredTrackerList(key: string, value: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(value))));
  } catch {
    // Ignore localStorage errors (private mode / quota).
  }
}

function mapIndexerNameToTracker(name: string): (typeof TRACKERS)[number] | null {
  const normalized = name.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('C411')) return 'C411';
  if (normalized.includes('TORR9')) return 'TORR9';
  if (normalized.includes('G3MINI')) return 'G3MINI';
  if (normalized.includes('PTP')) return 'PTP';
  if (normalized.includes('BLU')) return 'BLU';
  if (normalized === 'GF' || normalized.includes(' GF')) return 'GF';
  return null;
}

type UploadBatchStats = {
  processed: number;
  total: number;
  success: number;
  duplicate: number;
  error: number;
};

Chart.register(ArcElement, DoughnutController, Tooltip, Legend);

function PipelineDonutChart({
  steps,
}: {
  steps: Array<{ key: string; title: string; current: number; target: number; color: string }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const values = steps.map((s) => (s.target > 0 ? Math.min(s.current / s.target, 1) : 0));
  const totalProgress = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const totalPct = Math.round(totalProgress * 100);
  const activeStep =
    steps.find((s, idx) => values[idx] < 1 && s.target > 0) ?? steps[steps.length - 1] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: steps.map((s) => s.title),
        datasets: [
          {
            data: values.map((v) => (v <= 0 ? 0.001 : v)),
            backgroundColor: steps.map((s) => s.color),
            borderWidth: 0,
          },
        ],
      },
      options: {
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const step = steps[idx];
                const pct = step.target > 0 ? Math.round((step.current / step.target) * 100) : 0;
                return `${step.title}: ${step.current}/${step.target} (${pct}%)`;
              },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.labels = steps.map((s) => s.title);
    chartRef.current.data.datasets[0].data = values.map((v) => (v <= 0 ? 0.001 : v));
    chartRef.current.data.datasets[0].backgroundColor = steps.map((s) => s.color);
    chartRef.current.update('active');
  }, [JSON.stringify(steps.map((s) => `${s.key}:${s.current}/${s.target}`))]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-32 h-32 sm:w-40 sm:h-40 mx-auto">
        <canvas ref={canvasRef} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {activeStep && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--ds-text-tertiary)] text-center px-3">
              {activeStep.title}
            </span>
          )}
          <span className="text-xl sm:text-2xl font-semibold tabular-nums text-[var(--ds-text-primary)]">
            {totalPct}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {steps.map((step) => {
          return (
            <div key={step.key} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1 truncate text-[var(--ds-text-secondary)]">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: step.color }}
                />
                <span className="truncate">{step.title}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExecutionChart({ stats }: { stats: UploadBatchStats }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasData = stats.total > 0 && (stats.success > 0 || stats.duplicate > 0 || stats.error > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Succès', 'Doublons', 'Erreurs'],
        datasets: [
          {
            data: [stats.success, stats.duplicate, stats.error],
            backgroundColor: [
              'rgba(34, 197, 94, 0.9)',
              'rgba(234, 179, 8, 0.9)',
              'rgba(239, 68, 68, 0.9)',
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.label || '';
                const value = ctx.parsed || 0;
                return `${label}: ${value}`;
              },
            },
          },
        },
        cutout: '70%',
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    return () => {
      chart.destroy();
    };
  }, [stats.success, stats.duplicate, stats.error, hasData]);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-[var(--ds-text-tertiary)]">
        Aucun envoi traité pour le moment
      </div>
    );
  }

  const percent =
    stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <canvas ref={canvasRef} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-[var(--ds-text-primary)] tabular-nums">
            {percent}%
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-[var(--ds-text-secondary)]">
        <span>Succès : {stats.success}</span>
        <span>Doublons : {stats.duplicate}</span>
        <span>Erreurs : {stats.error}</span>
      </div>
    </div>
  );
}

/** Écran de chargement initial avec animation des étapes (carte C411) */
function LoadingAssistantView({
  loadingLibrary,
  loadingConfig,
  t,
}: {
  loadingLibrary: boolean;
  loadingConfig: boolean;
  t: (key: string) => string;
}) {
  const libraryDone = !loadingLibrary;

  return (
    <FullScreenLoadingOverlay
      title={t('settings.uploadTrackerPanel.uploadAssistantTitle')}
      description={t('settings.uploadTrackerPanel.uploadAssistantDescription')}
      iconContent={
        <LoadingIcon>
          <Upload className="w-8 h-8 text-[var(--ds-accent-violet)]" strokeWidth={1.8} aria-hidden />
        </LoadingIcon>
      }
    >
          <div className="w-full space-y-3 max-w-lg mx-auto mt-6">
            <div
              className={`flex items-center justify-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                loadingLibrary ? 'bg-primary/10' : 'bg-success/10'
              }`}
            >
              {loadingLibrary ? (
                <Loader2 className="w-5 h-5 shrink-0 text-primary animate-spin" aria-hidden />
              ) : (
                <Check className="w-5 h-5 shrink-0 text-success" aria-hidden />
              )}
              <span className="text-sm sm:text-base text-base-content/90 break-words">
                {t('settings.uploadTrackerPanel.loadingStepLibrary')}
              </span>
            </div>
            {loadingConfig && (
              <div className="flex items-center justify-center gap-3 rounded-lg px-4 py-3 bg-primary/10">
                <Loader2 className="w-5 h-5 shrink-0 text-primary animate-spin" aria-hidden />
                <span className="text-sm sm:text-base text-base-content/90 break-words">
                  {t('settings.uploadTrackerPanel.loadingStepConfig')}
                </span>
              </div>
            )}
            {libraryDone && !loadingConfig && (
              <div className="flex items-center justify-center gap-3 rounded-lg px-4 py-3 bg-success/10 animate-fade-in">
                <Check className="w-5 h-5 shrink-0 text-success" aria-hidden />
                <span className="text-sm sm:text-base text-base-content/90 break-words">
                  {t('settings.uploadTrackerPanel.loadingStepReady')}
                </span>
              </div>
            )}
          </div>
    </FullScreenLoadingOverlay>
  );
}

/** Assistant d'upload type wizard : 1) trackers → 2) médias → 3) Torrent factory (préparation + review + envoi). */
export default function UploadAssistantPanel() {
  const { t } = useI18n();
  const [step, setStep] = useState(1);

  const [mediaList, setMediaList] = useState<LibraryMediaEntry[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [excludedMediaIds, setExcludedMediaIds] = useState<string[]>([]);
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [showExcludedMedia, setShowExcludedMedia] = useState(false);
  const [filterTorrentCreated, setFilterTorrentCreated] = useState<'all' | 'with_torrent' | 'without_torrent'>('all');
  const [publishedMediaIdsWithTorrent, setPublishedMediaIdsWithTorrent] = useState<Set<string>>(new Set());
  const [publishedUploadsByMediaId, setPublishedUploadsByMediaId] = useState<Record<string, PublishedUploadMediaEntry>>({});
  const [dupeOnTrackerByMediaId, setDupeOnTrackerByMediaId] = useState<Record<string, { exists: boolean; matchedName?: string }>>({});
  const dupeCheckTimerRef = useRef<number | null>(null);
  const [trackerToIndexerId, setTrackerToIndexerId] = useState<Record<string, string>>({});

  const [selectedTrackers, setSelectedTrackers] = useState<string[]>([]);
  const [configuredTrackers, setConfiguredTrackers] = useState<string[]>([]);
  const [loadingTrackersSetup, setLoadingTrackersSetup] = useState(true);
  const [passkey, setPasskey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [announceUrl, setAnnounceUrl] = useState('');
  const [hasPasskeySaved, setHasPasskeySaved] = useState(false);
  const [hasApiKeySaved, setHasApiKeySaved] = useState(false);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [externalCreationInProgress, setExternalCreationInProgress] = useState(false);
  const [activeExternalCreation, setActiveExternalCreation] = useState<ActiveTorrentCreationEntry | null>(null);
  const [cancelingExternalCreation, setCancelingExternalCreation] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [torrentProgress, setTorrentProgress] = useState<number | null>(null);
  const torrentProgressIntervalRef = useRef<number | null>(null);
  const externalProgressIntervalRef = useRef<number | null>(null);
  const activeCreationIntervalRef = useRef<number | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadWasCancelledRef = useRef(false);
  /** Media id pour lequel une création externe est en cours (pour le bouton Annuler). */
  const runningCreationMediaIdRef = useRef<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<UploaderPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [nfoModalOpen, setNfoModalOpen] = useState(false);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);

  const [screenshotsCount, setScreenshotsCount] = useState<number | null>(null);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [screenshotsBaseUrl, setScreenshotsBaseUrl] = useState<string | null>(null);
  const [screenshotsSource, setScreenshotsSource] = useState<'backend' | 'cloud' | null>(null);
  const [screenshotsReady, setScreenshotsReady] = useState(false);
  const screenshotsInFlightRef = useRef<string>('');
  const [validationLoading, setValidationLoading] = useState(false);
  const [validatedMediaIds, setValidatedMediaIds] = useState<string[]>([]);
  const [excludedMediaReasons, setExcludedMediaReasons] = useState<Record<string, string>>({});
  const [batchStats, setBatchStats] = useState<UploadBatchStats>({
    processed: 0,
    total: 0,
    success: 0,
    duplicate: 0,
    error: 0,
  });
  const [publishCountdown, setPublishCountdown] = useState<number | null>(null);
  const publishCountdownCanceledRef = useRef(false);
  // Empêche le relancement automatique en boucle (ex. si l'upload échoue ou timeout) tant que l'utilisateur ne change pas d'étape.
  const autoLaunchConsumedRef = useRef(false);
  const publishCountdownIntervalRef = useRef<number | null>(null);
  const handleLaunchUploadRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const autoSkipStep1Ref = useRef(false);
  const [screenshotCarouselIndex, setScreenshotCarouselIndex] = useState(0);
  const availableMediaList = mediaList.filter((m) => !excludedMediaIds.includes(m.id));
  const searchLower = mediaSearchQuery.trim().toLowerCase();
  const baseListForDisplay =
    showExcludedMedia ? mediaList : mediaList.filter((m) => !excludedMediaIds.includes(m.id));
  const displayedMediaList = baseListForDisplay.filter((m) => {
    if (searchLower) {
      const title = (m.tmdb_title || m.file_name || '').toLowerCase();
      const fileName = (m.file_name || '').toLowerCase();
      if (!title.includes(searchLower) && !fileName.includes(searchLower)) return false;
    }
    const hasTorrent = publishedMediaIdsWithTorrent.has(m.id);
    if (filterTorrentCreated === 'with_torrent' && !hasTorrent) return false;
    if (filterTorrentCreated === 'without_torrent' && hasTorrent) return false;
    return true;
  });
  const selectableInDisplayed = displayedMediaList.filter((m) => !excludedMediaIds.includes(m.id));

  // Carrousel simple pour les captures d'écran dans le résumé (étape 3).
  useEffect(() => {
    if (step !== 3 || !screenshotsBaseUrl || !screenshotsCount || screenshotsCount <= 1) {
      return;
    }
    setScreenshotCarouselIndex(0);
    const id = window.setInterval(() => {
      setScreenshotCarouselIndex((prev) => {
        const next = prev + 1;
        if (!screenshotsCount || screenshotsCount <= 0) return 0;
        return next % screenshotsCount;
      });
    }, 3000);
    return () => {
      window.clearInterval(id);
    };
  }, [step, screenshotsBaseUrl, screenshotsCount]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    const res = await serverApi.getC411UploadCookies();
    if (res.success && res.data) {
      setHasPasskeySaved(Boolean(res.data.has_passkey));
      setHasApiKeySaved(Boolean(res.data.has_api_key));
      if (res.data.announce_url) setAnnounceUrl(res.data.announce_url);
      if (res.data.has_passkey) setPasskey(SAVED_MASK);
      if (res.data.has_api_key) setApiKey(SAVED_MASK);
    }
    setLoadingConfig(false);
  }, []);

  const loadConfiguredTrackers = useCallback(async () => {
    setLoadingTrackersSetup(true);
    const [indexersRes, c411Res] = await Promise.all([
      serverApi.getIndexers(),
      serverApi.getC411UploadCookies(),
    ]);

    const configured = new Set<string>();
    const trackerToIndexer: Record<string, string> = {};
    if (indexersRes.success && Array.isArray(indexersRes.data)) {
      for (const idx of indexersRes.data) {
        if (!idx?.isEnabled || !idx.name) continue;
        const mapped = mapIndexerNameToTracker(idx.name);
        if (mapped) {
          configured.add(mapped);
          trackerToIndexer[mapped] = idx.id;
        }
      }
    }

    if (c411Res.success && c411Res.data) {
      const hasAnyC411Config =
        Boolean(c411Res.data.has_api_key) ||
        Boolean(c411Res.data.has_passkey) ||
        Boolean((c411Res.data.announce_url || '').trim());
      if (hasAnyC411Config) configured.add('C411');
    }

    const removedTrackers = new Set(readStoredTrackerList(TRACKER_REMOVED_STORAGE_KEY));
    const visibleConfigured = Array.from(configured).filter((tracker) => !removedTrackers.has(tracker));
    setConfiguredTrackers(visibleConfigured);
    setTrackerToIndexerId(trackerToIndexer);

    setSelectedTrackers((prev) => {
      const current = prev.filter((tracker) => visibleConfigured.includes(tracker));
      if (current.length > 0) return current;
      const persisted = readStoredTrackerList(TRACKER_SELECTION_STORAGE_KEY).filter((tracker) =>
        visibleConfigured.includes(tracker)
      );
      if (persisted.length > 0) return persisted;
      return visibleConfigured.length > 0 ? [visibleConfigured[0]] : [];
    });
    setLoadingTrackersSetup(false);
  }, []);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    setMessage(null);
    const res = await serverApi.getLibraryMedia();
    if (res.success && res.data) {
      setMediaList(res.data);
      setSelectedMediaId((prev) => (prev && res.data!.some((m) => m.id === prev) ? prev : ''));
      setSelectedMediaIds((prev) => {
        if (prev.length > 0) return prev.filter((id) => res.data!.some((m) => m.id === id));
        return [];
      });
    } else {
      setMediaList([]);
      setSelectedMediaIds([]);
    }
    setLoadingMedia(false);
  }, []);

  const stopTorrentProgressPolling = useCallback(() => {
    if (torrentProgressIntervalRef.current !== null) {
      window.clearInterval(torrentProgressIntervalRef.current);
      torrentProgressIntervalRef.current = null;
    }
    setTorrentProgress(null);
  }, []);

  const stopExternalProgressPolling = useCallback(() => {
    if (externalProgressIntervalRef.current !== null) {
      window.clearInterval(externalProgressIntervalRef.current);
      externalProgressIntervalRef.current = null;
    }
  }, []);

  const stopActiveCreationPolling = useCallback(() => {
    if (activeCreationIntervalRef.current !== null) {
      window.clearInterval(activeCreationIntervalRef.current);
      activeCreationIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      stopTorrentProgressPolling();
      stopExternalProgressPolling();
      stopActiveCreationPolling();
    };
  }, [stopActiveCreationPolling, stopExternalProgressPolling, stopTorrentProgressPolling]);

  const startTorrentProgressPolling = useCallback(
    (localMediaId: string) => {
      stopTorrentProgressPolling();
      if (!localMediaId.trim()) return;
      torrentProgressIntervalRef.current = window.setInterval(async () => {
        const res = await (serverApi as any).getTorrentProgress(localMediaId);
        if (res.success && res.data) {
          const pct = res.data.progress;
          if (typeof pct === 'number') {
            setTorrentProgress(pct);
            if (pct >= 100) {
              stopTorrentProgressPolling();
            }
          }
        }
      }, 2000);
    },
    [stopTorrentProgressPolling]
  );

  // Charger la bibliothèque au montage (priorité pour afficher l’étape 1 vite)
  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  // Charger la config C411 à l'étape trackers (maintenant étape 1)
  useEffect(() => {
    if (step === 1) void loadConfig();
  }, [step, loadConfig]);

  useEffect(() => {
    void loadConfiguredTrackers();
  }, [loadConfiguredTrackers]);

  useEffect(() => {
    setSelectedMediaIds((prev) => prev.filter((id) => !excludedMediaIds.includes(id)));
  }, [excludedMediaIds]);

  useEffect(() => {
    setValidatedMediaIds((prev) => prev.filter((id) => selectedMediaIds.includes(id)));
  }, [selectedMediaIds]);

  useEffect(() => {
    if (step !== 2 || mediaList.length === 0) return;
    let cancelled = false;
    serverApi.getPublishedUploads().then((res) => {
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        const byId: Record<string, PublishedUploadMediaEntry> = {};
        const ids = new Set<string>();
        for (const entry of res.data) {
          if (entry?.local_media_id) byId[entry.local_media_id] = entry;
          if (entry.has_torrent_file && entry.local_media_id) ids.add(entry.local_media_id);
        }
        setPublishedUploadsByMediaId(byId);
        setPublishedMediaIdsWithTorrent(ids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, mediaList.length]);

  const excludeMediaWithReason = useCallback((mediaId: string, reason: string) => {
    setExcludedMediaIds((prev) => (prev.includes(mediaId) ? prev : [...prev, mediaId]));
    setExcludedMediaReasons((prev) => ({ ...prev, [mediaId]: reason }));
  }, []);

  // Vérifier la présence sur le tracker (via indexer) avant de hasher.
  // Heuristique: on check le premier tracker sélectionné (template/preview idem),
  // uniquement sur l'étape médias, et limité aux médias affichés (max 40) pour éviter le spam.
  useEffect(() => {
    if (step !== 2) return;
    const primaryTracker = selectedTrackers[0];
    if (!primaryTracker) return;
    if (loadingMedia) return;
    if (displayedMediaList.length === 0) return;
    const indexerId = trackerToIndexerId[primaryTracker];
    if (!indexerId) return;

    if (dupeCheckTimerRef.current != null) {
      window.clearTimeout(dupeCheckTimerRef.current);
      dupeCheckTimerRef.current = null;
    }
    const id = window.setTimeout(async () => {
      const ids = displayedMediaList
        .slice(0, 40)
        .map((m) => m.id)
        .filter(Boolean);
      const res = await serverApi.checkDuplicateOnIndexer({ indexer_id: indexerId, local_media_ids: ids });
      if (!res.success || !res.data?.results) return;
      const map: Record<string, { exists: boolean; matchedName?: string }> = {};
      for (const r of res.data.results) {
        if (!r?.local_media_id) continue;
        if (r.exists_on_tracker) {
          map[r.local_media_id] = { exists: true, matchedName: r.matched_name || undefined };
        } else {
          map[r.local_media_id] = { exists: false };
        }
      }
      setDupeOnTrackerByMediaId((prev) => ({ ...prev, ...map }));
    }, 600);
    dupeCheckTimerRef.current = id;
    return () => {
      if (dupeCheckTimerRef.current != null) {
        window.clearTimeout(dupeCheckTimerRef.current);
        dupeCheckTimerRef.current = null;
      }
    };
  }, [displayedMediaList, loadingMedia, selectedTrackers, step, trackerToIndexerId]);

  const isAlreadyPublishedOnAllSelectedTrackers = useCallback(
    (mediaId: string): boolean => {
      if (!mediaId.trim()) return false;
      if (selectedTrackers.length === 0) return false;
      const entry = publishedUploadsByMediaId[mediaId];
      if (!entry || !Array.isArray(entry.trackers)) return false;
      const successTrackers = new Set(entry.trackers.filter((t) => t?.success).map((t) => t.tracker));
      return selectedTrackers.every((t) => successTrackers.has(t));
    },
    [publishedUploadsByMediaId, selectedTrackers]
  );

  // Éviter de sélectionner des médias déjà publiés sur tous les trackers choisis :
  // sinon on lance un hash + upload pour rien.
  useEffect(() => {
    if (selectedTrackers.length === 0) return;
    const toExclude = selectedMediaIds.filter((id) => isAlreadyPublishedOnAllSelectedTrackers(id));
    if (toExclude.length === 0) return;
    for (const mediaId of toExclude) {
      excludeMediaWithReason(mediaId, t('settings.uploadTrackerPanel.mediaAlreadyPublished'));
    }
    setSelectedMediaIds((prev) => prev.filter((id) => !toExclude.includes(id)));
  }, [excludeMediaWithReason, isAlreadyPublishedOnAllSelectedTrackers, selectedMediaIds, selectedTrackers.length, t]);

  useEffect(() => {
    if (selectedMediaIds.length === 0) {
      setSelectedMediaId('');
      return;
    }
    if (!selectedMediaIds.includes(selectedMediaId)) {
      setSelectedMediaId(selectedMediaIds[0]);
    }
  }, [selectedMediaIds, selectedMediaId]);

  useEffect(() => {
    if (loadingMedia) return;
    let cancelled = false;
    const checkActiveCreations = async () => {
      const res = await serverApi.getActiveTorrentCreations();
      if (cancelled) return;
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const now = Date.now();
        const ACTIVE_WINDOW_MS = 15_000;
        const filtered = res.data.filter((e) => {
          const updated = typeof e.updated_at_ms === 'number' ? e.updated_at_ms : null;
          if (updated == null) return true; // rétrocompat: pas de timestamp → on garde
          return now - updated <= ACTIVE_WINDOW_MS;
        });
        const sorted = [...(filtered.length > 0 ? filtered : res.data)].sort(
          (a, b) => b.progress - a.progress
        );
        const first = sorted[0];
        setActiveExternalCreation({
          ...first,
          progress: Math.max(0, Math.min(100, Math.round(first.progress))),
        });
      } else {
        setActiveExternalCreation(null);
      }
    };

    void checkActiveCreations();
    stopActiveCreationPolling();
    activeCreationIntervalRef.current = window.setInterval(() => {
      void checkActiveCreations();
    }, 3000);

    return () => {
      cancelled = true;
      stopActiveCreationPolling();
    };
  }, [loadingMedia, stopActiveCreationPolling]);

  useEffect(() => {
    if (message?.type === 'error' && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [message]);

  // Au chargement initial de l'assistant, si une création .torrent est déjà en cours côté backend,
  // on "reprend" dessus : step 3, média sélectionné et polling de progression.
  useEffect(() => {
    if (loadingMedia) return;
    // Ne pas écraser un upload déjà lancé depuis cette session.
    if (uploading || externalCreationInProgress || runningCreationMediaIdRef.current) return;

    const resumeIfNeeded = async () => {
      const res = await serverApi.getActiveTorrentCreations();
      if (!res.success || !Array.isArray(res.data) || res.data.length === 0) return;
      const now = Date.now();
      const ACTIVE_WINDOW_MS = 15_000;
      const filtered = res.data.filter((e) => {
        const updated = typeof e.updated_at_ms === 'number' ? e.updated_at_ms : null;
        if (updated == null) return true; // rétrocompat: pas de timestamp → on garde
        return now - updated <= ACTIVE_WINDOW_MS;
      });
      if (filtered.length === 0) return;
      const sorted = [...filtered].sort((a, b) => b.progress - a.progress);
      const first = sorted[0];
      const mediaId = first.local_media_id;
      if (!mediaId) return;

      setActiveExternalCreation({
        ...first,
        progress: Math.max(0, Math.min(100, Math.round(first.progress))),
      });
      runningCreationMediaIdRef.current = mediaId;
      setExternalCreationInProgress(true);
      setTorrentProgress(Math.max(0, Math.min(100, Math.round(first.progress))));

      // S'assurer que le média est sélectionné pour que l'UI de l'étape 3 ait du contexte.
      setSelectedMediaIds((prev) => (prev.includes(mediaId) ? prev : [mediaId, ...prev]));
      setSelectedMediaId(mediaId);
      // Aller directement à l'étape récap / torrent factory.
      setStep(3);
      // Lancer le polling de progression pour refléter l'état actuel du hash.
      startTorrentProgressPolling(mediaId);
    };

    void resumeIfNeeded();
  }, [
    loadingMedia,
    uploading,
    externalCreationInProgress,
    setSelectedMediaIds,
    setSelectedMediaId,
    setStep,
    startTorrentProgressPolling,
  ]);

  const toggleTracker = (id: string) => {
    if (!configuredTrackers.includes(id)) return;
    setSelectedTrackers((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const isC411Selected = selectedTrackers.includes('C411');
  const c411ConfigOk =
    !isC411Selected ||
    (Boolean(announceUrl.trim()) || hasPasskeySaved) ||
    (Boolean(apiKey.trim()) && apiKey !== SAVED_MASK) ||
    hasApiKeySaved;
  const canGoStep2 = selectedTrackers.length > 0 && c411ConfigOk;
  const canGoStep3 = selectedMediaIds.length > 0;
  const allVisibleMediaSelected =
    selectableInDisplayed.length > 0 &&
    selectableInDisplayed.every((m) => selectedMediaIds.includes(m.id));
  const validationCompleted =
    selectedMediaIds.length > 0 &&
    selectedMediaIds.every((id) => validatedMediaIds.includes(id));
  const canLaunchUpload = validationCompleted && screenshotsCount !== null;
  const c411FullyConfigured =
    hasApiKeySaved && hasPasskeySaved && Boolean(announceUrl.trim());
  const shouldSkipTrackersStep =
    c411FullyConfigured && configuredTrackers.length > 0 && !loadingTrackersSetup;
  const validationProgress = validationCompleted ? 100 : 0;
  const screenshotsProgress = screenshotsCount !== null ? 100 : 0;
  const preparationProgress = Math.round((validationProgress + screenshotsProgress) / 2);
  const nfoProgress = previewData ? 100 : 0;
  const torrentStepProgress = typeof torrentProgress === 'number' ? torrentProgress : 0;
  const globalProgress = Math.round((preparationProgress + nfoProgress + torrentStepProgress) / 3);
  const uploadExecutionProgress =
    batchStats.total > 0 ? Math.round((batchStats.processed / batchStats.total) * 100) : 0;

  const validationCount = validatedMediaIds.length;
  const screenshotsGeneratedCount = screenshotsCount ?? 0;
  const previewCount = previewData ? 1 : 0;
  const uploadProcessedCount = batchStats.processed;

  const trackersTarget = selectedTrackers.length > 0 ? selectedTrackers.length : 1;
  const mediaTarget = selectedMediaIds.length > 0 ? selectedMediaIds.length : 1;
  const validationTarget = selectedMediaIds.length > 0 ? selectedMediaIds.length : 1;
  const screenshotsTarget = 3;
  const previewTarget = 1;
  const uploadTarget = batchStats.total > 0 ? batchStats.total : selectedMediaIds.length > 0 ? selectedMediaIds.length : 1;
  const hashTarget = 100;

  const trackersProgressPct = selectedTrackers.length > 0 ? 100 : 0;
  const mediaProgressPct = selectedMediaIds.length > 0 ? 100 : 0;
  const validationProgressPct = Math.min(100, Math.round((validationCount / validationTarget) * 100));
  const screenshotsProgressPct = Math.min(
    100,
    Math.round((Math.min(screenshotsGeneratedCount, screenshotsTarget) / screenshotsTarget) * 100)
  );
  const previewProgressPct = previewCount > 0 ? 100 : 0;
  const uploadProgressPct = Math.min(100, Math.round((uploadProcessedCount / uploadTarget) * 100));
  const hashProgressPct = Math.min(100, Math.max(0, Math.round(torrentStepProgress)));

  useEffect(() => {
    writeStoredTrackerList(
      TRACKER_SELECTION_STORAGE_KEY,
      selectedTrackers.filter((tracker) => configuredTrackers.includes(tracker))
    );
  }, [selectedTrackers, configuredTrackers]);

  // Auto-lancer la publication après 5 s quand tout est prêt ; l'utilisateur peut annuler avant.
  useEffect(() => {
    if (step !== 3) {
      publishCountdownCanceledRef.current = false;
      autoLaunchConsumedRef.current = false;
    }
    if (
      step !== 3 ||
      !canLaunchUpload ||
      uploading ||
      publishCountdownCanceledRef.current ||
      externalCreationInProgress ||
      autoLaunchConsumedRef.current
    ) {
      if (publishCountdownIntervalRef.current != null) {
        window.clearInterval(publishCountdownIntervalRef.current);
        publishCountdownIntervalRef.current = null;
      }
      if (step !== 3 || !canLaunchUpload) {
        setPublishCountdown(null);
        autoLaunchConsumedRef.current = false;
      }
      return;
    }
    setPublishCountdown(5);
    const id = window.setInterval(() => {
      setPublishCountdown((prev) => {
        if (prev == null || prev <= 1) {
          if (publishCountdownIntervalRef.current != null) {
            window.clearInterval(publishCountdownIntervalRef.current);
            publishCountdownIntervalRef.current = null;
          }
          if (prev === 1 && !publishCountdownCanceledRef.current) {
            autoLaunchConsumedRef.current = true;
            handleLaunchUploadRef.current();
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    publishCountdownIntervalRef.current = id;
    return () => {
      if (publishCountdownIntervalRef.current != null) {
        window.clearInterval(publishCountdownIntervalRef.current);
        publishCountdownIntervalRef.current = null;
      }
    };
  }, [step, canLaunchUpload, uploading, externalCreationInProgress]);

  useEffect(() => {
    if (step !== 1 || !shouldSkipTrackersStep || autoSkipStep1Ref.current) return;
    autoSkipStep1Ref.current = true;
    setStep(2);
  }, [step, shouldSkipTrackersStep]);

  const toggleMediaSelection = (mediaId: string) => {
    if (isAlreadyPublishedOnAllSelectedTrackers(mediaId)) {
      excludeMediaWithReason(mediaId, t('settings.uploadTrackerPanel.mediaAlreadyPublished'));
      return;
    }
    setSelectedMediaIds((prev) => {
      if (prev.includes(mediaId)) return prev.filter((id) => id !== mediaId);
      return [...prev, mediaId];
    });
  };

  const toggleSelectAllMedia = () => {
    if (allVisibleMediaSelected) {
      setSelectedMediaIds([]);
      return;
    }
    setSelectedMediaIds(selectableInDisplayed.map((m) => m.id));
  };

  const validateSelectedMedia = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    setValidationLoading(true);
    setMessage(null);
    const validated: string[] = [];
    let invalidCount = 0;
    for (let i = 0; i < selectedMediaIds.length; i += 1) {
      const mediaId = selectedMediaIds[i];
      const media = mediaList.find((m) => m.id === mediaId);
      const mediaName = media?.tmdb_title || media?.file_name || mediaId;
      setProgressMessage(
        t('settings.uploadTrackerPanel.validatingMediaProgress', {
          index: i + 1,
          total: selectedMediaIds.length,
          media: mediaName,
        })
      );
      const res = await serverApi.validateUploadMedia(mediaId);
      if (res.success && res.data) {
        if (res.data.valid) {
          validated.push(mediaId);
        } else {
          invalidCount += 1;
          excludeMediaWithReason(mediaId, res.data.message);
        }
      } else {
        invalidCount += 1;
        const msg = res.message || t('settings.uploadTrackerPanel.mediaValidationFailed');
        excludeMediaWithReason(mediaId, msg);
      }
    }
    setValidatedMediaIds(validated);
    setValidationLoading(false);
    setProgressMessage(null);
    if (invalidCount > 0) {
      setMessage({
        type: 'error',
        text: t('settings.uploadTrackerPanel.mediaValidationGlobalError'),
      });
    } else {
      setMessage({
        type: 'success',
        text: t('settings.uploadTrackerPanel.mediaValidationSuccess'),
      });
    }
  }, [excludeMediaWithReason, mediaList, selectedMediaIds, t]);

  const removeMediaFromLibraryOnly = async (mediaId: string) => {
    const res = await serverApi.deleteLibraryMedia(mediaId);
    if (res.success) {
      setExcludedMediaIds((prev) => prev.filter((id) => id !== mediaId));
      setExcludedMediaReasons((prev) => {
        const { [mediaId]: _, ...rest } = prev;
        return rest;
      });
      await loadMedia();
      setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.mediaRemovedFromLibrary') });
      return;
    }
    setMessage({ type: 'error', text: res.message ?? t('common.error') });
  };

  const removeMediaFileAndLibrary = async (mediaId: string) => {
    const confirmed = window.confirm(t('settings.uploadTrackerPanel.confirmDeleteMediaFile'));
    if (!confirmed) return;
    const res = await serverApi.deleteLibraryMediaFile(mediaId);
    if (res.success) {
      setExcludedMediaIds((prev) => prev.filter((id) => id !== mediaId));
      setExcludedMediaReasons((prev) => {
        const { [mediaId]: _, ...rest } = prev;
        return rest;
      });
      await loadMedia();
      setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.mediaFileRemoved') });
      return;
    }
    setMessage({ type: 'error', text: res.message ?? t('common.error') });
  };

  const handleGenerateScreenshots = async (): Promise<boolean> => {
    if (!selectedMediaId.trim()) return false;
    // Anti double-call (effets + renders rapides) : un seul call en vol par media_id.
    if (screenshotsInFlightRef.current === selectedMediaId) return false;
    screenshotsInFlightRef.current = selectedMediaId;
    setScreenshotsLoading(true);
    setMessage(null);
    const res = await (serverApi as any).generateScreenshots(selectedMediaId);
    setScreenshotsLoading(false);
    if (res.success && res.data) {
      setScreenshotsCount(res.data.count);
      // Par défaut, utiliser le base URL renvoyé par le backend (chemin local derrière /api/library/uploader/...).
      const backendBase = res.data.screenshot_base_url?.trim() || null;
      setScreenshotsBaseUrl(backendBase);
      setScreenshotsSource(backendBase ? 'backend' : null);
      setScreenshotsReady(false);
      // Héberger les captures sur popcorn-web pour que la description C411 affiche les images (URLs publiques).
      if (res.data.count > 0 && TokenManager.getCloudAccessToken()) {
        const backendUrl = getBackendUrl() || serverApi.getServerUrl() || '';
        if (backendUrl) {
          const cloudRes = await uploadScreenshotsToCloud(selectedMediaId, backendUrl, res.data.count);
          if (cloudRes.success) {
            // Les captures sont maintenant stockées sur popcorn-web.
            // Construire l'URL publique complète vers les captures pour ce média :
            // {base}/api/library/uploader/screenshots/{media_id}/{index}.jpg
            const cloudBase = getPopcornWebBaseUrl().replace(/\/$/, '');
            const publicBase = `${cloudBase}/api/library/uploader/screenshots/${encodeURIComponent(selectedMediaId)}`;
            setScreenshotsBaseUrl(publicBase);
            setScreenshotsSource('cloud');
            setScreenshotsReady(false);
          }
        }
      }
      screenshotsInFlightRef.current = '';
      return true;
    } else {
      setMessage({ type: 'error', text: res.message ?? t('settings.uploadTrackerPanel.screenshotsError') });
      screenshotsInFlightRef.current = '';
      return false;
    }
  };

  // Précharger la première capture pour éviter d'afficher une image cassée le temps que
  // le backend ou le cloud les rende réellement disponibles.
  useEffect(() => {
    if (!screenshotsBaseUrl || !screenshotsCount || screenshotsCount <= 0 || !screenshotsSource) {
      setScreenshotsReady(false);
      return;
    }
    const ext = screenshotsSource === 'cloud' ? 'jpg' : 'png';
    const testSrc = `${screenshotsBaseUrl.replace(/\/$/, '')}/0.${ext}`;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setScreenshotsReady(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setScreenshotsReady(false);
      }
    };
    img.src = testSrc;
    return () => {
      cancelled = true;
    };
  }, [screenshotsBaseUrl, screenshotsCount, screenshotsSource]);

  // Valider automatiquement les médias à l'arrivée sur l'étape 3.
  useEffect(() => {
    if (step === 3 && selectedMediaIds.length > 0 && !validationLoading && !validationCompleted) {
      void validateSelectedMedia();
    }
  }, [step, selectedMediaIds, validationLoading, validationCompleted, validateSelectedMedia]);

  // Générer automatiquement les captures dès que la validation est terminée dans l'étape préparation.
  useEffect(() => {
    if (
      step === 3 &&
      validationCompleted &&
      selectedMediaId.trim() &&
      !screenshotsLoading &&
      screenshotsCount === null
    ) {
      void handleGenerateScreenshots();
    }
  }, [step, validationCompleted, selectedMediaId, screenshotsLoading, screenshotsCount, handleGenerateScreenshots]);

  const handleSaveC411Config = async () => {
    const isFilled = (s: string) => s.trim() !== '' && s.trim() !== SAVED_MASK;
    const passkeyVal = isFilled(passkey) ? passkey.trim() : undefined;
    const apiKeyVal = isFilled(apiKey) ? apiKey.trim() : undefined;
    if (!passkeyVal && !apiKeyVal) {
      setMessage({
        type: 'error',
        text: t('settings.uploadTrackerPanel.wizardC411PasskeyLabel') + ' / ' + t('settings.uploadTrackerPanel.wizardC411ApiKeyLabel') + ' requis.',
      });
      return;
    }
    setSavingConfig(true);
    setMessage(null);
    const res = await serverApi.putC411UploadCookies({
      ...(passkeyVal ? { passkey: passkeyVal } : {}),
      ...(apiKeyVal ? { api_key: apiKeyVal } : {}),
    });
    setSavingConfig(false);
    if (res.success) {
      setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.cookiesSaved') });
      if (passkeyVal) setPasskey(SAVED_MASK);
      if (apiKeyVal) setApiKey(SAVED_MASK);
      await loadConfig();
    } else {
      setMessage({ type: 'error', text: res.message ?? res.error ?? t('common.error') });
    }
  };

  const handleLaunchUpload = async () => {
    if (selectedMediaIds.length === 0 || selectedTrackers.length === 0) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.fieldsRequired') });
      return;
    }
    if (isC411Selected && !c411ConfigOk) {
      setMessage({
        type: 'error',
        text: t('settings.uploadTrackerPanel.wizardC411ApiKeyLabel') + ' et passkey/announce requis pour C411.',
      });
      return;
    }
    setUploading(true);
    setExternalCreationInProgress(false);
    stopExternalProgressPolling();
    setBatchStats({
      processed: 0,
      total: selectedMediaIds.length,
      success: 0,
      duplicate: 0,
      error: 0,
    });
    setMessage(null);
    uploadWasCancelledRef.current = false;
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const failureDetails: string[] = [];
    const duplicateRegex = /(doublon|deja existant|already exists|already present|cross-slot)/i;
    try {
      for (let index = 0; index < selectedMediaIds.length; index += 1) {
        if (uploadWasCancelledRef.current) break;
        const mediaId = selectedMediaIds[index];
        const media = mediaList.find((m) => m.id === mediaId);
        const mediaName = media?.tmdb_title || media?.file_name || mediaId;
        setSelectedMediaId(mediaId);
        setProgressMessage(
          t('settings.uploadTrackerPanel.uploadingMediaProgress', {
            index: index + 1,
            total: selectedMediaIds.length,
            media: mediaName,
          })
        );
        startTorrentProgressPolling(mediaId);

        const controller = new AbortController();
        uploadAbortControllerRef.current = controller;

        const res = await serverApi.uploadLibraryMedia({
          local_media_id: mediaId,
          trackers: selectedTrackers,
          piece_size_override: undefined,
          screenshot_base_url: screenshotsBaseUrl ?? undefined,
          signal: controller.signal,
        });

        if (res.error === 'Aborted' || uploadWasCancelledRef.current) {
          break;
        }

        if (res.success && res.data) {
          const data = res.data as MultiTrackerUploadResult;
          const results = data.results ?? [];
          if (results.length === 0 || results.some((r) => r.result.success)) {
            successCount += 1;
            setBatchStats((prev) => ({
              ...prev,
              processed: prev.processed + 1,
              success: prev.success + 1,
            }));
            continue;
          }
          const allDuplicate = results.every((r) => duplicateRegex.test((r.result.message || '').toLowerCase()));
          if (allDuplicate) {
            duplicateCount += 1;
            setBatchStats((prev) => ({
              ...prev,
              processed: prev.processed + 1,
              duplicate: prev.duplicate + 1,
            }));
            setExcludedMediaIds((prev) => (prev.includes(mediaId) ? prev : [...prev, mediaId]));
            continue;
          }
          errorCount += 1;
          setBatchStats((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            error: prev.error + 1,
          }));
          failureDetails.push(
            `${mediaName}: ${results.map((r) => `${r.tracker}: ${r.result.message?.trim() || t('common.error')}`).join(' — ')}`
          );
        } else {
          errorCount += 1;
          setBatchStats((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            error: prev.error + 1,
          }));
          failureDetails.push(`${mediaName}: ${res.message ?? t('common.error')}`);
        }
      }
      setProgressMessage(null);
      if (uploadWasCancelledRef.current) {
        setMessage(null);
      } else {
        if (errorCount > 0) {
          let summary = t('settings.uploadTrackerPanel.uploadBatchSummary', {
            success: successCount,
            duplicate: duplicateCount,
            error: errorCount,
          });
          if (failureDetails.length > 0) {
            summary += ` (${failureDetails.join(' | ')})`;
          }
          setMessage({ type: 'error', text: summary });
        } else {
          setMessage(null);
        }
      }
    } catch (err) {
      setProgressMessage(null);
      if ((err instanceof Error && err.name === 'AbortError') || uploadWasCancelledRef.current) {
        setMessage(null);
      } else {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      uploadAbortControllerRef.current = null;
      // Ne pas arrêter le polling ici : si l'upload échoue (timeout/réseau),
      // la création .torrent peut continuer côté backend et l'UI doit continuer à afficher la progression.
      setUploading(false);
    }
  };

  useEffect(() => {
    handleLaunchUploadRef.current = handleLaunchUpload;
  });

  const handleCancelUpload = () => {
    if (!uploading) return;
    uploadWasCancelledRef.current = true;
    setProgressMessage(t('settings.uploadTrackerPanel.cancelingUploadProgress'));
    uploadAbortControllerRef.current?.abort();
  };

  const handleCancelPublishCountdown = () => {
    publishCountdownCanceledRef.current = true;
    autoLaunchConsumedRef.current = true;
    if (publishCountdownIntervalRef.current != null) {
      window.clearInterval(publishCountdownIntervalRef.current);
      publishCountdownIntervalRef.current = null;
    }
    setPublishCountdown(null);
  };

  const handleCancelExternalCreation = async () => {
    const mediaIdToCancel = runningCreationMediaIdRef.current?.trim() || selectedMediaId?.trim();
    if (!mediaIdToCancel || cancelingExternalCreation) return;
    setCancelingExternalCreation(true);
    const res = await serverApi.cancelTorrentCreation(mediaIdToCancel);
    setCancelingExternalCreation(false);
    const cancelRequested = res.success && (res.data?.cancel_requested === true);
    if (cancelRequested) {
      setProgressMessage(t('settings.uploadTrackerPanel.cancelingUploadProgress'));
      setExternalCreationInProgress(false);
      setTorrentProgress(null);
      runningCreationMediaIdRef.current = '';
      setMessage({
        type: 'success',
        text: t('settings.uploadTrackerPanel.cancelRequestedSuccess'),
      });
      return;
    }
    if (!res.success) {
      setMessage({
        type: 'error',
        text: res.message || res.error || t('common.error'),
      });
    }
  };

  const handleResumeExternalCreation = useCallback(() => {
    const mediaId = activeExternalCreation?.local_media_id?.trim();
    if (!mediaId) return;
    if (!mediaList.some((m) => m.id === mediaId)) {
      setActiveExternalCreation(null);
      return;
    }
    setSelectedMediaIds((prev) => (prev.includes(mediaId) ? prev : [mediaId, ...prev]));
    setSelectedMediaId(mediaId);
    setTorrentProgress(activeExternalCreation?.progress ?? 0);
    setStep(3);
  }, [activeExternalCreation, mediaList]);

  useEffect(() => {
    if (step !== 3 || !selectedMediaId.trim() || uploading) {
      setExternalCreationInProgress(false);
      if (!uploading) {
        stopExternalProgressPolling();
      }
      return;
    }

    let cancelled = false;
    const checkProgress = async () => {
      const res = await (serverApi as any).getTorrentProgress(selectedMediaId);
      if (cancelled) return;
      const pct = res.success && res.data && typeof res.data.progress === 'number' ? res.data.progress : null;
      const runningElsewhere = typeof pct === 'number' && pct < 100;
      setExternalCreationInProgress(runningElsewhere);
      if (runningElsewhere) {
        runningCreationMediaIdRef.current = selectedMediaId;
        setTorrentProgress(pct);
      } else {
        runningCreationMediaIdRef.current = '';
        if (!uploading && !progressMessage) {
          setTorrentProgress(null);
        }
      }
    };

    void checkProgress();
    stopExternalProgressPolling();
    externalProgressIntervalRef.current = window.setInterval(() => {
      void checkProgress();
    }, 2000);

    return () => {
      cancelled = true;
      stopExternalProgressPolling();
    };
  }, [progressMessage, selectedMediaId, step, stopExternalProgressPolling, uploading]);

  const selectedMedia = mediaList.find((m) => m.id === selectedMediaId);
  const selectedMediaLabel =
    selectedMediaIds.length > 1
      ? t('settings.uploadTrackerPanel.selectedMediaCount', { count: selectedMediaIds.length })
      : selectedMedia?.tmdb_title || selectedMedia?.file_name || selectedMediaId;
  const torrentFactoryItems = [
    {
      label: `${t('settings.uploadTrackerPanel.factoryTrackers')} ${selectedTrackers.length}/${trackersTarget}`,
      value: trackersProgressPct,
      color: 'var(--ds-accent-violet)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryMedia')} ${selectedMediaIds.length}/${mediaTarget}`,
      value: mediaProgressPct,
      color: 'var(--ds-accent-yellow)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryValidation')} ${validationCount}/${validationTarget}`,
      value: validationProgressPct,
      color: 'var(--ds-accent-green)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryScreenshots')} ${Math.min(
        screenshotsGeneratedCount,
        screenshotsTarget
      )}/${screenshotsTarget}`,
      value: screenshotsProgressPct,
      color: 'var(--ds-accent-yellow)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryPreview')} ${previewCount}/${previewTarget}`,
      value: previewProgressPct,
      color: 'var(--ds-accent-red)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryHash')} ${hashProgressPct}/${hashTarget}`,
      value: hashProgressPct,
      color: 'var(--ds-accent-violet)',
    },
    {
      label: `${t('settings.uploadTrackerPanel.factoryUpload')} ${uploadProcessedCount}/${uploadTarget}`,
      value: uploadProgressPct,
      color: 'var(--ds-text-secondary)',
    },
  ];

  const pipelineSteps = [
    {
      key: 'trackers',
      title: t('settings.uploadTrackerPanel.wizardSummaryTrackers'),
      current: selectedTrackers.length,
      target: trackersTarget,
      color: '#a855f7',
      accent: 'violet' as const,
    },
    {
      key: 'media',
      title: t('settings.uploadTrackerPanel.wizardSummaryMedia'),
      current: selectedMediaIds.length,
      target: mediaTarget,
      color: '#facc15',
      accent: 'yellow' as const,
    },
    {
      key: 'validation',
      title: t('settings.uploadTrackerPanel.factoryValidation'),
      current: validationCount,
      target: validationTarget,
      color: '#22c55e',
      accent: 'green' as const,
    },
    {
      key: 'screenshots',
      title: t('settings.uploadTrackerPanel.wizardSummaryScreenshots'),
      current: Math.min(screenshotsGeneratedCount, screenshotsTarget),
      target: screenshotsTarget,
      color: '#facc15',
      accent: 'yellow' as const,
    },
    {
      key: 'preview',
      title: t('settings.uploadTrackerPanel.factoryPreview'),
      current: previewCount,
      target: previewTarget,
      color: '#f97373',
      accent: 'violet' as const,
    },
    {
      key: 'hash',
      title: t('settings.uploadTrackerPanel.factoryHash'),
      current: hashProgressPct,
      target: hashTarget,
      color: '#6366f1',
      accent: 'violet' as const,
    },
    {
      key: 'upload',
      title: t('settings.uploadTrackerPanel.factoryUpload'),
      current: uploadProcessedCount,
      target: uploadTarget,
      color: '#9ca3af',
      accent: 'violet' as const,
    },
  ];

  const loadPreview = useCallback(async () => {
    const mediaIdForPreview = selectedMediaIds[0] ?? '';
    if (!mediaIdForPreview.trim()) return;
    setPreviewLoading(true);
    setPreviewData(null);
    const tracker = selectedTrackers[0]; // Un template par tracker : on prévisualise pour le premier sélectionné
    const res = await serverApi.getUploadPreview(
      mediaIdForPreview,
      tracker,
      screenshotsBaseUrl ?? undefined
    );
    setPreviewLoading(false);
    if (res.success && res.data) {
      setPreviewData(res.data);
    } else {
      setMessage({ type: 'error', text: res.message ?? t('settings.uploadTrackerPanel.previewError') });
    }
  }, [selectedMediaIds, selectedTrackers, screenshotsBaseUrl, t]);

  useEffect(() => {
    if (step === 3 && selectedMediaIds.length > 0) {
      void loadPreview();
    } else if (step !== 3) {
      setPreviewData(null);
    }
  }, [step, selectedMediaIds, selectedTrackers, loadPreview]);

  useEffect(() => {
    setScreenshotsCount(null);
    setScreenshotsBaseUrl(null);
  }, [selectedMediaId]);

  const initialLoading = loadingMedia || loadingTrackersSetup;
  if (initialLoading) {
    return (
      <div className="space-y-6">
        <LoadingAssistantView
          loadingLibrary={loadingMedia}
          loadingConfig={loadingConfig}
          t={t}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-base-content/80">
        {t('settings.uploadTrackerPanel.uploadAssistantDescription')}
      </p>
      {activeExternalCreation && step !== 3 && (
        <div role="alert" className="text-sm p-3 rounded bg-warning/15 text-warning flex flex-wrap items-center gap-3">
          <span>
            {t('settings.uploadTrackerPanel.resumeExternalCreationNotice', { progress: activeExternalCreation.progress })}
          </span>
          <button type="button" className="btn btn-warning btn-xs" onClick={() => void handleResumeExternalCreation()}>
            {t('settings.uploadTrackerPanel.resumeExternalCreationAction')}
          </button>
        </div>
      )}

      {/* Indicateur d'étapes */}
      <div className="flex items-center gap-2">
        {Array.from({ length: WIZARD_STEPS }, (_, idx) => idx + 1).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? 'bg-primary text-primary-content'
                  : step > s
                    ? 'bg-success/20 text-success'
                    : 'bg-base-300 text-base-content/60'
              }`}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </span>
            <span className="text-xs text-base-content/70">
              {s === 1 && t('settings.uploadTrackerPanel.wizardStepTrackers')}
              {s === 2 && t('settings.uploadTrackerPanel.wizardStepMedia')}
              {s === 3 && t('settings.uploadTrackerPanel.wizardStepReview')}
            </span>
            {s < 3 && <span className="mx-1 text-base-content/40">→</span>}
          </div>
        ))}
      </div>

      {/* Étape 1 : Trackers + config par tracker */}
      {step === 1 && (
        <>
          <div class="sc-frame">
          <div class="sc-frame-header"><div class="sc-frame-title">{t('settings.uploadTrackerPanel.wizardStepTrackers')}</div></div>
          <div class="sc-frame-body">
            <p className="text-sm text-base-content/70 mb-4">
              {t('settings.uploadTrackerPanel.wizardChooseTrackersDescription')}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {configuredTrackers.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`btn btn-sm ${selectedTrackers.includes(id) ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => toggleTracker(id)}
                >
                  {id}
                </button>
              ))}
            </div>
            <p className="text-xs text-base-content/60 mb-3">
              {t('settings.uploadTrackerPanel.trackersWipHint')}
            </p>
            {configuredTrackers.length === 0 && !loadingTrackersSetup && (
              <p className="text-sm text-warning mb-3">
                {t('settings.uploadTrackerPanel.noConfiguredTrackers')}
              </p>
            )}
            <a
              href="/settings/uploads/trackers/"
              data-astro-prefetch="hover"
              className="btn btn-ghost btn-sm mb-4"
            >
              {t('settings.uploadTrackerPanel.manageTrackersButton')}
            </a>

            {isC411Selected && (
              <div className="border border-base-300 rounded-lg p-4 bg-base-200/50 space-y-3">
                <p className="font-medium text-sm">C411</p>
                {loadingConfig ? (
                  <p className="text-sm text-base-content/70">{t('common.loading')}</p>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-base-content/60 block mb-1">
                        {t('settings.uploadTrackerPanel.wizardC411ApiKeyLabel')}
                      </label>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full max-w-md font-mono"
                        placeholder={t('settings.uploadTrackerPanel.wizardC411ApiKeyPlaceholder')}
                        value={apiKey}
                        onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
                        onFocus={() => apiKey === SAVED_MASK && setApiKey('')}
                      />
                      <p className="text-xs text-base-content/50 mt-1">
                        {t('settings.uploadTrackerPanel.wizardC411ApiKeyHint')}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-base-content/60 block mb-1">
                        {t('settings.uploadTrackerPanel.wizardC411PasskeyLabel')}
                      </label>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full max-w-md font-mono"
                        placeholder={t('settings.uploadTrackerPanel.passkeyPlaceholder')}
                        value={passkey}
                        onInput={(e) => setPasskey((e.target as HTMLInputElement).value)}
                        onFocus={() => passkey === SAVED_MASK && setPasskey('')}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/60 block mb-1">
                        {t('settings.uploadTrackerPanel.announceUrl')}
                      </label>
                      <input
                        type="url"
                        className="input input-bordered input-sm w-full max-w-md font-mono"
                        placeholder="https://c411.org/announce/VOTRE_PASSKEY"
                        value={announceUrl}
                        onInput={(e) => setAnnounceUrl((e.target as HTMLInputElement).value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                  disabled={savingConfig || loadingTrackersSetup}
                      onClick={() => void handleSaveC411Config()}
                    >
                      {savingConfig ? t('common.loading') : t('settings.uploadTrackerPanel.saveCookies')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn btn-primary gap-2"
              disabled={!canGoStep2 || loadingTrackersSetup}
              onClick={() => setStep(2)}
            >
              {t('settings.uploadTrackerPanel.wizardNext')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Étape 2 : Liste des médias (multi-sélection) */}
      {step === 2 && (
        <>
          <div class="sc-frame">
          <div class="sc-frame-header"><div class="sc-frame-title">{t('settings.uploadTrackerPanel.wizardStepMedia')}</div></div>
          <div class="sc-frame-body">
            <p className="text-sm text-base-content/70 mb-4">
              {t('settings.uploadTrackerPanel.wizardChooseMediaListDescription')}
            </p>
            <div className="mb-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[12rem] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" aria-hidden />
                  <input
                    type="search"
                    className="input input-bordered input-sm w-full pl-8"
                    placeholder={t('settings.uploadTrackerPanel.mediaSearchPlaceholder')}
                    value={mediaSearchQuery}
                    onInput={(e) => setMediaSearchQuery((e.target as HTMLInputElement).value)}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={showExcludedMedia}
                    onChange={(e) => setShowExcludedMedia((e.target as HTMLInputElement).checked)}
                  />
                  <span className="text-sm">{t('settings.uploadTrackerPanel.showExcludedMedia')}</span>
                </label>
                <select
                  className="select select-bordered select-sm w-auto max-w-[14rem]"
                  value={filterTorrentCreated}
                  onChange={(e) =>
                    setFilterTorrentCreated((e.target as HTMLSelectElement).value as 'all' | 'with_torrent' | 'without_torrent')
                  }
                >
                  <option value="all">{t('settings.uploadTrackerPanel.filterTorrentAll')}</option>
                  <option value="with_torrent">{t('settings.uploadTrackerPanel.filterTorrentWith')}</option>
                  <option value="without_torrent">{t('settings.uploadTrackerPanel.filterTorrentWithout')}</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={selectableInDisplayed.length === 0}
                  onClick={toggleSelectAllMedia}
                >
                  {allVisibleMediaSelected
                    ? t('settings.uploadTrackerPanel.wizardUnselectAllMedia')
                    : t('settings.uploadTrackerPanel.wizardSelectAllMedia')}
                </button>
                <span className="text-xs text-base-content/60">
                  {t('settings.uploadTrackerPanel.selectedMediaCount', { count: selectedMediaIds.length })}
                </span>
                {displayedMediaList.length > 0 && (
                  <span className="text-xs text-base-content/50">
                    {t('settings.uploadTrackerPanel.mediaFilteredCount', { count: displayedMediaList.length })}
                  </span>
                )}
              </div>
            </div>
            {displayedMediaList.length === 0 ? (
              <p className="text-sm text-base-content/70">{t('settings.uploadTrackerPanel.noMedia')}</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-base-300 divide-y divide-base-300">
                {displayedMediaList.map((m) => {
                  const isExcluded = excludedMediaIds.includes(m.id);
                  const hasTorrent = publishedMediaIdsWithTorrent.has(m.id);
                  const alreadyPublishedAll = isAlreadyPublishedOnAllSelectedTrackers(m.id);
                  const dupeOnTracker = dupeOnTrackerByMediaId[m.id]?.exists === true;
                  const dupeName = dupeOnTrackerByMediaId[m.id]?.matchedName;
                  return (
                    <label
                      key={m.id}
                      className={`flex items-start gap-3 p-3 ${isExcluded ? 'opacity-75 bg-base-200/50' : 'cursor-pointer hover:bg-base-200/50'}`}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm mt-0.5"
                        checked={selectedMediaIds.includes(m.id)}
                        disabled={isExcluded || alreadyPublishedAll || dupeOnTracker}
                        onChange={() => !isExcluded && !alreadyPublishedAll && !dupeOnTracker && toggleMediaSelection(m.id)}
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium text-base-content truncate">
                          {m.tmdb_title || m.file_name}
                        </span>
                        <span className="block text-xs text-base-content/70 truncate">{m.file_name}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {isExcluded && (
                            <span
                              className="badge badge-warning badge-sm"
                              title={excludedMediaReasons[m.id] || t('settings.uploadTrackerPanel.badgeExcluded')}
                            >
                              {t('settings.uploadTrackerPanel.badgeExcluded')}
                            </span>
                          )}
                          {hasTorrent && (
                            <span className="badge badge-info badge-sm">
                              {t('settings.uploadTrackerPanel.badgeTorrentCreated')}
                            </span>
                          )}
                          {alreadyPublishedAll && (
                            <span className="badge badge-success badge-sm" title={t('settings.uploadTrackerPanel.mediaAlreadyPublished')}>
                              {t('settings.uploadTrackerPanel.badgeAlreadyPublished')}
                            </span>
                          )}
                          {dupeOnTracker && (
                            <span
                              className="badge badge-success badge-sm"
                              title={dupeName ? `${t('settings.uploadTrackerPanel.mediaExistsOnTracker')}\n${dupeName}` : t('settings.uploadTrackerPanel.mediaExistsOnTracker')}
                            >
                              {t('settings.uploadTrackerPanel.badgeExistsOnTracker')}
                            </span>
                          )}
                        </div>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-base-content/60">
              {t('settings.uploadTrackerPanel.alreadyOnTrackerHint')}
            </p>
          </div>
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              className="btn btn-ghost gap-2"
              onClick={() =>
                shouldSkipTrackersStep
                  ? (window.location.href = '/settings/uploads/trackers/')
                  : setStep(1)
              }
            >
              <ArrowLeft className="w-4 h-4" />
              {shouldSkipTrackersStep
                ? t('settings.uploadTrackerPanel.manageTrackersButton')
                : t('settings.uploadTrackerPanel.wizardBack')}
            </button>
            <button
              type="button"
              className="btn btn-primary gap-2"
              disabled={!canGoStep3}
              onClick={() => setStep(3)}
            >
              {t('settings.uploadTrackerPanel.wizardNext')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Étape 3 : Torrent factory (préparation + récap + envoi) */}
      {step === 3 && (
        <>
          <div className="space-y-4">
            <div class="sc-frame">
              <div class="sc-frame-header"><div class="sc-frame-title">{t('settings.uploadTrackerPanel.wizardSummaryTitle')}</div></div>
              <div class="sc-frame-body">
                <p className="text-sm text-base-content/70 mb-4">
                  {t('settings.uploadTrackerPanel.wizardReviewDescription')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <DsCard variant="glass" className="h-full min-w-0 overflow-hidden">
                    <DsCardSection className="relative min-h-[160px] h-full min-w-0 overflow-hidden p-0">
                      {selectedMediaIds.length > 0 && (() => {
                        const firstMediaId = selectedMediaIds[0];
                        const media = mediaList.find((m) => m.id === firstMediaId);
                        const posterUrl = media?.poster_url;
                        const title = media?.tmdb_title || media?.file_name || firstMediaId;
                        const content = (
                          <div className="relative z-10 h-full p-3 sm:p-4 flex flex-col justify-end">
                            <div className="mt-1">
                              <p className={`text-sm sm:text-base font-semibold truncate ${posterUrl ? 'text-white drop-shadow' : 'text-[var(--ds-text-primary)]'}`}>
                                {title}
                              </p>
                              <p className={`text-xs mt-0.5 ${posterUrl ? 'text-white/80' : 'text-[var(--ds-text-tertiary)]'}`}>
                                {selectedMediaIds.length === 1
                                  ? t('settings.uploadTrackerPanel.wizardSummaryOneMedia')
                                  : t('settings.uploadTrackerPanel.wizardSummaryManyMedia', {
                                      count: selectedMediaIds.length,
                                    })}
                              </p>
                            </div>
                          </div>
                        );

                        if (!posterUrl) {
                          return content;
                        }

                        return (
                          <>
                            <div
                              className="absolute inset-0 bg-cover bg-center"
                              style={{ backgroundImage: `url(${posterUrl})` }}
                              aria-hidden
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" aria-hidden />
                            {content}
                          </>
                        );
                      })()}
                    </DsCardSection>
                  </DsCard>
                  <DsSettingsSectionCard
                    icon={Images}
                    title=""
                    accent="green"
                    cardVariant="glass"
                    className="h-full"
                  >
                    {screenshotsCount && screenshotsCount > 0 && screenshotsBaseUrl && (
                      <div className="mt-3">
                        {!screenshotsReady && (
                          <div className="w-full h-24 sm:h-28 rounded-lg bg-base-200/80 animate-pulse" />
                        )}
                        {screenshotsReady && (
                          <>
                            <div className="relative overflow-hidden rounded-lg bg-base-200 aspect-[16/9]">
                              <div className="flex transition-transform duration-500 ease-out">
                                {[...Array(screenshotsCount)].map((_, idx) => {
                                  const ext = screenshotsSource === 'cloud' ? 'jpg' : 'png';
                                  const src = `${screenshotsBaseUrl.replace(/\/$/, '')}/${idx}.${ext}`;
                                  const isActive = idx === screenshotCarouselIndex;
                                  return (
                                    <img
                                      key={idx}
                                      src={src}
                                      alt={t('settings.uploadTrackerPanel.screenshotAlt', {
                                        index: idx + 1,
                                      })}
                                      className={`absolute inset-0 w-full h-full object-cover ${
                                        isActive ? 'opacity-100' : 'opacity-0'
                                      }`}
                                      loading="lazy"
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            {/* Footer de texte retiré pour alléger la carte */}
                          </>
                        )}
                      </div>
                    )}
                  </DsSettingsSectionCard>
                  <DsSettingsSectionCard
                    icon={Activity}
                    title=""
                    accent="yellow"
                    cardVariant="glass"
                    className="h-full"
                  >
                    <div className="mt-3 space-y-3">
                      <PipelineDonutChart steps={pipelineSteps} />
                      <ExecutionChart stats={batchStats} />
                      {batchStats.total > 0 && (
                        <p className="text-xs text-[var(--ds-text-tertiary)]">
                          {t('settings.uploadTrackerPanel.wizardSummaryExecutionDetail', {
                            processed: batchStats.processed,
                            total: batchStats.total,
                          })}
                        </p>
                      )}
                    </div>
                  </DsSettingsSectionCard>
                </div>
              </div>
            </div>

            <div class="sc-frame">
              <div class="sc-frame-header">
                <div class="sc-frame-title">
                  {previewData?.release_name?.trim()
                    ? previewData.release_name
                    : t('settings.uploadTrackerPanel.previewReleaseName')}
                </div>
              </div>
              <div class="sc-frame-body">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Colonnes médias / trackers / captures conservées au-dessus */}
                  {/** Le bloc d'exécution détaillé est géré par la carte suivante avec PipelineDonutChart */}
                </div>
                {externalCreationInProgress && !uploading && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-warning">
                      {t('settings.uploadTrackerPanel.externalCreationInProgress', {
                        progress: typeof torrentProgress === 'number' ? torrentProgress : 0,
                      })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-warning btn-xs"
                      disabled={cancelingExternalCreation}
                      onClick={() => void handleCancelExternalCreation()}
                    >
                      {cancelingExternalCreation
                        ? t('settings.uploadTrackerPanel.cancelingUploadProgress')
                        : t('settings.uploadTrackerPanel.cancelExternalCreation')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div class="sc-frame">
              <div class="sc-frame-header"><div class="sc-frame-title">{t('settings.uploadTrackerPanel.wizardSummaryPlan')}</div></div>
              <div class="sc-frame-body">
                <div className="max-h-52 overflow-auto rounded-lg border border-base-300 divide-y divide-base-300">
                  {selectedMediaIds.map((id) => {
                    const media = mediaList.find((m) => m.id === id);
                    const label = media?.tmdb_title || media?.file_name || id;
                    return (
                      <div key={id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate max-w-[60%]" title={label}>
                          {label}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {selectedTrackers.map((tracker) => (
                            <span key={`${id}-${tracker}`} className="badge badge-ghost badge-sm">
                              {tracker}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

            {/* Rafraîchir l’aperçu */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={previewLoading || selectedMediaIds.length === 0}
                onClick={() => void loadPreview()}
              >
                {previewLoading ? t('settings.uploadTrackerPanel.previewLoading') : t('settings.uploadTrackerPanel.previewRefresh')}
              </button>
              {previewData && !previewLoading && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setNfoModalOpen(true)}
                  >
                    {t('settings.uploadTrackerPanel.previewNfoLabel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDescriptionModalOpen(true)}
                  >
                    {t('settings.uploadTrackerPanel.previewPublicationTracker')}
                  </button>
                </>
              )}
            </div>

            {/* NFO et description : accessibles via boutons / modales */}
            {previewLoading && (
              <p className="text-sm text-base-content/70 mt-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                {t('settings.uploadTrackerPanel.previewLoading')}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {publishCountdown != null && publishCountdown > 0 ? (
                <>
                  <span className="flex items-center gap-2 text-sm text-base-content/80">
                    {t('settings.uploadTrackerPanel.publishCountdown', { seconds: publishCountdown })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleCancelPublishCountdown}
                  >
                    {t('settings.uploadTrackerPanel.publishCountdownCancel')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary gap-2"
                    disabled={uploading || !canLaunchUpload || externalCreationInProgress}
                    onClick={() => void handleLaunchUpload()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {t('settings.uploadTrackerPanel.wizardLaunchUpload')}
                      </>
                    )}
                  </button>
                  {uploading && (
                    <button
                      type="button"
                      className="btn btn-error btn-sm"
                      onClick={handleCancelUpload}
                    >
                      {t('settings.uploadTrackerPanel.wizardCancelUpload')}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={uploading}
                onClick={() => {
                  window.location.href = '/settings/uploads/trackers/';
                }}
              >
                {t('settings.uploadTrackerPanel.manageTrackersButton')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={uploading}
                onClick={() => setStep(2)}
              >
                {t('settings.uploadTrackerPanel.wizardChangeMedia')}
              </button>
            </div>
        </>
      )}

      {/* Modales de prévisualisation NFO / description tracker */}
      <Modal
        isOpen={nfoModalOpen && !!previewData}
        onClose={() => setNfoModalOpen(false)}
        title={t('settings.uploadTrackerPanel.previewNfoLabel')}
        size="lg"
      >
        {previewData && (
          <pre
            className="w-full max-h-[60vh] overflow-auto rounded-lg border border-base-300 bg-base-300/80 p-4 text-xs font-mono text-base-content/90 whitespace-pre-wrap break-words"
            role="document"
            aria-label={t('settings.uploadTrackerPanel.previewNfoLabel')}
          >
            {previewData.nfo}
          </pre>
        )}
      </Modal>

      <Modal
        isOpen={descriptionModalOpen && !!previewData}
        onClose={() => setDescriptionModalOpen(false)}
        title={t('settings.uploadTrackerPanel.previewPublicationTracker')}
        size="lg"
      >
        {previewData && (
          <DescriptionPreview
            html={previewData.description_html}
            raw={previewData.description}
            aria-label={t('settings.uploadTrackerPanel.previewPublicationTracker')}
            className="max-h-[60vh]"
          />
        )}
      </Modal>

      {message && (
        <div
          ref={messageRef}
          className={`text-sm p-3 rounded ${
            message.type === 'success' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
