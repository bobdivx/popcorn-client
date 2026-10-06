/**
 * Moteur d'affichage Drive « canvas » pour /car (OPTIONNEL, pas par défaut).
 *
 * fetch(car.mjpeg) en streaming → découpe JPEG → jitter buffer → createImageBitmap → canvas 2D,
 * cadence pilotée par requestAnimationFrame et calée sur l'horloge de l'<audio> car.audio
 * (image n = audio.currentTime × fps). Les images en retard sont jetées (jamais de file qui dérive),
 * l'horloge fixe prend le relais tant que l'audio ne joue pas.
 *
 * Activation : /car?render=canvas (mémorisé) ou bouton « Rendu » dans la barre ; retour : ?render=img.
 * Pour en faire le défaut : passer CAR_RENDER_DEFAULT à 'canvas'.
 */

export type CarRenderEngine = 'img' | 'canvas';

/** Moteur par défaut en Drive. Basculer à 'canvas' quand le labo aura désigné le gagnant. */
export const CAR_RENDER_DEFAULT: CarRenderEngine = 'img';

const STORAGE_KEY = 'popcorn_car_render_engine';

export function readCarRenderEngine(): CarRenderEngine {
  if (typeof window === 'undefined') return CAR_RENDER_DEFAULT;
  try {
    const p = new URLSearchParams(window.location.search).get('render');
    if (p === 'canvas' || p === 'img') {
      localStorage.setItem(STORAGE_KEY, p);
      return p;
    }
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'canvas' || s === 'img') return s;
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

/** Découpe un flux multipart MJPEG en JPEG (SOI FFD8 … EOI FFD9). */
class JpegSplitter {
  private buf = new Uint8Array(512 * 1024);
  private len = 0;

  push(chunk: Uint8Array, emit: (jpeg: Uint8Array) => void): void {
    if (this.len + chunk.length > this.buf.length) {
      let cap = this.buf.length;
      while (cap < this.len + chunk.length) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
    }
    this.buf.set(chunk, this.len);
    this.len += chunk.length;
    const b = this.buf;
    let consumed = 0;
    for (;;) {
      let soi = -1;
      for (let i = consumed; i + 1 < this.len; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xd8) {
          soi = i;
          break;
        }
      }
      if (soi < 0) {
        consumed = Math.max(consumed, this.len - 1);
        break;
      }
      let eoi = -1;
      for (let i = soi + 2; i + 1 < this.len; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xd9) {
          eoi = i;
          break;
        }
      }
      if (eoi < 0) {
        consumed = soi;
        break;
      }
      emit(b.slice(soi, eoi + 2));
      consumed = eoi + 2;
    }
    if (consumed > 0) {
      b.copyWithin(0, consumed, this.len);
      this.len -= consumed;
    }
  }
}

interface QueuedFrame {
  index: number;
  data: Uint8Array;
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
  private ctx: CanvasRenderingContext2D | null = null;
  private abort: AbortController | null = null;
  private stopped = false;
  private raf = 0;
  private queue: QueuedFrame[] = [];
  private received = 0;
  private lastPainted = -1;
  private started = false;
  private clockStart = 0;
  private clockOffset = 0;
  private busy = false;

  constructor(opts: CarCanvasRendererOptions) {
    this.o = opts;
  }

  private get fps(): number {
    return Math.max(1, this.o.fps || 12);
  }

  private get maxQueue(): number {
    return Math.max(4, Math.round(this.fps * (this.o.bufferSeconds ?? 2)));
  }

  private get prebuffer(): number {
    return Math.max(1, Math.round(this.fps * (this.o.prebufferSeconds ?? 0.5)));
  }

  start(): void {
    this.ctx = this.o.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    if (!this.ctx) {
      this.o.onError?.('Canvas 2D indisponible.');
      return;
    }
    void this.read();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    try {
      this.abort?.abort();
    } catch {
      // ignore
    }
    this.queue = [];
  }

  private async read(): Promise<void> {
    this.abort = new AbortController();
    let res: Response;
    try {
      res = await fetch(this.o.url, { signal: this.abort.signal, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      if (!this.stopped) this.o.onError?.(`Flux vidéo injoignable : ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!res.ok || !res.body) {
      if (!this.stopped) this.o.onError?.(`Flux vidéo HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const splitter = new JpegSplitter();
    try {
      for (;;) {
        if (this.stopped) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        splitter.push(value, (jpeg) => {
          this.queue.push({ index: this.received++, data: jpeg });
          while (this.queue.length > this.maxQueue) this.queue.shift();
        });
      }
    } catch (e) {
      if (!this.stopped && !(e instanceof DOMException && e.name === 'AbortError')) {
        this.o.onError?.(`Flux vidéo interrompu : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private wanted(now: number): number {
    const a = this.o.audio;
    if (a && !a.paused && a.currentTime > 0 && a.readyState >= 2) {
      return Math.floor(a.currentTime * this.fps);
    }
    return this.clockOffset + Math.floor(((now - this.clockStart) / 1000) * this.fps);
  }

  private tick = (now: number): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.busy) return;
    if (!this.started) {
      if (this.queue.length < this.prebuffer) return;
      this.started = true;
      this.clockStart = now;
      this.clockOffset = this.queue[0].index;
    }
    if (this.queue.length === 0) {
      const a = this.o.audio;
      if (!a || a.paused) {
        this.clockStart = now;
        this.clockOffset = this.lastPainted + 1;
      }
      return;
    }
    const want = this.wanted(now);
    if (this.queue[0].index > want) return;
    let pick: QueuedFrame | undefined;
    while (this.queue.length && this.queue[0].index <= want) pick = this.queue.shift();
    if (pick) void this.paint(pick);
  };

  private async paint(frame: QueuedFrame): Promise<void> {
    this.busy = true;
    try {
      const bmp = await createImageBitmap(new Blob([frame.data as BlobPart], { type: 'image/jpeg' }));
      if (!this.stopped && this.ctx) {
        const c = this.o.canvas;
        if (c.width !== bmp.width || c.height !== bmp.height) {
          c.width = bmp.width;
          c.height = bmp.height;
        }
        this.ctx.drawImage(bmp, 0, 0);
      }
      bmp.close();
      this.lastPainted = frame.index;
    } catch {
      // image corrompue : on passe
    } finally {
      this.busy = false;
    }
  }
}
