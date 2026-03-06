import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import type { PublishedUploadMediaEntry } from '../../lib/client/server-api/upload-tracker';
import { useI18n } from '../../lib/i18n/useI18n';
import { DsCard, DsCardSection } from '../ui/design-system';

const BASE_URL = '/settings/uploads/';

function formatTimestamp(ts: number, language: string): string {
  try {
    const d = new Date(ts * 1000);
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return String(ts);
  }
}

export default function MyUploadsPanel() {
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PublishedUploadMediaEntry[]>([]);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await serverApi.getPublishedUploads();
    if (res.success && Array.isArray(res.data)) {
      setItems(res.data);
    } else {
      setError(res.message || res.error || t('settings.myUploadsPanel.errorLoad'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalTrackers = useMemo(
    () => items.reduce((acc, item) => acc + item.trackers.length, 0),
    [items]
  );

  const handleDownload = async (item: PublishedUploadMediaEntry) => {
    if (!item.info_hash || !item.has_torrent_file) return;
    setDownloadingHash(item.info_hash);
    const res = await serverApi.downloadTorrentFileForReseed(item.info_hash);
    setDownloadingHash(null);
    if (res.success && res.data) {
      const blob = res.data as Blob;
      const baseName = item.media_title || item.media_file_name || item.info_hash;
      const fallback = `${String(baseName).replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`;
      const filename = (res as { filename?: string }).filename || fallback;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      <a
        href={BASE_URL}
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
        aria-label={t('common.back')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        <span>{t('common.back')}</span>
      </a>

      <DsCard variant="elevated" className="min-w-0 overflow-hidden">
        <DsCardSection className="flex flex-col min-h-0 gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg">
                {t('settings.myUploadsPanel.title')}
              </h2>
              <p className="text-sm ds-text-secondary mt-1">
                {t('settings.myUploadsPanel.description')}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t('common.refresh')}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[var(--ds-text-tertiary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('settings.myUploadsPanel.loading')}</span>
            </div>
          ) : error ? (
            <p className="text-sm text-amber-500">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-tertiary)]">{t('settings.myUploadsPanel.empty')}</p>
          ) : (
            <>
              <p className="text-xs text-[var(--ds-text-tertiary)]">
                {t('settings.myUploadsPanel.summary', { total: items.length, trackers: totalTrackers })}
              </p>

              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="table table-zebra table-pin-rows">
                  <thead>
                    <tr>
                      <th>{t('settings.myUploadsPanel.colMedia')}</th>
                      <th>{t('settings.myUploadsPanel.colTrackers')}</th>
                      <th>{t('settings.myUploadsPanel.colRqbit')}</th>
                      <th>{t('settings.myUploadsPanel.colUploadedAt')}</th>
                      <th>{t('settings.myUploadsPanel.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.local_media_id}>
                        <td className="max-w-[300px]">
                          <div className="font-medium truncate" title={row.media_title}>
                            {row.media_title}
                          </div>
                          <div
                            className="font-mono text-xs text-[var(--ds-text-tertiary)] truncate"
                            title={row.media_file_name}
                          >
                            {row.media_file_name}
                          </div>
                        </td>
                        <td className="max-w-[300px]">
                          <div className="flex flex-wrap gap-1">
                            {row.trackers.map((tr) => (
                              <span
                                key={`${row.local_media_id}-${tr.tracker}`}
                                className={`inline-flex items-center gap-1 badge badge-sm ${tr.success ? 'badge-success' : 'badge-error'}`}
                                title={tr.message || tr.torrent_url || ''}
                              >
                                {tr.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                <span>{tr.tracker}</span>
                                {tr.torrent_url ? (
                                  <a
                                    href={tr.torrent_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex"
                                    aria-label={t('settings.myUploadsPanel.openOnTracker')}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : null}
                              </span>
                            ))}
                          </div>
                          {row.trackers.some((tr) => !tr.success && tr.message) ? (
                            <div className="mt-1 text-xs text-amber-500 line-clamp-2">
                              {row.trackers.find((tr) => !tr.success && tr.message)?.message}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {row.rqbit_present ? (
                            <span className="badge badge-success badge-sm">{t('settings.myUploadsPanel.inRqbit')}</span>
                          ) : (
                            <span className="badge badge-warning badge-sm">{t('settings.myUploadsPanel.notInRqbit')}</span>
                          )}
                        </td>
                        <td className="text-xs text-[var(--ds-text-tertiary)]">
                          {formatTimestamp(row.last_uploaded_at, language)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm gap-1"
                            disabled={!row.info_hash || !row.has_torrent_file || downloadingHash !== null}
                            onClick={() => handleDownload(row)}
                            title={t('settings.myUploadsPanel.downloadTorrent')}
                          >
                            {downloadingHash === row.info_hash ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            {t('settings.myUploadsPanel.downloadTorrent')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DsCardSection>
      </DsCard>
    </div>
  );
}
