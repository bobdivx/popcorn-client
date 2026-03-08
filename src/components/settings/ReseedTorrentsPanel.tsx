/**
 * Liste des torrents connus du backend avec .torrent en base : télécharger pour re-seed (ex. sur NAS).
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { ReseedTorrentInfo, ReseedFromLibraryItem, RestoreFromIndexerResult } from '../../lib/client/server-api/upload-tracker';
import type { Indexer } from '../../lib/client/server-api/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { RefreshCw, Download, Loader2, Library, X } from 'lucide-preact';

export default function ReseedTorrentsPanel() {
  const { t, language } = useI18n();
  const [list, setList] = useState<ReseedTorrentInfo[]>([]);
  const [libraryList, setLibraryList] = useState<ReseedFromLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [indexersLoading, setIndexersLoading] = useState(true);
  const [selectedIndexerId, setSelectedIndexerId] = useState<string>('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoringAll, setRestoringAll] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await serverApi.getTorrentFilesForReseed();
    if (res.success && Array.isArray(res.data)) {
      setList(res.data);
    } else {
      setError(res.message || res.error || t('settings.reseedPanel.errorLoad'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    const res = await serverApi.getTorrentFilesForReseedFromLibrary();
    if (res.success && Array.isArray(res.data)) {
      setLibraryList(res.data);
    } else {
      setLibraryError(res.message || res.error || t('settings.reseedPanel.errorLoad'));
    }
    setLibraryLoading(false);
  }, [t]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const withFile = list.filter((x) => x.has_torrent_file);
  const withoutFile = list.filter((x) => !x.has_torrent_file);
  const libraryWithFile = libraryList.filter((x) => x.has_torrent_file);
  const libraryWithoutFile = libraryList.filter((x) => !x.has_torrent_file);

  const handleDownload = async (item: ReseedTorrentInfo) => {
    if (!item.has_torrent_file) return;
    setDownloadingHash(item.info_hash);
    const res = await serverApi.downloadTorrentFileForReseed(item.info_hash);
    setDownloadingHash(null);
    if (res.success && res.data) {
      const blob = res.data as Blob;
      const filename = (res as { filename?: string }).filename || `${item.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadLibrary = async (item: ReseedFromLibraryItem) => {
    if (!item.has_torrent_file || !item.info_hash) return;
    setDownloadingHash(item.info_hash);
    const res = await serverApi.downloadTorrentFileForReseed(item.info_hash);
    setDownloadingHash(null);
    if (res.success && res.data) {
      const blob = res.data as Blob;
      const name = item.tmdb_title || item.file_name || item.info_hash;
      const filename = (res as { filename?: string }).filename || `${String(name).replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const loadIndexers = useCallback(async () => {
    setIndexersLoading(true);
    try {
      const res = await serverApi.getIndexers();
      if (res.success && Array.isArray(res.data)) {
        setIndexers(res.data);
        if (res.data.length > 0) {
          setSelectedIndexerId((current) => current || res.data[0].id);
        }
      } else {
        setIndexers([]);
      }
    } finally {
      setIndexersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIndexers();
  }, [loadIndexers]);

  const restoreOneFromIndexer = useCallback(
    async (item: ReseedFromLibraryItem): Promise<RestoreFromIndexerResult | null> => {
      if (!selectedIndexerId) {
        setLibraryError(t('settings.reseedPanel.noIndexers'));
        return null;
      }
      setRestoringId(item.local_media_id);
      setRestoreMessage(null);
      try {
        const res = await serverApi.restoreTorrentFromIndexerForMedia({
          local_media_id: item.local_media_id,
          indexer_id: selectedIndexerId,
          query: item.tmdb_title || item.file_name || null,
        });
        if (res.success && res.data) {
          setRestoreMessage(res.data.message);
          return res.data;
        }
        setLibraryError(res.message || res.error || t('settings.reseedPanel.errorLoad'));
        return null;
      } catch {
        setLibraryError(t('settings.reseedPanel.errorLoad'));
        return null;
      } finally {
        setRestoringId(null);
      }
    },
    [selectedIndexerId, t],
  );

  const handleRestoreAllMissing = useCallback(async () => {
    if (!selectedIndexerId) {
      setLibraryError(t('settings.reseedPanel.noIndexers'));
      return;
    }
    if (libraryWithoutFile.length === 0) return;
    setRestoringAll(true);
    setRestoreMessage(null);
    try {
      for (const row of libraryWithoutFile) {
        // eslint-disable-next-line no-await-in-loop
        await restoreOneFromIndexer(row);
      }
      await loadLibrary();
    } finally {
      setRestoringAll(false);
    }
  }, [selectedIndexerId, libraryWithoutFile, restoreOneFromIndexer, loadLibrary, t]);

  const handlePrepareReseed = useCallback(
    async (item: ReseedFromLibraryItem) => {
      if (!item.has_torrent_file || !item.torrent_expected_name || item.torrent_expected_name === item.file_name) return;
      setPreparingId(item.local_media_id);
      setLibraryError(null);
      try {
        const res = await serverApi.prepareReseedFromLibrary(item.local_media_id);
        if (res.success && res.data) {
          setRestoreMessage(res.data.message);
          await loadLibrary();
        } else {
          setLibraryError(res.message || res.error || t('settings.reseedPanel.errorLoad'));
        }
      } catch {
        setLibraryError(t('settings.reseedPanel.errorLoad'));
      } finally {
        setPreparingId(null);
      }
    },
    [loadLibrary, t]
  );

  return (
    <div className="space-y-4">
      <a
        href="/settings/uploads/"
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
        aria-label={t('common.back')}
      >
        ← {t('common.back')}
      </a>
      <div className="ds-card elevated min-w-0 overflow-hidden">
        <div className="p-4 sm:p-6 flex flex-col min-h-0">
          <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mb-2">
            {t('settings.reseedPanel.title')}
          </h2>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            {t('settings.reseedPanel.description')}
          </p>

          {loading ? (
        <div className="flex items-center gap-2 text-[var(--ds-text-tertiary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('settings.reseedPanel.loading')}</span>
        </div>
      ) : error ? (
        <p className="text-sm text-amber-500">{error}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--ds-text-tertiary)]">
          {t('settings.reseedPanel.noTorrents')}
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--ds-text-tertiary)]">
            {t('settings.reseedPanel.summary', {
              total: list.length,
              withFile: withFile.length,
              withoutFile: withoutFile.length,
            })}
          </p>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="table table-zebra table-pin-rows">
              <thead>
                <tr>
                  <th>{t('settings.reseedPanel.colName')}</th>
                  <th>{t('settings.reseedPanel.colDownloadPath')}</th>
                  <th>{t('settings.reseedPanel.colHasFile')}</th>
                  <th className="w-[1%]">{t('settings.reseedPanel.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.info_hash}>
                    <td className="max-w-[220px] truncate font-medium" title={row.name}>
                      {row.name || '—'}
                    </td>
                    <td className="max-w-[280px] truncate font-mono text-xs text-[var(--ds-text-tertiary)]" title={row.download_path || ''}>
                      {row.download_path || '—'}
                    </td>
                    <td>
                      {row.has_torrent_file ? (
                        <span className="badge badge-success badge-sm">{t('settings.reseedPanel.yes')}</span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">{t('settings.reseedPanel.no')}</span>
                      )}
                    </td>
                    <td>
                      {row.has_torrent_file ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gap-1"
                          onClick={() => handleDownload(row)}
                          disabled={downloadingHash !== null}
                          title={t('settings.reseedPanel.downloadTitle')}
                        >
                          {downloadingHash === row.info_hash ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {t('settings.reseedPanel.downloadTorrent')}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--ds-text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

          {!loading && list.length > 0 && (
        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={load}>
          <RefreshCw className="w-4 h-4" />
          {t('common.refresh')}
        </button>
          )}

          {!loading && list.length > 0 && withoutFile.length > 0 && (
        <p className="text-xs text-[var(--ds-text-tertiary)]">
          {t('settings.reseedPanel.noFileHint')}
        </p>
      )}
        </div>
      </div>

      {/* Section Depuis la bibliothèque : médias déjà sur disque */}
      <div className="ds-card elevated min-w-0 overflow-hidden">
        <div className="p-4 sm:p-6 flex flex-col min-h-0">
          <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mb-2 flex items-center gap-2">
            <Library className="w-5 h-5 text-[var(--ds-accent-violet)]" />
            {t('settings.reseedPanel.libraryTitle')}
          </h2>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            {t('settings.reseedPanel.libraryDescription')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--ds-text-secondary)]">
                {t('settings.reseedPanel.searchIndexerIndexerLabel')}
              </span>
              <select
                className="select select-xs bg-black/40 border border-white/10 text-xs"
                disabled={indexersLoading || indexers.length === 0}
                value={selectedIndexerId}
                onChange={(e) => setSelectedIndexerId((e.target as HTMLSelectElement).value)}
              >
                {indexers.length === 0 ? (
                  <option value="">
                    {indexersLoading ? t('common.loading') : t('settings.reseedPanel.noIndexers')}
                  </option>
                ) : (
                  indexers.map((idx) => (
                    <option key={idx.id} value={idx.id}>
                      {idx.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-xs gap-2"
              onClick={handleRestoreAllMissing}
              disabled={restoringAll || libraryWithoutFile.length === 0 || !selectedIndexerId}
            >
              {restoringAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {t('settings.reseedPanel.restoreAllButton')}
            </button>
          </div>

          {restoreMessage && (
            <p className="mt-2 text-xs text-[var(--ds-text-tertiary)] flex items-center gap-2 flex-wrap">
              <span>{restoreMessage}</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                onClick={() => {
                  setRestoreMessage(null);
                  setLibraryError(null);
                  setError(null);
                }}
                title={t('settings.reseedPanel.dismissMessage')}
                aria-label={t('settings.reseedPanel.dismissMessage')}
              >
                <X className="w-3.5 h-3.5" />
                {t('settings.reseedPanel.dismissMessage')}
              </button>
            </p>
          )}

          <p className="text-xs text-[var(--ds-text-tertiary)] mt-1">
            {t('settings.reseedPanel.dbChangedHint')}
          </p>

          {libraryLoading ? (
            <div className="flex items-center gap-2 text-[var(--ds-text-tertiary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('settings.reseedPanel.loading')}</span>
            </div>
          ) : libraryError ? (
            <p className="text-sm text-amber-500">{libraryError}</p>
          ) : libraryList.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-tertiary)]">
              {t('settings.reseedPanel.noLibraryMedia')}
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--ds-text-tertiary)]">
                {t('settings.reseedPanel.librarySummary', {
                  total: libraryList.length,
                  withFile: libraryWithFile.length,
                  withoutFile: libraryWithoutFile.length,
                })}
              </p>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="table table-zebra table-pin-rows">
                  <thead>
                    <tr>
                      <th>{t('settings.reseedPanel.colTmdbTitle')}</th>
                      <th>{t('settings.reseedPanel.colFileName')}</th>
                      <th>{t('settings.reseedPanel.colFilePath')}</th>
                      <th>{t('settings.reseedPanel.colHasFile')}</th>
                      <th>{t('settings.reseedPanel.expectedName')}</th>
                      <th className="w-[1%]">{t('settings.reseedPanel.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libraryList.map((row) => (
                      <tr key={row.local_media_id}>
                        <td className="max-w-[180px] truncate font-medium" title={row.tmdb_title || ''}>
                          {row.tmdb_title || '—'}
                        </td>
                        <td className="max-w-[200px] truncate font-mono text-xs" title={row.file_name}>
                          {row.file_name || '—'}
                        </td>
                        <td className="max-w-[220px] truncate font-mono text-xs text-[var(--ds-text-tertiary)]" title={row.file_path}>
                          {row.file_path || '—'}
                        </td>
                        <td>
                          {row.has_torrent_file ? (
                            <span className="badge badge-success badge-sm">{t('settings.reseedPanel.yes')}</span>
                          ) : (
                            <span className="inline-flex flex-col gap-1 items-end">
                              <span className="badge badge-ghost badge-sm">
                                {t('settings.reseedPanel.no')}
                              </span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs gap-1"
                                onClick={() => void (async () => {
                                  const res = await restoreOneFromIndexer(row);
                                  if (res?.matched) {
                                    await loadLibrary();
                                  }
                                })()}
                                disabled={restoringId === row.local_media_id || !selectedIndexerId}
                                title={t('settings.reseedPanel.restoreSingle')}
                              >
                                {restoringId === row.local_media_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span className="text-[10px]">
                                  {t('settings.reseedPanel.restoreSingle')}
                                </span>
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate font-mono text-xs text-[var(--ds-text-tertiary)]" title={row.torrent_expected_name || ''}>
                          {row.torrent_expected_name ?? '—'}
                        </td>
                        <td>
                          {row.has_torrent_file ? (
                            <span className="inline-flex flex-wrap items-center gap-1">
                              {row.torrent_expected_name && row.torrent_expected_name !== row.file_name && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm gap-1"
                                  onClick={() => handlePrepareReseed(row)}
                                  disabled={preparingId !== null}
                                  title={t('settings.reseedPanel.prepareReseedTitle')}
                                >
                                  {preparingId === row.local_media_id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : null}
                                  {t('settings.reseedPanel.prepareReseed')}
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm gap-1"
                                onClick={() => handleDownloadLibrary(row)}
                              disabled={downloadingHash !== null}
                              title={t('settings.reseedPanel.downloadTitle')}
                            >
                              {downloadingHash === row.info_hash ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              {t('settings.reseedPanel.downloadTorrent')}
                            </button>
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--ds-text-tertiary)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!libraryLoading && libraryList.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm gap-2 mt-2" onClick={loadLibrary}>
              <RefreshCw className="w-4 h-4" />
              {t('common.refresh')}
            </button>
          )}

          {!libraryLoading && libraryList.length > 0 && libraryWithoutFile.length > 0 && (
            <p className="text-xs text-[var(--ds-text-tertiary)] mt-2">
              {t('settings.reseedPanel.libraryNoFileHint')}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
