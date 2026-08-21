import { useEffect, useState, useRef, useMemo } from 'preact/hooks';
import { isTVPlatform, isWebOSTV, stampTvPlatformHints } from '../../../../lib/utils/device-detection';
import { useSeekStepAcceleration } from './useSeekStepAcceleration';
import { toggleFullscreen } from './useFullscreen';
import { scrubEffectiveDuration, scrubTimeForIndex } from '../components/video-controls/scrubMath';

const BACK_KEY_CODES = [27, 8, 461, 10009, 4, 166, 457];
const BACK_KEYS = ['Escape', 'Backspace', 'Back', 'BrowserBack', 'GoBack', 'XF86Back'];

/** Overlay buffering réellement visible dans le lecteur — pas un reste ailleurs dans la page. */
function visiblePlayerPlaybackOverlay(): HTMLElement | null {
  const root =
    document.getElementById('video-player-wrapper') ||
    document.getElementById('hls-player-container');
  const el = (root?.querySelector('[data-playback-overlay]') ?? null) as HTMLElement | null;
  if (!el) return null;
  if (!el.getClientRects().length) return null;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  return el;
}

/** Après arrêt des flèches : un seul seek vers la vignette / position preview. */
const SCRUB_SETTLE_MS = 2000;
const PREVIEW_SETTLE_MS = 1000;
/** webOS : hide plus rapide ; autres TV : 5s. */
const CONTROLS_HIDE_MS_WEBOS = 3200;
const CONTROLS_HIDE_MS_TV = 5000;

/** Qualités du menu Paramètres TV (même liste que le chrome PC). */
export const TV_QUALITY_VALUES: Array<number | null> = [null, 1080, 720, 480, 360];

export interface SeekPreviewInfo {
  targetTime: number;
  direction: 'left' | 'right';
  stepSeconds: number;
}

interface UseTVPlayerNavigationProps {
  showControls: boolean;
  setShowControls: (show: boolean | ((prev: boolean) => boolean)) => void;
  onPlayPause: () => void;
  /** Seek immédiat (fallback boutons / sans preview). Préférer le chemin scrub/preview. */
  onSeek: (direction: 'left' | 'right', stepSeconds?: number) => void;
  onVolumeChange: (direction: 'up' | 'down') => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onClose?: () => void;
  onOpenQualityMenu?: () => void;
  onToggleSubtitles?: () => void;
  /** Qualité HLS : ouvre le sélecteur dans le dock TV. */
  onSelectQuality?: (height: number | null) => void;
  streamQuality?: number | null;
  /** Zoom contain/cover. */
  onToggleFillMode?: () => void;
  duration: number;
  currentTime: number;
  /** Si false, ne pas auto-masquer (pause). */
  isPlaying?: boolean;
  /** Vidéo courante — cross-check pause sur webOS (isPlaying peut rester faux). */
  videoRef?: { current: HTMLVideoElement | null };
  progressBarRef?: { current: HTMLElement | null };
  /** Miniatures scrub : flèches = naviguer les vignettes, Enter / settle = seek. */
  scrubThumbnails?: { count: number; intervalSeconds?: number; durationSeconds?: number } | null;
  /** Commit seek (vignette ou preview sans scrub). */
  onScrubSeek?: (timeSeconds: number) => void;
  /** Feedback UI pendant preview sans scrub (pas de seek). */
  onSeekPreview?: (info: SeekPreviewInfo | null) => void;
}

export function useTVPlayerNavigation({
  showControls,
  setShowControls,
  onPlayPause,
  onSeek,
  onVolumeChange: _onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onClose,
  onOpenQualityMenu,
  onToggleSubtitles,
  onSelectQuality,
  streamQuality = null,
  onToggleFillMode,
  progressBarRef,
  scrubThumbnails = null,
  onScrubSeek,
  onSeekPreview,
  duration,
  currentTime,
  isPlaying = true,
  videoRef,
}: UseTVPlayerNavigationProps) {
  // App simple (URL) : stamp avant isTVPlatform() pour désactiver la Magic Remote / activer le hide.
  stampTvPlatformHints();
  const [focusedControlIndex, setFocusedControlIndex] = useState(isTVPlatform() || isWebOSTV() ? 2 : 0);
  const [focusedOnProgress, setFocusedOnProgress] = useState(false);
  const [focusedOnScrub, setFocusedOnScrub] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusIndex, setSettingsFocusIndex] = useState(0);
  const isTV = isTVPlatform() || isWebOSTV();
  void _onVolumeChange; // volume système TV — plus de volume in-app
  const focusedOnScrubRef = useRef(false);
  focusedOnScrubRef.current = focusedOnScrub;
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const onSelectQualityRef = useRef(onSelectQuality);
  onSelectQualityRef.current = onSelectQuality;
  const streamQualityRef = useRef(streamQuality);
  streamQualityRef.current = streamQuality;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const videoRefInternal = useRef(videoRef?.current ?? null);
  videoRefInternal.current = videoRef?.current ?? null;

  /** true si la vidéo est réellement en pause (DOM prioritaire sur webOS). */
  const isVideoPaused = () => {
    const v = videoRefInternal.current;
    if (v) return v.paused;
    return !isPlayingRef.current;
  };

  const scrubThumbnailsActive = !!(scrubThumbnails && scrubThumbnails.count > 0);
  const [tvScrubIndex, setTvScrubIndex] = useState(0);

  const tvScrubIndexRef = useRef(0);
  tvScrubIndexRef.current = tvScrubIndex;
  const scrubThumbnailsRef = useRef(scrubThumbnails);
  scrubThumbnailsRef.current = scrubThumbnails;
  const onScrubSeekRef = useRef(onScrubSeek);
  onScrubSeekRef.current = onScrubSeek;
  const onSeekPreviewRef = useRef(onSeekPreview);
  onSeekPreviewRef.current = onSeekPreview;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const showControlsRef = useRef(showControls);
  showControlsRef.current = showControls;
  const scrubThumbnailsActiveRef = useRef(scrubThumbnailsActive);
  scrubThumbnailsActiveRef.current = scrubThumbnailsActive;

  const scrubAutoSeekTimeoutRef = useRef<number | null>(null);
  const previewSeekTimeoutRef = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const hasUserNavigatedScrubRef = useRef(false);
  const [isBrowsingScrub, setIsBrowsingScrub] = useState(false);
  /** Position preview accumulée (sans scrub) — commit au settle. */
  const previewTargetTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!showControls) {
      hasUserNavigatedScrubRef.current = false;
      setIsBrowsingScrub(false);
      setSettingsOpen(false);
      previewTargetTimeRef.current = null;
      onSeekPreviewRef.current?.(null);
      if (previewSeekTimeoutRef.current != null) {
        window.clearTimeout(previewSeekTimeoutRef.current);
        previewSeekTimeoutRef.current = null;
      }
    }
  }, [showControls]);

  const timeForScrubIndex = (idx: number) => {
    const st = scrubThumbnailsRef.current;
    if (!st || !st.count) return 0;
    const dur = scrubEffectiveDuration(durationRef.current, st);
    if (!dur) return 0;
    return scrubTimeForIndex(idx, st, dur);
  };

  const clearControlsHideTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  };

  /** true pendant navigation flèches (vignettes ou preview temps). */
  const isActivelyBrowsingTimeline = () =>
    (scrubThumbnailsActiveRef.current && hasUserNavigatedScrubRef.current) ||
    previewTargetTimeRef.current != null;

  const scheduleControlsHide = () => {
    clearControlsHideTimeout();
    if (isVideoPaused()) return;
    if (visiblePlayerPlaybackOverlay()) return;
    if (isActivelyBrowsingTimeline()) return;
    if (settingsOpenRef.current) return;
    const ms = isWebOSTV() ? CONTROLS_HIDE_MS_WEBOS : CONTROLS_HIDE_MS_TV;
    controlsTimeoutRef.current = window.setTimeout(() => {
      controlsTimeoutRef.current = null;
      if (isVideoPaused()) return;
      if (isActivelyBrowsingTimeline()) return;
      if (visiblePlayerPlaybackOverlay()) return;
      if (settingsOpenRef.current) return;
      setShowControls(false);
      setFocusedOnProgress(false);
    }, ms);
  };

  const commitScrubSeek = () => {
    const targetTime = timeForScrubIndex(tvScrubIndexRef.current);
    hasUserNavigatedScrubRef.current = false;
    setIsBrowsingScrub(false);
    if (onScrubSeekRef.current) {
      onScrubSeekRef.current(targetTime);
    }
    scheduleControlsHide();
  };

  const commitPreviewSeek = () => {
    const t = previewTargetTimeRef.current;
    previewTargetTimeRef.current = null;
    onSeekPreviewRef.current?.(null);
    if (t == null || !Number.isFinite(t)) return;
    if (onScrubSeekRef.current) {
      onScrubSeekRef.current(t);
    }
    scheduleControlsHide();
  };

  const scheduleScrubSettle = () => {
    if (scrubAutoSeekTimeoutRef.current != null) {
      window.clearTimeout(scrubAutoSeekTimeoutRef.current);
    }
    scrubAutoSeekTimeoutRef.current = window.setTimeout(() => {
      scrubAutoSeekTimeoutRef.current = null;
      if (!hasUserNavigatedScrubRef.current) return;
      commitScrubSeek();
    }, SCRUB_SETTLE_MS) as unknown as number;
  };

  const schedulePreviewSettle = () => {
    if (previewSeekTimeoutRef.current != null) {
      window.clearTimeout(previewSeekTimeoutRef.current);
    }
    previewSeekTimeoutRef.current = window.setTimeout(() => {
      previewSeekTimeoutRef.current = null;
      commitPreviewSeek();
    }, PREVIEW_SETTLE_MS) as unknown as number;
  };

  // Sync l'index scrub avec la lecture tant que l'utilisateur ne navigue pas les vignettes.
  useEffect(() => {
    if (!isTV || !scrubThumbnailsActive || !showControls) return;
    if (hasUserNavigatedScrubRef.current) return;
    const st = scrubThumbnails!;
    const dur = scrubEffectiveDuration(duration, st);
    if (!dur || !st.count) {
      setTvScrubIndex(0);
      return;
    }
    const interval = st.intervalSeconds && st.intervalSeconds > 0 ? st.intervalSeconds : dur / st.count;
    const idx = Math.min(st.count - 1, Math.max(0, Math.floor(currentTime / interval)));
    setTvScrubIndex((prev) => (prev === idx ? prev : idx));
  }, [isTV, scrubThumbnailsActive, showControls, currentTime, duration, scrubThumbnails]);

  // Focus scrub par défaut dès que les vignettes sont dispo.
  useEffect(() => {
    if (!isTV || !showControls) return;
    if (scrubThumbnailsActive) {
      setFocusedOnProgress(false);
      setFocusedOnScrub(true);
    } else {
      setFocusedOnScrub(false);
    }
  }, [isTV, showControls, scrubThumbnailsActive]);

  // Debounce settle scrub (dépend de l'index).
  useEffect(() => {
    if (!isTV || !showControls) return;
    if (!scrubThumbnailsActive || !focusedOnScrubRef.current) return;
    if (!hasUserNavigatedScrubRef.current) return;
    scheduleScrubSettle();
    return () => {
      if (scrubAutoSeekTimeoutRef.current != null) {
        window.clearTimeout(scrubAutoSeekTimeoutRef.current);
        scrubAutoSeekTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTV, showControls, scrubThumbnailsActive, tvScrubIndex]);

  const { getSeekStep, recordKeyDown, recordKeyUp } = useSeekStepAcceleration();
  const hasBack = !!onClose;
  const toggleSettings = () => {
    setFocusedOnScrub(false);
    setSettingsOpen((open) => {
      const next = !open;
      if (next) {
        const idx = TV_QUALITY_VALUES.findIndex((v) => v === streamQualityRef.current);
        setSettingsFocusIndex(idx >= 0 ? idx : 0);
      }
      return next;
    });
  };
  const controls = useMemo(() => {
    if (isTV) {
      const c: { id: string; action: () => void }[] = [];
      if (onClose) c.push({ id: 'back', action: onClose });
      c.push(
        { id: 'skipback', action: () => onSeek('left', 10) },
        { id: 'playpause', action: onPlayPause },
        { id: 'skipforward', action: () => onSeek('right', 10) },
      );
      if (onSelectQuality) {
        c.push({
          id: 'settings',
          action: toggleSettings,
        });
      }
      if (onToggleFillMode) c.push({ id: 'fillmode', action: onToggleFillMode });
      return c;
    }
    const c = [{ id: 'playpause', action: onPlayPause }];
    c.push({ id: 'mute', action: onToggleMute });
    if (onOpenQualityMenu) c.push({ id: 'quality', action: onOpenQualityMenu });
    c.push({ id: 'fullscreen', action: onToggleFullscreen });
    if (hasBack) c.unshift({ id: 'back', action: onClose! });
    return c;
  }, [isTV, hasBack, onClose, onPlayPause, onToggleMute, onToggleFullscreen, onOpenQualityMenu, onToggleSubtitles, onSeek, onSelectQuality, onToggleFillMode]);

  const isBackKey = (e: KeyboardEvent) =>
    BACK_KEYS.includes(e.key) || BACK_KEY_CODES.includes(e.keyCode ?? e.which);

  const handleBack = () => {
    if (onClose) onClose();
    else onToggleFullscreen();
  };

  const resetControlsTimeout = () => {
    scheduleControlsHide();
  };

  /** Pas de vignettes en index selon l'accélération (10/30/60s → 1/3/6 vignettes à 10s d'intervalle). */
  const scrubStepFromAcceleration = (direction: 'left' | 'right') => {
    const stepSec = getSeekStep(direction);
    recordKeyDown(direction);
    const interval = scrubThumbnailsRef.current?.intervalSeconds;
    const base = interval && interval > 0 ? interval : 10;
    return Math.max(1, Math.round(stepSec / base));
  };

  const navigateScrub = (direction: 'left' | 'right') => {
    const count = scrubThumbnailsRef.current?.count ?? 0;
    if (count <= 0) return;
    const step = scrubStepFromAcceleration(direction);
    hasUserNavigatedScrubRef.current = true;
    setIsBrowsingScrub(true);
    setFocusedOnProgress(false);
    setFocusedOnScrub(true);
    setTvScrubIndex((prev) => {
      if (direction === 'left') return Math.max(0, prev - step);
      return Math.min(count - 1, prev + step);
    });
    // Settle géré par l'effet tvScrubIndex ; on s'assure aussi ici si l'index ne change pas (borne).
    scheduleScrubSettle();
    // Annule un éventuel masquage pendant le parcours des vignettes.
    scheduleControlsHide();
  };

  const navigatePreviewSeek = (direction: 'left' | 'right') => {
    const dur = durationRef.current;
    if (!dur || !Number.isFinite(dur)) return;
    const step = getSeekStep(direction);
    recordKeyDown(direction);
    const base =
      previewTargetTimeRef.current != null
        ? previewTargetTimeRef.current
        : currentTimeRef.current;
    const next =
      direction === 'left'
        ? Math.max(0, base - step)
        : Math.min(dur, base + step);
    previewTargetTimeRef.current = next;
    onSeekPreviewRef.current?.({
      targetTime: next,
      direction,
      stepSeconds: step,
    });
    if (!showControlsRef.current) setShowControls(true);
    schedulePreviewSettle();
    scheduleControlsHide();
  };

  useEffect(() => {
    if (!isTV) return;

    const triedFullscreenRef = { current: false };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const overlay = visiblePlayerPlaybackOverlay();
      if (overlay && isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleBack();
        return;
      }

      e.stopPropagation();

      if (!triedFullscreenRef.current) {
        triedFullscreenRef.current = true;
        const wrap = document.getElementById('video-player-wrapper');
        if (wrap) toggleFullscreen(wrap).catch(() => {});
      }

      if (isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (settingsOpenRef.current) {
          setSettingsOpen(false);
          resetControlsTimeout();
          return;
        }
        if (!showControlsRef.current) {
          setShowControls(true);
          resetControlsTimeout();
          return;
        }
        handleBack();
        return;
      }

      // Première touche : afficher le dock, sans seek / play.
      if (!showControlsRef.current) {
        e.preventDefault();
        setShowControls(true);
        resetControlsTimeout();
        return;
      }

      resetControlsTimeout();

      const kc = e.keyCode ?? e.which;
      const keyRaw = e.key || '';
      const key =
        keyRaw ||
        (kc === 13 || kc === 23 || kc === 66
          ? 'Enter'
          : kc === 32
            ? ' '
            : kc === 19
              ? 'ArrowUp'
              : kc === 20
                ? 'ArrowDown'
                : kc === 21
                  ? 'ArrowLeft'
                  : kc === 22
                    ? 'ArrowRight'
                    : kc === 37
                      ? 'ArrowLeft'
                      : kc === 38
                        ? 'ArrowUp'
                        : kc === 39
                          ? 'ArrowRight'
                          : kc === 40
                            ? 'ArrowDown'
                            : '');
      const codeRaw = (e as any).code as string | undefined;
      const fromCode =
        codeRaw === 'ArrowLeft' ||
        codeRaw === 'ArrowRight' ||
        codeRaw === 'Enter' ||
        codeRaw === 'Space'
          ? codeRaw === 'Space'
            ? ' '
            : codeRaw
          : codeRaw === 'DPadLeft'
            ? 'ArrowLeft'
            : codeRaw === 'DPadRight'
              ? 'ArrowRight'
              : codeRaw === 'DPadCenter'
                ? 'Enter'
                : '';
      const keyNormalized =
        (key === 'Left'
          ? 'ArrowLeft'
          : key === 'Right'
            ? 'ArrowRight'
            : key === 'Select'
              ? 'Enter'
              : key) || fromCode;

      if (kc === 23) e.preventDefault();

      if (kc === 415 || keyNormalized === 'MediaPlayPause') {
        e.preventDefault();
        onPlayPause();
        return;
      }

      const isLeft =
        kc === 412 || kc === 21 || keyNormalized === 'ArrowLeft';
      const isRight =
        kc === 417 || kc === 22 || keyNormalized === 'ArrowRight';
      const isConfirm =
        kc === 23 || keyNormalized === 'Enter' || keyNormalized === ' ';

      if (settingsOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (isLeft || keyNormalized === 'ArrowUp') {
          setSettingsFocusIndex((i) => Math.max(0, i - 1));
        } else if (isRight || keyNormalized === 'ArrowDown') {
          setSettingsFocusIndex((i) => Math.min(TV_QUALITY_VALUES.length - 1, i + 1));
        } else if (isConfirm) {
          setSettingsFocusIndex((i) => {
            onSelectQualityRef.current?.(TV_QUALITY_VALUES[i] ?? null);
            return i;
          });
          setSettingsOpen(false);
        }
        resetControlsTimeout();
        return;
      }

      const onButtonRow =
        showControlsRef.current &&
        !focusedOnScrubRef.current &&
        !focusedOnProgress;

      // Rangée de boutons TV : gauche/droite change de contrôle (pas seek)
      if (isTV && onButtonRow && (isLeft || isRight)) {
        e.preventDefault();
        e.stopPropagation();
        if (!showControlsRef.current) setShowControls(true);
        setFocusedControlIndex((idx) => {
          if (isLeft) return Math.max(0, idx - 1);
          return Math.min(controls.length - 1, idx + 1);
        });
        resetControlsTimeout();
        return;
      }

      // --- Scrub : flèches = preview vignettes UNIQUEMENT (jamais onSeek / reload HLS) ---
      if (scrubThumbnailsActiveRef.current && (isLeft || isRight)) {
        e.preventDefault();
        e.stopPropagation();
        if (!showControlsRef.current) setShowControls(true);
        navigateScrub(isLeft ? 'left' : 'right');
        resetControlsTimeout();
        return;
      }

      // Confirm scrub (Enter / OK)
      if (scrubThumbnailsActiveRef.current && focusedOnScrubRef.current && isConfirm) {
        e.preventDefault();
        e.stopPropagation();
        if (scrubAutoSeekTimeoutRef.current != null) {
          window.clearTimeout(scrubAutoSeekTimeoutRef.current);
          scrubAutoSeekTimeoutRef.current = null;
        }
        if (hasUserNavigatedScrubRef.current) {
          commitScrubSeek();
        } else {
          // Enter sans navigation → play/pause via contrôles
          if (showControlsRef.current) {
            const control = controls[focusedControlIndex];
            if (control) control.action();
          } else onPlayPause();
        }
        resetControlsTimeout();
        return;
      }

      // --- Sans scrub : preview + settle (pas de seek à chaque flèche) ---
      if (!scrubThumbnailsActiveRef.current && (isLeft || isRight)) {
        e.preventDefault();
        e.stopPropagation();
        navigatePreviewSeek(isLeft ? 'left' : 'right');
        resetControlsTimeout();
        return;
      }

      if (
        !showControlsRef.current &&
        [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(keyNormalized)
      ) {
        setShowControls(true);
      }

      if (showControlsRef.current && keyNormalized) resetControlsTimeout();

      switch (keyNormalized) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          // Commit preview en cours si présent
          if (previewTargetTimeRef.current != null) {
            if (previewSeekTimeoutRef.current != null) {
              window.clearTimeout(previewSeekTimeoutRef.current);
              previewSeekTimeoutRef.current = null;
            }
            commitPreviewSeek();
            return;
          }
          if (showControlsRef.current) {
            if (focusedOnProgress) onPlayPause();
            else {
              const control = controls[focusedControlIndex];
              if (control) control.action();
            }
          } else onPlayPause();
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (showControlsRef.current && scrubThumbnailsActiveRef.current) {
            setFocusedOnProgress(false);
            setFocusedOnScrub(true);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (showControlsRef.current && focusedOnScrubRef.current) {
            setFocusedOnScrub(false);
            const playIdx = controls.findIndex((c) => c.id === 'playpause');
            setFocusedControlIndex(playIdx >= 0 ? playIdx : 0);
          }
          break;
        case 'm':
        case 'M':
          // Mute in-app inutile sur TV.
          if (isTV) break;
          e.preventDefault();
          onToggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          onToggleFullscreen();
          break;
      }
    };

    const handleWebOSBack = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      handleBack();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const kc = e.keyCode ?? e.which;
      const key = e.key || (kc === 37 ? 'ArrowLeft' : kc === 39 ? 'ArrowRight' : '');
      if (key === 'ArrowLeft' || key === 'ArrowRight' || kc === 412 || kc === 417) recordKeyUp();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('webosback', handleWebOSBack);
    document.addEventListener('webOSBackButton', handleWebOSBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('webosback', handleWebOSBack);
      document.removeEventListener('webOSBackButton', handleWebOSBack);
    };
  }, [
    isTV,
    hasBack,
    focusedControlIndex,
    focusedOnProgress,
    controls,
    onPlayPause,
    onSeek,
    onToggleMute,
    onToggleFullscreen,
    onClose,
    onToggleSubtitles,
    onSelectQuality,
    onToggleFillMode,
    setShowControls,
    getSeekStep,
    recordKeyDown,
    recordKeyUp,
    progressBarRef,
  ]);

  // Magic Remote : le pointeur n’envoie pas toujours de flèches. Révéler le dock
  // seulement quand le curseur est en bas (évite le gyro webOS qui bloque le hide).
  useEffect(() => {
    if (!isTV) return;
    let last = 0;
    const revealFromPointer = (e: MouseEvent) => {
      const h = window.innerHeight || 1;
      if (e.clientY < h * 0.72) return;
      const now = Date.now();
      if (now - last < 250) return;
      last = now;
      if (!showControlsRef.current) setShowControls(true);
      scheduleControlsHide();
    };
    window.addEventListener('mousemove', revealFromPointer, { passive: true });
    window.addEventListener('pointermove', revealFromPointer, { passive: true });
    return () => {
      window.removeEventListener('mousemove', revealFromPointer);
      window.removeEventListener('pointermove', revealFromPointer);
    };
  }, [isTV, setShowControls]);

  // Afficher les commandes une fois la modal partie (le timer de mount les masquait trop tôt).
  useEffect(() => {
    if (!isTV) return;
    let revealed = false;
    const tryReveal = () => {
      if (visiblePlayerPlaybackOverlay()) {
        revealed = false;
        clearControlsHideTimeout();
        return;
      }
      if (revealed) return;
      revealed = true;
      setShowControls(true);
      scheduleControlsHide();
    };
    tryReveal();
    const id = window.setInterval(tryReveal, 200);
    return () => window.clearInterval(id);
  }, [isTV, setShowControls]);

  useEffect(() => {
    if (!isTV) return;
    const playIdx = controls.findIndex((c) => c.id === 'playpause');
    if (playIdx >= 0) setFocusedControlIndex(playIdx);
  }, [isTV, hasBack]);

  useEffect(() => {
    // TV dock : rester sur la rangée de boutons (gauche/droite = focus, pas seek).
    if (!isTV) return;
    setFocusedOnProgress(false);
  }, [isTV, showControls]);

  useEffect(() => {
    if (!isTV || !showControls) {
      clearControlsHideTimeout();
      return;
    }
    if (visiblePlayerPlaybackOverlay()) {
      clearControlsHideTimeout();
      return;
    }
    if (isVideoPaused()) {
      clearControlsHideTimeout();
      return;
    }
    if (settingsOpen) {
      clearControlsHideTimeout();
      return;
    }
    scheduleControlsHide();
  }, [isTV, showControls, isPlaying, setShowControls, settingsOpen]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      if (scrubAutoSeekTimeoutRef.current != null) {
        window.clearTimeout(scrubAutoSeekTimeoutRef.current);
      }
      if (previewSeekTimeoutRef.current != null) {
        window.clearTimeout(previewSeekTimeoutRef.current);
      }
    };
  }, []);

  return {
    isTV,
    focusedControlIndex,
    setFocusedControlIndex,
    focusedControlId: controls[Math.min(focusedControlIndex, Math.max(0, controls.length - 1))]?.id ?? 'playpause',
    focusedOnProgress,
    setFocusedOnProgress,
    hasBack,
    controlsCount: controls.length,
    tvScrubIndex,
    focusedOnScrub,
    tvScrubBrowsing: isBrowsingScrub,
    settingsOpen,
    settingsFocusIndex,
    toggleSettings,
  };
}
