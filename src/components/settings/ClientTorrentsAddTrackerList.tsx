/**
 * Liste des torrents du client : tracker C411, migration, boost ratio (qBittorrent leecher).
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { RatioBoostStatus } from '../../lib/client/server-api/upload-tracker';
import { useI18n } from '../../lib/i18n/useI18n';
import { RefreshCw, PlusCircle, Loader2, ArrowRightLeft, Zap, Save } from 'lucide-preact';

type TorrentRow = {
  info_hash: string;
  name: string;
  state: string;
  progress?: number;
  total_bytes?: number;
  trackers?: string[];
};

function isSeedRow(row: TorrentRow): boolean {
  const state = (row.state || '').toLowerCase();
  const progress = typeof row.progress === 'number' ? row.progress : 0;
  return state.includes('seed') || state === 'finished' || state === 'complete' || progress >= 0.999;
}

function formatGiB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

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

  // qBittorrent config
  const [qbitId, setQbitId] = useState<string | undefined>();
  const [qbitHost, setQbitHost] = useState('127.0.0.1');
  const [qbitPort, setQbitPort] = useState(8080);
  const [qbitUser, setQbitUser] = useState('admin');
  const [qbitPass, setQbitPass] = useState('');
  const [qbitSaving, setQbitSaving] = useState(false);
  const [qbitTesting, setQbitTesting] = useState(false);
  const [qbitOk, setQbitOk] = useState<boolean | null>(null);

  // Ratio boost
  const [selectedHashes, setSelectedHashes] = useState<Record<string, boolean>>({});
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [boosting, setBoosting] = useState(false);
  const [boostStatus, setBoostStatus] = useState<RatioBoostStatus | null>(null);

  const seedRows = useMemo(() => torrents.filter(isSeedRow), [torrents]);

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

  const loadQbit = useCallback(async () => {
    const res = await serverApi.listDownloadClients();
    if (!res.success || !res.data) return;
    const q = res.data.find((c) => c.client_type.toLowerCase() === 'qbittorrent' && c.is_enabled)
      || res.data.find((c) => c.client_type.toLowerCase() === 'qbittorrent');
    if (!q) return;
    setQbitId(q.id);
    setQbitHost(q.host || '127.0.0.1');
    setQbitPort(q.port || 8080);
    setQbitUser(q.username || 'admin');
    if (q.password) setQbitPass(q.password);
  }, []);

  useEffect(() => {
    loadTorrents();
    loadC411Announce();
    loadQbit();
  }, [loadTorrents, loadC411Announce, loadQbit]);

  useEffect(() => {
    if (seedRows.length === 0) return;
    setSelectedHashes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of seedRows) {
        if (next[row.info_hash] === undefined) {
          next[row.info_hash] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [seedRows]);

  // Poll boost status
  useEffect(() => {
    if (!boosting && !boostStatus?.in_progress) return;
    let cancelled = false;
    const tick = async () => {
      const res = await serverApi.getC411RatioBoostStatus();
      if (cancelled || !res.success || !res.data) return;
      setBoostStatus(res.data);
      if (!res.data.in_progress) {
        setBoosting(false);
        await loadTorrents();
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [boosting, boostStatus?.in_progress, loadTorrents]);

  const busy = addingAll || migrating || boosting || addingFor !== null || qbitSaving || qbitTesting;

  const selectedSeeds = seedRows.filter((r) => selectedHashes[r.info_hash]);
  const selectedBytes = selectedSeeds.reduce((acc, r) => acc + (r.total_bytes || 0), 0);

  const handleSaveQbit = async () => {
    setQbitSaving(true);
    setMessage(null);
    const res = await serverApi.saveQbittorrentClient({
      id: qbitId,
      host: qbitHost.trim(),
      port: qbitPort,
      username: qbitUser.trim(),
      password: qbitPass,
    });
    setQbitSaving(false);
    if (!res.success || !res.data) {
      setMessage({ type: 'error', text: res.message || t('settings.clientTorrentsList.qbitSaveError') });
      return;
    }
    setQbitId(res.data.id);
    setMessage({ type: 'success', text: t('settings.clientTorrentsList.qbitSaved') });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleTestQbit = async () => {
    setQbitTesting(true);
    setQbitOk(null);
    const res = await serverApi.testQbittorrent({
      host: qbitHost.trim(),
      port: qbitPort,
      username: qbitUser.trim(),
      password: qbitPass,
    });
    setQbitTesting(false);
    if (res.success) {
      setQbitOk(true);
      setMessage({ type: 'success', text: t('settings.clientTorrentsList.qbitTestOk') });
    } else {
      setQbitOk(false);
      setMessage({ type: 'error', text: res.message || t('settings.clientTorrentsList.qbitTestFail') });
    }
  };

  const handleStartBoost = async () => {
    const hashes = selectedSeeds.map((r) => r.info_hash);
    if (hashes.length === 0) {
      setMessage({ type: 'error', text: t('settings.clientTorrentsList.boostNoneSelected') });
      return;
    }
    setBoosting(true);
    setMessage(null);
    const res = await serverApi.startC411RatioBoost({
      info_hashes: hashes,
      max_concurrent: 1,
      delete_after_complete: deleteAfter,
    });
    if (!res.success || !res.data) {
      setBoosting(false);
      setMessage({ type: 'error', text: res.message || t('settings.clientTorrentsList.boostStartError') });
      return;
    }
    setBoostStatus(res.data);
    setMessage({ type: 'success', text: t('settings.clientTorrentsList.boostStarted') });
  };

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
      setMessage({ type: 'error', text: res.message || res.error || t('common.error') });
    }
  };

  const handleAddTrackerToAll = async () => {
    const url = trackerUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: t('settings.clientTorrentsList.trackerUrlRequired') });
      return;
    }
    const targets = seedRows;
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
      setMessage({ type: 'error', text: res.message || res.error || t('common.error') });
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
    if (data.announce_url) setTrackerUrl(data.announce_url);
    await loadTorrents();
    setTimeout(() => {
      setMessage(null);
      setMigrateFailedDetails(null);
    }, 15000);
  };

  const toggleAllSeeds = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const row of seedRows) next[row.info_hash] = checked;
    setSelectedHashes(next);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ds-text-secondary)]">
        {t('settings.clientTorrentsList.description')}
      </p>

      {/* qBittorrent */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          {t('settings.clientTorrentsList.qbitTitle')}
        </h3>
        <p className="text-xs text-[var(--ds-text-secondary)]">
          {t('settings.clientTorrentsList.qbitHint')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
          <label className="form-control">
            <span className="label-text text-xs">{t('settings.clientTorrentsList.qbitHost')}</span>
            <input
              className="input input-bordered input-sm"
              value={qbitHost}
              onInput={(e) => setQbitHost((e.target as HTMLInputElement).value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">{t('settings.clientTorrentsList.qbitPort')}</span>
            <input
              type="number"
              className="input input-bordered input-sm"
              value={qbitPort}
              onInput={(e) => setQbitPort(parseInt((e.target as HTMLInputElement).value, 10) || 8080)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">{t('settings.clientTorrentsList.qbitUser')}</span>
            <input
              className="input input-bordered input-sm"
              value={qbitUser}
              onInput={(e) => setQbitUser((e.target as HTMLInputElement).value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">{t('settings.clientTorrentsList.qbitPass')}</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={qbitPass}
              onInput={(e) => setQbitPass((e.target as HTMLInputElement).value)}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary gap-1" onClick={handleSaveQbit} disabled={busy}>
            {qbitSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>
          <button type="button" className="btn btn-sm btn-ghost gap-1" onClick={handleTestQbit} disabled={busy}>
            {qbitTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('settings.clientTorrentsList.qbitTest')}
            {qbitOk === true ? ' ✓' : qbitOk === false ? ' ✗' : ''}
          </button>
        </div>
      </section>

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
        <p className={`text-sm ${message.type === 'success' ? 'text-green-500' : 'text-amber-500'}`}>
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

      {/* Boost status */}
      {boostStatus && (boostStatus.in_progress || boostStatus.finished_at) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-3 text-sm space-y-1">
          <p className="font-medium text-amber-100">
            {boostStatus.in_progress
              ? t('settings.clientTorrentsList.boostInProgress')
              : t('settings.clientTorrentsList.boostDone')}
          </p>
          {boostStatus.message && (
            <p className="text-xs text-amber-200/90">{boostStatus.message}</p>
          )}
          <p className="text-xs text-amber-200/80">
            {boostStatus.completed}/{boostStatus.queued} · {formatGiB(boostStatus.bytes_boosted)} Gio
            {boostStatus.current_name
              ? ` · ${boostStatus.current_name.slice(0, 48)}${
                  typeof boostStatus.current_progress === 'number'
                    ? ` (${Math.round(boostStatus.current_progress * 100)}%)`
                    : ''
                }`
              : ''}
          </p>
          {boostStatus.failed?.length > 0 && (
            <p className="text-xs text-red-300">
              {boostStatus.failed.length} échec(s) — {boostStatus.failed[0]?.error}
            </p>
          )}
        </div>
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
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={seedRows.length > 0 && selectedSeeds.length === seedRows.length}
                    onChange={(e) => toggleAllSeeds((e.target as HTMLInputElement).checked)}
                    title={t('settings.clientTorrentsList.boostSelectAll')}
                  />
                </th>
                <th>{t('settings.clientTorrentsList.colName')}</th>
                <th>{t('settings.clientTorrentsList.colInfoHash')}</th>
                <th>{t('settings.clientTorrentsList.colState')}</th>
                <th>{t('settings.clientTorrentsList.colTrackers')}</th>
                <th className="w-[1%]">{t('settings.clientTorrentsList.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((row) => {
                const seed = isSeedRow(row);
                return (
                  <tr key={row.info_hash}>
                    <td>
                      {seed ? (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={!!selectedHashes[row.info_hash]}
                          onChange={(e) =>
                            setSelectedHashes((prev) => ({
                              ...prev,
                              [row.info_hash]: (e.target as HTMLInputElement).checked,
                            }))
                          }
                        />
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && torrents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-warning btn-sm gap-2"
            onClick={handleStartBoost}
            disabled={busy || selectedSeeds.length === 0}
            title={t('settings.clientTorrentsList.boostTitle')}
          >
            {boosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {t('settings.clientTorrentsList.boostButton')}
            {selectedSeeds.length > 0
              ? ` (${selectedSeeds.length} · ${formatGiB(selectedBytes)} Gio)`
              : ''}
          </button>
          <label className="flex items-center gap-2 text-xs text-[var(--ds-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={deleteAfter}
              onChange={(e) => setDeleteAfter((e.target as HTMLInputElement).checked)}
            />
            {t('settings.clientTorrentsList.boostDeleteAfter')}
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            onClick={handleMigrateC411}
            disabled={busy}
            title={t('settings.clientTorrentsList.migrateC411Title')}
          >
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {t('settings.clientTorrentsList.migrateC411')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            onClick={handleAddTrackerToAll}
            disabled={!trackerUrl.trim() || busy}
            title={t('settings.clientTorrentsList.addAllTitle')}
          >
            {addingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
            {t('settings.clientTorrentsList.addAll')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={loadTorrents} disabled={busy}>
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>
      )}
    </div>
  );
}
