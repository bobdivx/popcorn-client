import { useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import IndexersManager from './IndexersManager';
import { IndexerTestModal, formatProgressEvent } from './IndexerTestModal';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';
import { useI18n } from '../../lib/i18n/useI18n';
import IndexerCategoriesSelector from './IndexerCategoriesSelector';
import IndexerBulkZipPanel from './IndexerBulkZipPanel';
import { Trash2, Pencil, RefreshCw, PlayCircle } from 'lucide-preact';

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
  const [showEdit, setShowEdit] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<{ index: number; total: number; lastQuery?: string; lastCount?: number; lastSuccess?: boolean } | undefined>();
  const [testResult, setTestResult] = useState<any>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testProgressLog, setTestProgressLog] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testFinalResult, setTestFinalResult] = useState<any>(null);
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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
    if (!confirm(t('indexersManager.confirmDelete'))) return;
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
        setTestProgress({
          index: event.index ?? 0,
          total: event.total ?? 0,
          lastQuery: event.query,
          lastCount: event.count,
          lastSuccess: event.success,
        });
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
        setTestResult({
          success: d.success !== false,
          message: d.message,
          totalResults: d.totalResults,
          resultsCount: d.resultsCount,
          successfulQueries: d.successfulQueries,
          failedQueries: d.failedQueries,
          testQueries: d.testQueries,
          sampleResults: d.sampleResults,
          sampleResult: d.sampleResults?.[0],
          apiKeyTest: d.apiKeyTest,
          downloadTest: d.downloadTest,
        });
      } else {
        const msg = response.message || t('indexersManager.errorTesting');
        setTestFinalResult({ success: false, message: msg });
        setTestResult({ success: false, message: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('indexersManager.errorTesting');
      setTestErrorMessage(msg);
      setTestFinalResult({ success: false, message: msg });
      setTestResult({ success: false, message: msg });
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

  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'bulkZip'>('overview');

  return (
    <div className="space-y-6">
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
            </div>
          </div>

          {/* Actions principales */}
          <div className="flex flex-wrap gap-2 justify-end">
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
              disabled={syncing}
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

      <IndexerTestModal
        isOpen={testModalOpen}
        onClose={closeTestModal}
        indexerName={indexer.name}
        progressLog={testProgressLog}
        isRunning={testRunning}
        finalResult={testFinalResult}
        errorMessage={testErrorMessage}
      />
    </div>
  );
}
