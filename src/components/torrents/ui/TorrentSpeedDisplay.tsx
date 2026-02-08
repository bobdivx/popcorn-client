import { useI18n } from '../../../lib/i18n/useI18n';
import { formatSpeed, formatTimeRemaining } from '../../../lib/utils/formatBytes';

export interface TorrentSpeedDisplayProps {
  downloadSpeed?: number;
  uploadSpeed?: number;
  etaSeconds?: number | null;
  showEta?: boolean;
  className?: string;
}

export function TorrentSpeedDisplay({
  downloadSpeed,
  uploadSpeed,
  etaSeconds,
  showEta = true,
  className = '',
}: TorrentSpeedDisplayProps) {
  const { t } = useI18n();
  const hasDownload = downloadSpeed != null && downloadSpeed > 0;
  const hasUpload = uploadSpeed != null && uploadSpeed > 0;
  const hasEta = showEta && etaSeconds != null && etaSeconds > 0;

  if (!hasDownload && !hasUpload && !hasEta) {
    return null;
  }

  const parts: string[] = [];
  if (hasDownload) {
    parts.push(`${t('torrentStats.speed') ?? 'Vitesse'}: ${formatSpeed(downloadSpeed)}`);
  }
  if (hasEta) {
    parts.push(`${t('torrentStats.eta') ?? 'Temps restant'}: ${formatTimeRemaining(etaSeconds)}`);
  }
  if (hasUpload) {
    parts.push(`${t('torrentStats.uploadSpeed') ?? 'Upload'}: ${formatSpeed(uploadSpeed)}`);
  }

  return (
    <div className={`text-sm text-white/60 ${className}`}>
      {parts.join(' • ')}
    </div>
  );
}
