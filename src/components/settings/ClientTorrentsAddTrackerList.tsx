/**
 * Liste des torrents du client avec action « Ajouter le tracker » (ex. C411).
 * À placer sur la page Réglages → Indexeurs.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { RefreshCw, PlusCircle, Loader2, ArrowRightLeft } from 'lucide-preact';

type TorrentRow = {
  info_hash: string;
  name: string;
  state: string;
  progress?: number;
  trackers?: string[];
};

export default function ClientTorrentsAddTrackerList() {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<TorrentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackerUrl, setTrackerUrl] = useState('');
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trackersAfterAdd, setTrackersAfterAdd] = useState<string[] | null>(null);
  const [migrateFailedDetails, setMigrateFailedDetails] = useState<string | null>(null);

  const loadTorrents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await serverApi.getClientTorrents();
    if (res.success && res.data != null) {
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.torrents ?? [];
      setTorrents(Array.isArray(list) ? list : []);
    } else {
      setError(res.message || res.error || t('settings.clientTorrentsList.errorLoad'));
    }
    setLoading(false);
  }, [t]);

  const loadC411Announce = useCallback(async () => {
    const res = await serverApi.getC411UploadCookies();
    if (res.success && res.data?.announce_url) {
      setTrackerUrl(res.data.announce_url);
    }
  }, []);

  useEffect(() => {
    loadTorrents();
    loadC411Announce();
  }, [loadTorrents, loadC411Announce]);

  const busy = addingAll || migrating || addingFor !== null;

  const handleAddTracker = async (infoHash: string) => {
    const url = trackerUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: t('settings.clientTorrentsList.trackerUrlRequired') });
      return;
    }
    setAddingFor(infoHash);
    setMessage(null);
    setMigrateFailedDetails(null);
    const res = await serverApi.addClientTracker(infoHash, url);
    setAddingFor(null);
    if (res.success) {
      setMessage({ type: 'success', text: t('settings.clientTorrentsList.addSuccess') });
      const trackersRes = await serverApi.getClientTorrentTrackers(infoHash);
      if (trackersRes.success && trackersRes.data?.trackers) {
        setTrackersAfterAdd(trackersRes.data.trackers);
      } else {
        setTrackersAfterAdd(null);
      }
      await loadTorrents();
      setTimeout(() => {
        setMessage(null);
        setTrackersAfterAdd(null);
      }, 8000);
    } else {
      const errorText = res.message || res.error || t('common.error');
      setMessage({ type: 'error', text: errorText });
    }
  };

  const handleAddTrackerToAll = async () => {
    const url = trackerUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: t('settings.clientTorrentsList.trackerUrlRequired') });
      return;
    }
    const targets = torrents.filter((row) => {
      const state = (row.state || '').toLowerCase();
      const progress = typeof row.progress === 'number' ? row.progress : 0;
      return state.includes('seed') || state === 'finished' || progress >= 0.999;
    });
    if (targets.length === 0) {
      setMessage({ type: 'error', text: t('settings.clientTorrentsList.addAllNone') });
      return;
    }
    setAddingAll(true);
    setMessage(null);
    setTrackersAfterAdd(null);
    setMigrateFailedDetails(null);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of targets) {
      const existing = Array.isArray(row.trackers)
        ? row.trackers.some((tr) => tr.trim() === url)
        : false;
      if (existing) {
        skipped += 1;
        continue;
      }
      const res = await serverApi.addClientTracker(row.info_hash, url);
      if (res.success) ok += 1;
      else failed += 1;
    }
    setAddingAll(false);
    setMessage({
      type: failed > 0 && ok === 0 ? 'error' : 'success',
      text: t('settings.clientTorrentsList.addAllResult')
        .replace('{ok}', String(ok))
        .replace('{skipped}', String(skipped))
        .replace('{failed}', String(failed)),
    });
    await loadTorrents();
    setTimeout(() => setMessage(null), 10000);
  };

  const handleMigrateC411 = async () => {
    setMigrating(true);
    setMessage(null);
    setTrackersAfterAdd(null);
    setMigrateFailedDetails(null);
    const res = await serverApi.migrateC411Seeds({});
    setMigrating(false);
    if (!res.success || !res.data) {
      setMessage({
        type: 'error',
        text: res.message || res.error || t('common.error'),
      });
      return;
    }
    const data = res.data;
    const failedCount = data.failed?.length ?? 0;
    setMessage({
      type: failedCount > 0 && data.migrated === 0 && data.resnatched === 0 ? 'error' : 'success',
      text: t('settings.clientTorrentsList.migrateC411Result')
        .replace('{migrated}', String(data.migrated))
        .replace('{skipped}', String(data.skipped))
        .replace('{resnatched}', String(data.resnatched))
        .replace('{failed}', String(failedCount)),
    });
    if (failedCount > 0) {
      const details = data.failed
        .slice(0, 5)
        .map((f) => `${f.name.slice(0, 40)}: ${f.reason}`)
        .join(' · ');
      setMigrateFailedDetails(
        t('settings.clientTorrentsList.migrateC411FailedHint').replace('{details}', details)
      );
    }
    if (data.announce_url) {
      setTrackerUrl(data.announce_url);
    }
    await loadTorrents();
    setTimeout(() => {
      setMessage(null);
      setMigrateFailedDetails(null);
    }, 15000);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ds-text-secondary)]">
        {t('settings.clientTorrentsList.description')}
      </p>

      <label className="form-control w-full max-w-2xl">
        <span className="label-text text-[var(--ds-text-secondary)]">
          {t('settings.clientTorrentsList.trackerUrlLabel')}
        </span>
        <input
          type="url"
          value={trackerUrl}
          onInput={(e) => setTrackerUrl((e.target as HTMLInputElement).value)}
          placeholder="https://…/announce/…"
          className="input input-bordered w-full font-mono text-sm"
        />
      </label>

      {message && (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-green-500' : 'text-amber-500'
          }`}
        >
          {message.text}
        </p>
      )}
      {migrateFailedDetails && (
        <p className="text-xs text-amber-500/90 break-words">{migrateFailedDetails}</p>
      )}
      {message?.type === 'success' && trackersAfterAdd && (
        <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
          {t('settings.clientTorrentsList.trackersVerifyLabel')}{' '}
          {trackersAfterAdd.length === 0 ? (
            <span className="italic">—</span>
          ) : (
            <span className="font-mono break-all">{trackersAfterAdd.join(', ')}</span>
          )}
        </p>
      )}
      {message?.type === 'error' &&
        (message.text.toLowerCase().includes('librqbit') ||
          message.text.includes('502') ||
          message.text.toLowerCase().includes('bad gateway')) && (
          <p className="text-xs text-[var(--ds-text-tertiary)] mt-1">
            {t('settings.clientTorrentsList.addTrackerErrorHint')}
          </p>
        )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--ds-text-tertiary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('settings.clientTorrentsList.loading')}</span>
        </div>
      ) : error ? (
        <p className="text-sm text-amber-500">{error}</p>
      ) : torrents.length === 0 ? (
        <p className="text-sm text-[var(--ds-text-tertiary)]">
          {t('settings.clientTorrentsList.noTorrents')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="table table-zebra table-pin-rows">
            <thead>
              <tr>
                <th>{t('settings.clientTorrentsList.colName')}</th>
                <th>{t('settings.clientTorrentsList.colInfoHash')}</th>
                <th>{t('settings.clientTorrentsList.colState')}</th>
                <th>{t('settings.clientTorrentsList.colTrackers')}</th>
                <th className="w-[1%]">{t('settings.clientTorrentsList.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((row) => (
                <tr key={row.info_hash}>
                  <td className="max-w-[200px] truncate font-medium" title={row.name}>
                    {row.name || '—'}
                  </td>
                  <td className="font-mono text-xs text-[var(--ds-text-tertiary)]">
                    {row.info_hash.slice(0, 8)}…
                  </td>
                  <td>
                    <span className="badge badge-ghost badge-sm">{row.state}</span>
                  </td>
                  <td className="text-sm text-[var(--ds-text-tertiary)]">
                    {Array.isArray(row.trackers) ? row.trackers.length : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-1"
                      onClick={() => handleAddTracker(row.info_hash)}
                      disabled={!trackerUrl.trim() || busy}
                      title={t('settings.clientTorrentsList.addTrackerTitle')}
                    >
                      {addingFor === row.info_hash ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlusCircle className="w-4 h-4" />
                      )}
                      {t('settings.clientTorrentsList.addTracker')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && torrents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            onClick={handleMigrateC411}
            disabled={busy}
            title={t('settings.clientTorrentsList.migrateC411Title')}
          >
            {migrating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-4 h-4" />
            )}
            {t('settings.clientTorrentsList.migrateC411')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            onClick={handleAddTrackerToAll}
            disabled={!trackerUrl.trim() || busy}
            title={t('settings.clientTorrentsList.addAllTitle')}
          >
            {addingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            {t('settings.clientTorrentsList.addAll')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            onClick={loadTorrents}
            disabled={busy}
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>
      )}
    </div>
  );
}
