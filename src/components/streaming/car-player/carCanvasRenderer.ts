/**
 * Moteurs d'affichage Drive pour /car.
 *
 * - « canvas » : fetch(car.mjpeg) en streaming → jitter buffer → createImageBitmap → canvas 2D (thread principal),
 *   cadence rAF calée sur l'horloge de l'<audio> car.audio, images en retard jetées (carFrameCore.ts).
 * - « worker » : même pipeline dans un Worker + OffscreenCanvas (carWorkerRenderer.ts).
 * - « img » : <img src=multipart> natif (aucune régulation).
 * - « auto » (défaut) : choisi par carCapabilities.recommendCarDrive — sans relevé Drive → canvas ;
 *   worker seulement si un relevé pris EN Drive le valide ; repli worker → canvas → <img> en cas d'échec.
 *
 * Forcer : /car?render=canvas|worker|img|auto (mémorisé) ou menu « Moteur » de la barre.
 */
import { MjpegFrameCore, type FrameCoreStats } from './carFrameCore';

export type CarRenderEngine = 'img' | 'canvas' | 'worker' | 'auto';
export type CarConcreteEngine = 'img' | 'canvas' | 'worker';

/** Moteur par défaut en Drive. */
export const CAR_RENDER_DEFAULT: CarRenderEngine = 'auto';

/** Plafond du backing store (pas d'upscale DPR ; le CSS met à l'échelle). */
export const CAR_MAX_BACKING = { width: 1280, height: 720 };

const STORAGE_KEY = 'popcorn_car_render_engine';

function isEngine(v: unknown): v is CarRenderEngine {
  return v === 'canvas' || v === 'img' || v === 'auto' || v === 'worker';
}

export function readCarRenderEngine(): CarRenderEngine {
  if (typeof window === 'undefined') return CAR_RENDER_DEFAULT;
  try {
    const p = new URLSearchParams(window.location.search).get('render');
    if (isEngine(p)) {
      localStorage.setItem(STORAGE_KEY, p);
      return p;
    }
    const s = localStorage.getItem(STORAGE_KEY);
    if (isEngine(s)) return s;
  } catch {
    // ignore
  }
  return CAR_RENDER_DEFAULT;
}

export function writeCarRenderEngine(engine: CarRenderEngine): void {
  try {
    localStorage.setItem(STORAGE_KEY, engine);
  } catch {
    // ignore
  }
}

export interface CarCanvasRendererOptions {
  canvas: HTMLCanvasElement;
  url: string;
  /** <audio> car.audio démarré au même seek (horloge maître). */
  audio: HTMLAudioElement | null;
  fps: number;
  /** Secondes de buffer max (défaut 2 s). */
  bufferSeconds?: number;
  /** Secondes à pré-remplir avant la 1re image (défaut 0,5 s). */
  prebufferSeconds?: number;
  useAudioClock?: boolean;
  onError?: (message: string) => void;
}

export class CarCanvasRenderer {
  static isSupported(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof (window as unknown as { createImageBitmap?: unknown }).createImageBitmap === 'function' &&
        typeof ReadableStream !== 'undefined' &&
        'body' in Response.prototype
      );
    } catch {
      return false;
    }
  }

  private o: CarCanvasRendererOptions;
  private core: MjpegFrameCore | null = null;

  constructor(opts: CarCanvasRendererOptions) {
    this.o = opts;
  }

  start(): void {
    const ctx = this.o.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    if (!ctx) {
      this.o.onError?.('Canvas 2D indisponible.');
      return;
    }
    const a = this.o.audio;
    this.core = new MjpegFrameCore({
      url: this.o.url,
      fps: this.o.fps,
      bufferSeconds: this.o.bufferSeconds ?? 2,
      prebufferSeconds: this.o.prebufferSeconds ?? 0.5,
      maxWidth: CAR_MAX_BACKING.width,
      maxHeight: CAR_MAX_BACKING.height,
      ctx,
      audioClock: () =>
        this.o.useAudioClock !== false && a && !a.paused && a.currentTime > 0 && a.readyState >= 2 ? a.currentTime : null,
      schedule: (cb) => requestAnimationFrame(cb),
      cancel: (h) => cancelAnimationFrame(h),
      now: () => performance.now(),
      onError: (m) => this.o.onError?.(m),
    });
    this.core.start();
  }

  takeStats(): FrameCoreStats | null {
    return this.core ? this.core.takeStats() : null;
  }

  get paintedSeconds(): number {
    return this.core?.paintedSeconds ?? 0;
  }

  stop(): void {
    this.core?.stop();
    this.core = null;
  }
}
