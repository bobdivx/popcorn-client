/**
 * Empreinte automatique des capacités / restrictions du navigateur (Tesla Park vs Drive).
 *
 * Collectée sans aucune action : au chargement de /car et /car/lab, puis à chaque transition Park↔Drive.
 * Envoyée au serveur Popcorn (POST /api/car/capabilities, enregistrement « capabilities » par session + mode),
 * lisible via GET /api/car/capabilities (dernier Park vs dernier Drive) et le menu « Capacités » du labo.
 *
 * Chaque test est isolé (try/catch + délai max) et léger : aucun impact sur la lecture en cours.
 * Le dernier relevé par mode est aussi gardé en localStorage pour choisir automatiquement moteur/preset en Drive.
 */
import { serverApi } from '../../../lib/client/server-api';
import { detectTeslaDriveMode, type TeslaDriveMode } from './driveModeDetector';

export type CapsReason = 'load' | 'transition' | 'manual';

export interface CapsRecord {
  kind: 'capabilities';
  v: 1;
  session: string;
  mode: TeslaDriveMode;
  reason: CapsReason;
  page: string;
  at: string;
  durationMs: number;
  clientVersion: string | null;
  env: Record<string, unknown>;
  media: Record<string, unknown>;
  apis: Record<string, unknown>;
  perf: Record<string, unknown>;
  errors: Record<string, string>;
  received_at?: number;
}

export interface CarAutoTuning {
  /** Moteur Drive recommandé pour /car */
  engine: 'img' | 'canvas' | 'worker';
  /** Preset qualité Drive recommandé */
  preset: 'standard' | 'lite';
  /** Relevé utilisé */
  basis: 'drive' | 'park' | 'none';
  /** Worker + OffscreenCanvas 2D utilisable (piste pour un moteur hors thread principal) */
  workerOffscreen: boolean;
  reasons: string[];
}

const SESSION_KEY = 'popcorn_car_caps_session';
const LAST_KEY = 'popcorn_car_caps_last_v1';
export const CAPS_ENDPOINT = '/api/car/capabilities';

/* ------------------------------------------------------------------ utils */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return m.slice(0, 200);
}

async function check<T>(errors: Record<string, string>, name: string, fn: () => T | Promise<T>, ms = 3000): Promise<T | null> {
  try {
    return await withTimeout(Promise.resolve().then(fn), ms);
  } catch (e) {
    errors[name] = errMsg(e);
    return null;
  }
}

function round(n: number, d = 2): number {
  const k = 10 ** d;
  return Math.round(n * k) / k;
}

function stats(arr: number[]): { n: number; avg: number; min: number; max: number; p50: number } | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, avg: round(sum / s.length), min: round(s[0]), max: round(s[s.length - 1]), p50: round(s[Math.floor(s.length / 2)]) };
}

export function getCapsSession(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return 'nosession';
  }
}

export function getServerBase(): string {
  try {
    const u = serverApi.getServerUrl();
    if (u) return u.replace(/\/+$/, '');
  } catch {
    // ignore
  }
  return '';
}

/* --------------------------------------------------------------- collectors */

const CODECS: { id: string; mime: string; wc?: string }[] = [
  { id: 'h264_baseline', mime: 'video/mp4; codecs="avc1.42E01E"', wc: 'avc1.42E01E' },
  { id: 'h264_high', mime: 'video/mp4; codecs="avc1.640028"', wc: 'avc1.640028' },
  { id: 'hevc', mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"', wc: 'hvc1.1.6.L93.B0' },
  { id: 'vp9_mp4', mime: 'video/mp4; codecs="vp09.00.10.08"', wc: 'vp09.00.10.08' },
  { id: 'vp9_webm', mime: 'video/webm; codecs="vp09.00.10.08"' },
  { id: 'av1_mp4', mime: 'video/mp4; codecs="av01.0.04M.08"', wc: 'av01.0.04M.08' },
  { id: 'av1_webm', mime: 'video/webm; codecs="av01.0.04M.08"' },
  { id: 'aac', mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { id: 'mp3', mime: 'audio/mpeg' },
  { id: 'opus_webm', mime: 'audio/webm; codecs="opus"' },
];

async function collectEnv(errors: Record<string, string>): Promise<Record<string, unknown>> {
  const nav = navigator as Navigator & Record<string, any>;
  const env: Record<string, unknown> = {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 5) : null,
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return null;
      }
    })(),
    onLine: nav.onLine,
    maxTouchPoints: nav.maxTouchPoints ?? null,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    visibility: document.visibilityState,
    secureContext: window.isSecureContext,
  };
  const uad = nav.userAgentData;
  if (uad) {
    env.uaData = { brands: uad.brands, mobile: uad.mobile, platform: uad.platform };
    env.uaHighEntropy = await check(errors, 'uaHighEntropy', () =>
      uad.getHighEntropyValues(['platform', 'platformVersion', 'model', 'architecture', 'bitness', 'fullVersionList', 'uaFullVersion', 'wow64']),
    1500);
  } else {
    env.uaData = null;
  }
  try {
    const pm = (performance as any).memory;
    env.performanceMemory = pm
      ? { jsHeapSizeLimit: pm.jsHeapSizeLimit, totalJSHeapSize: pm.totalJSHeapSize, usedJSHeapSize: pm.usedJSHeapSize }
      : null;
  } catch (e) {
    errors.performanceMemory = errMsg(e);
  }
  env.screen = {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    orientation: (screen as any).orientation?.type ?? null,
  };
  env.viewport = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio };
  try {
    const c = nav.connection;
    env.connection = c
      ? { effectiveType: c.effectiveType ?? null, downlink: c.downlink ?? null, rtt: c.rtt ?? null, saveData: c.saveData ?? null, type: c.type ?? null }
      : null;
  } catch (e) {
    errors.connection = errMsg(e);
  }
  env.storage = await check(errors, 'storage', async () => {
    if (!nav.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    return { quota: est.quota ?? null, usage: est.usage ?? null };
  }, 1500);
  return env;
}

async function collectMedia(errors: Record<string, string>): Promise<Record<string, unknown>> {
  const media: Record<string, unknown> = {};

  // <video> qui avance réellement (même sonde que la détection Park/Drive)
  media.videoProbe = await check(errors, 'videoProbe', async () => {
    const r = await detectTeslaDriveMode();
    return { mode: r.mode, confidence: r.confidence, reason: r.reason ?? null };
  }, 6000);

  const v = document.createElement('video');
  const canPlay: Record<string, string> = {};
  for (const c of CODECS) {
    try {
      canPlay[c.id] = v.canPlayType(c.mime) || 'no';
    } catch (e) {
      canPlay[c.id] = `err ${errMsg(e)}`;
    }
  }
  media.canPlayType = canPlay;

  const MS: any = (window as any).MediaSource;
  const MMS: any = (window as any).ManagedMediaSource;
  const mse: Record<string, unknown> = { MediaSource: typeof MS === 'function', ManagedMediaSource: typeof MMS === 'function' };
  if (typeof MS === 'function' && typeof MS.isTypeSupported === 'function') {
    const sup: Record<string, boolean> = {};
    for (const c of CODECS) {
      try {
        sup[c.id] = !!MS.isTypeSupported(c.mime);
      } catch {
        sup[c.id] = false;
      }
    }
    mse.isTypeSupported = sup;
  }
  media.mse = mse;

  const mc: any = (navigator as any).mediaCapabilities;
  if (mc?.decodingInfo) {
    const out: Record<string, unknown> = {};
    for (const c of CODECS.filter((x) => x.mime.startsWith('video/'))) {
      for (const type of ['file', 'media-source'] as const) {
        const r = await check(errors, `decodingInfo.${c.id}.${type}`, () =>
          mc.decodingInfo({ type, video: { contentType: c.mime, width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 } }),
        1500);
        if (r) out[`${c.id}.${type}`] = { supported: !!r.supported, smooth: !!r.smooth, powerEfficient: !!r.powerEfficient };
      }
    }
    media.decodingInfo = out;
  } else {
    media.decodingInfo = null;
  }

  const VD: any = (window as any).VideoDecoder;
  const ID: any = (window as any).ImageDecoder;
  const wc: Record<string, unknown> = {
    VideoDecoder: typeof VD === 'function',
    ImageDecoder: typeof ID === 'function',
    VideoFrame: typeof (window as any).VideoFrame === 'function',
    AudioDecoder: typeof (window as any).AudioDecoder === 'function',
  };
  if (typeof VD === 'function' && VD.isConfigSupported) {
    const sup: Record<string, unknown> = {};
    for (const c of CODECS.filter((x) => x.wc)) {
      const r = await check(errors, `webcodecs.${c.id}`, () => VD.isConfigSupported({ codec: c.wc, codedWidth: 1280, codedHeight: 720 }), 1500);
      sup[c.id] = r ? !!r.supported : null;
    }
    wc.videoConfigSupported = sup;
  }
  if (typeof ID === 'function' && ID.isTypeSupported) {
    wc.imageJpeg = await check(errors, 'imageDecoder.jpeg', () => ID.isTypeSupported('image/jpeg'), 1000);
  }
  media.webcodecs = wc;

  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  media.webAudio = {
    AudioContext: typeof AC === 'function',
    AudioWorklet: typeof (window as any).AudioWorkletNode === 'function',
  };
  const gap: any = (navigator as any).getAutoplayPolicy;
  media.autoplayPolicy =
    typeof gap === 'function'
      ? {
          mediaelement: (() => {
            try {
              return gap.call(navigator, 'mediaelement');
            } catch (e) {
              return `err ${errMsg(e)}`;
            }
          })(),
          audiocontext: (() => {
            try {
              return gap.call(navigator, 'audiocontext');
            } catch (e) {
              return `err ${errMsg(e)}`;
            }
          })(),
        }
      : null;
  media.requestVideoFrameCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  return media;
}

const WASM_SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const WASM_THREADS = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11]);

function glInfo(kind: 'webgl' | 'webgl2'): Record<string, unknown> | null {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const gl = c.getContext(kind) as WebGLRenderingContext | null;
  if (!gl) return null;
  const out: Record<string, unknown> = {
    version: gl.getParameter(gl.VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    out.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    out.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  } else {
    out.vendor = gl.getParameter(gl.VENDOR);
    out.renderer = gl.getParameter(gl.RENDERER);
  }
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // ignore
  }
  return out;
}

const WORKER_SRC = `
self.onmessage = async (ev) => {
  const r = {
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    ctx2d: false, webgl: false, webgl2: false,
    createImageBitmap: typeof createImageBitmap === 'function',
    fetch: typeof fetch === 'function',
    VideoDecoder: typeof VideoDecoder !== 'undefined',
    ImageDecoder: typeof ImageDecoder !== 'undefined',
  };
  try { if (r.offscreenCanvas) r.ctx2d = !!new OffscreenCanvas(16, 16).getContext('2d'); } catch (e) { r.err2d = String(e); }
  try { if (r.offscreenCanvas) r.webgl = !!new OffscreenCanvas(16, 16).getContext('webgl'); } catch (e) { r.errWebgl = String(e); }
  try { if (r.offscreenCanvas) r.webgl2 = !!new OffscreenCanvas(16, 16).getContext('webgl2'); } catch (e) { r.errWebgl2 = String(e); }
  const blob = ev.data && ev.data.jpeg;
  if (blob && r.createImageBitmap) {
    try {
      const c = r.ctx2d ? new OffscreenCanvas(640, 360) : null;
      const ctx = c ? c.getContext('2d') : null;
      const times = [];
      for (let i = 0; i < 8; i++) {
        const t0 = performance.now();
        const bmp = await createImageBitmap(blob);
        if (ctx) ctx.drawImage(bmp, 0, 0);
        bmp.close && bmp.close();
        times.push(performance.now() - t0);
      }
      r.jpegDecodeMs = times;
    } catch (e) { r.errDecode = String(e); }
  }
  self.postMessage(r);
};`;

async function workerCheck(jpeg: Blob | null): Promise<Record<string, unknown>> {
  if (typeof Worker !== 'function') return { Worker: false };
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  let w: Worker | null = null;
  try {
    w = new Worker(url);
    const res = await withTimeout(
      new Promise<Record<string, unknown>>((resolve, reject) => {
        w!.onmessage = (e) => resolve(e.data as Record<string, unknown>);
        w!.onerror = (e) => reject(new Error(e.message || 'worker error'));
        w!.postMessage({ jpeg });
      }),
      4000,
    );
    const times = Array.isArray(res.jpegDecodeMs) ? (res.jpegDecodeMs as number[]) : null;
    if (times) res.jpegDecodeMs = stats(times);
    return { Worker: true, ...res };
  } finally {
    try {
      w?.terminate();
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);
  }
}

async function makeTestJpeg(): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 640, 360);
  g.addColorStop(0, '#1d3557');
  g.addColorStop(0.5, '#e63946');
  g.addColorStop(1, '#f1faee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 360);
  // Bruit déterministe : une image « réaliste » pèse ~25-40 ko comme une frame MJPEG 360p
  let seed = 12345;
  for (let i = 0; i < 1600; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = seed % 640;
    const y = (seed >> 10) % 360;
    ctx.fillStyle = `hsl(${seed % 360},70%,${30 + (seed % 50)}%)`;
    ctx.fillRect(x, y, 3 + (seed % 9), 3 + ((seed >> 4) % 9));
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('Popcorn caps', 150, 190);
  return new Promise<Blob | null>((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/jpeg', 0.75);
    } catch {
      resolve(null);
    }
  });
}

async function collectApis(errors: Record<string, string>, jpeg: Blob | null): Promise<Record<string, unknown>> {
  const w = window as any;
  const nav = navigator as any;
  const apis: Record<string, unknown> = {
    Worker: typeof Worker === 'function',
    OffscreenCanvas: typeof w.OffscreenCanvas === 'function',
    transferControlToOffscreen: typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype,
    SharedArrayBuffer: typeof w.SharedArrayBuffer === 'function',
    crossOriginIsolated: !!w.crossOriginIsolated,
    WebSocket: typeof w.WebSocket === 'function',
    WebTransport: typeof w.WebTransport === 'function',
    ReadableStream: typeof w.ReadableStream === 'function',
    TransformStream: typeof w.TransformStream === 'function',
    serviceWorker: 'serviceWorker' in navigator,
    serviceWorkerControlled: !!nav.serviceWorker?.controller,
    wakeLock: 'wakeLock' in navigator,
    fullscreen: {
      fullscreenEnabled: !!(document as any).fullscreenEnabled,
      requestFullscreen: typeof (document.documentElement as any).requestFullscreen === 'function',
      webkitRequestFullscreen: typeof (document.documentElement as any).webkitRequestFullscreen === 'function',
    },
    WebGPU: 'gpu' in navigator,
    createImageBitmap: typeof w.createImageBitmap === 'function',
    PerformanceObserver: typeof w.PerformanceObserver === 'function',
    longTaskSupported: (() => {
      try {
        return (w.PerformanceObserver?.supportedEntryTypes || []).includes('longtask');
      } catch {
        return false;
      }
    })(),
  };

  apis.wasm = await check(errors, 'wasm', () => {
    const WA = w.WebAssembly;
    if (!WA) return { supported: false };
    let simd = false;
    let threads = false;
    try {
      simd = WA.validate(WASM_SIMD);
    } catch {
      // ignore
    }
    try {
      threads = WA.validate(WASM_THREADS) && typeof w.SharedArrayBuffer === 'function';
    } catch {
      // ignore
    }
    let sharedMemory = false;
    try {
      sharedMemory = new WA.Memory({ initial: 1, maximum: 1, shared: true }).buffer instanceof w.SharedArrayBuffer;
    } catch {
      // ignore
    }
    return { supported: true, simd, threads, sharedMemory };
  }, 1000);

  apis.webgl1 = await check(errors, 'webgl1', () => glInfo('webgl'), 1500);
  apis.webgl2 = await check(errors, 'webgl2', () => glInfo('webgl2'), 1500);

  if (nav.gpu?.requestAdapter) {
    apis.webgpuAdapter = await check(errors, 'webgpu', async () => {
      const a = await nav.gpu.requestAdapter();
      if (!a) return { adapter: false };
      let info: any = a.info || null;
      if (!info && typeof a.requestAdapterInfo === 'function') info = await a.requestAdapterInfo();
      return {
        adapter: true,
        vendor: info?.vendor ?? null,
        architecture: info?.architecture ?? null,
        device: info?.device ?? null,
        description: info?.description ?? null,
        isFallbackAdapter: a.isFallbackAdapter ?? null,
      };
    }, 2500);
  }

  // fetch en streaming (ReadableStream sur Response.body) sur une ressource même origine minuscule
  apis.fetchStreams = await check(errors, 'fetchStreams', async () => {
    const r = await fetch(`/VERSION.json?caps=${Date.now()}`, { cache: 'no-store' });
    const reader = r.body?.getReader();
    if (!reader) return { ok: false, body: false, status: r.status };
    let bytes = 0;
    let chunks = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks++;
      bytes += value.byteLength;
      parts.push(value);
    }
    let version: string | null = null;
    try {
      const all = new Uint8Array(bytes);
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.byteLength;
      }
      const j = JSON.parse(new TextDecoder().decode(all));
      version = j?.client?.version ? `${j.client.version}+${j.client.build ?? ''}` : null;
    } catch {
      // ignore
    }
    return { ok: true, body: true, status: r.status, chunks, bytes, version };
  }, 3000);

  if (jpeg && typeof w.createImageBitmap === 'function') {
    apis.createImageBitmapOptions = await check(errors, 'createImageBitmapOptions', async () => {
      const out: Record<string, boolean> = {};
      const tries: Record<string, ImageBitmapOptions> = {
        resize: { resizeWidth: 64, resizeHeight: 36 },
        resizeQualityLow: { resizeWidth: 64, resizeHeight: 36, resizeQuality: 'low' },
        imageOrientation: { imageOrientation: 'none' as ImageOrientation },
        premultiplyAlpha: { premultiplyAlpha: 'none' },
        colorSpaceConversion: { colorSpaceConversion: 'none' },
      };
      for (const [k, opt] of Object.entries(tries)) {
        try {
          const b = await createImageBitmap(jpeg, opt);
          out[k] = b.width > 0;
          b.close();
        } catch {
          out[k] = false;
        }
      }
      return out;
    }, 3000);
  }

  apis.worker = await check(errors, 'worker', () => workerCheck(jpeg), 5000);
  return apis;
}

async function measureRaf(): Promise<Record<string, unknown>> {
  if (typeof requestAnimationFrame !== 'function') return { supported: false };
  const intervals: number[] = [];
  let frames = 0;
  const start = performance.now();
  let last = start;
  await new Promise<void>((resolve) => {
    const hard = setTimeout(resolve, 1600);
    const tick = (t: number) => {
      frames++;
      if (frames > 1) intervals.push(t - last);
      last = t;
      if (t - start >= 1000) {
        clearTimeout(hard);
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const elapsed = Math.max(1, last - start);
  return { supported: true, frames, fps: round(((frames - 1) * 1000) / elapsed, 1), interval: stats(intervals), janks: intervals.filter((x) => x > 50).length };
}

async function measureTimeouts(): Promise<Record<string, unknown>> {
  const delays: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t0 = performance.now();
    await new Promise<void>((r) => setTimeout(r, 0));
    delays.push(performance.now() - t0);
  }
  const t0 = performance.now();
  await sleep(10);
  const ten = performance.now() - t0;
  return { zero: stats(delays), firstFiveAvg: round(delays.slice(0, 5).reduce((a, b) => a + b, 0) / 5), nestedAvg: round(delays.slice(5).reduce((a, b) => a + b, 0) / Math.max(1, delays.length - 5)), sleep10: round(ten) };
}

async function benchJpeg(errors: Record<string, string>, jpeg: Blob | null): Promise<Record<string, unknown>> {
  if (!jpeg) return { ok: false, note: 'toBlob jpeg indisponible' };
  const out: Record<string, unknown> = { ok: true, bytes: jpeg.size, width: 640, height: 360 };
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext('2d');
  if (typeof createImageBitmap === 'function') {
    out.createImageBitmap = await check(errors, 'bench.createImageBitmap', async () => {
      const times: number[] = [];
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now();
        const b = await createImageBitmap(jpeg);
        ctx?.drawImage(b, 0, 0);
        b.close();
        times.push(performance.now() - t0);
        await sleep(0);
      }
      return stats(times);
    }, 5000);
  }
  out.imgDecode = await check(errors, 'bench.imgDecode', async () => {
    const url = URL.createObjectURL(jpeg);
    const times: number[] = [];
    try {
      for (let i = 0; i < 6; i++) {
        const img = new Image();
        const t0 = performance.now();
        img.src = `${url}#${i}`;
        if (typeof img.decode === 'function') await img.decode();
        else await new Promise((r, j) => ((img.onload = r), (img.onerror = j)));
        ctx?.drawImage(img, 0, 0);
        times.push(performance.now() - t0);
        await sleep(0);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
    return stats(times);
  }, 5000);
  const ID: any = (window as any).ImageDecoder;
  if (typeof ID === 'function') {
    out.imageDecoder = await check(errors, 'bench.imageDecoder', async () => {
      const buf = await jpeg.arrayBuffer();
      const times: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        const dec = new ID({ data: buf.slice(0), type: 'image/jpeg' });
        const { image } = await dec.decode();
        ctx?.drawImage(image, 0, 0);
        image.close();
        dec.close();
        times.push(performance.now() - t0);
        await sleep(0);
      }
      return stats(times);
    }, 5000);
  }
  return out;
}

/* ------------------------------------------------------------- orchestration */

export async function collectCapabilities(opts: { mode: TeslaDriveMode; reason: CapsReason; page: string }): Promise<CapsRecord> {
  const t0 = performance.now();
  const errors: Record<string, string> = {};
  let longTasks = 0;
  let longTaskMs = 0;
  let po: PerformanceObserver | null = null;
  try {
    if ((PerformanceObserver?.supportedEntryTypes || []).includes('longtask')) {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longTasks++;
          longTaskMs += e.duration;
        }
      });
      po.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    }
  } catch (e) {
    errors.longtask = errMsg(e);
  }

  const env = (await check(errors, 'env', () => collectEnv(errors), 4000)) || {};
  const media = (await check(errors, 'media', () => collectMedia(errors), 20000)) || {};
  const jpeg = await check(errors, 'testJpeg', () => makeTestJpeg(), 2000);
  const apis = (await check(errors, 'apis', () => collectApis(errors, jpeg), 20000)) || {};
  const perf: Record<string, unknown> = {};
  perf.raf = await check(errors, 'raf', () => measureRaf(), 2500);
  perf.timers = await check(errors, 'timers', () => measureTimeouts(), 2500);
  perf.jpeg = await check(errors, 'jpeg', () => benchJpeg(errors, jpeg), 12000);
  try {
    po?.disconnect();
  } catch {
    // ignore
  }
  perf.longTasks = po ? { count: longTasks, totalMs: round(longTaskMs) } : null;

  const probeMode = (media.videoProbe as { mode?: TeslaDriveMode } | null)?.mode;
  const mode: TeslaDriveMode = opts.mode !== 'unknown' ? opts.mode : probeMode && probeMode !== 'unknown' ? probeMode : 'unknown';
  const fs = apis.fetchStreams as { version?: string | null } | null;
  return {
    kind: 'capabilities',
    v: 1,
    session: getCapsSession(),
    mode,
    reason: opts.reason,
    page: opts.page,
    at: new Date().toISOString(),
    durationMs: Math.round(performance.now() - t0),
    clientVersion: fs?.version ?? null,
    env,
    media,
    apis,
    perf,
    errors,
  };
}

function saveLocal(rec: CapsRecord): void {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || '{}') as Record<string, CapsRecord>;
    all[rec.mode] = rec;
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch {
    // ignore (quota…)
  }
}

export function getLocalCapabilities(): Partial<Record<TeslaDriveMode, CapsRecord>> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') as Partial<Record<TeslaDriveMode, CapsRecord>>;
  } catch {
    return {};
  }
}

/** POST texte brut (requête « simple », sans pré-vol CORS) ; direct serveur puis repli via proxy client /srv. */
export async function postCapabilities(rec: CapsRecord): Promise<string> {
  const body = JSON.stringify(rec);
  const targets: string[] = [];
  const base = getServerBase();
  if (base) targets.push(`${base}${CAPS_ENDPOINT}`);
  targets.push(`/srv${CAPS_ENDPOINT}`);
  let last = 'aucune cible';
  for (const url of targets) {
    try {
      const r = await withTimeout(
        fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: body.length < 60000, credentials: 'omit' }),
        8000,
      );
      if (r.ok) return url;
      last = `${url} → HTTP ${r.status}`;
    } catch (e) {
      last = `${url} → ${errMsg(e)}`;
    }
  }
  throw new Error(last);
}

/* ------------------------------------------------- planification automatique */

let running = false;
let pending: { mode: TeslaDriveMode; reason: CapsReason; page: string } | null = null;
let lastReported: TeslaDriveMode | null = null;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(rec: CapsRecord, sentTo: string | null, err: string | null) => void>();

export function onCapabilitiesReported(fn: (rec: CapsRecord, sentTo: string | null, err: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function runQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const job = pending;
      pending = null;
      // Laisser la lecture démarrer avant de lancer les tests
      await sleep(job.reason === 'manual' ? 0 : 2500);
      let rec: CapsRecord;
      try {
        rec = await collectCapabilities(job);
      } catch (e) {
        console.warn('[car-caps] collecte échouée', e);
        continue;
      }
      saveLocal(rec);
      let sentTo: string | null = null;
      let err: string | null = null;
      try {
        sentTo = await postCapabilities(rec);
      } catch (e) {
        err = errMsg(e);
        console.warn('[car-caps] envoi échoué', err);
      }
      listeners.forEach((fn) => {
        try {
          fn(rec, sentTo, err);
        } catch {
          // ignore
        }
      });
    }
  } finally {
    running = false;
  }
}

/** Lance une collecte maintenant (bouton du labo). */
export function requestCapabilitiesReport(page: string, mode: TeslaDriveMode, reason: CapsReason = 'manual'): void {
  if (typeof window === 'undefined') return;
  pending = { mode, reason, page };
  void runQueue();
}

/**
 * À appeler à chaque changement du mode détecté (et au montage avec le mode initial).
 * - 1er relevé au chargement (dès que Park/Drive est connu, au plus tard ~5 s avec « unknown ») ;
 * - puis un relevé à chaque transition Park↔Drive.
 */
export function noteDriveModeForCapabilities(page: string, mode: TeslaDriveMode): void {
  if (typeof window === 'undefined') return;
  if (mode === 'unknown') {
    if (lastReported === null && !loadTimer) {
      loadTimer = setTimeout(() => {
        loadTimer = null;
        if (lastReported === null) {
          lastReported = 'unknown';
          requestCapabilitiesReport(page, 'unknown', 'load');
        }
      }, 5000);
    }
    return;
  }
  if (mode === lastReported) return;
  if (loadTimer) {
    clearTimeout(loadTimer);
    loadTimer = null;
  }
  const reason: CapsReason = lastReported === 'park' || lastReported === 'drive' ? 'transition' : 'load';
  lastReported = mode;
  requestCapabilitiesReport(page, mode, reason);
}

/* --------------------------------------------------- choix moteur / preset */

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Recommandation Drive à partir d'un relevé (de préférence pris EN Drive). */
export function recommendCarDrive(rec?: CapsRecord | null): CarAutoTuning {
  const reasons: string[] = [];
  if (!rec || rec.mode !== 'drive') {
    // Pas encore de relevé pris EN Drive : canvas (le moins mauvais constaté en Drive), repli <img> si le canvas échoue
    return {
      engine: 'canvas',
      preset: 'standard',
      basis: rec ? 'park' : 'none',
      workerOffscreen: false,
      reasons: [rec ? 'relevé Park seulement → canvas (défaut Drive)' : 'aucun relevé → canvas (défaut Drive)', 'repli <img> si le canvas échoue'],
    };
  }
  const basis = 'drive' as const;
  const apis = rec.apis as any;
  const perf = rec.perf as any;
  const env = rec.env as any;
  const fetchOk = !!apis?.fetchStreams?.ok;
  const decode = num(perf?.jpeg?.createImageBitmap?.avg);
  const fps = num(perf?.raf?.fps);
  const workerOffscreen = !!(apis?.worker?.offscreenCanvas && apis?.worker?.ctx2d && apis?.worker?.createImageBitmap);

  let engine: 'img' | 'canvas' | 'worker' = 'canvas';
  if (!fetchOk) {
    engine = 'img';
    reasons.push('fetch streaming KO en Drive → <img>');
  } else if (decode == null) {
    engine = 'img';
    reasons.push('createImageBitmap KO en Drive → <img>');
  } else if (workerOffscreen) {
    engine = 'worker';
    reasons.push(`Drive : Worker + OffscreenCanvas validés, décodage ${decode} ms → worker (hors thread principal)`);
  } else {
    reasons.push(`Drive : fetch streaming OK, décodage ${decode} ms, rAF ${fps ?? '?'} i/s → canvas`);
  }
  if (engine !== 'img') reasons.push('repli worker → canvas → <img> en cas d’échec');

  let preset: 'standard' | 'lite' = 'standard';
  const mem = num(env?.deviceMemory);
  const eff = env?.connection?.effectiveType;
  if (mem != null && mem <= 2) {
    preset = 'lite';
    reasons.push(`deviceMemory ${mem} Go → preset léger`);
  }
  if (decode != null && decode > 20) {
    preset = 'lite';
    reasons.push(`décodage ${decode} ms > 20 → preset léger`);
  }
  if (fps != null && fps < 30) {
    preset = 'lite';
    reasons.push(`rAF ${fps} i/s < 30 → preset léger`);
  }
  if (eff === '2g' || eff === 'slow-2g' || eff === '3g' || env?.connection?.saveData) {
    preset = 'lite';
    reasons.push(`réseau ${eff || 'saveData'} → preset léger`);
  }
  return { engine, preset, basis, workerOffscreen, reasons };
}

/** Recommandation à partir des relevés locaux (Drive prioritaire). */
export function getCarAutoTuning(): CarAutoTuning {
  const all = getLocalCapabilities();
  return recommendCarDrive(all.drive || all.park || null);
}
