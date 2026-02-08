import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer, IndexerFormData } from '../../lib/client/types';
import { IndexerCard } from './IndexerCard';
import { IndexerTestModal, formatProgressEvent } from './IndexerTestModal';
import { getIndexerDefinitions, type IndexerDefinition } from '../../lib/api/popcorn-web';
import {
  filterAndSortIndexerDefinitions,
  getUniqueLanguagesAndCountries,
} from '../../lib/utils/indexer-definitions-filter';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';

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
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testProgress, setTestProgress] = useState<Record<string, { index: number; total: number; lastQuery?: string; lastCount?: number; lastSuccess?: boolean }>>({});
  const [testModalOpen, setTestModalOpen] = useState(false);
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

  useEffect(() => {
    loadIndexers();
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

    try {
      let response;
      if (editingIndexer) {
        response = await serverApi.updateIndexer(editingIndexer.id, formData);
      } else {
        response = await serverApi.createIndexer(formData);
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
    // Charger les définitions d'indexers depuis popcorn-web
    setLoadingDefinitions(true);
    setError(null);
    
    try {
      const defs = await getIndexerDefinitions();
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
      }),
    [
      definitions,
      definitionSearchQuery,
      definitionFilterLanguage,
      definitionFilterCountry,
      userLocale,
    ]
  );

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
    
    // Déterminer le nom Jackett si c'est un protocole torznab
    let jackettIndexerName = '';
    if (definition.protocol === 'torznab') {
      // Pour torznab, le nom de l'indexer Jackett est souvent le même que le nom de la définition
      jackettIndexerName = definition.name;
    }
    
    setFormData({
      name: definition.name,
      baseUrl: baseUrl,
      apiKey: '',
      jackettIndexerName: jackettIndexerName,
      isEnabled: true,
      isDefault: false,
      priority: 0,
      indexerTypeId: definition.id, // Utiliser l'ID de la définition comme indexerTypeId
    });
    
    setShowDefinitionSelector(false);
    setShowForm(true);
  };

  const handleEdit = (indexer: Indexer) => {
    setEditingIndexer(indexer);
    setSelectedDefinition(null);
    setFormData({
      name: indexer.name,
      baseUrl: indexer.baseUrl,
      apiKey: indexer.apiKey || '',
      jackettIndexerName: indexer.jackettIndexerName || '',
      isEnabled: indexer.isEnabled,
      isDefault: indexer.isDefault,
      priority: indexer.priority,
      indexerTypeId: indexer.indexerTypeId || null,
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
        <div class="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {!showForm && !showDefinitionSelector ? (
        <>
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-white">{t('indexersManager.title')}</h2>
            <button 
              class="btn btn-primary" 
              onClick={handleAddIndexer}
              disabled={loadingDefinitions}
            >
              {loadingDefinitions ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  {t('indexersManager.loading')}
                </>
              ) : (
                t('indexersManager.addIndexer')
              )}
            </button>
          </div>

          {indexers.length === 0 ? (
            <div class="text-center py-12">
              <p class="text-gray-400">{t('indexersManager.noIndexers')}</p>
            </div>
          ) : (
            <div class="space-y-4">
              {indexers.map((indexer) => (
                <IndexerCard
                  key={indexer.id}
                  name={indexer.name}
                  baseUrl={indexer.baseUrl}
                  isEnabled={indexer.isEnabled}
                  isDefault={indexer.isDefault}
                  priority={indexer.priority}
                  indexerId={indexer.id}
                  categoryMapping={{ films: {}, series: {}, autres: {} }} // Catégories standard disponibles
                  onEdit={() => handleEdit(indexer)}
                  onDelete={() => handleDelete(indexer.id)}
                  onTest={() => handleTest(indexer.id)}
                  isTesting={testing === indexer.id}
                  testProgress={testProgress[indexer.id]}
                  testResult={testResults[indexer.id]}
                />
              ))}
            </div>
          )}
        </>
      ) : showDefinitionSelector ? (
        <div class="space-y-4">
          <div class="mb-6">
            <h2 class="text-2xl font-bold text-white">{t('indexersManager.selectIndexer')}</h2>
          </div>

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
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-white">
              {editingIndexer ? t('indexersManager.editIndexer') : t('indexersManager.addIndexer')}
            </h2>
            {selectedDefinition && (
              <div class="badge badge-primary">
                {t('indexersManager.basedOn')}: {selectedDefinition.name}
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
              <span class="label-text text-white">
                {t('indexersManager.form.apiKey')}
                {selectedDefinition?.requiresApiKey && (
                  <span class="text-red-400 ml-1">*</span>
                )}
              </span>
            </label>
            <input
              type="text"
              class="input input-bordered bg-gray-800 border-gray-700 text-white"
              value={formData.apiKey}
              onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })}
              required={selectedDefinition?.requiresApiKey || false}
              placeholder={selectedDefinition?.requiresApiKey ? t('indexersManager.required') : t('indexersManager.optional')}
            />
          </div>

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
