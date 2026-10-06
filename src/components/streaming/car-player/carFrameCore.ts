/**
 * Cœur commun des moteurs MJPEG « canvas » (thread principal ET Worker/OffscreenCanvas).
 *
 * fetch(car.mjpeg) en streaming → découpe JPEG → jitter buffer borné → pacing régulier
 * (horloge audio si elle tourne, sinon horloge fixe) → createImageBitmap (redimensionné au décodage
 * si l'image dépasse le plafond) → drawImage. Les images en retard sont jetées (jamais de dérive).
 * Aucun accès DOM par image : uniquement le contexte 2D fourni.
 */

export interface FrameCoreStats {
  state: 'connecting' | 'buffering' | 'playing' | 'stalled' | 'error' | 'ended';
  fpsShown: number;
  fpsReceived: number;
  targetFps: number;
  dropped: number;
  late: number;
  stalls: number;
  paintJitterMs: number;
  arrivalJitterMs: number;
  kbps: number;
  bufferFrames: number;
  bufferMs: number;
  decodeMs: number;
  paintMs: number;
  avSyncMs: number | null;
  frameSize: string;
  lastIndex: number;
}

type Ctx2D = {
  drawImage(img: ImageBitmap, dx: number, dy: number): void;
  canvas: { width: number; height: number };
};

export interface FrameCoreOptions {
  url: string;
  fps: number;
  /** Secondes de buffer max (images au-delà jetées, les plus anciennes d'abord). */
  bufferSeconds: number;
  /** Secondes à pré-remplir avant la 1re image. */
  prebufferSeconds: number;
  /** Plafond du backing store (pas d'upscale DPR ; réduit au décodage si l'image est plus grande). */
  maxWidth: number;
  maxHeight: number;
  ctx: Ctx2D;
  /** Position de l'horloge audio en secondes (relative au seek), ou null si l'audio ne tourne pas. */
  audioClock: () => number | null;
  /** Ordonnanceur (requestAnimationFrame ou équivalent worker). */
  schedule: (cb: (now: number) => void) => number;
  cancel: (h: number) => void;
  now: () => number;
  onError: (message: string) => void;
}

export class JpegSplitter {
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

function stddev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
}

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

interface Frame {
  index: number;
  data: Uint8Array;
}

export class MjpegFrameCore {
  private o: FrameCoreOptions;
  private abort: AbortController | null = null;
  private stopped = false;
  private handle = 0;
  private queue: Frame[] = [];
  private received = 0;
  private lastPainted = -1;
  private started = false;
  private clockStart = 0;
  private clockOffset = 0;
  private busy = false;
  private underrun = false;
  private state: FrameCoreStats['state'] = 'connecting';
  private resize: { w: number; h: number } | null = null;
  private frameSize = '—';
  // fenêtre de stats
  private wPainted = 0;
  private wReceived = 0;
  private wBytes = 0;
  private wDecode: number[] = [];
  private wPaint: number[] = [];
  private paintTimes: number[] = [];
  private arrivalTimes: number[] = [];
  private dropped = 0;
  private failStreak = 0;
  private late = 0;
  private stalls = 0;
  private lastStatsAt = 0;

  constructor(o: FrameCoreOptions) {
    this.o = o;
  }

  private get fps(): number {
    return Math.max(1, this.o.fps || 12);
  }
  private get maxQueue(): number {
    return Math.max(3, Math.round(this.fps * this.o.bufferSeconds));
  }
  private get prebuffer(): number {
    return Math.max(1, Math.round(this.fps * this.o.prebufferSeconds));
  }

  start(): void {
    this.lastStatsAt = this.o.now();
    void this.read();
    this.handle = this.o.schedule(this.tick);
  }

  stop(): void {
    this.stopped = true;
    this.o.cancel(this.handle);
    try {
      this.abort?.abort();
    } catch {
      // ignore
    }
    this.queue = [];
  }

  /** Position (s, relative au seek) de la dernière image affichée. */
  get paintedSeconds(): number {
    return this.lastPainted >= 0 ? this.lastPainted / this.fps : 0;
  }

  private async read(): Promise<void> {
    this.abort = new AbortController();
    let res: Response;
    try {
      res = await fetch(this.o.url, { signal: this.abort.signal, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      if (!this.stopped) {
        this.state = 'error';
        this.o.onError(`Flux vidéo injoignable : ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (!res.ok || !res.body) {
      if (!this.stopped) {
        this.state = 'error';
        this.o.onError(`Flux vidéo HTTP ${res.status}`);
      }
      return;
    }
    this.state = 'buffering';
    const reader = res.body.getReader();
    const splitter = new JpegSplitter();
    try {
      for (;;) {
        if (this.stopped) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        this.wBytes += value.byteLength;
        splitter.push(value, (jpeg) => {
          const now = this.o.now();
          this.arrivalTimes.push(now);
          if (this.arrivalTimes.length > 60) this.arrivalTimes.shift();
          this.wReceived++;
          this.queue.push({ index: this.received++, data: jpeg });
          while (this.queue.length > this.maxQueue) {
            this.queue.shift();
            this.dropped++;
          }
        });
      }
      if (!this.stopped) this.state = 'ended';
    } catch (e) {
      if (!this.stopped && !(e instanceof DOMException && e.name === 'AbortError')) {
        this.state = 'error';
        this.o.onError(`Flux vidéo interrompu : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private wanted(now: number): number {
    const t = this.o.audioClock();
    if (t != null && t > 0) return Math.floor(t * this.fps);
    return this.clockOffset + Math.floor(((now - this.clockStart) / 1000) * this.fps);
  }

  private tick = (now: number): void => {
    if (this.stopped) return;
    this.handle = this.o.schedule(this.tick);
    if (this.busy) return;
    if (!this.started) {
      if (this.queue.length < this.prebuffer) return;
      this.started = true;
      this.clockStart = now;
      this.clockOffset = this.queue[0].index;
      this.state = 'playing';
    }
    if (this.queue.length === 0) {
      if (!this.underrun && this.state !== 'ended') {
        this.underrun = true;
        this.stalls++;
        this.state = 'stalled';
      }
      if (this.o.audioClock() == null) {
        this.clockStart = now;
        this.clockOffset = this.lastPainted + 1;
      }
      return;
    }
    if (this.underrun) {
      this.underrun = false;
      this.state = 'playing';
    }
    const want = this.wanted(now);
    if (this.queue[0].index > want) return;
    let pick: Frame | undefined;
    while (this.queue.length && this.queue[0].index <= want) {
      if (pick) this.dropped++;
      pick = this.queue.shift();
    }
    if (!pick) return;
    if (want - pick.index >= 2) this.late++;
    void this.paint(pick, now);
  };

  private async paint(frame: Frame, now: number): Promise<void> {
    this.busy = true;
    const t0 = this.o.now();
    try {
      const blob = new Blob([frame.data as BlobPart], { type: 'image/jpeg' });
      const bmp = this.resize
        ? await createImageBitmap(blob, { resizeWidth: this.resize.w, resizeHeight: this.resize.h, resizeQuality: 'low' })
        : await createImageBitmap(blob);
      const t1 = this.o.now();
      if (!this.resize) {
        // 1re image : plafond du backing store (jamais d'upscale)
        const s = Math.min(1, this.o.maxWidth / bmp.width, this.o.maxHeight / bmp.height);
        if (s < 1) this.resize = { w: Math.round(bmp.width * s), h: Math.round(bmp.height * s) };
      }
      if (!this.stopped) {
        const c = this.o.ctx.canvas;
        if (c.width !== bmp.width || c.height !== bmp.height) {
          c.width = bmp.width;
          c.height = bmp.height;
          this.frameSize = `${bmp.width}×${bmp.height}`;
        }
        this.o.ctx.drawImage(bmp, 0, 0);
      }
      bmp.close();
      this.failStreak = 0;
      this.wDecode.push(t1 - t0);
      this.wPaint.push(this.o.now() - t1);
      this.lastPainted = frame.index;
      this.wPainted++;
      this.paintTimes.push(now);
      if (this.paintTimes.length > 60) this.paintTimes.shift();
    } catch (e) {
      this.dropped++;
      // Décodage systématiquement KO → remonter l'erreur (repli moteur côté appelant)
      if (++this.failStreak === 10 && !this.stopped) {
        this.o.onError(`Décodage JPEG KO : ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Stats de la fenêtre écoulée depuis le dernier appel (normalisées par seconde). */
  takeStats(): FrameCoreStats {
    const now = this.o.now();
    const sec = Math.max(0.25, (now - this.lastStatsAt) / 1000);
    this.lastStatsAt = now;
    const pi: number[] = [];
    for (let i = 1; i < this.paintTimes.length; i++) pi.push(this.paintTimes[i] - this.paintTimes[i - 1]);
    const ai: number[] = [];
    for (let i = 1; i < this.arrivalTimes.length; i++) ai.push(this.arrivalTimes[i] - this.arrivalTimes[i - 1]);
    const a = this.o.audioClock();
    const s: FrameCoreStats = {
      state: this.state,
      fpsShown: Math.round((this.wPainted / sec) * 10) / 10,
      fpsReceived: Math.round((this.wReceived / sec) * 10) / 10,
      targetFps: this.fps,
      dropped: this.dropped,
      late: this.late,
      stalls: this.stalls,
      paintJitterMs: Math.round(stddev(pi)),
      arrivalJitterMs: Math.round(stddev(ai)),
      kbps: Math.round((this.wBytes * 8) / 1000 / sec),
      bufferFrames: this.queue.length,
      bufferMs: Math.round((this.queue.length / this.fps) * 1000),
      decodeMs: Math.round(mean(this.wDecode) * 10) / 10,
      paintMs: Math.round(mean(this.wPaint) * 10) / 10,
      avSyncMs: a != null && a > 0 && this.lastPainted >= 0 ? Math.round((this.lastPainted / this.fps - a) * 1000) : null,
      frameSize: this.frameSize,
      lastIndex: this.lastPainted,
    };
    this.wPainted = 0;
    this.wReceived = 0;
    this.wBytes = 0;
    this.wDecode = [];
    this.wPaint = [];
    return s;
  }
}
