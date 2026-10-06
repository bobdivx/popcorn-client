/**
 * PROVISOIRE — Labo lecture Tesla (/car/lab).
 * Moteurs de rendu interchangeables + statistiques live. Aucun import depuis le lecteur desktop/TV.
 */
import type { LabBuffer, LabClock, LabEngine, LabPace, QualityPreset } from './labConfig';
import { buildLabUrls } from './labConfig';

export interface LabStats {
  engine: LabEngine;
  state: 'idle' | 'connecting' | 'buffering' | 'playing' | 'stalled' | 'error' | 'unavailable';
  position: number;
  fpsPainted: number;
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
  audioState: string;
  note: string;
}

export interface LabPlayerOptions {
  host: HTMLElement;
  streamUrl: string;
  seek: number;
  engine: LabEngine;
  preset: QualityPreset;
  buffer: LabBuffer;
  pace: LabPace;
  clock: LabClock;
  audio: boolean;
  onStats: (s: LabStats) => void;
  onError: (msg: string) => void;
}

type Availability = { ok: true } | { ok: false; reason: string };

export function hasFetchStreaming(): boolean {
  try {
    return typeof ReadableStream !== 'undefined' && typeof Response !== 'undefined' && 'body' in Response.prototype;
  } catch {
    return false;
  }
}

let webglCache: boolean | null = null;
function hasWebGL(): boolean {
  if (webglCache != null) return webglCache;
  try {
    const c = document.createElement('canvas');
    webglCache = !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function engineAvailability(engine: LabEngine): Availability {
  if (typeof window === 'undefined') return { ok: false, reason: 'SSR' };
  const w = window as unknown as Record<string, unknown>;
  switch (engine) {
    case 'img':
    case 'native':
    case 'video-canvas':
      return { ok: true };
    case 'canvas-bitmap':
      if (!hasFetchStreaming()) return { ok: false, reason: 'fetch streaming indisponible' };
      if (typeof w.createImageBitmap !== 'function') return { ok: false, reason: 'createImageBitmap indisponible' };
      return { ok: true };
    case 'canvas-img':
      return hasFetchStreaming() ? { ok: true } : { ok: false, reason: 'fetch streaming indisponible' };
    case 'webgl':
      if (!hasFetchStreaming()) return { ok: false, reason: 'fetch streaming indisponible' };
      if (typeof w.createImageBitmap !== 'function') return { ok: false, reason: 'createImageBitmap indisponible' };
      return hasWebGL() ? { ok: true } : { ok: false, reason: 'WebGL indisponible' };
    case 'webcodecs':
      if (!hasFetchStreaming()) return { ok: false, reason: 'fetch streaming indisponible' };
      return typeof w.ImageDecoder === 'function' ? { ok: true } : { ok: false, reason: 'WebCodecs ImageDecoder indisponible' };
    case 'mse':
      return {
        ok: false,
        reason: typeof w.MediaSource === 'function'
          ? 'MSE dispo, mais pas de flux fMP4 serveur'
          : 'MSE indisponible + pas de flux fMP4 serveur',
      };
    case 'jsmpeg':
      return { ok: false, reason: 'pas d’endpoint MPEG1/WebSocket serveur' };
    default:
      return { ok: false, reason: 'inconnu' };
  }
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
  return Math.sqrt(v);
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

interface QueuedFrame {
  index: number;
  data: Uint8Array;
  arrivedAt: number;
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

export class LabPlayer {
  private o: LabPlayerOptions;
  private stopped = false;
  private abort: AbortController | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private gl: WebGLRenderingContext | null = null;
  private glTex: WebGLTexture | null = null;
  private raf = 0;
  private statsTimer = 0;

  private queue: QueuedFrame[] = [];
  private queueWaiters: Array<() => void> = [];
  private receivedIndex = 0;
  private lastPaintedIndex = -1;
  private started = false;
  private clockStart = 0;
  private clockOffsetFrames = 0;
  private busy = false;
  private underrun = false;

  // stats accumulators (fenêtre 1 s)
  private winPainted = 0;
  private winReceived = 0;
  private winBytes = 0;
  private winDecode: number[] = [];
  private winPaint: number[] = [];
  private paintTimes: number[] = [];
  private arrivalTimes: number[] = [];
  private totalDropped = 0;
  private totalLate = 0;
  private totalStalls = 0;
  private frameSize = '—';
  private state: LabStats['state'] = 'idle';
  private note = '';
  private lastVideoTime = -1;
  private lastTotalFrames = 0;

  constructor(opts: LabPlayerOptions) {
    this.o = opts;
  }

  get fps(): number {
    return this.o.preset.fps;
  }

  /** Position média absolue (s). */
  getPosition(): number {
    const { engine, seek } = this.o;
    if (engine === 'native' && this.videoEl) return this.videoEl.currentTime || seek;
    if (this.audioEl && this.o.audio && !this.audioEl.paused && this.audioEl.currentTime > 0) {
      return seek + this.audioEl.currentTime;
    }
    if (engine === 'video-canvas' && this.videoEl) return this.videoEl.currentTime || seek;
    if (this.lastPaintedIndex >= 0) return seek + this.lastPaintedIndex / this.fps;
    return seek;
  }

  start(): void {
    const avail = engineAvailability(this.o.engine);
    if (!avail.ok) {
      this.state = 'unavailable';
      this.note = avail.reason;
      this.emitStats();
      return;
    }
    this.o.host.innerHTML = '';
    this.state = 'connecting';
    const { engine } = this.o;
    const urls = buildLabUrls(this.o.streamUrl, this.o.seek, this.o.preset, engine === 'img' ? 'realtime' : this.o.pace);

    if (this.o.audio && engine !== 'native') {
      const a = document.createElement('audio');
      a.preload = 'auto';
      a.src = urls.audioUrl;
      a.style.display = 'none';
      this.o.host.appendChild(a);
      this.audioEl = a;
      a.addEventListener('error', () => {
        if (!this.stopped) this.o.onError('Audio indisponible (car.audio).');
      });
      void a.play().catch(() => {
        this.note = 'Audio bloqué : touchez ▶';
      });
    }

    if (engine === 'img') {
      const img = document.createElement('img');
      img.className = 'car-lab__surface';
      img.alt = '';
      img.draggable = false;
      img.addEventListener('load', () => {
        this.state = 'playing';
        this.winPainted++;
        this.frameSize = `${img.naturalWidth}×${img.naturalHeight}`;
      });
      img.addEventListener('error', () => {
        if (!this.stopped) this.o.onError('Flux MJPEG <img> en erreur.');
      });
      img.src = urls.mjpegUrl;
      this.imgEl = img;
      this.o.host.appendChild(img);
      this.note = 'Stats limitées : <img> natif (pas d’accès aux images)';
    } else if (engine === 'native' || engine === 'video-canvas') {
      this.startVideo(engine);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'car-lab__surface';
      this.o.host.appendChild(this.canvas);
      if (engine === 'webgl') this.initGl();
      else this.ctx2d = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
      void this.readMjpeg(urls.mjpegUrl);
      this.raf = requestAnimationFrame(this.tick);
    }

    this.statsTimer = window.setInterval(() => this.emitStats(), 1000);
  }

  stop(): void {
    this.stopped = true;
    try {
      this.abort?.abort();
    } catch {
      // ignore
    }
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.statsTimer);
    this.queueWaiters.splice(0).forEach((r) => r());
    this.queue = [];
    for (const m of [this.audioEl, this.videoEl]) {
      if (!m) continue;
      try {
        m.pause();
        m.removeAttribute('src');
        m.load();
      } catch {
        // ignore
      }
    }
    if (this.imgEl) this.imgEl.removeAttribute('src');
    if (this.gl) {
      try {
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // ignore
      }
    }
    this.o.host.innerHTML = '';
  }

  resumeAudio(): void {
    void this.audioEl?.play().catch(() => undefined);
    void this.videoEl?.play().catch(() => undefined);
  }

  // ---------- MJPEG fetch + jitter buffer ----------

  private get maxQueue(): number {
    return this.o.buffer === 'cautious' ? Math.round(this.fps * 3) : 4;
  }

  private get prebuffer(): number {
    return this.o.buffer === 'cautious' ? Math.max(2, Math.round(this.fps * 0.75)) : 1;
  }

  private async readMjpeg(url: string): Promise<void> {
    this.abort = new AbortController();
    let res: Response;
    try {
      res = await fetch(url, { signal: this.abort.signal, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      if (!this.stopped) {
        this.state = 'error';
        this.o.onError(`Connexion MJPEG impossible : ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (!res.ok || !res.body) {
      this.state = 'error';
      this.o.onError(`MJPEG HTTP ${res.status}`);
      return;
    }
    this.state = 'buffering';
    const reader = res.body.getReader();
    const splitter = new JpegSplitter();
    const burst = this.o.pace === 'burst';
    try {
      for (;;) {
        if (this.stopped) break;
        // Backpressure : en mode « burst » on arrête de lire quand le buffer est plein (TCP freine FFmpeg)
        while (burst && this.queue.length >= this.maxQueue && !this.stopped) {
          await new Promise<void>((r) => this.queueWaiters.push(r));
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        this.winBytes += value.byteLength;
        splitter.push(value, (jpeg) => {
          const now = performance.now();
          this.arrivalTimes.push(now);
          if (this.arrivalTimes.length > 60) this.arrivalTimes.shift();
          this.winReceived++;
          this.queue.push({ index: this.receivedIndex++, data: jpeg, arrivedAt: now });
          // Temps réel : on jette les plus anciennes plutôt que d'accumuler du retard
          if (!burst) {
            while (this.queue.length > this.maxQueue) {
              this.queue.shift();
              this.totalDropped++;
            }
          }
        });
      }
    } catch (e) {
      if (!this.stopped && !(e instanceof DOMException && e.name === 'AbortError')) {
        this.o.onError(`Flux MJPEG interrompu : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!this.stopped) this.note = 'Fin du flux MJPEG';
  }

  /** Index d'image que l'horloge demande maintenant. */
  private wantedIndex(now: number): number {
    const a = this.audioEl;
    if (this.o.clock === 'audio' && a && this.o.audio && !a.paused && a.currentTime > 0 && a.readyState >= 2) {
      return Math.floor(a.currentTime * this.fps);
    }
    return this.clockOffsetFrames + Math.floor(((now - this.clockStart) / 1000) * this.fps);
  }

  private tick = (now: number): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.busy) return;

    if (!this.started) {
      if (this.queue.length >= this.prebuffer) {
        this.started = true;
        this.clockStart = now;
        this.clockOffsetFrames = this.queue[0].index;
        this.state = 'playing';
      } else {
        return;
      }
    }

    if (this.queue.length === 0) {
      if (!this.underrun) {
        this.underrun = true;
        this.totalStalls++;
        this.state = 'stalled';
      }
      // Horloge fixe : on met la pendule en pause pendant le sous-régime
      if (this.o.clock === 'fixed' || !this.audioEl || this.audioEl.paused) {
        this.clockStart = now;
        this.clockOffsetFrames = this.lastPaintedIndex + 1;
      }
      return;
    }
    if (this.underrun) {
      this.underrun = false;
      this.state = 'playing';
    }

    const wanted = this.wantedIndex(now);
    if (this.queue[0].index > wanted) return; // en avance : attendre

    // Garder la plus récente image <= wanted, jeter les autres (pas de file d'attente qui dérive)
    let pick: QueuedFrame | undefined;
    while (this.queue.length && this.queue[0].index <= wanted) {
      if (pick) this.totalDropped++;
      pick = this.queue.shift();
    }
    this.queueWaiters.splice(0).forEach((r) => r());
    if (!pick) return;
    if (wanted - pick.index >= 2) this.totalLate++;
    void this.paint(pick, now);
  };

  private async paint(frame: QueuedFrame, now: number): Promise<void> {
    this.busy = true;
    const t0 = performance.now();
    try {
      const engine = this.o.engine;
      if (engine === 'webcodecs') {
        const Dec = (window as unknown as { ImageDecoder: new (init: { data: Uint8Array; type: string }) => { decode: () => Promise<{ image: { displayWidth: number; displayHeight: number; close: () => void } }>; close: () => void } }).ImageDecoder;
        const dec = new Dec({ data: frame.data, type: 'image/jpeg' });
        const { image } = await dec.decode();
        const t1 = performance.now();
        this.ensureSize(image.displayWidth, image.displayHeight);
        this.ctx2d?.drawImage(image as unknown as CanvasImageSource, 0, 0);
        image.close();
        dec.close();
        this.recordTimes(t0, t1);
      } else if (engine === 'canvas-img') {
        const url = URL.createObjectURL(new Blob([frame.data], { type: 'image/jpeg' }));
        const img = new Image();
        img.src = url;
        try {
          if (typeof img.decode === 'function') await img.decode();
          else await new Promise<void>((r, j) => { img.onload = () => r(); img.onerror = () => j(new Error('decode')); });
        } finally {
          URL.revokeObjectURL(url);
        }
        const t1 = performance.now();
        this.ensureSize(img.naturalWidth, img.naturalHeight);
        this.ctx2d?.drawImage(img, 0, 0);
        this.recordTimes(t0, t1);
      } else {
        const bmp = await createImageBitmap(new Blob([frame.data], { type: 'image/jpeg' }));
        const t1 = performance.now();
        this.ensureSize(bmp.width, bmp.height);
        if (engine === 'webgl') this.drawGl(bmp);
        else this.ctx2d?.drawImage(bmp, 0, 0);
        bmp.close();
        this.recordTimes(t0, t1);
      }
      this.lastPaintedIndex = frame.index;
      this.winPainted++;
      this.paintTimes.push(now);
      if (this.paintTimes.length > 60) this.paintTimes.shift();
    } catch (e) {
      this.totalDropped++;
      this.note = `Décodage KO : ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  private recordTimes(t0: number, t1: number): void {
    this.winDecode.push(t1 - t0);
    this.winPaint.push(performance.now() - t1);
  }

  private ensureSize(w: number, h: number): void {
    const c = this.canvas;
    if (!c || !w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.frameSize = `${w}×${h}`;
      if (this.gl) this.gl.viewport(0, 0, w, h);
    }
  }

  private initGl(): void {
    const c = this.canvas;
    if (!c) return;
    const gl = (c.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false }) ||
      c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      this.o.onError('WebGL indisponible');
      return;
    }
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, 'attribute vec2 p;varying vec2 t;void main(){t=vec2((p.x+1.0)*0.5,(1.0-p.y)*0.5);gl_Position=vec4(p,0.0,1.0);}');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, 'precision mediump float;varying vec2 t;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,t);}');
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.gl = gl;
    this.glTex = tex;
  }

  private drawGl(src: ImageBitmap): void {
    const gl = this.gl;
    if (!gl || !this.glTex) return;
    gl.bindTexture(gl.TEXTURE_2D, this.glTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- <video> natif / caché ----------

  private startVideo(engine: 'native' | 'video-canvas'): void {
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.muted = engine === 'video-canvas';
    v.src = this.o.streamUrl;
    this.videoEl = v;
    const seekTo = () => {
      try {
        if (this.o.seek > 0) v.currentTime = this.o.seek;
      } catch {
        // ignore
      }
    };
    v.addEventListener('loadedmetadata', seekTo, { once: true });
    v.addEventListener('playing', () => { this.state = 'playing'; });
    v.addEventListener('waiting', () => { this.state = 'stalled'; this.totalStalls++; });
    v.addEventListener('pause', () => { if (!this.stopped) this.note = '<video> mis en pause (Drive ?)'; });
    v.addEventListener('error', () => {
      if (!this.stopped) this.o.onError(`<video> erreur code ${v.error?.code ?? '?'}`);
    });
    if (engine === 'native') {
      v.className = 'car-lab__surface';
      this.o.host.appendChild(v);
    } else {
      v.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
      this.o.host.appendChild(v);
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'car-lab__surface';
      this.o.host.appendChild(this.canvas);
      this.ctx2d = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
      const draw = (now: number) => {
        if (this.stopped) return;
        this.raf = requestAnimationFrame(draw);
        if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
        this.lastVideoTime = v.currentTime;
        const t0 = performance.now();
        this.ensureSize(v.videoWidth, v.videoHeight);
        this.ctx2d?.drawImage(v, 0, 0);
        this.winPaint.push(performance.now() - t0);
        this.winPainted++;
        this.paintTimes.push(now);
        if (this.paintTimes.length > 60) this.paintTimes.shift();
      };
      this.raf = requestAnimationFrame(draw);
    }
    void v.play().catch(() => {
      this.note = '<video>.play() refusé (Drive ou autoplay)';
    });
    if (engine === 'native') this.frameSize = '…';
  }

  // ---------- stats ----------

  private emitStats(): void {
    const intervals: number[] = [];
    for (let i = 1; i < this.paintTimes.length; i++) intervals.push(this.paintTimes[i] - this.paintTimes[i - 1]);
    const arrivals: number[] = [];
    for (let i = 1; i < this.arrivalTimes.length; i++) arrivals.push(this.arrivalTimes[i] - this.arrivalTimes[i - 1]);

    let fpsPainted = this.winPainted;
    let dropped = this.totalDropped;
    let bufferMs = (this.queue.length / this.fps) * 1000;
    const v = this.videoEl;
    if (v) {
      const q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null;
      if (q) dropped = q.droppedVideoFrames;
      try {
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) {
            bufferMs = (v.buffered.end(i) - v.currentTime) * 1000;
          }
        }
      } catch {
        // ignore
      }
      if (this.o.engine === 'native') {
        this.frameSize = v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '—';
        const total = q ? q.totalVideoFrames : 0;
        fpsPainted = Math.max(0, total - this.lastTotalFrames);
        this.lastTotalFrames = total;
      }
    }

    const a = this.audioEl;
    let avSyncMs: number | null = null;
    if (a && this.o.audio && a.currentTime > 0) {
      if (this.lastPaintedIndex >= 0 && this.canvas && !v) {
        avSyncMs = Math.round((this.lastPaintedIndex / this.fps - a.currentTime) * 1000);
      } else if (v && this.o.engine === 'video-canvas') {
        avSyncMs = Math.round((v.currentTime - (this.o.seek + a.currentTime)) * 1000);
      }
    }

    const s: LabStats = {
      engine: this.o.engine,
      state: this.state,
      position: this.getPosition(),
      fpsPainted,
      fpsReceived: this.winReceived,
      targetFps: this.fps,
      dropped,
      late: this.totalLate,
      stalls: this.totalStalls,
      paintJitterMs: Math.round(stddev(intervals)),
      arrivalJitterMs: Math.round(stddev(arrivals)),
      kbps: Math.round((this.winBytes * 8) / 1000),
      bufferFrames: this.queue.length,
      bufferMs: Math.round(bufferMs),
      decodeMs: Math.round(avg(this.winDecode) * 10) / 10,
      paintMs: Math.round(avg(this.winPaint) * 10) / 10,
      avSyncMs,
      frameSize: this.frameSize,
      audioState: !this.o.audio ? 'coupé' : a ? (a.paused ? 'pause' : a.readyState >= 3 ? 'lecture' : 'chargement') : this.o.engine === 'native' ? 'via <video>' : '—',
      note: this.note,
    };
    this.winPainted = 0;
    this.winReceived = 0;
    this.winBytes = 0;
    this.winDecode = [];
    this.winPaint = [];
    this.o.onStats(s);
  }
}
