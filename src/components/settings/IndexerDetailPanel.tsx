import { useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import { IndexerCard } from './IndexerCard';
import IndexersManager from './IndexersManager';
import { IndexerTestModal, formatProgressEvent } from './IndexerTestModal';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';
import { useI18n } from '../../lib/i18n/useI18n';
import IndexerCategoriesSelector from './IndexerCategoriesSelector';

interface IndexerDetailPanelProps {
  indexer: Indexer;
  onDeleted?: () => void;
  onEditClose?: () => void;
  onBack?: () => void;
}

export default function IndexerDetailPanel({ indexer, onDeleted, onEditClose, onBack }: IndexerDetailPanelProps) {
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

  return (
    <div className="space-y-4">
      <IndexerCard
        name={indexer.name}
        baseUrl={indexer.baseUrl}
        isEnabled={indexer.isEnabled}
        isDefault={indexer.isDefault}
        priority={indexer.priority}
        indexerId={indexer.id}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTest={handleTest}
        onSync={handleSync}
        isTesting={testing}
        isSyncing={syncing}
        testProgress={testProgress}
        testResult={testResult}
      >
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h3 className="text-base font-semibold text-white mb-2">
            {t('settingsMenu.syncCategories.selectorTitle') ?? 'Catégories synchronisées'}
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            {t('settingsMenu.syncCategories.selectorDescription')}
          </p>
          <IndexerCategoriesSelector indexerId={indexer.id} />
        </div>
      </IndexerCard>
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
