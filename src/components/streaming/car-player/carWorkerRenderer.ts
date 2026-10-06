/**
 * Moteur Drive « worker » : décodage + dessin MJPEG dans un Worker via OffscreenCanvas
 * (thread principal libre : aucun travail par image côté DOM). Même pacing que le moteur canvas.
 */
import RenderWorker from './carRender.worker.ts?worker';
import type { FrameCoreStats } from './carFrameCore';

export interface CarWorkerRendererOptions {
  canvas: HTMLCanvasElement;
  url: string;
  audio: HTMLAudioElement | null;
  fps: number;
  bufferSeconds?: number;
  prebufferSeconds?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** false = horloge fixe (pas de calage audio) */
  useAudioClock?: boolean;
  onError?: (message: string) => void;
}

export class CarWorkerRenderer {
  static isSupported(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof Worker === 'function' &&
        typeof (window as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'function' &&
        'transferControlToOffscreen' in HTMLCanvasElement.prototype &&
        typeof (window as unknown as { createImageBitmap?: unknown }).createImageBitmap === 'function' &&
        typeof ReadableStream !== 'undefined'
      );
    } catch {
      return false;
    }
  }

  private o: CarWorkerRendererOptions;
  private worker: Worker | null = null;
  private clockTimer = 0;
  private last: FrameCoreStats | null = null;
  private stopped = false;
  workerRaf: boolean | null = null;

  constructor(o: CarWorkerRendererOptions) {
    this.o = o;
  }

  start(): void {
    let offscreen: OffscreenCanvas;
    try {
      offscreen = this.o.canvas.transferControlToOffscreen();
    } catch (e) {
      this.o.onError?.(`OffscreenCanvas KO : ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    try {
      this.worker = new RenderWorker();
    } catch (e) {
      this.o.onError?.(`Worker KO : ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    this.worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { type: string; stats?: FrameCoreStats; message?: string; raf?: boolean };
      if (m.type === 'stats' && m.stats) {
        this.last = m.stats;
        if (typeof m.raf === 'boolean') this.workerRaf = m.raf;
      } else if (m.type === 'error' && !this.stopped) {
        this.o.onError?.(m.message || 'Erreur worker');
      }
    };
    this.worker.onerror = (e) => {
      if (!this.stopped) this.o.onError?.(`Worker : ${e.message || 'erreur'}`);
    };
    this.worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        url: new URL(this.o.url, window.location.href).toString(),
        fps: this.o.fps,
        bufferSeconds: this.o.bufferSeconds ?? 2,
        prebufferSeconds: this.o.prebufferSeconds ?? 0.5,
        maxWidth: this.o.maxWidth ?? 1280,
        maxHeight: this.o.maxHeight ?? 720,
      },
      [offscreen],
    );
    const sendClock = () => {
      const a = this.o.audio;
      const playing = this.o.useAudioClock !== false && !!a && !a.paused && a.currentTime > 0 && a.readyState >= 2;
      this.worker?.postMessage({
        type: 'clock',
        t: a ? a.currentTime : 0,
        at: performance.timeOrigin + performance.now(),
        playing,
      });
    };
    sendClock();
    this.clockTimer = window.setInterval(sendClock, 250);
  }

  /** Dernières stats reçues du worker (fenêtre 1 s). */
  takeStats(): FrameCoreStats | null {
    return this.last;
  }

  get paintedSeconds(): number {
    return this.last && this.last.lastIndex >= 0 ? this.last.lastIndex / Math.max(1, this.o.fps) : 0;
  }

  stop(): void {
    this.stopped = true;
    window.clearInterval(this.clockTimer);
    try {
      this.worker?.postMessage({ type: 'stop' });
    } catch {
      // ignore
    }
    const w = this.worker;
    this.worker = null;
    setTimeout(() => w?.terminate(), 300);
  }
}
