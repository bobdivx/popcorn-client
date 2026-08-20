import { useI18n } from '../../../../lib/i18n/useI18n';
import { formatEtaSeconds } from '../../../../lib/streaming/networkPlaybackProfile';
import type { PlaybackLiveTraceState } from '../hooks/usePlaybackLiveTrace';

interface PlaybackLiveTraceProps {
  trace: PlaybackLiveTraceState;
  className?: string;
}

function formatMbps(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)} Mb/s`;
}

export function PlaybackLiveTrace({ trace, className = '' }: PlaybackLiveTraceProps) {
  const { t } = useI18n();
  const status = trace.status;
  const minSeg = status?.min_playable_segments ?? 3;
  const eta =
    status?.eta_playable_seconds ??
    (status && status.segment_count >= minSeg ? 0 : null);
  const elapsedSec = Math.max(0, (Date.now() - trace.startedAt) / 1000);

  return (
    <div
      class={`w-full min-w-0 rounded-xl border border-white/15 bg-black/55 px-3 py-2 text-white ${className}`}
      data-playback-live-trace
    >
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
          {t('playback.hls.liveTrace')}
        </span>
        <span class="text-[11px] text-white/70 tabular-nums">
          {t('playback.hls.etaPlayable', { eta: formatEtaSeconds(eta) })}
        </span>
      </div>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums">
        <dt class="text-white/45">{t('playback.hls.elapsed')}</dt>
        <dd>{Math.round(elapsedSec)} s</dd>
        <dt class="text-white/45">{t('playback.hls.serverPipeline')}</dt>
        <dd>
          {status
            ? `${status.segment_count}/${minSeg} · ${status.mode}${status.ffmpeg_running ? ' · FFmpeg' : ''}`
            : '…'}
        </dd>
        <dt class="text-white/45">{t('playback.hls.playerBuffer')}</dt>
        <dd>{trace.bufferAheadSec.toFixed(1)} s</dd>
        <dt class="text-white/45">{t('playback.hls.stalls')}</dt>
        <dd>
          {trace.waitingCount} {t('playback.hls.bufferEvents')} · {trace.stallCount} stall
        </dd>
        <dt class="text-white/45">{t('playback.hls.network')}</dt>
        <dd class="truncate" title={trace.network.label}>
          {trace.network.label}
          {trace.network.downlinkMbps != null ? ` · ${formatMbps(trace.network.downlinkMbps)}` : ''}
        </dd>
        <dt class="text-white/45">{t('playback.hls.hlsBandwidth')}</dt>
        <dd>{formatMbps(trace.bandwidthMbps)}</dd>
      </dl>
      {trace.events.length > 0 ? (
        <ol class="mt-2 max-h-20 overflow-y-auto space-y-0.5 text-[10px] text-white/65 font-mono">
          {trace.events.slice(-8).map((ev) => (
            <li key={ev.id} class="truncate">
              {new Date(ev.at).toLocaleTimeString()} {ev.message}
            </li>
          ))}
        </ol>
      ) : null}
      {trace.logLines.length > 0 ? (
        <pre class="mt-2 max-h-24 overflow-auto text-[10px] leading-snug text-emerald-200/80 font-mono whitespace-pre-wrap break-all">
          {trace.logLines.slice(-8).join('\n')}
        </pre>
      ) : null}
    </div>
  );
}

export default PlaybackLiveTrace;
