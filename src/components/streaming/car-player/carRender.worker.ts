/// <reference lib="webworker" />
/**
 * Worker de rendu MJPEG (OffscreenCanvas) : fetch + découpe + décodage + dessin hors thread principal.
 * Messages : init {canvas, url, fps, bufferSeconds, prebufferSeconds, maxWidth, maxHeight}
 *            clock {t, at, playing}  (t = secondes audio relatives au seek, at = horodatage absolu ms)
 *            stop
 * Émet : stats {stats} (1/s) · error {message}
 */
import { MjpegFrameCore } from './carFrameCore';

const scope = self as unknown as DedicatedWorkerGlobalScope & {
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (h: number) => void;
};

let core: MjpegFrameCore | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;
let clock = { t: 0, at: 0, playing: false };
const absNow = () => performance.timeOrigin + performance.now();

scope.onmessage = (ev: MessageEvent) => {
  const m = ev.data as Record<string, any>;
  if (m.type === 'init') {
    const canvas = m.canvas as OffscreenCanvas;
    const ctx = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      scope.postMessage({ type: 'error', message: 'OffscreenCanvas 2D indisponible dans le Worker' });
      return;
    }
    const hasRaf = typeof scope.requestAnimationFrame === 'function';
    core = new MjpegFrameCore({
      url: m.url,
      fps: m.fps,
      bufferSeconds: m.bufferSeconds,
      prebufferSeconds: m.prebufferSeconds,
      maxWidth: m.maxWidth,
      maxHeight: m.maxHeight,
      ctx: ctx as unknown as { drawImage(img: ImageBitmap, x: number, y: number): void; canvas: { width: number; height: number } },
      audioClock: () => (clock.playing ? clock.t + (absNow() - clock.at) / 1000 : null),
      schedule: hasRaf
        ? (cb) => scope.requestAnimationFrame!(cb)
        : (cb) => setTimeout(() => cb(performance.now()), 8) as unknown as number,
      cancel: hasRaf ? (h) => scope.cancelAnimationFrame?.(h) : (h) => clearTimeout(h),
      now: () => performance.now(),
      onError: (message) => scope.postMessage({ type: 'error', message }),
    });
    core.start();
    statsTimer = setInterval(() => {
      if (core) scope.postMessage({ type: 'stats', stats: core.takeStats(), raf: hasRaf });
    }, 1000);
  } else if (m.type === 'clock') {
    clock = { t: Number(m.t) || 0, at: Number(m.at) || 0, playing: !!m.playing };
  } else if (m.type === 'stop') {
    core?.stop();
    core = null;
    if (statsTimer) clearInterval(statsTimer);
    scope.close();
  }
};
