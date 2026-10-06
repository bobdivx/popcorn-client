/**
 * Télémétrie de lecture périodique (/car et /car/lab) : agrège les stats 1 s du moteur et envoie
 * un échantillon toutes les 10 s PENDANT la lecture → POST /api/car/telemetry (texte brut, sans pré-vol),
 * direct serveur puis repli proxy client /srv. Lecture : GET /api/car/telemetry?session=…
 * Mesures annexes : cadence rAF de la page, long tasks (PerformanceObserver), visibilité.
 */
import { getCapsSession, getServerBase } from './carCapabilities';
import type { TeslaDriveMode } from './driveModeDetector';

export const TELEMETRY_ENDPOINT = '/api/car/telemetry';

export interface PlaybackSecond {
  state: string;
  fpsShown: number | null;
  fpsReceived: number | null;
  targetFps: number;
  /** Totaux cumulés depuis le début du flux (les deltas sont calculés ici) */
  dropped: number;
  late: number;
  stalls: number;
  paintJitterMs: number | null;
  arrivalJitterMs: number | null;
  kbps: number | null;
  bufferFrames: number | null;
  bufferMs: number | null;
  decodeMs: number | null;
  paintMs: number | null;
  avSyncMs: number | null;
  frameSize?: string;
}

export interface TelemetryContext {
  page: '/car' | '/car/lab';
  engine: string;
  mode: TeslaDriveMode | 'testing';
  modeSource?: string;
  preset: string;
  route: string;
  position: number;
  audio?: string;
  extra?: Record<string, unknown>;
}

let clientVersion: string | null = null;
let versionLoading = false;
function loadVersion(): void {
  if (versionLoading) return;
  versionLoading = true;
  fetch(`/VERSION.json?tl=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((j: { client?: { version?: string; build?: number } }) => {
      clientVersion = j?.client?.version ? `${j.client.version}+${j.client.build ?? ''}` : null;
    })
    .catch(() => undefined);
}

const mean = (a: number[]): number | null => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const nums = (a: Array<number | null | undefined>): number[] => a.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

export async function postTelemetry(sample: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify(sample);
  const targets: string[] = [];
  const base = getServerBase();
  if (base) targets.push(`${base}${TELEMETRY_ENDPOINT}`);
  targets.push(`/srv${TELEMETRY_ENDPOINT}`);
  let last = 'aucune cible';
  for (const url of targets) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        keepalive: body.length < 60000,
        credentials: 'omit',
      });
      if (r.ok) return url;
      last = `${url} → HTTP ${r.status}`;
    } catch (e) {
      last = `${url} → ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(last);
}

export class PlaybackTelemetry {
  private getCtx: () => TelemetryContext;
  private intervalMs: number;
  private samples: Array<PlaybackSecond & { at: number }> = [];
  private prevTotals: { dropped: number; late: number; stalls: number } | null = null;
  private timer = 0;
  private rafHandle = 0;
  private rafFrames = 0;
  private rafGaps: number[] = [];
  private rafLast = 0;
  private longTasks = 0;
  private longTaskMs = 0;
  private observer: PerformanceObserver | null = null;
  private windowStart = 0;
  private seq = 0;
  private hiddenMs = 0;
  private hiddenSince = 0;
  lastSentTo: string | null = null;
  lastError: string | null = null;
  sent = 0;

  constructor(getCtx: () => TelemetryContext, intervalMs = 10000) {
    this.getCtx = getCtx;
    this.intervalMs = intervalMs;
  }

  start(): void {
    loadVersion();
    this.windowStart = performance.now();
    const loop = (t: number) => {
      this.rafFrames++;
      if (this.rafLast) {
        const g = t - this.rafLast;
        if (this.rafGaps.length < 2000) this.rafGaps.push(g);
      }
      this.rafLast = t;
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
    try {
      if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        this.observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            this.longTasks++;
            this.longTaskMs += e.duration;
          }
        });
        this.observer.observe({ type: 'longtask', buffered: false } as PerformanceObserverInit);
      }
    } catch {
      this.observer = null;
    }
    document.addEventListener('visibilitychange', this.onVis);
    this.timer = window.setInterval(() => this.flush(false), this.intervalMs);
  }

  private onVis = (): void => {
    if (document.hidden) this.hiddenSince = performance.now();
    else if (this.hiddenSince) {
      this.hiddenMs += performance.now() - this.hiddenSince;
      this.hiddenSince = 0;
    }
  };

  /** Stats 1 s du moteur (null = moteur sans stats, ex. <img> natif). */
  push(s: PlaybackSecond | null): void {
    if (!s) return;
    this.samples.push({ ...s, at: Date.now() });
    if (this.samples.length > 120) this.samples.shift();
  }

  /** Réinitialise les totaux (nouveau flux : compteurs repartis à 0). */
  resetTotals(): void {
    this.prevTotals = null;
  }

  flush(final: boolean): void {
    const now = performance.now();
    const windowS = Math.max(0.5, (now - this.windowStart) / 1000);
    const samples = this.samples;
    const playing = samples.filter((s) => s.state === 'playing' || s.state === 'stalled' || s.state === 'buffering');
    const ctx = this.getCtx();
    if (!samples.length || (!playing.length && !final)) {
      this.resetWindow(now);
      return;
    }
    if (final && samples.length < 3) return;
    const last = samples[samples.length - 1];
    const prev = this.prevTotals ?? { dropped: samples[0].dropped, late: samples[0].late, stalls: samples[0].stalls };
    // Compteur remis à zéro (nouveau flux) : delta = valeur courante
    const delta = (cur: number, p: number) => (cur >= p ? cur - p : cur);
    const gaps = this.rafGaps.slice().sort((a, b) => a - b);
    const fpsShown = nums(samples.map((s) => s.fpsShown));
    const sample: Record<string, unknown> = {
      v: 1,
      seq: ++this.seq,
      session: getCapsSession(),
      page: ctx.page,
      engine: ctx.engine,
      mode: ctx.mode,
      modeSource: ctx.modeSource || (ctx.extra && (ctx.extra as any).modeSource) || 'auto',
      preset: ctx.preset,
      route: ctx.route,
      position: Math.round(ctx.position * 10) / 10,
      audio: ctx.audio ?? null,
      clientVersion,
      final,
      windowS: Math.round(windowS * 10) / 10,
      seconds: samples.length,
      state: last.state,
      targetFps: last.targetFps,
      fpsShown: mean(fpsShown),
      fpsShownMin: fpsShown.length ? Math.min(...fpsShown) : null,
      fpsReceived: mean(nums(samples.map((s) => s.fpsReceived))),
      dropped: delta(last.dropped, prev.dropped),
      late: delta(last.late, prev.late),
      stalls: delta(last.stalls, prev.stalls),
      paintJitterMs: mean(nums(samples.map((s) => s.paintJitterMs))),
      arrivalJitterMs: mean(nums(samples.map((s) => s.arrivalJitterMs))),
      kbps: mean(nums(samples.map((s) => s.kbps))),
      bufferMs: mean(nums(samples.map((s) => s.bufferMs))),
      bufferFrames: mean(nums(samples.map((s) => s.bufferFrames))),
      decodeMs: mean(nums(samples.map((s) => s.decodeMs))),
      paintMs: mean(nums(samples.map((s) => s.paintMs))),
      avSyncMs: last.avSyncMs,
      avSyncAbsMs: mean(nums(samples.map((s) => (s.avSyncMs == null ? null : Math.abs(s.avSyncMs))))),
      frameSize: last.frameSize ?? null,
      rafFps: Math.round((this.rafFrames / windowS) * 10) / 10,
      rafGapP95Ms: gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))]) : null,
      rafGapMaxMs: gaps.length ? Math.round(gaps[gaps.length - 1]) : null,
      longTasks: this.observer ? this.longTasks : null,
      longTaskMs: this.observer ? Math.round(this.longTaskMs) : null,
      visibility: document.visibilityState,
      hiddenMs: Math.round(this.hiddenMs + (this.hiddenSince ? now - this.hiddenSince : 0)),
      ...(ctx.extra || {}),
    };
    this.prevTotals = { dropped: last.dropped, late: last.late, stalls: last.stalls };
    this.resetWindow(now);
    postTelemetry(sample)
      .then((to) => {
        this.sent++;
        this.lastSentTo = to;
        this.lastError = null;
      })
      .catch((e) => {
        this.lastError = e instanceof Error ? e.message : String(e);
      });
  }

  private resetWindow(now: number): void {
    this.samples = [];
    this.rafFrames = 0;
    this.rafGaps = [];
    this.longTasks = 0;
    this.longTaskMs = 0;
    this.hiddenMs = 0;
    if (this.hiddenSince) this.hiddenSince = now;
    this.windowStart = now;
  }

  stop(): void {
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.rafHandle);
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.flush(true);
  }
}
