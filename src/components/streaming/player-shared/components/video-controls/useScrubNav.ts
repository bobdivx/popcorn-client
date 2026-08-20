import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { serverApi } from '../../../../../lib/client/server-api';
import type { ScrubThumbnailsMeta } from '../../types/scrubThumbnails';
import {
  scrubBaseUrl,
  scrubEffectiveDuration,
  scrubIndexFromTimelinePercent,
  scrubTimeForIndex,
  scrubUrlForIndex,
} from './scrubMath';

export function useScrubNav(options: {
  scrubEnabled: boolean;
  scrubThumbnails: ScrubThumbnailsMeta | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isTV: boolean;
  showControls: boolean;
  tvScrubIndexExternal?: number;
  onSeekToTime?: (timeSeconds: number) => void;
  /** Afficher les commandes (flèches avec chrome masqué). */
  onRevealControls?: () => void;
}) {
  const {
    scrubEnabled,
    scrubThumbnails,
    duration,
    currentTime,
    isPlaying,
    isTV,
    showControls,
    tvScrubIndexExternal,
    onSeekToTime,
    onRevealControls,
  } = options;

  const [tvScrubIndexInternal, setTvScrubIndexInternal] = useState(0);
  /** Drag / scrub barre en cours : preview uniquement, pas de seek HLS. */
  const [isDraggingScrub, setIsDraggingScrub] = useState(false);
  /** Flèches / swipe carrousel : l’utilisateur parcourt les vignettes (pas encore seek). */
  const [isBrowsingScrub, setIsBrowsingScrub] = useState(false);
  /** Temps preview pendant un drag (avec ou sans vignettes). */
  const [dragPreviewTime, setDragPreviewTime] = useState<number | null>(null);
  const [dragPreviewPercent, setDragPreviewPercent] = useState<number | null>(null);

  const tvScrubIndex =
    isTV && tvScrubIndexExternal != null ? tvScrubIndexExternal : tvScrubIndexInternal;

  const scrubBase =
    scrubEnabled && scrubThumbnails
      ? scrubBaseUrl(serverApi.getServerUrl(), scrubThumbnails.mediaId)
      : '';

  const getEffectiveDuration = () => scrubEffectiveDuration(duration, scrubThumbnails);

  const getScrubUrlForIndex = (idx: number) => {
    if (!scrubEnabled || !scrubThumbnails || !scrubBase) return '';
    return scrubUrlForIndex(scrubBase, scrubThumbnails.count, idx, scrubThumbnails.mediaId);
  };

  const timeForScrubIndex = (idx: number) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || !scrubThumbnails || effectiveDuration <= 0) return 0;
    return scrubTimeForIndex(idx, scrubThumbnails, effectiveDuration);
  };

  const scrubThumbnailsRef = useRef(scrubThumbnails);
  scrubThumbnailsRef.current = scrubThumbnails;
  const timeForScrubIndexRef = useRef(timeForScrubIndex);
  timeForScrubIndexRef.current = timeForScrubIndex;
  const tvScrubInternalRef = useRef(tvScrubIndexInternal);
  tvScrubInternalRef.current = tvScrubIndexInternal;
  const onSeekToTimeRef = useRef(onSeekToTime);
  onSeekToTimeRef.current = onSeekToTime;
  const onRevealControlsRef = useRef(onRevealControls);
  onRevealControlsRef.current = onRevealControls;
  const showControlsRef = useRef(showControls);
  showControlsRef.current = showControls;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const isBrowsingScrubRef = useRef(isBrowsingScrub);
  isBrowsingScrubRef.current = isBrowsingScrub;
  const skipStripHideTimeoutRef = useRef<number | null>(null);
  const userScrubbedRef = useRef(false);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDraggingScrub;
  const dragPreviewTimeRef = useRef<number | null>(null);
  dragPreviewTimeRef.current = dragPreviewTime;

  const prevShowControlsRef = useRef(false);
  const scrubMetaKey =
    scrubEnabled && scrubThumbnails
      ? `${scrubThumbnails.mediaId}:${scrubThumbnails.count}:${scrubThumbnails.intervalSeconds ?? 'n'}`
      : '';
  const prevScrubMetaKeyRef = useRef('');

  useEffect(() => {
    if (!showControls) setIsBrowsingScrub(false);
  }, [showControls]);

  const resetScrubToPlayhead = useCallback(() => {
    const st = scrubThumbnailsRef.current;
    if (!st?.count) return;
    const effectiveDuration = scrubEffectiveDuration(duration, st);
    if (effectiveDuration <= 0) return;
    const pct = (currentTime / effectiveDuration) * 100;
    const idx = scrubIndexFromTimelinePercent(pct, effectiveDuration, st);
    setTvScrubIndexInternal((prev) => (prev === idx ? prev : idx));
  }, [duration, currentTime]);

  useEffect(() => {
    const wasOpen = prevShowControlsRef.current;
    prevShowControlsRef.current = showControls;
    if (wasOpen || !showControls || !scrubEnabled || isTV) return;
    const st = scrubThumbnailsRef.current;
    if (!st || !st.count) return;
    const effectiveDuration = scrubEffectiveDuration(duration, st);
    if (effectiveDuration <= 0) return;
    const pct = (currentTime / effectiveDuration) * 100;
    const idx = scrubIndexFromTimelinePercent(pct, effectiveDuration, st);
    setTvScrubIndexInternal(idx);
  }, [showControls, scrubEnabled, isTV, scrubMetaKey, duration]);

  useEffect(() => {
    if (!scrubMetaKey) return;
    if (scrubMetaKey === prevScrubMetaKeyRef.current) return;
    prevScrubMetaKeyRef.current = scrubMetaKey;
    if (!showControls || isTV || isPlaying || !scrubEnabled) return;
    const st = scrubThumbnailsRef.current;
    if (!st?.count) return;
    const effectiveDuration = scrubEffectiveDuration(duration, st);
    if (effectiveDuration <= 0) return;
    const pct = (currentTime / effectiveDuration) * 100;
    const idx = scrubIndexFromTimelinePercent(pct, effectiveDuration, st);
    setTvScrubIndexInternal(idx);
  }, [scrubMetaKey, showControls, isTV, isPlaying, scrubEnabled, duration]);

  const prevPausedTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPlaying) {
      prevPausedTimeRef.current = null;
      return;
    }
    if (!scrubEnabled || isTV || !showControls || isDraggingRef.current) return;
    const st = scrubThumbnailsRef.current;
    if (!st?.count) return;
    const t = currentTime;
    if (prevPausedTimeRef.current !== null && t === prevPausedTimeRef.current) return;
    prevPausedTimeRef.current = t;
    const effectiveDuration = scrubEffectiveDuration(duration, st);
    if (effectiveDuration <= 0) return;
    const pct = (t / effectiveDuration) * 100;
    const idx = scrubIndexFromTimelinePercent(pct, effectiveDuration, st);
    setTvScrubIndexInternal((prev) => (prev === idx ? prev : idx));
  }, [currentTime, isPlaying, showControls, scrubEnabled, isTV, duration]);

  useEffect(() => {
    if (isTV) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const kc = (e as any).keyCode ?? (e as any).which;
      const key = (e as any).key as string;
      const keyNormalized =
        key ||
        (kc === 37
          ? 'ArrowLeft'
          : kc === 39
            ? 'ArrowRight'
            : kc === 36
              ? 'Home'
              : kc === 35
                ? 'End'
                : kc === 33
                  ? 'PageUp'
                  : kc === 34
                    ? 'PageDown'
                    : kc === 13
                      ? 'Enter'
                      : kc === 32
                        ? ' '
                        : '');

      const isNavKey =
        keyNormalized === 'ArrowLeft' ||
        keyNormalized === 'ArrowRight' ||
        keyNormalized === 'Home' ||
        keyNormalized === 'End' ||
        keyNormalized === 'PageUp' ||
        keyNormalized === 'PageDown';

      // Espace = play/pause (jamais volé par le scrub).
      if (keyNormalized === ' ') return;

      if (keyNormalized === 'Enter') {
        if (!showControlsRef.current || !isBrowsingScrubRef.current || !scrubEnabled) return;
        e.preventDefault();
        e.stopPropagation();
        const targetTime = timeForScrubIndexRef.current(tvScrubInternalRef.current);
        onSeekToTimeRef.current?.(targetTime);
        userScrubbedRef.current = false;
        setIsBrowsingScrub(false);
        return;
      }

      if (!isNavKey) return;

      const controlsVisible = showControlsRef.current;
      const st = scrubThumbnailsRef.current;
      const count = st?.count ?? 0;
      const effectiveDuration = scrubEffectiveDuration(durationRef.current, st);

      // Chrome masqué : skip immédiat ±10 s (YouTube), même sans miniatures.
      if (!controlsVisible) {
        e.preventDefault();
        e.stopPropagation();
        const delta =
          keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown' || keyNormalized === 'Home'
            ? keyNormalized === 'Home'
              ? -effectiveDuration
              : keyNormalized === 'PageDown'
                ? -60
                : -10
            : keyNormalized === 'End'
              ? effectiveDuration
              : keyNormalized === 'PageUp'
                ? 60
                : 10;
        const dur = effectiveDuration > 0 ? effectiveDuration : durationRef.current;
        if (!dur) return;
        const next = Math.max(0, Math.min(dur, currentTimeRef.current + delta));
        onRevealControlsRef.current?.();
        if (scrubEnabled && st?.count) {
          const pct = (next / dur) * 100;
          const idx = scrubIndexFromTimelinePercent(pct, dur, st);
          setTvScrubIndexInternal(idx);
          setIsBrowsingScrub(true);
          userScrubbedRef.current = false;
          if (skipStripHideTimeoutRef.current != null) window.clearTimeout(skipStripHideTimeoutRef.current);
          skipStripHideTimeoutRef.current = window.setTimeout(() => {
            skipStripHideTimeoutRef.current = null;
            setIsBrowsingScrub(false);
          }, 1600);
        }
        onSeekToTimeRef.current?.(next);
        return;
      }

      if (!scrubEnabled || count <= 0) return;

      e.preventDefault();
      e.stopPropagation();
      setIsBrowsingScrub(true);
      userScrubbedRef.current = true;
      setTvScrubIndexInternal((prev) => {
        let nextIdx = prev;
        const step = keyNormalized === 'PageUp' || keyNormalized === 'PageDown' ? 5 : 1;
        if (keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown')
          nextIdx = Math.max(0, prev - step);
        if (keyNormalized === 'ArrowRight' || keyNormalized === 'PageUp')
          nextIdx = Math.min(count - 1, prev + step);
        if (keyNormalized === 'Home') nextIdx = 0;
        if (keyNormalized === 'End') nextIdx = count - 1;
        return nextIdx;
      });
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
      if (skipStripHideTimeoutRef.current != null) {
        window.clearTimeout(skipStripHideTimeoutRef.current);
        skipStripHideTimeoutRef.current = null;
      }
    };
  }, [isTV, scrubEnabled]);

  useEffect(() => {
    if (isTV || isDraggingScrub) return;
    if (!showControls || !scrubEnabled) return;
    const id = window.setTimeout(() => {
      if (!userScrubbedRef.current) return;
      const targetTime = timeForScrubIndexRef.current(tvScrubInternalRef.current);
      onSeekToTimeRef.current?.(targetTime);
      userScrubbedRef.current = false;
      setIsBrowsingScrub(false);
    }, 1400);
    return () => window.clearTimeout(id);
  }, [isTV, showControls, scrubEnabled, tvScrubIndexInternal, isDraggingScrub]);

  const percentFromPointerEvent = (e: any): number | null => {
    const el = e.currentTarget as HTMLDivElement | null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const clientX =
      typeof e.clientX === 'number'
        ? e.clientX
        : e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX;
    if (typeof clientX !== 'number' || !rect.width) return null;
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
    return (x / rect.width) * 100;
  };

  const setScrubFromPercent = (percent: number, asDragPreview = false) => {
    const effectiveDuration = getEffectiveDuration();
    if (effectiveDuration <= 0) return;
    const p = Math.min(100, Math.max(0, percent));
    const t = (p / 100) * effectiveDuration;
    if (asDragPreview || isDraggingRef.current) {
      setDragPreviewPercent(p);
      setDragPreviewTime(t);
    }
    if (scrubEnabled && scrubThumbnails) {
      const idx = scrubIndexFromTimelinePercent(p, effectiveDuration, scrubThumbnails);
      setTvScrubIndexInternal(idx);
    }
  };

  const setScrubFromPointer = (e: any, asDragPreview = false) => {
    const percent = percentFromPointerEvent(e);
    if (percent == null) return;
    setScrubFromPercent(percent, asDragPreview);
  };

  const beginScrubDrag = useCallback((e: any) => {
    setIsDraggingScrub(true);
    userScrubbedRef.current = false;
    const percent = percentFromPointerEvent(e);
    if (percent != null) setScrubFromPercent(percent, true);
  }, [scrubEnabled, scrubThumbnails, duration]);

  const updateScrubDrag = useCallback((e: any) => {
    if (!isDraggingRef.current) return;
    const percent = percentFromPointerEvent(e);
    if (percent != null) setScrubFromPercent(percent, true);
  }, [scrubEnabled, scrubThumbnails, duration]);

  const commitScrubDrag = useCallback(
    (e?: any) => {
      if (e) {
        const percent = percentFromPointerEvent(e);
        if (percent != null) setScrubFromPercent(percent, true);
      }
      const effectiveDuration = getEffectiveDuration();
      let target =
        dragPreviewTimeRef.current != null
          ? dragPreviewTimeRef.current
          : scrubEnabled
            ? timeForScrubIndexRef.current(tvScrubInternalRef.current)
            : null;
      if (target == null && e) {
        const percent = percentFromPointerEvent(e);
        if (percent != null && effectiveDuration > 0) {
          target = (percent / 100) * effectiveDuration;
        }
      }
      setIsDraggingScrub(false);
      setDragPreviewTime(null);
      setDragPreviewPercent(null);
      userScrubbedRef.current = false;
      setIsBrowsingScrub(false);
      if (target == null || !Number.isFinite(target)) return;
      const clamped = Math.max(0, Math.min(effectiveDuration || target, target));
      onSeekToTimeRef.current?.(clamped);
    },
    [scrubEnabled, duration, scrubThumbnails],
  );

  const cancelScrubDrag = useCallback(() => {
    setIsDraggingScrub(false);
    setDragPreviewTime(null);
    setDragPreviewPercent(null);
  }, []);

  const stepScrubIndex = (delta: number) => {
    const st = scrubThumbnailsRef.current;
    const total = st?.count ?? 0;
    if (total <= 0 || delta === 0) return;
    userScrubbedRef.current = true;
    setIsBrowsingScrub(true);
    setTvScrubIndexInternal((prev) => Math.min(total - 1, Math.max(0, prev + delta)));
  };

  const effectiveDurationForProgress = getEffectiveDuration();
  /** Tête de lecture réelle (curseur) — toujours currentTime, sauf drag. */
  const playheadPercent = (() => {
    if (isDraggingScrub && dragPreviewPercent != null) return dragPreviewPercent;
    if (effectiveDurationForProgress > 0) {
      return Math.min(100, Math.max(0, (currentTime / effectiveDurationForProgress) * 100));
    }
    return duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  })();

  /**
   * Remplissage de la barre :
   * - drag / scrub desktop → aperçu
   * - TV : suit la lecture ; n’utilise l’index scrub que s’il a divergé (nav flèches)
   */
  const progressPercent = (() => {
    if (effectiveDurationForProgress <= 0) {
      return playheadPercent;
    }
    if (isDraggingScrub && dragPreviewPercent != null) {
      return dragPreviewPercent;
    }
    if (scrubEnabled) {
      if (isTV && tvScrubIndexExternal != null) {
        const scrubTime = timeForScrubIndex(tvScrubIndex);
        // Aperçu scrub uniquement si l’utilisateur a navigué loin de la tête de lecture.
        if (Math.abs(scrubTime - currentTime) >= 0.75) {
          return Math.min(100, Math.max(0, (scrubTime / effectiveDurationForProgress) * 100));
        }
        return playheadPercent;
      }
      if (!isTV) {
        const followScrub = !isPlaying || isDraggingScrub;
        const t = followScrub ? timeForScrubIndex(tvScrubIndex) : currentTime;
        return Math.min(100, Math.max(0, (t / effectiveDurationForProgress) * 100));
      }
    }
    return playheadPercent;
  })();

  const previewTime =
    isDraggingScrub && dragPreviewTime != null
      ? dragPreviewTime
      : scrubEnabled && !isTV
        ? timeForScrubIndex(tvScrubIndex)
        : currentTime;

  return {
    tvScrubIndex,
    setTvScrubIndexInternal,
    getEffectiveDuration,
    getScrubUrlForIndex,
    timeForScrubIndex,
    setScrubFromPointer,
    setScrubFromPercent,
    stepScrubIndex,
    progressPercent,
    playheadPercent,
    isDraggingScrub,
    beginScrubDrag,
    updateScrubDrag,
    commitScrubDrag,
    cancelScrubDrag,
    previewTime,
    dragPreviewPercent,
    isBrowsingScrub,
    resetScrubToPlayhead,
  };
}
