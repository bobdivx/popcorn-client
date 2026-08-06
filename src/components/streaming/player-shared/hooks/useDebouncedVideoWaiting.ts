import { useState, useEffect } from 'preact/hooks';
import { WAITING_HIDE_DELAY_MS, WAITING_SHOW_DELAY_MS } from '../utils/bufferMetrics';

/**
 * `waiting` debounce : show après un délai, hide après stabilité playing/canplay.
 * Évite le clignotement overlay pendant un seek HLS.
 */
export function useDebouncedVideoWaiting(
  videoRef: { current: HTMLVideoElement | null },
  deps: unknown[] = [],
  showDelayMs = WAITING_SHOW_DELAY_MS,
  hideDelayMs = WAITING_HIDE_DELAY_MS,
): boolean {
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let showTimer: number | null = null;
    let hideTimer: number | null = null;

    const clearTimers = () => {
      if (showTimer != null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const onWaiting = () => {
      if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (showTimer != null) return;
      showTimer = window.setTimeout(() => {
        showTimer = null;
        setIsWaiting(true);
      }, showDelayMs);
    };

    const onReady = () => {
      if (showTimer != null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      if (hideTimer != null) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        setIsWaiting(false);
      }, hideDelayMs);
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('canplay', onReady);
    video.addEventListener('playing', onReady);
    video.addEventListener('seeked', onReady);

    return () => {
      clearTimers();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('seeked', onReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps fournies par l’appelant (src, etc.)
  }, [videoRef, showDelayMs, hideDelayMs, ...deps]);

  return isWaiting;
}
