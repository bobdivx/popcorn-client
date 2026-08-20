import { useGpuCapability } from '../../hooks/useGpuCapability';
import { gpuKind } from '../../lib/gpu-capability-store';
import { useI18n } from '../../lib/i18n/useI18n';

type GpuStatusBadgeProps = {
  variant?: 'standalone' | 'inline';
};

export default function GpuStatusBadge({ variant = 'standalone' }: GpuStatusBadgeProps) {
  const { t } = useI18n();
  const cap = useGpuCapability();
  const kind = gpuKind(cap);

  if (!cap.known) return null;

  const isGpu = kind !== 'cpu';
  const short =
    kind === 'nvenc'
      ? t('backend.gpuBadgeNvenc')
      : kind === 'nvdec'
        ? t('backend.gpuBadgeNvdec')
        : kind === 'vaapi'
          ? 'VAAPI'
          : kind === 'qsv'
            ? 'QSV'
            : t('backend.gpuBadgeCpu');
  const title =
    kind === 'nvenc'
      ? t('backend.gpuBadgeTitleNvenc')
      : kind === 'nvdec'
        ? t('backend.gpuBadgeTitleNvdec')
        : kind === 'cpu'
          ? t('backend.gpuBadgeTitleCpu')
          : t('backend.gpuBadgeTitleGeneric', { accel: short });

  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="text-[var(--ds-text-secondary)]">{t('backend.gpuBadgeLabel')}</span>
        <span className="flex items-center gap-1.5 text-[var(--ds-text-primary)]">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isGpu ? 'bg-emerald-400' : 'bg-amber-400'}`}
            aria-hidden
          />
          {short}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ${
        isGpu
          ? 'bg-emerald-600/90 text-white'
          : 'bg-amber-600/80 text-white'
      }`}
      title={title}
      aria-label={title}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${isGpu ? 'bg-emerald-200' : 'bg-amber-200'}`}
        aria-hidden
      />
      <span className="hidden sm:inline">{short}</span>
    </span>
  );
}
