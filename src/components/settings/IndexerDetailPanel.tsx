import { useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import IndexersManager from './IndexersManager';
import { IndexerTestModal, formatProgressEvent } from './IndexerTestModal';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';
import { useI18n } from '../../lib/i18n/useI18n';
import IndexerCategoriesSelector from './IndexerCategoriesSelector';
import IndexerBulkZipPanel from './IndexerBulkZipPanel';
import { Trash2, Pencil, RefreshCw, PlayCircle, CopyPlus } from 'lucide-preact';
import { useConfirmDialog } from '../ui/useConfirmDialog';
import { Modal } from '../ui/Modal';

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

interface IndexerDetailPanelProps {
  indexer: Indexer;
  onDeleted?: () => void;
  onEditClose?: () => void;
  onBack?: () => void;
  /** Après mise à jour de la config indexer (ex. préférences ZIP) */
  onIndexerUpdated?: () => void;
}

export default function IndexerDetailPanel({ indexer, onDeleted, onEditClose, onBack, onIndexerUpdated }: IndexerDetailPanelProps) {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [showEdit, setShowEdit] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testProgressLog, setTestProgressLog] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testFinalResult, setTestFinalResult] = useState<any>(null);
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'bulkZip'>('overview');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('C411 (DL)');
  const [duplicateApiKey, setDuplicateApiKey] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateSuccess, setDuplicateSuccess] = useState<string | null>(null);

  const skipSync = useMemo(() => indexerHasSkipSync(indexer.configJson), [indexer.configJson]);
  const canDuplicateAccount = (indexer.indexerTypeId || '').toLowerCase() === 'c411';

  const extraConfig = useMemo(() => {
    if (!indexer.configJson) return undefined as Record<string, string> | undefined;
    try {
      const parsed = JSON.parse(indexer.configJson) as Record<string, unknown>;
      const out: Record<string, string> = {};
      Object.entries(parsed || {}).forEach(([k, v]) => {
        if (v != null) out[k] = String(v);
      });
      return out;
    } catch {
      return undefined;
    }
  }, [indexer.configJson]);

  const manualTrackerRatio = useMemo(() => {
    const raw = extraConfig?.tracker_manual_ratio;
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }, [extraConfig]);

  const handleEdit = () => setShowEdit(true);
  const handleEditClose = () => {
    setShowEdit(false);
    onEditClose?.();
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: t('indexersManager.confirmDelete'),
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }
    try {
      const res = await serverApi.deleteIndexer(indexer.id);
      if (res.success) {
        await syncIndexersToCloud();
        onDeleted?.();
        onBack?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openDuplicateModal = () => {
    setDuplicateName('C411 (DL)');
    setDuplicateApiKey('');
    setDuplicateError(null);
    setDuplicateSuccess(null);
    setDuplicateOpen(true);
  };

  const handleDuplicateAccount = async (e: Event) => {
    e.preventDefault();
    const key = duplicateApiKey.trim();
    if (!key) {
      setDuplicateError(t('indexersManager.duplicateAccount.apiKeyRequired'));
      return;
    }
    setDuplicating(true);
    setDuplicateError(null);
    setDuplicateSuccess(null);
    try {
      const res = await serverApi.duplicateIndexerAccount(indexer.id, {
        apiKey: key,
        name: duplicateName.trim() || undefined,
      });
      if (!res.success || !res.data) {
        setDuplicateError(res.message || t('indexersManager.duplicateAccount.error'));
        return;
      }
      await syncIndexersToCloud();
      setDuplicateSuccess(
        t('indexersManager.duplicateAccount.success').replace('{name}', res.data.name)
      );
      setDuplicateOpen(false);
      onIndexerUpdated?.();
      onEditClose?.();
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : t('indexersManager.duplicateAccount.error'));
    } finally {
      setDuplicating(false);
    }
  };

  const handleTest = async () => {
    setTestProgressLog([]);
    setTestFinalResult(null);
    setTestErrorMessage(null);
    setTestModalOpen(true);
    setTestRunning(true);
    setTesting(true);

    try {
      const response = await serverApi.testIndexerStream(indexer.id, (event) => {
        setTestProgressLog((prev) => [...prev, formatProgressEvent(event)]);
      });

      if (response.success && response.data) {
        const d = response.data;
        setTestFinalResult({
          success: d.success !== false,
          message: d.message,
          totalResults: d.totalResults,
          resultsCount: d.resultsCount,
          successfulQueries: d.successfulQueries,
          failedQueries: d.failedQueries,
          testQueries: d.testQueries,
          sampleResults: d.sampleResults,
          apiKeyTest: d.apiKeyTest,
          downloadTest: d.downloadTest,
        });
      } else {
        const msg = response.message || t('indexersManager.errorTesting');
        setTestFinalResult({ success: false, message: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('indexersManager.errorTesting');
      setTestErrorMessage(msg);
      setTestFinalResult({ success: false, message: msg });
    } finally {
      setTestRunning(false);
      setTesting(false);
    }
  };

  const closeTestModal = () => {
    setTestModalOpen(false);
    setTestProgressLog([]);
    setTestFinalResult(null);
    setTestErrorMessage(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await serverApi.startSync(indexer.id);
    } finally {
      setSyncing(false);
    }
  };

  if (showEdit) {
    return (
      <IndexersManager
        editIndexer={indexer}
        onEditClose={handleEditClose}
      />
    );
  }

  return (
    <div className="space-y-6">
      {duplicateSuccess && (
        <div className="p-3 rounded-lg border border-emerald-600/50 bg-emerald-900/20 text-emerald-200 text-sm">
          {duplicateSuccess}
        </div>
      )}
      {/* Carte principale infos + onglets + actions */}
      <div className="ds-card-section rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]/85 shadow-lg space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="ds-title-card text-lg sm:text-xl truncate">
              {t('indexersManager.editIndexer')}
            </h2>
            <p className="ds-text-secondary text-xs sm:text-sm break-all">
              {indexer.baseUrl || '—'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full border ${indexer.isEnabled ? 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10' : 'border-gray-500/60 text-gray-300 bg-gray-500/10'}`}>
                {indexer.isEnabled ? t('indexerCard.active') : t('indexerCard.inactive')}
              </span>
              {indexer.isDefault && (
                <span className="px-2 py-0.5 rounded-full border border-indigo-500/60 text-indigo-200 bg-indigo-500/10">
                  {t('indexerCard.default')}
                </span>
              )}
              {canDuplicateAccount && (skipSync ? (
                <span className="px-2 py-0.5 rounded-full border border-amber-500/60 text-amber-200 bg-amber-500/10" title={t('indexerCard.downloadAccountHint')}>
                  {t('indexerCard.downloadAccount')}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full border border-cyan-500/60 text-cyan-200 bg-cyan-500/10" title={t('indexerCard.syncAccountHint')}>
                  {t('indexerCard.syncAccount')}
                </span>
              ))}
            </div>
          </div>

          {/* Actions principales */}
          <div className="flex flex-wrap gap-2 justify-end">
            {canDuplicateAccount && (
              <button
                type="button"
                className="btn btn-sm btn-ghost gap-1 text-amber-200 border border-amber-500/40"
                onClick={openDuplicateModal}
                title={t('indexersManager.duplicateAccount.hint')}
              >
                <CopyPlus className="w-4 h-4" aria-hidden />
                {t('indexersManager.duplicateAccount.button')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1 text-primary-300 border border-primary-500/40"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? <span className="loading loading-spinner loading-xs" /> : <PlayCircle className="w-4 h-4" aria-hidden />}
              {t('torrentSyncManager.syncNow')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1 text-emerald-300 border border-emerald-500/40"
              onClick={handleSync}
              disabled={syncing || skipSync}
              title={skipSync ? t('indexerCard.downloadAccountHint') : undefined}
            >
              {syncing ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              {t('torrentSyncManager.syncNow') ?? 'Sync'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1 text-white border border-white/20"
              onClick={handleEdit}
            >
              <Pencil className="w-4 h-4" aria-hidden />
              {t('indexersManager.editIndexer')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1 text-red-300 border border-red-500/40"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              {t('common.delete')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-2 border-b border-[var(--ds-border-subtle)] flex gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-t-md border-b-2 ${
              activeTab === 'overview'
                ? 'border-[var(--ds-accent-violet)] text-white'
                : 'border-transparent text-[var(--ds-text-secondary)] hover:text-white'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            {t('common.details')}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-t-md border-b-2 ${
              activeTab === 'categories'
                ? 'border-[var(--ds-accent-violet)] text-white'
                : 'border-transparent text-[var(--ds-text-secondary)] hover:text-white'
            }`}
            onClick={() => setActiveTab('categories')}
          >
            {t('settingsMenu.indexers.title')}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-t-md border-b-2 ${
              activeTab === 'bulkZip'
                ? 'border-[var(--ds-accent-violet)] text-white'
                : 'border-transparent text-[var(--ds-text-secondary)] hover:text-white'
            }`}
            onClick={() => setActiveTab('bulkZip')}
          >
            {t('indexersManager.bulkZip.tabTitle')}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="ds-text-secondary text-xs">{t('indexerCard.priority')}</p>
              <p className="font-semibold text-white">{indexer.priority ?? 0}</p>
            </div>
            <div className="space-y-1">
              <p className="ds-text-secondary text-xs">{t('indexerCard.ratio')}</p>
              <p className="font-semibold text-white">
                {manualTrackerRatio != null ? manualTrackerRatio.toFixed(2) : t('indexerCard.ratioNotAvailable')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="ds-text-secondary text-xs">ID</p>
              <p className="font-mono text-xs text-white break-all">{indexer.id}</p>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="pt-3 space-y-3">
            <p className="ds-text-secondary text-xs sm:text-sm">
              {t('settingsMenu.syncCategories.selectorDescription')}
            </p>
            <IndexerCategoriesSelector indexerId={indexer.id} />
          </div>
        )}

        {activeTab === 'bulkZip' && (
          <IndexerBulkZipPanel indexerId={indexer.id} onConfigSaved={onIndexerUpdated} />
        )}
      </div>

      <Modal
        isOpen={duplicateOpen}
        onClose={() => !duplicating && setDuplicateOpen(false)}
        title={t('indexersManager.duplicateAccount.title')}
        size="md"
      >
        <form onSubmit={handleDuplicateAccount} className="space-y-4">
          <p className="text-sm ds-text-secondary">{t('indexersManager.duplicateAccount.hint')}</p>
          <div className="form-control">
            <label className="label">
              <span className="label-text text-white">{t('indexersManager.duplicateAccount.nameLabel')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered bg-gray-800 border-gray-700 text-white w-full"
              value={duplicateName}
              onInput={(e) => setDuplicateName((e.target as HTMLInputElement).value)}
              placeholder="C411 (DL)"
              disabled={duplicating}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text text-white">{t('indexersManager.duplicateAccount.apiKeyLabel')}</span>
            </label>
            <input
              type="password"
              className="input input-bordered bg-gray-800 border-gray-700 text-white w-full"
              value={duplicateApiKey}
              onInput={(e) => setDuplicateApiKey((e.target as HTMLInputElement).value)}
              placeholder={t('indexersManager.duplicateAccount.apiKeyPlaceholder')}
              disabled={duplicating}
              autoComplete="off"
            />
          </div>
          {duplicateError && (
            <p className="text-sm text-red-300">{duplicateError}</p>
          )}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={duplicating}
              onClick={() => setDuplicateOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={duplicating}>
              {duplicating ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  {t('indexersManager.duplicateAccount.saving')}
                </>
              ) : (
                t('indexersManager.duplicateAccount.confirm')
              )}
            </button>
          </div>
        </form>
      </Modal>

      <IndexerTestModal
        isOpen={testModalOpen}
        onClose={closeTestModal}
        indexerName={indexer.name}
        progressLog={testProgressLog}
        isRunning={testRunning}
        finalResult={testFinalResult}
        errorMessage={testErrorMessage}
      />
      {confirmDialog}
    </div>
  );
}
