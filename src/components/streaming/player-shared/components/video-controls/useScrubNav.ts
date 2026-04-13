import { useState, useEffect, useRef } from 'preact/hooks';
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
  } = options;

  const [tvScrubIndexInternal, setTvScrubIndexInternal] = useState(0);
  const tvScrubIndex = isTV && tvScrubIndexExternal != null ? tvScrubIndexExternal : tvScrubIndexInternal;

  const scrubBase = scrubEnabled && scrubThumbnails
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

  const prevShowControlsRef = useRef(false);
  /** Identité stable des meta scrub (évite de relancer les effets à chaque nouvelle référence d’objet). */
  const scrubMetaKey =
    scrubEnabled && scrubThumbnails
      ? `${scrubThumbnails.mediaId}:${scrubThumbnails.count}:${scrubThumbnails.intervalSeconds ?? 'n'}`
      : '';
  const prevScrubMetaKeyRef = useRef('');

  /** À l’ouverture des contrôles : aligner le carrousel sur la position actuelle (desktop). */
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

  /**
   * Quand les meta scrub arrivent ou changent (ex. fin de génération) en pause avec contrôles ouverts :
   * aligner une fois. Ne jamais vider `prevScrubMetaKeyRef` quand la meta disparaît un instant (merge / fetch) :
   * sinon on croit à un « nouveau » lot de vignettes et on resynchronise sur la tête → souvent vignette 0.
   */
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

  /** En pause uniquement : resynchroniser quand la tête de lecture change (seek), pas à chaque render parent. */
  const prevPausedTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPlaying) {
      prevPausedTimeRef.current = null;
      return;
    }
    if (!scrubEnabled || isTV || !showControls) return;
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
    if (!showControls || !scrubEnabled) return;
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

      if (keyNormalized === 'Enter' || keyNormalized === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const targetTime = timeForScrubIndexRef.current(tvScrubInternalRef.current);
        onSeekToTimeRef.current?.(targetTime);
        return;
      }

      if (!isNavKey) return;
      e.preventDefault();
      e.stopPropagation();
      const st = scrubThumbnailsRef.current;
      const count = st?.count ?? 0;
      if (count <= 0) return;
      setTvScrubIndexInternal((prev) => {
        let nextIdx = prev;
        const step = keyNormalized === 'PageUp' || keyNormalized === 'PageDown' ? 5 : 1;
        if (keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown') nextIdx = Math.max(0, prev - step);
        if (keyNormalized === 'ArrowRight' || keyNormalized === 'PageUp') nextIdx = Math.min(count - 1, prev + step);
        if (keyNormalized === 'Home') nextIdx = 0;
        if (keyNormalized === 'End') nextIdx = count - 1;
        return nextIdx;
      });
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [isTV, showControls, scrubEnabled, scrubThumbnails?.count]);

  useEffect(() => {
    if (isTV) return;
    if (!showControls || !scrubEnabled) return;
    const id = window.setTimeout(() => {
      const targetTime = timeForScrubIndexRef.current(tvScrubInternalRef.current);
      onSeekToTimeRef.current?.(targetTime);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [isTV, showControls, scrubEnabled, tvScrubIndexInternal]);

  const setScrubFromPercent = (percent: number) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || !scrubThumbnails || effectiveDuration <= 0) return;
    const idx = scrubIndexFromTimelinePercent(percent, effectiveDuration, scrubThumbnails);
    setTvScrubIndexInternal(idx);
  };

  const setScrubFromPointer = (e: any) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || !scrubThumbnails || effectiveDuration <= 0) return;
    const el = e.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    const percent = rect.width > 0 ? (x / rect.width) * 100 : 0;
    setScrubFromPercent(percent);
  };

  const effectiveDurationForProgress = getEffectiveDuration();
  /** En lecture desktop : la barre suit la tête de lecture (pas l’état interne des vignettes, sinon conflit avec la resync). */
  const progressPercent = (() => {
    if (scrubEnabled && effectiveDurationForProgress > 0) {
      if (isTV && tvScrubIndexExternal != null) {
        const scrubTime = timeForScrubIndex(tvScrubIndex);
        return (scrubTime / effectiveDurationForProgress) * 100;
      }
      if (!isTV) {
        const t = isPlaying ? currentTime : timeForScrubIndex(tvScrubIndex);
        return (t / effectiveDurationForProgress) * 100;
      }
    }
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  })();

  return {
    tvScrubIndex,
    setTvScrubIndexInternal,
    getEffectiveDuration,
    getScrubUrlForIndex,
    timeForScrubIndex,
    setScrubFromPointer,
    setScrubFromPercent,
    progressPercent,
  };
}
