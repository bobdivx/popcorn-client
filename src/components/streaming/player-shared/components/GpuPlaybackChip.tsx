import { useGpuCapability } from '../../../../hooks/useGpuCapability';
import { gpuKind, type GpuCapability } from '../../../../lib/gpu-capability-store';
import type { PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';
import { useI18n } from '../../../../lib/i18n/useI18n';

function mergeCapability(
  store: GpuCapability,
  pipeline: PlaybackPipelineStatus | null | undefined,
): GpuCapability {
  if (!pipeline) return store;
  return {
    known: true,
    gpu_available: pipeline.gpu_available ?? store.gpu_available,
    encoding_hwaccel:
      pipeline.encoding_hwaccel !== undefined
        ? pipeline.encoding_hwaccel
        : store.encoding_hwaccel,
    cuda_decode_available:
      pipeline.cuda_decode_available !== undefined
        ? pipeline.cuda_decode_available
        : store.cuda_decode_available,
  };
}

export default function GpuPlaybackChip({
  pipeline = null,
  className = '',
}: {
  pipeline?: PlaybackPipelineStatus | null;
  className?: string;
}) {
  const { t } = useI18n();
  const store = useGpuCapability();
  const cap = mergeCapability(store, pipeline);
  if (!cap.known && !pipeline) return null;

  const kind = gpuKind(cap);
  const mode = (pipeline?.mode || '').toLowerCase();
  const isGpu = kind !== 'cpu' && kind !== 'unknown';

  let label: string;
  if (mode === 'remux') {
    label = t('playback.hls.gpuRemux');
  } else if (mode === 'transcode') {
    if (kind === 'nvenc') label = t('playback.hls.gpuTranscodeNvenc');
    else if (kind === 'nvdec') label = t('playback.hls.gpuTranscodeNvdec');
    else if (kind === 'vaapi' || kind === 'qsv') {
      label = t('playback.hls.gpuTranscodeGeneric', { accel: kind.toUpperCase() });
    } else label = t('playback.hls.gpuTranscodeCpu');
  } else if (kind === 'nvenc') {
    label = t('playback.hls.gpuWillUseNvenc');
  } else if (kind === 'nvdec') {
    label = t('playback.hls.gpuWillUseNvdec');
  } else if (kind === 'vaapi' || kind === 'qsv') {
    label = t('playback.hls.gpuWillUseGeneric', { accel: kind.toUpperCase() });
  } else {
    label = t('playback.hls.gpuWillUseCpu');
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        isGpu
          ? 'border-[var(--ds-accent-green)]/40 bg-[var(--ds-accent-green)]/15 text-[var(--ds-text-primary)]'
          : 'border-[var(--ds-accent-yellow)]/40 bg-[var(--ds-accent-yellow)]/15 text-[var(--ds-text-primary)]'
      } ${className}`}
      title={label}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${isGpu ? 'bg-emerald-300' : 'bg-amber-300'}`}
        aria-hidden
      />
      {label}
    </span>
  );
}
