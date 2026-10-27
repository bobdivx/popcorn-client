import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';
import { updateResumeWatching } from '../../../../lib/resumeWatchingStorage';
import { recordEpisodeProgress, WATCHED_EPISODE_THRESHOLD_PERCENT } from '../../../../lib/watchedEpisodes';
import { recordMovieProgress } from '../../../../lib/watchedMovies';
import type { ContentItem } from '../../../../lib/client/types';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { isSparseOrEmptyMessage } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/player-shared/hooks/useFullscreen';
import { QualityBadges } from './QualityBadges';
import { isMobileDevice, isTVPlatform, isWebOSTV } from '../../../../lib/utils/device-detection';
import IntroVideoWithHlsPreload from '../../../IntroVideoWithHlsPreload';
import { useHlsLoader } from '../../../streaming/hls-player/hooks/useHlsLoader';
import { usePlayerConfig } from '../../../streaming/player-shared/hooks/usePlayerConfig';
import PlayerLoadingOverlay, {
  type PlayerLoadingTorrentStats,
} from '../../../streaming/player-shared/components/PlayerLoadingOverlay';
import { getLoadingStep } from '../../../streaming/player-shared/utils/streamingSteps';
import UnifiedPlayer from '../../../streaming/player-core/components/UnifiedPlayer';
import { useStreamSource } from '../../../streaming/player-core/hooks/useStreamSource';
import { buildProxyUrl, normalizeStreamPath } from '../../../streaming/player-core/utils/buildStreamUrl';
import { canUseSeekReload as computeCanUseSeekReload } from '../../../streaming/player-core/utils/streamSourceUtils';
import { emitPlaybackStep } from '../../../streaming/player-core/observability/playbackEvents';
import { getNetworkPlaybackProfile } from '../../../../lib/streaming/networkPlaybackProfile';
import { logVideoPlaybackError } from '../../../streaming/direct-player/mediaErrorDiagnostics';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { useRemoteFocusTrap } from '../../../../lib/tv/useRemoteFocusTrap';
import { useHistoryBackGuard } from '../../../../lib/navigation/historyBackGuard';
import { useLibraryScrubThumbnails } from './video-player-wrapper/useLibraryScrubThumbnails';
import { getLanguageName } from '../../../streaming/player-shared/utils/languageName';
import {
  pickPreferredAudioTrackId,
  resolvePreferredAudioLanguage,
} from '../../../streaming/player-shared/utils/pickPreferredAudioTrack';
import { isVideoFilePath } from '../../../../lib/streaming/videoFilePath';

/** Délai max d'attente des pistes audio (ffprobe serveur) avant de lancer le HLS sur la piste par défaut. */
const AUDIO_PROBE_TIMEOUT_MS = 2500;

/** Info épisode suivant (série) pour le bouton « Épisode suivant » */
export interface NextEpisodeInfo {
  seasonNum: number;
  episodeVariantId: string;
  title?: string;
}

interface VideoPlayerWrapperProps {
  infoHash: string;
  selectedFile?: TorrentFile;
  torrentName: string;
  torrentId?: string;
  /** Pour sauvegarder la position par média (tmdb) dans le player */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  /** Série : épisode en cours (sauvegarde reprise + « vu ») */
  seriesSeasonNum?: number | null;
  seriesEpisodeNum?: number | null;
  startFromBeginning?: boolean;
  /** Position de reprise explicite (query ?t= / localStorage média). */
  initialSeekSeconds?: number | null;
  /** Contexte série : afficher « Passer le générique » et appliquer auto-skip si activé */
  isSeries?: boolean;
  /** Épisode suivant (série) : afficher bouton « Épisode suivant » peu avant la fin */
  nextEpisodeInfo?: NextEpisodeInfo | null;
  onPlayNextEpisode?: () => void;
  /** Épisode précédent (série) : bouton « Précédent » du lecteur + ChannelDown. */
  previousEpisodeInfo?: NextEpisodeInfo | null;
  onPlayPreviousEpisode?: () => void;
  /** Prefetch silencieux de l'épisode suivant (ex. à ~50 % de lecture). */
  onPrefetchNextEpisode?: () => void;
  onClose: () => void;
  /** Annuler vraiment le téléchargement (retirer le torrent du client). */
  onAbortDownload?: () => void;
  visible?: boolean;
  wrapperRef?: (element: HTMLDivElement | null) => void;
  quality?: {
    resolution?: string;
    source?: string;
    codec?: string;
    audio?: string;
    language?: string;
    full?: string;
  };
  tmdbMatchSource?: string | null;
  tmdbMatchConfidence?: string | null;
  /** En mode démo : URL directe du MP4 (ex. popcorn-web/public/media), pour lecture sans HLS. */
  directStreamUrl?: string | null;
  /** Média partagé par un ami : URL du serveur ami pour le stream uniquement (on garde notre backend pour le reste). */
  streamBackendUrl?: string | null;
  /** URL du poster (affiché en overlay pause avec le synopsis). */
  posterUrl?: string | null;
  /** URL du logo du média (TMDB) — affiché à la place du logo Popcorn si fourni. */
  logoUrl?: string | null;
  /** Synopsis du média (affiché en overlay pause avec le poster). */
  synopsis?: string | null;
  /** Année de sortie (badge overlay pause). */
  releaseDate?: string | null;
  /** Utiliser la route /api/stream-torrent (option payante) avec token. */
  useStreamTorrentMode?: boolean;
  /** Token cloud pour stream-torrent (?access_token=). */
  streamingTorrentToken?: string | null;
  /** Statut de lecture (pour l'indicateur d'étapes dans l'overlay du lecteur). */
  playStatus?: string;
  /** Message de progression (ex. "Recherche de peers..."). */
  progressMessage?: string;
  /** Stats du torrent (pour déduire l'étape courante et l'overlay buffering). */
  torrentStats?: PlayerLoadingTorrentStats | null;
  errorMessage?: string | null;
  /** Erreur HLS fatale remontée au parent (ex. SPARSE_OR_EMPTY). */
  onPlaybackError?: (message: string) => void;
  /** Supprimer les fichiers sparses/vides (confirmation gérée par le parent ou ici). */
  onDeleteEmptyFiles?: () => void;
}

export function VideoPlayerWrapper({ 
  infoHash, 
  selectedFile, 
  torrentName, 
  torrentId, 
  tmdbId,
  tmdbType,
  seriesSeasonNum,
  seriesEpisodeNum,
  startFromBeginning = false, 
  initialSeekSeconds = null,
  isSeries = false,
  nextEpisodeInfo,
  onPlayNextEpisode,
  previousEpisodeInfo,
  onPlayPreviousEpisode,
  onPrefetchNextEpisode,
  onClose,
  onAbortDownload,
  visible = true, 
  wrapperRef,
  quality,
  tmdbMatchSource,
  tmdbMatchConfidence,
  directStreamUrl,
  streamBackendUrl,
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  useStreamTorrentMode = false,
  streamingTorrentToken,
  playStatus,
  progressMessage,
  torrentStats,
  errorMessage,
  onPlaybackError,
  onDeleteEmptyFiles,
}: VideoPlayerWrapperProps) {
  const baseUrl = serverApi.getServerUrl();
  const [forceHlsFallback, setForceHlsFallback] = useState(false);
  const [showFallbackMessage, setShowFallbackMessage] = useState(false);
  /** Message d’overlay pendant le chargement HLS (ex. « Préparation en cours » pendant retries 503) */
  const [hlsLoadingMessage, setHlsLoadingMessage] = useState<string | null>(null);
  const [localPlayerError, setLocalPlayerError] = useState<string | null>(null);
  const [confirmingDeleteEmpty, setConfirmingDeleteEmpty] = useState(false);

  const hasLoggedStartRef = useRef(false);
  const lastLoggedErrorRef = useRef<string | null>(null);
  const hasPrefetchedNextRef = useRef(false);

  useEffect(() => {
    hasPrefetchedNextRef.current = false;
  }, [nextEpisodeInfo?.seasonNum, nextEpisodeInfo?.episodeVariantId]);

  const logErrorEvent = useCallback((errorDetails: string) => {
    serverApi.logPlaybackEvent({
      eventType: 'error',
      mediaName: torrentName,
      infoHash: infoHash,
      filePath: selectedFile?.path || selectedFile?.name,
      errorDetails,
    }).catch((err) => console.error('[VideoPlayerWrapper] Failed to log playback error:', err));
  }, [torrentName, infoHash, selectedFile]);

  useEffect(() => {
    if (errorMessage && lastLoggedErrorRef.current !== errorMessage) {
      lastLoggedErrorRef.current = errorMessage;
      logErrorEvent(errorMessage);
    }
  }, [errorMessage, logErrorEvent]);
  /** En mode stream-torrent : nombre de tentatives du lecteur direct (remount pour réessayer après 503). */
  const [directStreamRetryCount, setDirectStreamRetryCount] = useState(0);
  const directStreamRetryTimeoutRef = useRef<number | null>(null);
  const hlsPreloadRef = useRef<any>(null);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const { hlsLoaded } = useHlsLoader();
  const apiFullscreen = useFullscreen();
  const isTvPlayback = isTVPlatform() || isWebOSTV();
  const isFullscreen = apiFullscreen || isTvPlayback;
  const wrapperElementRef = useRef<HTMLDivElement>(null);
  const stopBufferRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) {
      document.documentElement.removeAttribute('data-tv-player-open');
      return;
    }
    document.documentElement.setAttribute('data-tv-player-open', 'true');
    return () => document.documentElement.removeAttribute('data-tv-player-open');
  }, [visible]);

  // Retour système (geste / bouton Android, « précédent » du navigateur) : une seule entrée
  // d'historique pour tout le lecteur (chargement, lecture, erreur) ; Retour = fermer, une fois.
  const closeFromSystemBackRef = useRef(onClose);
  closeFromSystemBackRef.current = onClose;
  const markBackGuardClosing = useHistoryBackGuard(visible !== false, () => {
    stopBufferRef.current?.();
    closeFromSystemBackRef.current?.();
  });

  /** Ferme le lecteur en arrêtant d'abord le buffer HLS/Lucie. */
  const handleClosePlayer = useCallback(() => {
    markBackGuardClosing();
    stopBufferRef.current?.();
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
  const isMobile = isMobileDevice();
  const { t, language: uxLanguage } = useI18n();
  const displayError = errorMessage || localPlayerError;
  // Carte d'erreur : focus auto, flèches/OK entre les boutons, focus piégé, Retour = fermer (une fois).
  const errorTrapRef = useRef<HTMLDivElement>(null);
  const confirmingDeleteEmptyRef = useRef(confirmingDeleteEmpty);
  confirmingDeleteEmptyRef.current = confirmingDeleteEmpty;
  // Toujours fermer via handleClosePlayer : marque la garde d'historique (sinon l'entrée
  // « lecteur » reste et le Retour suivant ne fait rien / revient en double) et coupe le buffer.
  const onCloseRef = useRef(handleClosePlayer);
  onCloseRef.current = handleClosePlayer;
  useRemoteFocusTrap(errorTrapRef, {
    active: !!displayError && visible !== false,
    onBack: () => {
      if (confirmingDeleteEmptyRef.current) {
        setConfirmingDeleteEmpty(false);
        return;
      }
      onCloseRef.current?.();
    },
  });
  const sparseOrEmpty = isSparseOrEmptyMessage(displayError);
  const playerConfig = usePlayerConfig();
  const isDirectMode = playerConfig.streamingMode === 'direct';
  const isLucieMode = playerConfig.streamingMode === 'lucie';
  // Désactiver Lucie pour la bibliothèque (local_) : la MSE ne remplit pas le buffer avec les segments actuels.
  // Utiliser HLS pour que la lecture fonctionne. Lucie reste utilisé pour les torrents si config = lucie.
  const useLucieForThisSource = isLucieMode && !forceHlsFallback && !infoHash?.startsWith('local_');
  // Bibliothèque locale : Direct Play auto pour conteneurs natifs navigateur (MP4/WebM) =
  // lecture disque sans réencode (4K fluide, comme VLC). MKV → HLS remux/transcode côté serveur.
  const localFilePath = selectedFile?.path || selectedFile?.name || '';
  const isBrowserNativeLocal =
    !!infoHash?.startsWith('local_') &&
    /\.(mp4|m4v|webm)(\?|$)/i.test(localFilePath);
  const effectiveDirectMode =
    (isDirectMode || isBrowserNativeLocal) && !forceHlsFallback;
  /** Qualité stream HLS : hauteur max ou null = Auto (source). TV / Wi‑Fi → Auto ; 4G mobile → 720p. */
  const [streamQuality, setStreamQuality] = useState<number | null>(
    () => getNetworkPlaybackProfile(false, { isTv: isTVPlatform() || isWebOSTV() }).suggestedMaxHeight,
  );
  const [audioIndex, setAudioIndex] = useState(0);
  const [sourceAudioTracks, setSourceAudioTracks] = useState<
    Array<{ id: number; name: string; lang?: string; default?: boolean }>
  >([]);
  /**
   * Pistes audio connues (ou sondage abandonné) : on ne monte le lecteur HLS qu'après, pour
   * construire l'URL avec la bonne piste dès le départ (sinon : 1er transcodage piste 0, puis
   * bascule audio_index → 2 FFmpeg serveur et lecteur relancé à chaud).
   */
  const [audioProbeDone, setAudioProbeDone] = useState(false);
  /** Lecteur déjà monté pour cette ouverture : ne plus le démonter (épisode suivant, plein écran). */
  const playerMountedRef = useRef(false);
  if (!visible) playerMountedRef.current = false;
  const {
    streamUrl,
    hlsFilePath,
    isLoading,
    setIsLoading,
    showIntro,
    setShowIntro,
  } = useStreamSource({
    selectedFile,
    infoHash,
    directStreamUrl,
    baseUrl,
    isDirectMode: effectiveDirectMode,
    isLucieMode: useLucieForThisSource,
    streamBackendUrl,
    maxHeight: streamQuality,
    streamingTorrentMode: useStreamTorrentMode,
    streamingTorrentToken: streamingTorrentToken ?? undefined,
  });

  const { scrubThumbnails, scrubThumbnailsLoading, reportPlaybackDuration } = useLibraryScrubThumbnails({
    visible: !!visible,
    streamBackendUrl,
    infoHash,
    hlsFilePath,
  });

  const audioProbePath =
    hlsFilePath && hlsFilePath !== 'direct' ? hlsFilePath : selectedFile?.path || selectedFile?.name || '';
  // Pistes audio du fichier source (ffprobe) — le HLS n'embarque qu'une seule piste.
  // Par défaut : langue de l'UX Popcornn (ex. fr), sauf préférence lecteur explicite.
  useEffect(() => {
    if (!visible || effectiveDirectMode || useLucieForThisSource || useStreamTorrentMode) {
      setSourceAudioTracks([]);
      setAudioIndex(0);
      setAudioProbeDone(true);
      return;
    }
    const path = audioProbePath;
    // Sans chemin fichier, l'API renvoie 400 — ne pas appeler avec info_hash seul.
    // Dossier (ex. downloadPath « media/films ») : ffprobe échouerait côté serveur → pas d'appel.
    if (!path || !String(path).trim() || !isVideoFilePath(path)) {
      setSourceAudioTracks([]);
      setAudioIndex(0);
      setAudioProbeDone(true);
      return;
    }
    let cancelled = false;
    setAudioProbeDone(false);
    // Serveur lent (NAS) : ne pas bloquer le démarrage au-delà de ce délai (piste par défaut).
    const probeTimeout = window.setTimeout(() => {
      if (!cancelled) setAudioProbeDone(true);
    }, AUDIO_PROBE_TIMEOUT_MS);
    (async () => {
      try {
        const res = await serverApi.getLocalAudioStreams({
          path: path.trim(),
          infoHash: infoHash || undefined,
        });
        if (cancelled) return;
        const tracks = res.success && res.data?.tracks ? res.data.tracks : [];
        const mapped = tracks.map((tr) => ({
          id: tr.index,
          name:
            tr.title ||
            getLanguageName(tr.language || undefined, undefined) ||
            `Audio ${tr.index + 1}`,
          lang: tr.language || undefined,
          title: tr.title || undefined,
          default: !!tr.default,
        }));
        setSourceAudioTracks(mapped);
        const preferred = resolvePreferredAudioLanguage(
          playerConfig.defaultAudioLanguage,
          uxLanguage,
        );
        setAudioIndex(pickPreferredAudioTrackId(mapped, preferred));
      } catch {
        if (!cancelled) {
          setSourceAudioTracks([]);
          setAudioIndex(0);
        }
      } finally {
        window.clearTimeout(probeTimeout);
        if (!cancelled) setAudioProbeDone(true);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(probeTimeout);
    };
  }, [
    visible,
    effectiveDirectMode,
    useLucieForThisSource,
    useStreamTorrentMode,
    infoHash,
    audioProbePath,
    playerConfig.defaultAudioLanguage,
    uxLanguage,
  ]);

  const loadingStepFromStatus = getLoadingStep(playStatus ?? '', progressMessage ?? '', torrentStats ?? null);
  // Quand on attend le flux (isLoading sans étape précise), afficher l’étape 1 (en file d’attente), pas la 4
  const loadingStep = loadingStepFromStatus > 0 ? loadingStepFromStatus : isLoading ? 1 : 0;

  /** En-deçà, on ne sauvegarde pas la progression (démarrage, reprise pas encore appliquée). */
  const MIN_PROGRESS_SAVE_SECONDS = 3;
  const handlePlaybackProgress = useCallback(
    (currentTime: number, duration: number) => {
      // Log start event once when playback actually starts (currentTime > 0)
      if (currentTime > 0 && !hasLoggedStartRef.current) {
        hasLoggedStartRef.current = true;
        serverApi.logPlaybackEvent({
          eventType: 'start',
          mediaName: torrentName,
          infoHash: infoHash,
          filePath: selectedFile?.path || selectedFile?.name,
        }).catch((err) => console.error('[VideoPlayerWrapper] Failed to log playback start:', err));
      }

      reportPlaybackDuration(duration);
      if (tmdbId == null || !tmdbType || duration <= 0) return;
      // Notification immédiate à la découverte de la durée (currentTime ≈ 0, avant que le seek
      // de reprise soit appliqué) : ne pas écraser la position sauvegardée par 0 %.
      if (!(currentTime >= MIN_PROGRESS_SAVE_SECONDS) && currentTime < duration) return;
      const progressPercent = (currentTime / duration) * 100;
      // Prefetch épisode suivant dès ~50 % (une seule fois par épisode).
      if (
        progressPercent >= 50 &&
        nextEpisodeInfo &&
        onPrefetchNextEpisode &&
        !hasPrefetchedNextRef.current
      ) {
        hasPrefetchedNextRef.current = true;
        try {
          onPrefetchNextEpisode();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] prefetch next episode failed', e);
        }
      }
      const item: ContentItem = {
        id: String(tmdbId),
        title: torrentName || '',
        type: tmdbType,
        poster: posterUrl ?? undefined,
        tmdbId,
      };
      // Position/durée pour tous les types (seuil générique côté dashboard).
      const episodeInfo = {
        ...(tmdbType === 'tv'
          ? {
              ...(seriesSeasonNum != null ? { season: seriesSeasonNum } : {}),
              ...(seriesEpisodeNum != null ? { episode: seriesEpisodeNum } : {}),
              ...(torrentId ? { variantId: torrentId } : {}),
            }
          : {}),
        positionSeconds: currentTime,
        durationSeconds: duration,
      };
      updateResumeWatching(item, progressPercent, episodeInfo);
      // Épisodes vus + reprise par épisode (carrousels série) — tous lecteurs / plateformes.
      // Films : vu (≥ 90 % ou générique) + reprise NN % sur cartes / détail.
      if (tmdbType === 'movie') {
        recordMovieProgress(tmdbId, currentTime, duration);
      }
      if (tmdbType === 'tv' && seriesSeasonNum != null && seriesEpisodeNum != null) {
        recordEpisodeProgress(tmdbId, seriesSeasonNum, seriesEpisodeNum, currentTime, duration, {
          // Fin (ended / épisode suivant depuis l'overlay) : pousser explicitement « vu ».
          pushToServer: progressPercent >= WATCHED_EPISODE_THRESHOLD_PERCENT,
        });
      }
    },
    [
      tmdbId,
      tmdbType,
      torrentName,
      posterUrl,
      reportPlaybackDuration,
      seriesSeasonNum,
      seriesEpisodeNum,
      torrentId,
      nextEpisodeInfo,
      onPrefetchNextEpisode,
    ]
  );

  const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';
  const STORAGE_INTRO_ALWAYS_SHOW = 'popcorn_intro_always_show';

  useEffect(() => {
    if (wrapperRef) {
      wrapperRef(wrapperElementRef.current);
    }
  }, [wrapperRef]);

  // Arrêter le buffer HLS lors de la fermeture du lecteur (via ref typée)
  useEffect(() => {
    if (!visible && stopBufferRef.current) {
      try {
        stopBufferRef.current();
      } catch (e) {
        console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer:', e);
      }
    }
  }, [visible]);

  // Arrêter le buffer et annuler le retry stream-torrent lors du démontage du composant
  useEffect(() => {
    return () => {
      directStreamRetryTimeoutRef.current && clearTimeout(directStreamRetryTimeoutRef.current);
      directStreamRetryTimeoutRef.current = null;
      if (stopBufferRef.current) {
        try {
          stopBufferRef.current();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer au démontage:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    // Réinitialiser le fallback, la qualité et les retries stream-torrent quand on change de média/session de lecture.
    setForceHlsFallback(false);
    setStreamQuality(
      getNetworkPlaybackProfile(false, { isTv: isTvPlayback }).suggestedMaxHeight,
    );
    setDirectStreamRetryCount(0);
    hasLoggedStartRef.current = false;
    lastLoggedErrorRef.current = null;
  }, [infoHash, selectedFile?.path, directStreamUrl, visible, isTvPlayback]);

  // Afficher l'intro avec préchargement HLS si nécessaire (pas en mode lecture directe)
  if (!directStreamUrl && !effectiveDirectMode && showIntro && selectedFile && hlsFilePath && infoHash) {
    return (
      <IntroVideoWithHlsPreload
        hlsStreamUrl={streamUrl}
        onEnded={() => {
          // Marquer l'intro comme vue (seulement si on n'est pas en mode "toujours afficher")
          try {
            const alwaysShow = localStorage.getItem(STORAGE_INTRO_ALWAYS_SHOW) === '1';
            if (!alwaysShow) {
              localStorage.setItem(STORAGE_INTRO_SKIPPED, '1');
            }
          } catch (e) {
            console.warn('[VideoPlayerWrapper] Erreur localStorage:', e);
          }
          setShowIntro(false);
        }}
        hlsInfoHash={infoHash}
        hlsFilePath={hlsFilePath}
        hlsFileName={selectedFile.name}
        onHlsReady={(hlsInstance) => {
          console.log('[VideoPlayerWrapper] HLS préchargé et prêt:', hlsInstance);
        }}
      />
    );
  }

  if (displayError) {
    return (
      <div 
        ref={wrapperElementRef}
        id="video-player-wrapper" 
        className="fixed inset-0 z-[400] bg-black w-full h-full flex flex-col items-center justify-center p-6"
        style={{
          ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
          display: visible ? 'flex' : 'none',
        }}
      >
        <div ref={errorTrapRef} data-remote-trap className="contents">
        <button
          type="button"
          onClick={handleClosePlayer}
          aria-label={t('common.back') || 'Retour'}
          className="absolute top-4 left-4 flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all border border-white/20 text-white cursor-pointer pointer-events-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="max-w-md w-full bg-black/60 border border-white/10 backdrop-blur-xl p-8 rounded-2xl text-center shadow-2xl flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">
            {sparseOrEmpty
              ? t('playback.sparseOrEmptyTitle') || 'Fichiers vides'
              : t('playback.phase.error') || 'Erreur de lecture'}
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            {sparseOrEmpty
              ? t('playback.sparseOrEmptyDetail') || displayError
              : displayError}
          </p>
          {sparseOrEmpty && onDeleteEmptyFiles && confirmingDeleteEmpty ? (
            <div className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 space-y-3">
              <p className="text-sm text-white/85">
                {t('playback.sparseOrEmptyConfirm') || 'Supprimer les fichiers vides du disque ?'}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteEmpty(false)}
                  data-autofocus
                  className="px-5 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm cursor-pointer"
                >
                  {t('common.back') || 'Retour'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDeleteEmpty(false);
                    onDeleteEmptyFiles();
                  }}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm cursor-pointer"
                >
                  {t('common.confirm') || 'Confirmer'}
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {sparseOrEmpty && onDeleteEmptyFiles && !confirmingDeleteEmpty ? (
              <button
                type="button"
                onClick={() => setConfirmingDeleteEmpty(true)}
                data-autofocus
                className="px-6 py-2 bg-red-600 hover:bg-red-700 active:scale-95 transition-all text-white font-semibold rounded-lg cursor-pointer pointer-events-auto"
              >
                {t('playback.sparseOrEmptyDelete') || 'Supprimer les fichiers vides'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClosePlayer}
              data-autofocus={!(sparseOrEmpty && onDeleteEmptyFiles) || undefined}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 active:scale-95 transition-all text-white font-semibold rounded-lg cursor-pointer pointer-events-auto"
            >
              {t('common.close') || 'Fermer'}
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (!selectedFile && !directStreamUrl) {
    return (
      <div 
        ref={wrapperElementRef}
        id="video-player-wrapper" 
        className="fixed inset-0 z-[400] bg-black w-full h-full"
        style={{
          ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
          display: visible ? 'block' : 'none',
        }}
      >
        <PlayerLoadingOverlay
          message="Chargement des fichiers vidéo..."
          title={torrentName}
          loadingStep={loadingStep}
          progressMessage={progressMessage}
          torrentStats={torrentStats ?? undefined}
          onCancel={handleClosePlayer}
          onAbortDownload={onAbortDownload}
          cancelLabel={t('common.cancel') || 'Annuler'}
          isHlsPreparing
          hasVideoFiles={Boolean(selectedFile)}
        />
      </div>
    );
  }

  // Lecteur HLS : attendre les pistes audio (≤ AUDIO_PROBE_TIMEOUT_MS) avant de construire l'URL.
  if (!audioProbeDone && !playerMountedRef.current && !directStreamUrl && !effectiveDirectMode && !useLucieForThisSource && !useStreamTorrentMode) {
    return (
      <div
        ref={wrapperElementRef}
        id="video-player-wrapper"
        className="fixed inset-0 z-[400] bg-black w-full h-full"
        style={{
          ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
          display: visible ? 'block' : 'none',
        }}
      >
        <PlayerLoadingOverlay
          message={t('playback.loadingVideo')}
          title={torrentName}
          loadingStep={loadingStep}
          progressMessage={progressMessage}
          torrentStats={torrentStats ?? undefined}
          onCancel={handleClosePlayer}
          onAbortDownload={onAbortDownload}
          cancelLabel={t('common.cancel') || 'Annuler'}
          isHlsPreparing
          hasVideoFiles
        />
      </div>
    );
  }

  playerMountedRef.current = true;
  return (
    <div 
      ref={wrapperElementRef}
      id="video-player-wrapper"
      data-tv-player-active={visible ? 'true' : undefined}
      tabIndex={-1}
      className="fixed inset-0 z-[400] bg-black w-full h-full"
      style={{
        ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
        display: visible ? 'block' : 'none',
        ...(isTvPlayback
          ? {}
          : {
              transform: 'translateZ(0)',
              willChange: 'transform',
              backfaceVisibility: 'hidden' as const,
            }),
      }}
    >
      {/* Badges codec : pas sur TV (le wrapper est toujours “fullscreen”, ça reste collé à l’écran). */}
      {!isTvPlayback && !isFullscreen && (
        <div className="absolute top-4 right-4 z-10">
          <QualityBadges
            quality={quality}
            align="right"
            tmdbMatchSource={tmdbMatchSource}
            tmdbMatchConfidence={tmdbMatchConfidence}
          />
        </div>
      )}
      {!isTvPlayback && isFullscreen && (
        <div className="absolute top-4 right-4 z-20">
          <QualityBadges
            quality={quality}
            align="right"
            tmdbMatchSource={tmdbMatchSource}
            tmdbMatchConfidence={tmdbMatchConfidence}
          />
        </div>
      )}

      {/* Message unique après fallback direct → HLS */}
      {showFallbackMessage && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded bg-black/80 text-white text-sm"
          role="status"
        >
          {t('playback.streamingFallbackToHls')}
        </div>
      )}

      <div 
        className={`absolute inset-0 ${isFullscreen ? 'p-0' : isMobile ? 'pt-12 pb-1 px-0' : 'pt-16 pb-1 px-1'}`}
      >
        <div 
          className={`h-full w-full flex flex-col relative ${isFullscreen ? '' : 'max-w-[99vw]'}`}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <UnifiedPlayer
            key={useStreamTorrentMode ? `stream-torrent-${directStreamRetryCount}` : undefined}
            src={streamUrl}
            useDirectPlayer={Boolean(directStreamUrl || effectiveDirectMode || useStreamTorrentMode)}
            useLuciePlayer={useLucieForThisSource && !directStreamUrl && !effectiveDirectMode}
            loading={isLoading}
            loadingMessage={hlsLoadingMessage ?? t('playback.loadingVideo')}
            loadingStep={loadingStep}
            progressMessage={progressMessage ?? undefined}
            torrentStats={torrentStats ?? undefined}
            closeLabel={t('common.close')}
            cancelLabel={t('common.cancel') || 'Annuler'}
            onClose={handleClosePlayer}
            onAbortDownload={onAbortDownload}
            onDirectLoadedData={() => setIsLoading(false)}
            onDirectError={(e) => {
              const videoEl = e.target instanceof HTMLVideoElement ? e.target : null;
              let errDetail = 'Direct video error';
              if (videoEl && videoEl.error) {
                errDetail = `Code ${videoEl.error.code}: ${videoEl.error.message || 'Direct video element error'}`;
              }
              logErrorEvent(errDetail);
              if (useStreamTorrentMode) {
                // Distinguer 401/402 (auth) des 503 (pas encore prêt) avant de retry.
                const probeUrl =
                  (typeof videoEl?.currentSrc === 'string' && videoEl.currentSrc) ||
                  (typeof videoEl?.src === 'string' && videoEl.src) ||
                  '';
                const failAuth = (status: number) => {
                  const msg =
                    status === 402
                      ? 'STREAM_TORRENT_AUTH: Option streaming torrent non active.'
                      : 'STREAM_TORRENT_AUTH: Token invalide ou refusé par le backend.';
                  setLocalPlayerError(msg);
                  onPlaybackError?.(msg);
                  setIsLoading(false);
                };
                const scheduleRetry = () => {
                  const maxRetries = 12;
                  const retryDelayMs = 5000;
                  if (directStreamRetryCount < maxRetries - 1) {
                    console.warn(
                      '[VideoPlayerWrapper] Flux pas encore prêt (503?), nouvelle tentative dans',
                      retryDelayMs / 1000,
                      's…',
                      e
                    );
                    directStreamRetryTimeoutRef.current && clearTimeout(directStreamRetryTimeoutRef.current);
                    setHlsLoadingMessage(
                      t('playback.streamPreparingRetry') ?? 'Préparation du flux, nouvelle tentative…'
                    );
                    setIsLoading(true);
                    directStreamRetryTimeoutRef.current = window.setTimeout(() => {
                      directStreamRetryTimeoutRef.current = null;
                      setDirectStreamRetryCount((c) => c + 1);
                      setHlsLoadingMessage(null);
                    }, retryDelayMs);
                    return;
                  }
                  if (videoEl) {
                    logVideoPlaybackError('VideoPlayerWrapper', videoEl, {
                      note: 'stream-torrent gave up after retries',
                      attempts: maxRetries,
                    });
                  } else {
                    console.error('[VideoPlayerWrapper] Direct video error après', maxRetries, 'tentatives:', e);
                  }
                  setHlsLoadingMessage(
                    t('playback.torrentUnavailableOnIndexer') ??
                      "Ce torrent n'est plus disponible sur l'indexeur. Choisissez une autre source."
                  );
                  setIsLoading(false);
                };
                if (probeUrl) {
                  fetch(probeUrl, { method: 'GET', headers: { Range: 'bytes=0-0' } })
                    .then((res) => {
                      if (res.status === 401 || res.status === 402) {
                        failAuth(res.status);
                        return;
                      }
                      if (res.status === 502 || res.status === 503) {
                        scheduleRetry();
                        return;
                      }
                      // Autre erreur (404, etc.) : pas de retry infini — remonter pour retélécharger
                      if (!res.ok) {
                        const msg = `STREAM_TORRENT_AUTH: Flux stream-torrent indisponible (${res.status}).`;
                        setLocalPlayerError(msg);
                        onPlaybackError?.(msg);
                        setIsLoading(false);
                        return;
                      }
                      scheduleRetry();
                    })
                    .catch(() => scheduleRetry());
                  return;
                }
                scheduleRetry();
                return;
              }
              if (videoEl) {
                logVideoPlaybackError('VideoPlayerWrapper', videoEl, {
                  note: 'direct playback',
                  willTryHlsFallback: !directStreamUrl && (isDirectMode || isBrowserNativeLocal) && !forceHlsFallback,
                });
              } else {
                console.error('[VideoPlayerWrapper] Direct video error:', e);
              }
              if (!directStreamUrl && (isDirectMode || isBrowserNativeLocal) && !forceHlsFallback) {
                console.warn('[VideoPlayerWrapper] Fallback automatique vers HLS après échec du mode direct.');
                emitPlaybackStep('fallback_direct_to_hls', { message: 'Direct stream failed' });
                emitPlaybackStep('fallback_message_shown');
                setIsLoading(true);
                setForceHlsFallback(true);
                setShowFallbackMessage(true);
                window.setTimeout(() => setShowFallbackMessage(false), 5000);
                return;
              }
              setIsLoading(false);
            }}
            hlsProps={{
              infoHash,
              fileName: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              torrentName: torrentName || selectedFile?.name || 'video',
              posterUrl: posterUrl ?? undefined,
              logoUrl: logoUrl ?? undefined,
              synopsis: synopsis ?? undefined,
              releaseDate: releaseDate ?? undefined,
              torrentId,
              filePath:
                hlsFilePath && hlsFilePath !== 'direct'
                  ? hlsFilePath
                  : selectedFile?.path || selectedFile?.name || torrentName || 'video',
              tmdbId,
              tmdbType,
              seriesSeason: seriesSeasonNum ?? undefined,
              seriesEpisode: seriesEpisodeNum ?? undefined,
              variantId: torrentId,
              startFromBeginning,
              initialSeekSeconds,
              isSeries,
              nextEpisodeInfo,
              onPlayNextEpisode,
              previousEpisodeInfo,
              onPlayPreviousEpisode,
              onClose: handleClosePlayer,
              canUseSeekReload: computeCanUseSeekReload({
                infoHash,
                streamBackendUrl,
                filePath:
                  hlsFilePath && hlsFilePath !== 'direct'
                    ? hlsFilePath
                    : selectedFile?.path ?? selectedFile?.name ?? null,
              }),
              baseUrl,
              isRemoteStream: !!streamBackendUrl?.trim(),
              onLoadingMessageChange: setHlsLoadingMessage,
              streamBackendUrl: streamBackendUrl ?? undefined,
              stopBufferRef,
              maxHeight: streamQuality,
              streamQuality,
              onQualityChange: setStreamQuality,
              audioIndex,
              sourceAudioTracks,
              onAudioIndexChange: setAudioIndex,
              useStreamTorrentUrl: useStreamTorrentMode,
              scrubThumbnails,
              scrubThumbnailsLoading,
            }}
            lucieProps={{
              infoHash,
              fileName: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              torrentName: torrentName || selectedFile?.name || 'video',
              posterUrl: posterUrl ?? undefined,
              logoUrl: logoUrl ?? undefined,
              synopsis: synopsis ?? undefined,
              releaseDate: releaseDate ?? undefined,
              torrentId,
              filePath: selectedFile?.path || selectedFile?.name || torrentName || 'video',
              tmdbId,
              tmdbType,
              seriesSeason: seriesSeasonNum ?? undefined,
              seriesEpisode: seriesEpisodeNum ?? undefined,
              variantId: torrentId,
              startFromBeginning,
              isSeries,
              nextEpisodeInfo,
              onPlayNextEpisode,
              onClose: handleClosePlayer,
              baseUrl,
              stopBufferRef,
              scrubThumbnails,
              scrubThumbnailsLoading,
            }}
            onHlsLoadingChange={(loading) => setIsLoading(loading)}
            onHlsError={(e) => {
              console.error('[VideoPlayerWrapper] Player error:', e);
              const errDetail = e?.message || (typeof e === 'string' ? e : 'HLS / Lucie player error');
              logErrorEvent(errDetail);
              if (isSparseOrEmptyMessage(errDetail)) {
                setLocalPlayerError(errDetail);
                onPlaybackError?.(errDetail);
                setIsLoading(false);
                return;
              }
              if (isLucieMode && !forceHlsFallback) {
                console.warn('[VideoPlayerWrapper] Fallback automatique vers HLS après échec Lucie (ex. manifest 404).');
                emitPlaybackStep('fallback_lucie_to_hls', { message: e?.message ?? 'Lucie failed' });
                emitPlaybackStep('fallback_message_shown');
                setIsLoading(true);
                setForceHlsFallback(true);
                setShowFallbackMessage(true);
                window.setTimeout(() => setShowFallbackMessage(false), 5000);
                return;
              }
              setIsLoading(false);
            }}
            onProgress={handlePlaybackProgress}
          />
        </div>
      </div>
    </div>
  );
}
