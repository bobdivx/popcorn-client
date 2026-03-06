import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer, IndexerFormData } from '../../lib/client/types';
import { IndexerCard } from './IndexerCard';
import { IndexerTestModal, formatProgressEvent } from './IndexerTestModal';
import { CookieWizardModal } from './CookieWizardModal';
import IndexerDetailPanel from './IndexerDetailPanel';
import { Modal } from '../ui/Modal';
import { DsCard, DsCardSection } from '../ui/design-system';
import { Plus, ChevronRight, Search } from 'lucide-preact';
import { getIndexerDefinitionsWithBackendFallback, type IndexerDefinition } from '../../lib/api/popcorn-web';
import {
  filterAndSortIndexerDefinitions,
  getUniqueLanguagesAndCountries,
} from '../../lib/utils/indexer-definitions-filter';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';
import { normalizeCookieInput } from '../../lib/utils/cookie-format';

const STORAGE_KEY_USE_JACKETT = 'popcorn-indexer-use-jackett';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

function getStoredUseJackett(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_USE_JACKETT);
    return v === 'true';
  } catch {
    return false;
  }
}

interface IndexersManagerProps {
  /** Afficher uniquement le formulaire d'édition pour cet indexer (mode "détail") */
  editIndexer?: Indexer | null;
  /** Callback quand on ferme le formulaire d'édition */
  onEditClose?: () => void;
  /** Afficher directement le formulaire d'ajout au montage */
  initialModeAdd?: boolean;
  /** Callback après ajout réussi (pour rafraîchir la liste parente) */
  onAddSuccess?: () => void;
}

export default function IndexersManager({ editIndexer, onEditClose, initialModeAdd, onAddSuccess }: IndexersManagerProps = {}) {
  const { t, language: userLocale } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDefinitionSelector, setShowDefinitionSelector] = useState(false);
  const [definitions, setDefinitions] = useState<IndexerDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<IndexerDefinition | null>(null);
  const [definitionSearchQuery, setDefinitionSearchQuery] = useState('');
  const [definitionFilterLanguage, setDefinitionFilterLanguage] = useState('');
  const [definitionFilterCountry, setDefinitionFilterCountry] = useState('');
  const [useJackett, setUseJackett] = useState(false);
  const [editingIndexer, setEditingIndexer] = useState<Indexer | null>(null);
  const [formData, setFormData] = useState<IndexerFormData>({
    name: '',
    baseUrl: '',
    apiKey: '',
    jackettIndexerName: '',
    isEnabled: true,
    isDefault: false,
    priority: 0,
    indexerTypeId: null,
    extraConfig: {},
    useFlareSolverr: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testProgress, setTestProgress] = useState<Record<string, { index: number; total: number; lastQuery?: string; lastCount?: number; lastSuccess?: boolean }>>({});
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [cookieWizardOpen, setCookieWizardOpen] = useState(false);
  const [testModalIndexer, setTestModalIndexer] = useState<{ id: string; name: string } | null>(null);
  const [testProgressLog, setTestProgressLog] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testFinalResult, setTestFinalResult] = useState<{ success: boolean; message?: string; totalResults?: number; resultsCount?: number; successfulQueries?: number; failedQueries?: number; testQueries?: string[]; sampleResults?: Array<any>; apiKeyTest?: { valid: boolean; message: string } } | null>(null);
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, {
    success: boolean;
    message?: string;
    totalResults?: number;
    resultsCount?: number;
    successfulQueries?: number;
    failedQueries?: Array<[string, string]> | number;
    testQueries?: string[];
    sampleResults?: Array<any>;
    sampleResult?: any;
    apiKeyTest?: { valid: boolean; message: string };
  }>>({});
  const [syncingIndexerId, setSyncingIndexerId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  /** Indexer dont la modal détail/configuration est ouverte (null = fermée) */
  const [detailModalIndexerId, setDetailModalIndexerId] = useState<string | null>(null);

  useEffect(() => {
    loadIndexers();
  }, []);

  useEffect(() => {
    setUseJackett(getStoredUseJackett());
  }, []);

  // Mode édition standalone (depuis sous-menu)
  useEffect(() => {
    if (editIndexer) {
      setEditingIndexer(editIndexer);
      setFormData({
        name: editIndexer.name,
        baseUrl: editIndexer.baseUrl,
        apiKey: editIndexer.apiKey ?? '',
        jackettIndexerName: editIndexer.jackettIndexerName ?? '',
        isEnabled: editIndexer.isEnabled,
        isDefault: editIndexer.isDefault,
        priority: editIndexer.priority,
        indexerTypeId: editIndexer.indexerTypeId ?? null,
      });
      setShowForm(true);
      setShowDefinitionSelector(false);
    }
  }, [editIndexer?.id]);

  // Mode ajout initial (une seule fois) - lancer immédiatement sans attendre le chargement des indexers
  const hasInitialAdd = useRef(false);
  useEffect(() => {
    if (initialModeAdd && !hasInitialAdd.current) {
      hasInitialAdd.current = true;
      handleAddIndexer();
    }
  }, [initialModeAdd]);

  const loadIndexers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getIndexers();
      if (response.success && response.data) {
        setIndexers(response.data);
      } else {
        setError(response.message || t('indexersManager.errorLoading'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const configObj: Record<string, string | boolean> = { ...(formData.extraConfig || {}) };
      const def = formData.indexerTypeId ? definitions.find((d) => d.id === formData.indexerTypeId) : null;
      if (def?.protocol === 'custom' && formData.useFlareSolverr) configObj.useFlareSolverr = true;
      const payload: IndexerFormData = {
        ...formData,
        configJson: Object.keys(configObj).length > 0 ? JSON.stringify(configObj) : null,
      };
    try {
      let response;
      if (editingIndexer) {
        response = await serverApi.updateIndexer(editingIndexer.id, payload);
      } else {
        response = await serverApi.createIndexer(payload);
      }

      if (response.success) {
        setShowForm(false);
        setShowDefinitionSelector(false);
        setEditingIndexer(null);
        setSelectedDefinition(null);
        setFormData({
          name: '',
          baseUrl: '',
          apiKey: '',
          jackettIndexerName: '',
          isEnabled: true,
          isDefault: false,
          priority: 0,
          indexerTypeId: null,
          extraConfig: {},
          useFlareSolverr: false,
        });
        await loadIndexers();
        await syncIndexersToCloud();
        if (editingIndexer && onEditClose) onEditClose();
        else if (!editingIndexer && onAddSuccess) onAddSuccess();
      } else {
        setError(response.message || t('indexersManager.errorSaving'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddIndexer = async () => {
    // Charger les définitions via le backend (proxy) si disponible, sinon depuis popcorn-web
    setLoadingDefinitions(true);
    setError(null);
    
    try {
      const backendUrl = serverApi.getServerUrl?.() ?? null;
      const defs = await getIndexerDefinitionsWithBackendFallback(backendUrl);
      if (defs && defs.length > 0) {
        setDefinitions(defs);
        setShowDefinitionSelector(true);
      } else {
        // Si aucune définition n'est disponible, afficher directement le formulaire vide
        setShowForm(true);
      }
    } catch (err) {
      console.warn('Erreur lors du chargement des définitions d\'indexers:', err);
      // En cas d'erreur, afficher directement le formulaire vide
      setShowForm(true);
    } finally {
      setLoadingDefinitions(false);
    }
  };

  const { languages: uniqueLanguages, countries: uniqueCountries } = useMemo(
    () => getUniqueLanguagesAndCountries(definitions),
    [definitions]
  );

  const displayedDefinitions = useMemo(
    () =>
      filterAndSortIndexerDefinitions(definitions, {
        searchQuery: definitionSearchQuery,
        filterLanguage: definitionFilterLanguage,
        filterCountry: definitionFilterCountry,
        userLocale,
        useJackett,
      }),
    [
      definitions,
      definitionSearchQuery,
      definitionFilterLanguage,
      definitionFilterCountry,
      userLocale,
      useJackett,
    ]
  );

  const toggleUseJackett = (value: boolean) => {
    setUseJackett(value);
    try {
      localStorage.setItem(STORAGE_KEY_USE_JACKETT, String(value));
    } catch {}
  };

  const handleSelectDefinition = (definition: IndexerDefinition) => {
    setSelectedDefinition(definition);
    
    // Pré-remplir le formulaire avec les informations de la définition
    // Extraire l'URL de base depuis le searchEndpoint si possible
    let baseUrl = '';
    if (definition.searchEndpoint) {
      try {
        // Le searchEndpoint peut être relatif ou absolu
        // Exemple: "/api/v2.0/indexers/{indexer}/results/torznab"
        // On essaie d'extraire la base URL
        const endpoint = definition.searchEndpoint;
        
        // Si c'est un endpoint relatif, on ne peut pas extraire l'URL de base
        // L'utilisateur devra la saisir manuellement
        if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
          try {
            const url = new URL(endpoint);
            // Retirer les parties dynamiques du chemin
            const pathParts = url.pathname.split('/').filter(p => p && p !== '{indexer}');
            // Garder seulement les premiers niveaux (ex: /api/v2.0)
            const basePath = pathParts.slice(0, -2).join('/');
            baseUrl = `${url.protocol}//${url.host}${basePath ? '/' + basePath : ''}`;
          } catch {
            baseUrl = '';
          }
        }
        // Si c'est relatif, on laisse vide pour que l'utilisateur saisisse
      } catch {
        // Si l'URL ne peut pas être parsée, laisser vide
        baseUrl = '';
      }
    }
    
    // Valeurs par défaut depuis ui.fields (baseUrl, apiKey, username, password, etc.)
    // Pour baseUrl uniquement : utiliser default si présent, sinon placeholder (ex. "https://hdf.world") pour pré-remplir
    const uiFields = Array.isArray(definition.ui?.fields) ? definition.ui.fields : [];
    let defaultBaseUrl = baseUrl;
    let defaultApiKey = '';
    const extraConfig: Record<string, string> = {};
    for (const field of uiFields) {
      const name = field?.name;
      const defaultVal = field?.default ?? '';
      if (name === 'baseUrl') {
        defaultBaseUrl = defaultVal || (field?.placeholder ?? '') || defaultBaseUrl;
      } else if (name === 'apiKey') {
        defaultApiKey = defaultVal;
      } else if (name) {
        extraConfig[name] = typeof defaultVal === 'string' ? defaultVal : '';
      }
    }

    // Déterminer le nom Jackett si c'est un protocole torznab
    let jackettIndexerName = '';
    if (definition.protocol === 'torznab') {
      jackettIndexerName = definition.name;
    }

    setFormData({
      name: definition.name,
      baseUrl: defaultBaseUrl,
      apiKey: defaultApiKey,
      jackettIndexerName: jackettIndexerName,
      isEnabled: true,
      isDefault: false,
      priority: 0,
      indexerTypeId: definition.id,
      extraConfig,
      useFlareSolverr: false,
    });
    
    setShowDefinitionSelector(false);
    setShowForm(true);
  };

  const handleEdit = async (indexer: Indexer) => {
    setEditingIndexer(indexer);
    setSelectedDefinition(null);
    let extraConfig: Record<string, string> = {};
    let useFlareSolverr = false;
    if (indexer.configJson) {
      try {
        const parsed = JSON.parse(indexer.configJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          useFlareSolverr = parsed.useFlareSolverr === true;
          for (const [k, v] of Object.entries(parsed)) {
            if (k !== 'useFlareSolverr' && typeof v === 'string') extraConfig[k] = v;
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (definitions.length === 0 && indexer.indexerTypeId) {
      try {
        const backendUrl = serverApi.getServerUrl?.() ?? null;
        const defs = await getIndexerDefinitionsWithBackendFallback(backendUrl);
        if (defs?.length) setDefinitions(defs);
      } catch {
        /* ignore */
      }
    }
    setFormData({
      name: indexer.name,
      baseUrl: indexer.baseUrl,
      apiKey: indexer.apiKey || '',
      jackettIndexerName: indexer.jackettIndexerName || '',
      isEnabled: indexer.isEnabled,
      isDefault: indexer.isDefault,
      priority: indexer.priority,
      indexerTypeId: indexer.indexerTypeId || null,
      extraConfig,
      useFlareSolverr,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('indexersManager.confirmDelete'))) {
      return;
    }

    try {
      const response = await serverApi.deleteIndexer(id);
      if (response.success) {
        await loadIndexers();
        // Synchroniser automatiquement vers le cloud
        await syncIndexersToCloud();
      } else {
        setError(response.message || t('indexersManager.errorDeleting'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const handleSync = async (id: string) => {
    setSyncingIndexerId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await serverApi.startSync(id);
      if (response.success) {
        const msg = (response.data && typeof response.data === 'string' ? response.data : null) || t('indexersManager.syncStarted');
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(response.message || t('indexersManager.errorTesting'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSyncingIndexerId(null);
    }
  };

  const handleTest = async (id: string) => {
    const indexer = indexers.find((i) => i.id === id);
    const name = indexer?.name ?? id;
    setTestModalIndexer({ id, name });
    setTestProgressLog([]);
    setTestFinalResult(null);
    setTestErrorMessage(null);
    setTestModalOpen(true);
    setTestRunning(true);
    setTesting(id);
    setError(null);

    try {
      const response = await serverApi.testIndexerStream(id, (event) => {
        setTestProgressLog((prev) => [...prev, formatProgressEvent(event)]);
        setTestProgress((prev) => ({
          ...prev,
          [id]: {
            index: event.index ?? 0,
            total: event.total ?? 0,
            lastQuery: event.query,
            lastCount: event.count,
            lastSuccess: event.success,
          },
        }));
      });

      if (response.success && response.data) {
        const testData = response.data;
        setTestFinalResult({
          success: testData.success !== false,
          message: testData.message,
          totalResults: testData.totalResults,
          resultsCount: testData.resultsCount,
          successfulQueries: testData.successfulQueries,
          failedQueries: testData.failedQueries,
          testQueries: testData.testQueries,
          sampleResults: testData.sampleResults,
          apiKeyTest: testData.apiKeyTest,
          downloadTest: testData.downloadTest,
        });
        setTestResults((prev) => ({
          ...prev,
          [id]: {
            success: testData.success !== false,
            message: testData.message,
            totalResults: testData.totalResults,
            resultsCount: testData.resultsCount,
            successfulQueries: testData.successfulQueries,
            failedQueries: testData.failedQueries,
            testQueries: testData.testQueries,
            sampleResults: testData.sampleResults,
            sampleResult: testData.sampleResults?.[0],
            apiKeyTest: testData.apiKeyTest,
            downloadTest: testData.downloadTest,
          },
        }));
      } else {
        const msg = response.message || t('indexersManager.errorTesting');
        setTestFinalResult({ success: false, message: msg });
        setTestResults((prev) => ({ ...prev, [id]: { success: false, message: msg } }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('indexersManager.errorTesting');
      setTestErrorMessage(msg);
      setTestFinalResult({ success: false, message: msg });
      setTestResults((prev) => ({ ...prev, [id]: { success: false, message: msg } }));
    } finally {
      setTestRunning(false);
      setTesting(null);
    }
  };

  const closeTestModal = () => {
    setTestModalOpen(false);
    setTestModalIndexer(null);
    setTestProgressLog([]);
    setTestFinalResult(null);
    setTestErrorMessage(null);
  };

  // En mode ajout initial, afficher le spinner jusqu'à ce que le formulaire/selecteur soit prêt
  const showAddModeSpinner = initialModeAdd && !showForm && !showDefinitionSelector;

  if (loading || showAddModeSpinner) {
    return (
      <div class="flex justify-center items-center min-h-[400px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div class="space-y-6">
      {error && (
        <div class="ds-status-badge ds-status-badge--error w-full max-w-xl" role="alert">
          {error}
        </div>
      )}
      {successMessage && (
        <div class="ds-status-badge ds-status-badge--success w-fit" role="status">
          {successMessage}
        </div>
      )}

      {!showForm && !showDefinitionSelector ? (
        <>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger">
            {/* Carte Ajouter un indexer */}
            <button
              type="button"
              onClick={handleAddIndexer}
              disabled={loadingDefinitions}
              class="text-left block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 focus-visible:overflow-visible"
              data-settings-card
            >
              <DsCard variant="elevated" className="h-full">
                <DsCardSection className="flex flex-col h-full min-h-[120px]">
                  <div class="flex items-start justify-between gap-3">
                    <span
                      class="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                      style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                      aria-hidden
                    >
                      <Plus class="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                    </span>
                    <ChevronRight class="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                  </div>
                  <h3 class="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                    {t('indexersManager.addIndexer')}
                  </h3>
                  <span class="ds-text-tertiary text-sm mt-3">{t('settingsMenu.indexersConfigured.description')}</span>
                  <span class="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                    {t('common.open')}
                  </span>
                </DsCardSection>
              </DsCard>
            </button>

            {/* Cartes indexers : compactes, clic = ouvrir la modal de configuration */}
            {indexers.map((indexer) => {
              const ratio = undefined;
              const truncatedUrl = indexer.baseUrl.length > 45 ? indexer.baseUrl.slice(0, 42) + '…' : indexer.baseUrl;
              return (
                <button
                  key={indexer.id}
                  type="button"
                  onClick={() => setDetailModalIndexerId(indexer.id)}
                  class="text-left block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
                  data-settings-card
                >
                  <DsCard variant="elevated" className="h-full">
                    <DsCardSection className="flex flex-col h-full min-h-[120px]">
                      <div class="flex items-start justify-between gap-3">
                        <span
                          class="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                          style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                          aria-hidden
                        >
                          <Search class="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                        </span>
                        <ChevronRight class="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                      </div>
                      <h3 class="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                        {indexer.name}
                      </h3>
                      <code class="text-xs ds-text-tertiary mt-1 truncate block" title={indexer.baseUrl}>
                        {truncatedUrl}
                      </code>
                      <div class="flex flex-wrap gap-2 mt-3">
                        {indexer.isEnabled ? (
                          <span class="px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 border border-green-600 text-green-300">
                            {t('indexerCard.active')}
                          </span>
                        ) : (
                          <span class="px-2 py-0.5 rounded text-xs font-medium bg-gray-700 border border-gray-600 text-gray-300">
                            {t('indexerCard.inactive')}
                          </span>
                        )}
                        {indexer.isDefault && (
                          <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/30 border border-blue-600 text-blue-300">
                            {t('indexerCard.default')}
                          </span>
                        )}
                        <span class="px-2 py-0.5 rounded text-xs ds-text-tertiary">
                          {t('indexerCard.priority')}: {indexer.priority}
                        </span>
                        <span class="px-2 py-0.5 rounded text-xs ds-text-tertiary">
                          {t('indexerCard.ratio')}: {ratio != null && Number.isFinite(ratio) ? ratio.toFixed(2) : t('indexerCard.ratioNotAvailable')}
                        </span>
                      </div>
                      <span class="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                        {t('common.open')}
                      </span>
                    </DsCardSection>
                  </DsCard>
                </button>
              );
            })}
            {indexers.length === 0 && (
              <div class="ds-card rounded-[var(--ds-radius-lg)] p-6 flex flex-col items-center justify-center min-h-[120px] text-center">
                <p class="ds-text-secondary text-sm">{t('indexersManager.noIndexers')}</p>
                <p class="ds-text-tertiary text-xs mt-2">{t('indexersManager.addIndexer')}</p>
              </div>
            )}
          </div>

          {/* Modal configuration / détail d'un indexer */}
          {detailModalIndexerId && (() => {
            const indexer = indexers.find((i) => i.id === detailModalIndexerId);
            if (!indexer) return null;
            return (
              <Modal
                isOpen={true}
                onClose={() => setDetailModalIndexerId(null)}
                title={indexer.name}
                size="xl"
              >
                <IndexerDetailPanel
                  indexer={indexer}
                  onBack={() => setDetailModalIndexerId(null)}
                  onEditClose={() => {
                    setDetailModalIndexerId(null);
                    loadIndexers();
                  }}
                  onDeleted={() => {
                    setDetailModalIndexerId(null);
                    loadIndexers();
                  }}
                />
              </Modal>
            );
          })()}
        </>
      ) : showDefinitionSelector ? (
        <div class="space-y-4">
          <div class="mb-6">
            <h2 class="ds-title-section text-[var(--ds-text-primary)]">{t('indexersManager.selectIndexer')}</h2>
          </div>

          {definitions.length > 0 && (
            <div class="mb-4 p-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
              <label class="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary mt-0.5"
                  checked={useJackett}
                  onChange={(e) => toggleUseJackett((e.target as HTMLInputElement).checked)}
                  aria-describedby="use-jackett-desc"
                />
                <div>
                  <span class="font-medium text-white">{t('indexersManager.useJackettLabel')}</span>
                  <p id="use-jackett-desc" class="text-sm text-gray-400 mt-1">{t('indexersManager.useJackettDescription')}</p>
                </div>
              </label>
            </div>
          )}

          {definitions.length > 0 && (
            <div class="flex flex-col sm:flex-row gap-3 flex-wrap mb-4">
              <input
                type="search"
                class="input input-bordered flex-1 min-w-[200px] bg-gray-800 border-gray-700 text-white"
                placeholder={t('indexersManager.searchPlaceholder')}
                value={definitionSearchQuery}
                onInput={(e) => setDefinitionSearchQuery((e.target as HTMLInputElement).value)}
              />
              <select
                class="select select-bordered bg-gray-800 border-gray-700 text-white"
                value={definitionFilterLanguage}
                onChange={(e) => setDefinitionFilterLanguage((e.target as HTMLSelectElement).value)}
                aria-label={t('indexersManager.filterByLanguage')}
              >
                <option value="">{t('indexersManager.filterAll')}</option>
                {uniqueLanguages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <select
                class="select select-bordered bg-gray-800 border-gray-700 text-white"
                value={definitionFilterCountry}
                onChange={(e) => setDefinitionFilterCountry((e.target as HTMLSelectElement).value)}
                aria-label={t('indexersManager.filterByCountry')}
              >
                <option value="">{t('indexersManager.filterAll')}</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          
          {definitions.length === 0 ? (
            <div class="text-center py-12">
              <p class="text-gray-400">{t('indexersManager.noDefinitions')}</p>
            </div>
          ) : displayedDefinitions.length === 0 ? (
            <div class="text-center py-12">
              <p class="text-gray-400">{t('indexersManager.noResultsForSearch')}</p>
            </div>
          ) : (
            <div class="space-y-3">
              {displayedDefinitions.map((def) => (
                <div
                  key={def.id}
                  class="glass-panel rounded-lg p-4 border border-white/10 hover:border-primary/50 cursor-pointer transition-all"
                  onClick={() => handleSelectDefinition(def)}
                >
                  <div class="flex justify-between items-start">
                    <div class="flex-1">
                      <h3 class="text-lg font-semibold text-white mb-1">{def.name}</h3>
                      {def.description && (
                        <p class="text-sm text-gray-400 mb-2">{def.description}</p>
                      )}
                      <div class="flex gap-2 flex-wrap">
                        <span class="badge badge-outline">{def.protocol}</span>
                        {def.language && (
                          <span class="badge badge-ghost">{def.language}</span>
                        )}
                        {def.country && (
                          <span class="badge badge-ghost">{def.country}</span>
                        )}
                        {def.requiresApiKey && (
                          <span class="badge badge-warning">{t('indexersManager.apiKeyRequired')}</span>
                        )}
                        {def.requiresAuth && (
                          <span class="badge badge-info">{t('indexersManager.authRequired')}</span>
                        )}
                        {def.version && (
                          <span class="badge badge-ghost">v{def.version}</span>
                        )}
                      </div>
                    </div>
                    <button class="btn btn-primary btn-sm">
                      {t('indexersManager.select')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} class="space-y-4">
          {(() => {
            const effectiveDef = selectedDefinition || (editingIndexer?.indexerTypeId && definitions.find((d) => d.id === editingIndexer?.indexerTypeId)) || null;
            const uiFields = Array.isArray(effectiveDef?.ui?.fields) ? effectiveDef!.ui!.fields : [];
            const fieldLabel = (field: { name?: string; label?: string }) => {
              if (field.label) return field.label;
              const key = `indexersManager.form.${field.name}` as keyof typeof t;
              return t(key as any) || field.name || '';
            };
            return (
              <>
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-white">
              {editingIndexer ? t('indexersManager.editIndexer') : t('indexersManager.addIndexer')}
            </h2>
            {(selectedDefinition || effectiveDef) && (
              <div class="badge badge-primary">
                {t('indexersManager.basedOn')}: {(selectedDefinition || effectiveDef)!.name}
              </div>
            )}
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">{t('indexersManager.form.name')}</span>
            </label>
            <input
              type="text"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.name}
              onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
              required
            />
          </div>

          {uiFields.map((field: { name?: string; label?: string; type?: string; required?: boolean; placeholder?: string }) => {
            const name = field?.name;
            if (!name) return null;
            if (name === 'baseUrl') {
              return (
                <div key={name} class="form-control">
                  <label class="label">
                    <span class="label-text text-white">{fieldLabel(field)}</span>
                  </label>
                  <input
                    type="url"
                    class="input input-bordered bg-gray-800 border-gray-700 text-white"
                    value={formData.baseUrl}
                    onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })}
                    required
                    placeholder={field.placeholder}
                  />
                </div>
              );
            }
            if (name === 'apiKey') {
              return (
                <div key={name} class="form-control">
                  <label class="label">
                    <span class="label-text text-white">
                      {fieldLabel(field)}
                      {effectiveDef?.requiresApiKey && <span class="text-red-400 ml-1">*</span>}
                    </span>
                  </label>
                  <input
                    type="password"
                    class="input input-bordered bg-gray-800 border-gray-700 text-white"
                    value={formData.apiKey}
                    onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })}
                    required={effectiveDef?.requiresApiKey ?? false}
                    placeholder={field.placeholder || (effectiveDef?.requiresApiKey ? t('indexersManager.required') : t('indexersManager.optional'))}
                  />
                </div>
              );
            }
            const isPassword = name !== 'cookie' && (field.type || '').toLowerCase() === 'password';
            return (
              <div key={name} class="form-control">
                <label class="label">
                  <span class="label-text text-white">
                    {fieldLabel(field)}
                    {field.required && <span class="text-red-400 ml-1">*</span>}
                  </span>
                  {name === 'cookie' && (
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost text-primary-400 hover:text-primary-300 border border-primary-500/50"
                      onClick={() => setCookieWizardOpen(true)}
                    >
                      {t('indexersManager.form.cookieWizardOpen')}
                    </button>
                  )}
                </label>
                <input
                  type={isPassword ? 'password' : 'text'}
                  class="input input-bordered bg-gray-800 border-gray-700 text-white"
                  value={formData.extraConfig?.[name] ?? ''}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    const final = name === 'cookie' ? normalizeCookieInput(v) : v;
                    setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), [name]: final } });
                  }}
                  required={!!field.required}
                  placeholder={field.placeholder || (name === 'cookie' ? t('indexersManager.form.cookiePlaceholder') : undefined)}
                />
                {name === 'cookie' && (
                  <>
                    <div
                      class="mt-2 rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/50 p-4 text-center text-sm text-gray-400 hover:border-primary-500/50 hover:bg-gray-800 transition-colors"
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-primary-500', 'bg-primary-500/10'); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary-500', 'bg-primary-500/10'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove('border-primary-500', 'bg-primary-500/10');
                        const text = e.dataTransfer?.getData?.('text/plain')?.trim();
                        if (text) setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text) } });
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData?.getData?.('text/plain')?.trim();
                        if (text) { e.preventDefault(); setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text) } }); }
                      }}
                      tabIndex={0}
                      role="button"
                    >
                      {t('indexersManager.form.cookieDropZone')}
                    </div>
                    <button
                      type="button"
                      class="mt-2 btn btn-sm btn-ghost text-primary-400 border border-primary-500/50"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text?.trim()) setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text.trim()) } });
                        } catch (_) {}
                      }}
                    >
                      {t('indexersManager.form.cookiePasteButton')}
                    </button>
                    <p class="text-sm text-gray-400 mt-1 ml-1">{t('indexersManager.form.cookieHelp')}</p>
                  </>
                )}
              </div>
            );
          })}

          {uiFields.length === 0 && (
            <>
          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">{t('indexersManager.form.baseUrl')}</span>
            </label>
            <input
              type="url"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.baseUrl}
              onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })}
              required
            />
          </div>
          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">{t('indexersManager.form.apiKey')}</span>
            </label>
            <input
              type="password"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.apiKey}
              onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })}
              placeholder={t('indexersManager.optional')}
            />
          </div>
            </>
          )}
              </>
            );
          })()}

          {(selectedDefinition?.protocol === 'torznab' || editingIndexer?.jackettIndexerName) && (
            <div class="form-control">
              <label class="label">
                <span class="label-text text-white">{t('indexersManager.form.jackettName')}</span>
              </label>
              <input
                type="text"
                class="input input-bordered bg-gray-800 border-gray-700 text-white"
                value={formData.jackettIndexerName}
                onInput={(e) => setFormData({ ...formData, jackettIndexerName: (e.target as HTMLInputElement).value })}
              />
            </div>
          )}

          {(selectedDefinition || (editingIndexer?.indexerTypeId && definitions.find((d) => d.id === editingIndexer?.indexerTypeId)) || null)?.protocol === 'custom' && (
            <div class="form-control">
              <label class="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  checked={formData.useFlareSolverr ?? false}
                  onChange={(e) => setFormData({ ...formData, useFlareSolverr: (e.target as HTMLInputElement).checked })}
                />
                <span class="label-text text-white">{t('indexersManager.form.useFlareSolverr')}</span>
              </label>
              <p class="text-sm text-gray-400 mt-1 ml-6">{t('indexersManager.form.useFlareSolverrHelp')}</p>
            </div>
          )}

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text text-white">{t('indexersManager.form.enable')}</span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: (e.target as HTMLInputElement).checked })}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text text-white">{t('indexersManager.form.default')}</span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: (e.target as HTMLInputElement).checked })}
              />
            </label>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-white">{t('indexersManager.form.priority')}</span>
            </label>
            <input
              type="number"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.priority}
              onInput={(e) => setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value) || 0 })}
              min="0"
            />
          </div>

          <div class="flex gap-4">
            <button type="submit" class="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  {t('indexersManager.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </form>
      )}

      {/* Modale de test d'indexer : retour visuel en cours + résultats au fur et à mesure */}
      <CookieWizardModal
        isOpen={cookieWizardOpen}
        onClose={() => setCookieWizardOpen(false)}
      />
      <IndexerTestModal
        isOpen={testModalOpen}
        onClose={closeTestModal}
        indexerName={testModalIndexer?.name ?? ''}
        progressLog={testProgressLog}
        isRunning={testRunning}
        finalResult={testFinalResult}
        errorMessage={testErrorMessage}
      />
    </div>
  );
}
