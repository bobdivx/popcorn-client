import { useEffect, useRef } from 'preact/hooks';
import { Modal } from '../ui/Modal';
import { useI18n } from '../../lib/i18n/useI18n';

export interface IndexerTestProgressEvent {
  type: string;
  query?: string;
  index?: number;
  total?: number;
  count?: number;
  success?: boolean;
  error?: string;
  apiKeyTest?: { valid: boolean; message: string };
}

export interface IndexerTestFinalResult {
  success: boolean;
  message?: string;
  totalResults?: number;
  resultsCount?: number;
  successfulQueries?: number;
  failedQueries?: number;
  testQueries?: string[];
  sampleResults?: Array<any>;
  /** Résultat du test de téléchargement d'un .torrent réel */
  downloadTest?: { success: boolean; message: string; torrentIdUsed?: string; guidUsed?: string };
}

interface IndexerTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  indexerName: string;
  progressLog: string[];
  isRunning: boolean;
  finalResult: IndexerTestFinalResult | null;
  errorMessage?: string | null;
}

export function IndexerTestModal({
  isOpen,
  onClose,
  indexerName,
  progressLog,
  isRunning,
  finalResult,
  errorMessage,
}: IndexerTestModalProps) {
  const { t } = useI18n();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('indexerTestModal.title', { name: indexerName || '…' })}
      size="lg"
      closeOnEscape={!isRunning}
      closeOnBackdropClick={!isRunning}
    >
      <div class="flex flex-col gap-4">
        {/* Indicateur en cours */}
        {isRunning && (
          <div class="flex items-center gap-3 rounded-lg bg-blue-900/30 border border-blue-600/50 px-4 py-3 text-blue-200">
            <span class="loading loading-spinner loading-sm" />
            <span>{t('indexerTestModal.testing')}</span>
          </div>
        )}

        {/* Log des étapes (au fur et à mesure) */}
        {(progressLog.length > 0 || isRunning) && (
          <div class="rounded-lg bg-gray-900/80 border border-gray-700 overflow-hidden">
            <div class="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-400">
              {t('indexerTestModal.progressLog')}
            </div>
            <div class="max-h-48 overflow-y-auto p-3 font-mono text-sm text-gray-300 space-y-1">
              {progressLog.map((line, i) => (
                <div key={i} class="whitespace-pre-wrap break-words">
                  {line}
                </div>
              ))}
              {isRunning && progressLog.length === 0 && (
                <div class="text-gray-500">{t('indexerTestModal.waitingFirstResult')}</div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Erreur réseau / backend */}
        {errorMessage && (
          <div class="rounded-lg bg-red-900/30 border border-red-600 px-4 py-3 text-red-200">
            {errorMessage}
          </div>
        )}

        {/* Résultat final */}
        {finalResult && !isRunning && (
          <div
            class={`rounded-lg border px-4 py-4 ${
              finalResult.success
                ? 'bg-green-900/30 border-green-600 text-green-200'
                : 'bg-amber-900/30 border-amber-600 text-amber-200'
            }`}
          >
            <div class="flex items-start gap-3">
              <span class="text-2xl">{finalResult.success ? '✅' : '❌'}</span>
              <div class="flex-1 min-w-0">
                <p class="font-semibold">
                  {finalResult.success ? t('indexerCard.testSuccess') : t('indexerCard.testFailed')}
                </p>
                {finalResult.message && (
                  <p class="mt-1 text-sm opacity-90">{finalResult.message}</p>
                )}
                {finalResult.success && finalResult.totalResults != null && (
                  <p class="mt-2 text-sm">
                    {(finalResult.totalResults ?? 0).toLocaleString()} {t('indexerCard.torrentsFoundTotal')}
                  </p>
                )}
                {finalResult.successfulQueries != null && finalResult.testQueries != null && (
                  <p class="text-sm mt-1">
                    {finalResult.successfulQueries} {t('indexerCard.queriesSuccessOutOf')} {finalResult.testQueries.length}
                  </p>
                )}
                {finalResult.downloadTest != null && (
                  <div class={`mt-3 p-3 rounded-lg border text-sm ${
                    finalResult.downloadTest.success
                      ? 'bg-green-900/20 border-green-600/50 text-green-200'
                      : 'bg-amber-900/20 border-amber-600/50 text-amber-200'
                  }`}>
                    <p class="font-semibold flex items-center gap-2">
                      <span>{finalResult.downloadTest.success ? '✅' : '❌'}</span>
                      <span>{t('indexerCard.downloadTestTorrentFile')}</span>
                    </p>
                    <p class="mt-1 opacity-90">{finalResult.downloadTest.message}</p>
                    {(finalResult.downloadTest.torrentIdUsed ?? finalResult.downloadTest.guidUsed) && (
                      <p class="mt-1 text-xs opacity-75 font-mono">
                        {(finalResult.downloadTest.torrentIdUsed ?? finalResult.downloadTest.guidUsed)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bouton Fermer */}
        <div class="flex justify-end pt-2">
          <button
            type="button"
            class="btn btn-neutral"
            onClick={onClose}
            disabled={isRunning}
          >
            {t('indexerTestModal.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Formate un événement query_done pour affichage dans le log */
export function formatProgressEvent(event: IndexerTestProgressEvent): string {
  if (event.type === 'api_key_test_done' && event.apiKeyTest) {
    const ok = event.apiKeyTest.valid ? '✅' : '❌';
    return `1. Clé API / passkey : ${ok} ${event.apiKeyTest.message}`;
  }
  const i = event.index ?? 0;
  const total = event.total ?? 0;
  const query = event.query ?? '';
  if (event.success) {
    const count = event.count ?? 0;
    return `Requête ${i}/${total} : « ${query} » → ${count} résultat(s)`;
  }
  const err = event.error ?? '';
  return err ? `Requête ${i}/${total} : « ${query} » → Échec : ${err}` : `Requête ${i}/${total} : « ${query} » → Échec`;
}
