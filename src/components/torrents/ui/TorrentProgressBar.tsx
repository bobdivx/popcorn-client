import { useI18n } from '../../../lib/i18n/useI18n';
import { formatBytes, formatTimeRemaining } from '../../../lib/utils/formatBytes';

export interface TorrentProgressBarProps {
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  downloadSpeed?: number;
  etaSeconds?: number | null;
  statusLabel?: string;
  variant?: 'compact' | 'full';
  progressColor?: 'blue' | 'green' | 'gray';
  className?: string;
}

const progressColorClasses = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  gray: 'bg-gray-600',
};

export function TorrentProgressBar({
  progress,
  downloadedBytes = 0,
  totalBytes = 0,
  downloadSpeed,
  etaSeconds,
  statusLabel,
  variant = 'full',
  progressColor = 'blue',
  className = '',
}: TorrentProgressBarProps) {
  const { t } = useI18n();
  const percent = Math.round(progress * 100);
  const barColor = progressColorClasses[progressColor] ?? progressColorClasses.blue;

  if (variant === 'compact') {
    return (
      <div className={className}>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{statusLabel ?? t('downloads.progress') ?? 'Progression'}</span>
          <span className="font-semibold text-white">{percent}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className={`${barColor} h-full rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(100, percent)}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {totalBytes > 0 && (
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatBytes(downloadedBytes)}</span>
            <span>{formatBytes(totalBytes)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/90 font-medium">
          {statusLabel ?? t('torrentStats.downloading') ?? 'Téléchargement en cours'}
        </span>
        <span className="text-white/70 text-sm">{percent}%</span>
      </div>
      <div className="w-full bg-white/10 rounded-full h-2 mb-2 overflow-hidden">
        <div
          className={`${barColor} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(100, percent)}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {(downloadSpeed != null && downloadSpeed > 0) || (etaSeconds != null && etaSeconds > 0) ? (
        <div className="text-white/60 text-sm">
          {downloadSpeed != null && downloadSpeed > 0 && (
            <span>
              {t('torrentStats.speed') ?? 'Vitesse'}: {((downloadSpeed / (1024 * 1024)).toFixed(1))} MB/s
            </span>
          )}
          {etaSeconds != null && etaSeconds > 0 && (
            <>
              {downloadSpeed != null && downloadSpeed > 0 && ' • '}
              <span>
                {t('torrentStats.eta') ?? 'Temps restant'}: {formatTimeRemaining(etaSeconds)}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
