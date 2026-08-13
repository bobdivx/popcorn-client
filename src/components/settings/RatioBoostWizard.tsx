/**
 * Assistant Boost ratio C411 — parcours guidé :
 * 1) créer un compte C411  2) coller la clé  3) qBittorrent  4) lancement + suivi auto
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { RatioBoostStatus } from '../../lib/client/server-api/upload-tracker';
import type { Indexer } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { CheckCircle2, Circle, Loader2, Zap, ExternalLink, Save } from 'lucide-preact';

function formatGiB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

function indexerHasSkipSync(configJson: string | null | undefined): boolean {
  if (!configJson) return false;
  try {
    const parsed = JSON.parse(configJson) as Record<string, unknown>;
    const v = parsed?.skip_sync;
    return v === true || v === 1 || v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function StepBadge({
  n,
  done,
  active,
}: {
  n: number;
  done: boolean;
  active: boolean;
}) {
  if (done) {
    return (
      <span className="inline-flex w-7 h-7 rounded-full items-center justify-center bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
        <CheckCircle2 className="w-4 h-4" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-sm font-semibold border ${
        active
          ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
          : 'bg-white/5 text-gray-400 border-white/15'
      }`}
    >
      {n}
    </span>
  );
}

export default function RatioBoostWizard() {
  const { t } = useI18n();

  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loadingIndexers, setLoadingIndexers] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [accountName, setAccountName] = useState('C411 (DL)');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [qbitId, setQbitId] = useState<string | undefined>();
  const [qbitHost, setQbitHost] = useState('127.0.0.1');
  const [qbitPort, setQbitPort] = useState(8080);
  const [qbitUser, setQbitUser] = useState('admin');
  const [qbitPass, setQbitPass] = useState('');
  const [qbitSavePath, setQbitSavePath] = useState('/DATA/ratio-boost');
  const [qbitSaving, setQbitSaving] = useState(false);
  const [qbitTesting, setQbitTesting] = useState(false);
  const [qbitOk, setQbitOk] = useState(false);
  const [qbitError, setQbitError] = useState<string | null>(null);

  const [seedCount, setSeedCount] = useState(0);
  const [seedBytes, setSeedBytes] = useState(0);
  const [seedHashes, setSeedHashes] = useState<string[]>([]);

  const [boosting, setBoosting] = useState(false);
  const [boostStatus, setBoostStatus] = useState<RatioBoostStatus | null>(null);
  const [boostError, setBoostError] = useState<string | null>(null);

  const sourceC411 = useMemo(
    () =>
      indexers.find(
        (i) =>
          (i.indexerTypeId || '').toLowerCase() === 'c411' && !indexerHasSkipSync(i.configJson)
      ) ||
      indexers.find((i) => (i.indexerTypeId || '').toLowerCase() === 'c411'),
    [indexers]
  );

  const dlAccount = useMemo(
    () =>
      indexers.find(
        (i) =>
          (i.indexerTypeId || '').toLowerCase() === 'c411' && indexerHasSkipSync(i.configJson)
      ) ||
      indexers.find(
        (i) =>
          (i.indexerTypeId || '').toLowerCase() === 'c411' &&
          i.isDefault &&
          sourceC411 &&
          i.id !== sourceC411.id
      ),
    [indexers, sourceC411]
  );

  const step1Done = Boolean(sourceC411);
  const step2Done = Boolean(dlAccount);
  const step3Done = qbitOk || Boolean(qbitId);
  const step4Active = step2Done && step3Done;

  const loadIndexers = useCallback(async () => {
    setLoadingIndexers(true);
    const res = await serverApi.getIndexers();
    if (res.success && res.data) setIndexers(res.data);
    setLoadingIndexers(false);
  }, []);

  const loadQbit = useCallback(async () => {
    const res = await serverApi.listDownloadClients();
    if (!res.success || !res.data) return;
    const q =
      res.data.find((c) => c.client_type.toLowerCase() === 'qbittorrent' && c.is_enabled) ||
      res.data.find((c) => c.client_type.toLowerCase() === 'qbittorrent');
    if (!q) return;
    setQbitId(q.id);
    setQbitHost(q.host || '127.0.0.1');
    setQbitPort(q.port || 8080);
    setQbitUser(q.username || 'admin');
    if (q.password) setQbitPass(q.password);
    if (q.download_path) setQbitSavePath(q.download_path);
  }, []);

  const loadSeeds = useCallback(async () => {
    const res = await serverApi.getClientTorrents();
    if (!res.success || !res.data) return;
    const list = Array.isArray(res.data) ? res.data : [];
    const seeds = list.filter((row: any) => {
      const state = String(row.state || '').toLowerCase();
      const progress = typeof row.progress === 'number' ? row.progress : 0;
      return state.includes('seed') || state === 'finished' || state === 'complete' || progress >= 0.999;
    });
    setSeedCount(seeds.length);
    setSeedBytes(seeds.reduce((a: number, r: any) => a + (r.total_bytes || 0), 0));
    setSeedHashes(seeds.map((r: any) => String(r.info_hash)));
  }, []);

  useEffect(() => {
    loadIndexers();
    loadQbit();
    loadSeeds();
    serverApi.getC411RatioBoostStatus().then((res) => {
      if (res.success && res.data) {
        setBoostStatus(res.data);
        if (res.data.in_progress) setBoosting(true);
      }
    });
  }, [loadIndexers, loadQbit, loadSeeds]);

  useEffect(() => {
    if (!boosting && !boostStatus?.in_progress) return;
    let cancelled = false;
    const tick = async () => {
      const res = await serverApi.getC411RatioBoostStatus();
      if (cancelled || !res.success || !res.data) return;
      setBoostStatus(res.data);
      if (!res.data.in_progress) {
        setBoosting(false);
        await loadSeeds();
      }
    };
    const id = window.setInterval(tick, 2500);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [boosting, boostStatus?.in_progress, loadSeeds]);

  const handleCreateDlAccount = async () => {
    setAccountError(null);
    if (!sourceC411) {
      setAccountError(t('ratioBoost.needSourceIndexer'));
      return;
    }
    const key = apiKey.trim();
    if (!key) {
      setAccountError(t('ratioBoost.apiKeyRequired'));
      return;
    }
    setSavingAccount(true);
    try {
      const res = await serverApi.duplicateIndexerAccount(sourceC411.id, {
        apiKey: key,
        name: accountName.trim() || 'C411 (DL)',
      });
      if (!res.success) {
        setAccountError(res.message || t('ratioBoost.accountCreateError'));
        return;
      }
      setApiKey('');
      await loadIndexers();
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveAndTestQbit = async () => {
    setQbitError(null);
    setQbitSaving(true);
    try {
      const save = await serverApi.saveQbittorrentClient({
        id: qbitId,
        host: qbitHost.trim(),
        port: qbitPort,
        username: qbitUser.trim(),
        password: qbitPass,
        download_path: qbitSavePath.trim(),
      });
      if (!save.success || !save.data) {
        setQbitError(save.message || t('ratioBoost.qbitSaveError'));
        setQbitOk(false);
        return;
      }
      setQbitId(save.data.id);
      setQbitTesting(true);
      const test = await serverApi.testQbittorrent({
        host: qbitHost.trim(),
        port: qbitPort,
        username: qbitUser.trim(),
        password: qbitPass,
      });
      if (!test.success) {
        setQbitOk(false);
        const msg = test.message || '';
        const isCreds =
          test.error === 'InvalidCredentials' ||
          /identifiants|mot de passe|password|credentials/i.test(msg);
        setQbitError(
          isCreds
            ? (msg.includes('Identifiants') ? msg : t('ratioBoost.qbitBadCredentials'))
            : msg || t('ratioBoost.qbitTestFail')
        );
        return;
      }
      setQbitOk(true);
    } finally {
      setQbitSaving(false);
      setQbitTesting(false);
    }
  };

  const handleStartBoost = async () => {
    setBoostError(null);
    if (seedHashes.length === 0) {
      setBoostError(t('ratioBoost.noSeeds'));
      return;
    }
    setBoosting(true);
    const res = await serverApi.startC411RatioBoost({
      info_hashes: seedHashes,
      max_concurrent: 1,
      delete_after_complete: true,
      save_dir: qbitSavePath.trim() || '/DATA/ratio-boost',
    });
    if (!res.success || !res.data) {
      setBoosting(false);
      setBoostError(res.message || t('ratioBoost.startError'));
      return;
    }
    setBoostStatus(res.data);
  };

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/40 to-[var(--ds-surface-elevated)]/80 p-5 sm:p-6 space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="w-6 h-6 text-amber-300" aria-hidden />
          {t('ratioBoost.title')}
        </h2>
        <p className="text-sm text-[var(--ds-text-secondary)] max-w-3xl leading-relaxed">
          {t('ratioBoost.intro')}
        </p>
        <p className="text-xs text-amber-200/80 max-w-3xl">{t('ratioBoost.howItWorks')}</p>
      </header>

      {/* Étape 1 — Comprendre + compte C411 */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <StepBadge n={1} done={step1Done && step2Done} active={!step2Done} />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="font-semibold text-white">{t('ratioBoost.step1Title')}</h3>
            <p className="text-sm text-[var(--ds-text-secondary)]">{t('ratioBoost.step1Body')}</p>
            <ol className="list-decimal list-inside text-sm text-[var(--ds-text-secondary)] space-y-1">
              <li>{t('ratioBoost.step1Item1')}</li>
              <li>{t('ratioBoost.step1Item2')}</li>
              <li>{t('ratioBoost.step1Item3')}</li>
            </ol>
            <a
              href="https://c411.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-amber-300 hover:underline"
            >
              {t('ratioBoost.openC411')}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </div>

      {/* Étape 2 — Clé API */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <StepBadge n={2} done={step2Done} active={step1Done && !step2Done} />
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="font-semibold text-white">{t('ratioBoost.step2Title')}</h3>
            <p className="text-sm text-[var(--ds-text-secondary)]">{t('ratioBoost.step2Body')}</p>
            {loadingIndexers ? (
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading')}
              </p>
            ) : step2Done && dlAccount ? (
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {t('ratioBoost.accountReady').replace('{name}', dlAccount.name)}
              </p>
            ) : !sourceC411 ? (
              <p className="text-sm text-amber-300">{t('ratioBoost.needSourceIndexer')}</p>
            ) : (
              <div className="space-y-3 max-w-xl">
                <label className="form-control">
                  <span className="label-text text-xs text-gray-400">{t('ratioBoost.accountName')}</span>
                  <input
                    className="input input-bordered input-sm bg-gray-900/60"
                    value={accountName}
                    onInput={(e) => setAccountName((e.target as HTMLInputElement).value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs text-gray-400">{t('ratioBoost.apiKeyLabel')}</span>
                  <input
                    type="password"
                    className="input input-bordered input-sm bg-gray-900/60 font-mono"
                    value={apiKey}
                    onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
                    placeholder={t('ratioBoost.apiKeyPlaceholder')}
                    autoComplete="new-password"
                  />
                </label>
                {accountError && <p className="text-sm text-red-300">{accountError}</p>}
                <button
                  type="button"
                  className="btn btn-sm btn-primary gap-2"
                  onClick={handleCreateDlAccount}
                  disabled={savingAccount || !apiKey.trim()}
                >
                  {savingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('ratioBoost.saveAccount')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Étape 3 — qBittorrent */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <StepBadge n={3} done={step3Done && qbitOk} active={step2Done && !qbitOk} />
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="font-semibold text-white">{t('ratioBoost.step3Title')}</h3>
            <p className="text-sm text-[var(--ds-text-secondary)]">{t('ratioBoost.step3Body')}</p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveAndTestQbit();
              }}
            >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <label className="form-control">
                <span className="label-text text-xs">{t('ratioBoost.qbitHost')}</span>
                <input
                  className="input input-bordered input-sm bg-gray-900/60"
                  value={qbitHost}
                  onInput={(e) => {
                    setQbitHost((e.target as HTMLInputElement).value);
                    setQbitOk(false);
                  }}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">{t('ratioBoost.qbitPort')}</span>
                <input
                  type="number"
                  className="input input-bordered input-sm bg-gray-900/60"
                  value={qbitPort}
                  onInput={(e) => {
                    setQbitPort(parseInt((e.target as HTMLInputElement).value, 10) || 8080);
                    setQbitOk(false);
                  }}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">{t('ratioBoost.qbitUser')}</span>
                <input
                  className="input input-bordered input-sm bg-gray-900/60"
                  value={qbitUser}
                  onInput={(e) => {
                    setQbitUser((e.target as HTMLInputElement).value);
                    setQbitOk(false);
                  }}
                  autoComplete="username"
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">{t('ratioBoost.qbitPass')}</span>
                <input
                  type="password"
                  className="input input-bordered input-sm bg-gray-900/60"
                  value={qbitPass}
                  onInput={(e) => {
                    setQbitPass((e.target as HTMLInputElement).value);
                    setQbitOk(false);
                  }}
                  autoComplete="current-password"
                />
              </label>
            </div>
            {qbitError && <p className="text-sm text-red-300">{qbitError}</p>}
            {qbitOk && (
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {t('ratioBoost.qbitReady')}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-sm btn-primary gap-2"
              disabled={qbitSaving || qbitTesting}
            >
              {qbitSaving || qbitTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t('ratioBoost.saveAndTestQbit')}
            </button>
            </form>
          </div>
        </div>
      </div>

      {/* Étape 4 — Lancer + suivi */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <StepBadge n={4} done={Boolean(boostStatus?.finished_at && !boostStatus.in_progress)} active={step4Active} />
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="font-semibold text-white">{t('ratioBoost.step4Title')}</h3>
            <p className="text-sm text-[var(--ds-text-secondary)]">{t('ratioBoost.step4Body')}</p>
            <p className="text-sm text-white">
              {t('ratioBoost.seedsSummary')
                .replace('{count}', String(seedCount))
                .replace('{gib}', formatGiB(seedBytes))}
            </p>
            {!step4Active && (
              <p className="text-xs text-amber-200/80 flex items-center gap-2">
                <Circle className="w-3.5 h-3.5" />
                {t('ratioBoost.completePreviousSteps')}
              </p>
            )}
            {boostError && <p className="text-sm text-red-300">{boostError}</p>}
            <button
              type="button"
              className="btn btn-warning gap-2"
              onClick={handleStartBoost}
              disabled={!step4Active || boosting || seedCount === 0}
            >
              {boosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {t('ratioBoost.startButton')}
            </button>

            {/* Suivi live */}
            {boostStatus && (boostStatus.in_progress || boostStatus.finished_at) && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/40 p-4 space-y-2">
                <p className="font-medium text-amber-100">
                  {boostStatus.in_progress ? t('ratioBoost.liveTitle') : t('ratioBoost.doneTitle')}
                </p>
                {boostStatus.message && (
                  <p className="text-sm text-amber-100/90">{boostStatus.message}</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-amber-200/70">{t('ratioBoost.statQueued')}</p>
                    <p className="text-lg font-mono text-white">{boostStatus.queued}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-200/70">{t('ratioBoost.statDone')}</p>
                    <p className="text-lg font-mono text-emerald-300">{boostStatus.completed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-200/70">{t('ratioBoost.statFailed')}</p>
                    <p className="text-lg font-mono text-red-300">{boostStatus.failed?.length ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-200/70">{t('ratioBoost.statGiB')}</p>
                    <p className="text-lg font-mono text-white">{formatGiB(boostStatus.bytes_boosted)}</p>
                  </div>
                </div>
                {boostStatus.in_progress && boostStatus.current_name && (
                  <div className="space-y-1">
                    <p className="text-xs text-amber-200/80 truncate">
                      {t('ratioBoost.currentFile')}: {boostStatus.current_name}
                    </p>
                    <progress
                      className="progress progress-warning w-full"
                      value={Math.round((boostStatus.current_progress ?? 0) * 100)}
                      max={100}
                    />
                    <p className="text-xs text-right text-amber-100">
                      {Math.round((boostStatus.current_progress ?? 0) * 100)}%
                    </p>
                  </div>
                )}
                {boostStatus.failed?.length > 0 && (
                  <ul className="text-xs text-red-300 space-y-1 max-h-28 overflow-y-auto">
                    {boostStatus.failed.slice(0, 8).map((f) => (
                      <li key={f.info_hash}>
                        {f.name.slice(0, 40)} — {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
