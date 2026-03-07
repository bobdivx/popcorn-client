import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { getBackendUrl } from '../../lib/backend-config';
import { getPopcornWebBaseUrl, uploadScreenshotsToCloud } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import type { LibraryMediaEntry } from '../../lib.client/server-api/library';
import type {
  ActiveTorrentCreationEntry,
  MultiTrackerUploadResult,
  UploaderPreviewResponse,
} from '../../lib/client/server-api/upload-tracker';
import { useI18n } from '../../lib/i18n/useI18n';
import { DsBarChart, DsCard, DsCardSection, DsMetricCard, LoadingIcon } from '../ui/design-system';
import { Modal } from '../ui/Modal';
import { DescriptionPreview } from '../upload/DescriptionPreview';
import { ArrowLeft, ArrowRight, Check, Loader2, Upload } from 'lucide-preact';

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
    <div
      className="ds-card-loading-wrapper w-full max-w-[42rem] mx-auto"
      role="status"
      aria-live="polite"
      aria-busy={!libraryDone}
    >
      <div className="ds-card-loading-glow" />
      <div className="ds-card-loading">
        <div className="ds-card-loading-bar" />
        <div className="ds-card-loading-content !p-5 sm:!p-10 text-center">
          <LoadingIcon>
            <Upload className="w-8 h-8 text-[var(--ds-accent-violet)]" strokeWidth={1.8} aria-hidden />
          </LoadingIcon>
          <h2 className="ds-loading-title !text-[clamp(1.45rem,4.2vw,2.15rem)] leading-tight max-w-[24ch] mx-auto break-words">
            {t('settings.uploadTrackerPanel.uploadAssistantDescription')}
          </h2>
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
          <div className="ds-progress-container mt-6 mb-0">
            <div className="ds-progress-bar" />
            <div className="ds-progress-wave" />
          </div>
        </div>
      </div>
    </div>
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
  const publishCountdownIntervalRef = useRef<number | null>(null);
  const handleLaunchUploadRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const autoSkipStep1Ref = useRef(false);
  const availableMediaList = mediaList.filter((m) => !excludedMediaIds.includes(m.id));

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
    if (indexersRes.success && Array.isArray(indexersRes.data)) {
      for (const idx of indexersRes.data) {
        if (!idx?.isEnabled || !idx.name) continue;
        const mapped = mapIndexerNameToTracker(idx.name);
        if (mapped) configured.add(mapped);
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
      setSelectedMediaId((prev) => (res.data!.length > 0 && !prev ? res.data![0].id : prev));
      setSelectedMediaIds((prev) => {
        if (prev.length > 0) return prev.filter((id) => res.data!.some((m) => m.id === id));
        return res.data!.length > 0 ? [res.data![0].id] : [];
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
        const res = await serverApi.getTorrentProgress(localMediaId);
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
        const sorted = [...res.data].sort((a, b) => b.progress - a.progress);
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
    availableMediaList.length > 0 &&
    availableMediaList.every((m) => selectedMediaIds.includes(m.id));
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
    }
    if (
      step !== 3 ||
      !canLaunchUpload ||
      uploading ||
      publishCountdownCanceledRef.current ||
      externalCreationInProgress
    ) {
      if (publishCountdownIntervalRef.current != null) {
        window.clearInterval(publishCountdownIntervalRef.current);
        publishCountdownIntervalRef.current = null;
      }
      if (step !== 3 || !canLaunchUpload) {
        setPublishCountdown(null);
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
    setSelectedMediaIds(availableMediaList.map((m) => m.id));
  };

  const excludeMediaWithReason = useCallback((mediaId: string, reason: string) => {
    setExcludedMediaIds((prev) => (prev.includes(mediaId) ? prev : [...prev, mediaId]));
    setExcludedMediaReasons((prev) => ({ ...prev, [mediaId]: reason }));
  }, []);

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
    setScreenshotsLoading(true);
    setMessage(null);
    const res = await serverApi.generateScreenshots(selectedMediaId);
    setScreenshotsLoading(false);
    if (res.success && res.data) {
      setScreenshotsCount(res.data.count);
      setScreenshotsBaseUrl(res.data.screenshot_base_url?.trim() || null);
      // Héberger les captures sur popcorn-web pour que la description C411 affiche les images (URLs publiques).
      if (res.data.count > 0 && TokenManager.getCloudAccessToken()) {
        const backendUrl = getBackendUrl() || serverApi.getServerUrl() || '';
        if (backendUrl) {
          const cloudRes = await uploadScreenshotsToCloud(selectedMediaId, backendUrl, res.data.count);
          if (cloudRes.success) {
            setScreenshotsBaseUrl(getPopcornWebBaseUrl());
          }
        }
      }
      return true;
    } else {
      setMessage({ type: 'error', text: res.message ?? t('settings.uploadTrackerPanel.screenshotsError') });
      return false;
    }
  };

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
      stopTorrentProgressPolling();
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
      const res = await serverApi.getTorrentProgress(selectedMediaId);
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
          <DsCardSection title={t('settings.uploadTrackerPanel.wizardStepTrackers')}>
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
          </DsCardSection>
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
          <DsCardSection title={t('settings.uploadTrackerPanel.wizardStepMedia')}>
            <p className="text-sm text-base-content/70 mb-4">
              {t('settings.uploadTrackerPanel.wizardChooseMediaListDescription')}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={availableMediaList.length === 0}
                onClick={toggleSelectAllMedia}
              >
                {allVisibleMediaSelected
                  ? t('settings.uploadTrackerPanel.wizardUnselectAllMedia')
                  : t('settings.uploadTrackerPanel.wizardSelectAllMedia')}
              </button>
              <span className="text-xs text-base-content/60">
                {t('settings.uploadTrackerPanel.selectedMediaCount', { count: selectedMediaIds.length })}
              </span>
            </div>
            {availableMediaList.length === 0 ? (
              <p className="text-sm text-base-content/70">{t('settings.uploadTrackerPanel.noMedia')}</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-base-300 divide-y divide-base-300">
                {availableMediaList.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-base-200/50"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm mt-0.5"
                      checked={selectedMediaIds.includes(m.id)}
                      onChange={() => toggleMediaSelection(m.id)}
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium text-base-content truncate">
                        {m.tmdb_title || m.file_name}
                      </span>
                      <span className="block text-xs text-base-content/70 truncate">{m.file_name}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-base-content/60">
              {t('settings.uploadTrackerPanel.alreadyOnTrackerHint')}
            </p>
          </DsCardSection>
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
            <DsCard variant="elevated">
              <DsCardSection title={t('settings.uploadTrackerPanel.wizardSummaryTitle')}>
                <p className="text-sm text-base-content/70 mb-4">
                  {t('settings.uploadTrackerPanel.wizardReviewDescription')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <DsMetricCard
                    icon="🎬"
                    label={t('settings.uploadTrackerPanel.wizardSummaryMediaSelected')}
                    value={selectedMediaIds.length}
                    accent="violet"
                    className="rounded-xl"
                  />
                  <DsMetricCard
                    icon="🧭"
                    label={t('settings.uploadTrackerPanel.wizardSummaryTrackerSelected')}
                    value={selectedTrackers.length}
                    accent="yellow"
                    className="rounded-xl"
                  />
                  <DsMetricCard
                    icon="🖼️"
                    label={t('settings.uploadTrackerPanel.wizardSummaryScreenshots')}
                    value={screenshotsCount ?? 0}
                    accent="green"
                    className="rounded-xl"
                  />
                  <DsMetricCard
                    icon="⚙️"
                    label={t('settings.uploadTrackerPanel.wizardSummaryExecution')}
                    value={batchStats.total > 0 ? `${batchStats.processed}/${batchStats.total}` : '0/0'}
                    accent="yellow"
                    className="rounded-xl"
                  />
                </div>
              </DsCardSection>
            </DsCard>

            <DsCard variant="elevated">
              <DsCardSection
                title={
                  previewData?.release_name?.trim()
                    ? previewData.release_name
                    : t('settings.uploadTrackerPanel.previewReleaseName')
                }
              >
                <DsBarChart
                  items={torrentFactoryItems}
                  max={100}
                  showValues={false}
                  horizontalLabelClassName="w-36 sm:w-44 whitespace-nowrap"
                />
                {batchStats.total > 0 && !uploading && batchStats.processed >= batchStats.total && (
                  <p className="text-xs text-base-content/70 mt-1">
                    {t('settings.uploadTrackerPanel.uploadBatchSummary', {
                      success: batchStats.success,
                      duplicate: batchStats.duplicate,
                      error: batchStats.error,
                    })}
                  </p>
                )}
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
              </DsCardSection>
            </DsCard>

            <DsCard variant="elevated">
              <DsCardSection title={t('settings.uploadTrackerPanel.wizardSummaryPlan')}>
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
              </DsCardSection>
            </DsCard>
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
