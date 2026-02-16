import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus, Indexer, IndexerFormData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n';
import { getIndexerDefinitions, type IndexerDefinition } from '../../../lib/api/popcorn-web';
import { TokenManager } from '../../../lib/client/storage';
import {
  filterAndSortIndexerDefinitions,
  getUniqueLanguagesAndCountries,
} from '../../../lib/utils/indexer-definitions-filter';
import { Info } from 'lucide-preact';

const STORAGE_KEY_USE_JACKETT = 'popcorn-indexer-use-jackett';
function getStoredUseJackett(): boolean {
  try { return localStorage.getItem(STORAGE_KEY_USE_JACKETT) === 'true'; } catch { return false; }
}
import { IndexerDefinitionDocsModal } from '../../indexers/IndexerDefinitionDocsModal';
import { CookieWizardModal } from '../../settings/CookieWizardModal';
import { normalizeCookieInput } from '../../../lib/utils/cookie-format';

interface IndexersStepProps {
  setupStatus: SetupStatus | null;
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
  onStatusChange: () => void;
}

export function IndexersStep({
  setupStatus,
  focusedButtonIndex,
  buttonRefs,
  onPrevious,
  onNext,
  onStatusChange,
}: IndexersStepProps) {
  const { t, language: userLocale } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<IndexerDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [showDefinitionSelector, setShowDefinitionSelector] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<IndexerDefinition | null>(null);
  const [hasCloudToken, setHasCloudToken] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showCookieWizard, setShowCookieWizard] = useState(false);
  const [definitionSearchQuery, setDefinitionSearchQuery] = useState('');
  const [definitionFilterLanguage, setDefinitionFilterLanguage] = useState('');
  const [definitionFilterCountry, setDefinitionFilterCountry] = useState('');
  const [useJackett, setUseJackett] = useState(false);

  useEffect(() => {
    setHasCloudToken(TokenManager.getCloudAccessToken() !== null);
  }, []);

  useEffect(() => {
    setUseJackett(getStoredUseJackett());
  }, []);

  useEffect(() => {
    loadIndexers();
  }, []);

  // La config peut être importée en arrière-plan depuis AuthStep.
  // On re-tente quelques fois si la liste est vide (évite l'impression "rien ne se passe").
  useEffect(() => {
    if (loading) return;
    if (indexers.length > 0) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15; // ~30s (15 * 2s)

    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await serverApi.getIndexers();
        if (res.success && Array.isArray(res.data)) {
          const newIndexers = res.data;
          if (newIndexers.length > 0) {
            setIndexers(newIndexers);
            onStatusChange();
            clearInterval(interval);
          }
        }
      } catch {
        // ignore (on retentera)
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loading, indexers.length]);

  const loadIndexers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getIndexers();
      if (response.success && response.data) {
        setIndexers(response.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des indexers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIndexer = async () => {
    setLoadingDefinitions(true);
    setError(null);
    try {
      const defs = await getIndexerDefinitions();
      if (defs && defs.length > 0) {
        setDefinitions(defs);
        setShowDefinitionSelector(true);
      } else {
        setShowForm(true);
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
      }
    } catch (err) {
      console.warn('Erreur lors du chargement des définitions d\'indexers:', err);
      setShowForm(true);
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
    try { localStorage.setItem(STORAGE_KEY_USE_JACKETT, String(value)); } catch {}
  };

  const handleSelectDefinition = (definition: IndexerDefinition) => {
    setSelectedDefinition(definition);
    let baseUrl = '';
    if (definition.searchEndpoint) {
      try {
        const endpoint = definition.searchEndpoint;
        if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
          try {
            const url = new URL(endpoint);
            const pathParts = url.pathname.split('/').filter((p) => p && p !== '{indexer}');
            const basePath = pathParts.slice(0, -2).join('/');
            baseUrl = `${url.protocol}//${url.host}${basePath ? '/' + basePath : ''}`;
          } catch {
            baseUrl = '';
          }
        }
      } catch {
        baseUrl = '';
      }
    }
    const uiFields = Array.isArray(definition.ui?.fields) ? definition.ui!.fields : [];
    let defaultBaseUrl = baseUrl;
    let defaultApiKey = '';
    const extraConfig: Record<string, string> = {};
    for (const field of uiFields) {
      const name = field?.name;
      const val = field?.default ?? '';
      if (name === 'baseUrl') defaultBaseUrl = val || defaultBaseUrl;
      else if (name === 'apiKey') defaultApiKey = val;
      else if (name) extraConfig[name] = typeof val === 'string' ? val : '';
    }
    const jackettIndexerName = definition.protocol === 'torznab' ? definition.name : '';
    setFormData({
      name: definition.name,
      baseUrl: defaultBaseUrl,
      apiKey: defaultApiKey,
      jackettIndexerName,
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

  const handleEdit = (indexer: Indexer) => {
    setEditingIndexer(indexer);
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
    setFormData({
      name: indexer.name,
      baseUrl: indexer.baseUrl,
      apiKey: indexer.apiKey || '',
      jackettIndexerName: indexer.jackettIndexerName || '',
      isEnabled: indexer.isEnabled,
      isDefault: indexer.isDefault,
      priority: indexer.priority || 0,
      indexerTypeId: indexer.indexerTypeId ?? null,
      extraConfig,
      useFlareSolverr,
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet indexer ?')) {
      return;
    }

    setDeleting(id);
    setError(null);

    try {
      const response = await serverApi.deleteIndexer(id);
      if (response.success) {
        await loadIndexers();
        onStatusChange();
      } else {
        setError(response.message || 'Erreur lors de la suppression de l\'indexer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDeleting(null);
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
        // Si c'est une création (pas une édition), synchroniser les catégories avec le backend Rust
        if (!editingIndexer && response.data) {
          const indexerId = response.data.id;
          try {
            // Activer par défaut les catégories "films" et "séries" dans le backend Rust
            const defaultCategories = ['films', 'series'];
            await serverApi.updateIndexerCategories(indexerId, defaultCategories);
            console.log('[WIZARD] ✅ Catégories par défaut activées pour l\'indexer:', indexerId);
            } catch (catError) {
            console.warn('[WIZARD] ⚠️ Erreur lors de l\'activation des catégories par défaut:', catError);
            // Ne pas bloquer si la synchronisation des catégories échoue
          }
        } else if (editingIndexer && response.data) {
          }
        
        setShowForm(false);
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
        onStatusChange();
      } else {
        setError(response.message || `Erreur lors de la ${editingIndexer ? 'mise à jour' : 'création'} de l'indexer`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
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
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const hasIndexers = indexers.length > 0;

  return (
    <div className="space-y-6">
      <CookieWizardModal isOpen={showCookieWizard} onClose={() => setShowCookieWizard(false)} />
      <IndexerDefinitionDocsModal isOpen={showDocs} onClose={() => setShowDocs(false)} />
      <h3 className="text-2xl font-bold text-white">Configuration des indexers</h3>
      
      {hasIndexers ? (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>Au moins un indexer est configuré</span>
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300">
          <span>
            Aucun indexer configuré. Veuillez en ajouter au moins un.
            {' '}
            <span className="text-yellow-200/80">(si tu viens de te connecter, l'import automatique peut prendre quelques secondes)</span>
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {showDefinitionSelector ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">{t('setupIndexersStep.selectDefinitionTitle')}</h3>
              <button
                type="button"
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white/90 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDocs(true);
                }}
                aria-label={t('indexerDefinitionDocs.open')}
                title={t('indexerDefinitionDocs.open')}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg"
              onClick={() => {
                setShowDefinitionSelector(false);
                setDefinitions([]);
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
          <p className="text-gray-300 text-sm">
            {t('setupIndexersStep.manualHint')}
          </p>
          {definitions.length > 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
                  checked={useJackett}
                  onChange={(e) => toggleUseJackett((e.target as HTMLInputElement).checked)}
                  aria-describedby="setup-use-jackett-desc"
                />
                <div>
                  <span className="font-medium text-white">{t('indexersManager.useJackettLabel')}</span>
                  <p id="setup-use-jackett-desc" className="text-sm text-gray-400 mt-1">{t('indexersManager.useJackettDescription')}</p>
                </div>
              </label>
            </div>
          )}
          {definitions.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <input
                type="search"
                className="flex-1 min-w-[200px] px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                placeholder={t('setupIndexersStep.searchPlaceholder')}
                value={definitionSearchQuery}
                onInput={(e) => setDefinitionSearchQuery((e.target as HTMLInputElement).value)}
              />
              <select
                className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={definitionFilterLanguage}
                onChange={(e) => setDefinitionFilterLanguage((e.target as HTMLSelectElement).value)}
                aria-label={t('setupIndexersStep.filterByLanguage')}
              >
                <option value="">{t('setupIndexersStep.filterAll')}</option>
                {uniqueLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <select
                className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={definitionFilterCountry}
                onChange={(e) => setDefinitionFilterCountry((e.target as HTMLSelectElement).value)}
                aria-label={t('setupIndexersStep.filterByCountry')}
              >
                <option value="">{t('setupIndexersStep.filterAll')}</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          {definitions.length === 0 ? (
            <div className="space-y-3">
              <p className="text-gray-400">{t('setupIndexersStep.noDefinitions')}</p>
              <button
                type="button"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg"
                onClick={() => {
                  setShowDefinitionSelector(false);
                  setSelectedDefinition(null);
                  setShowForm(true);
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
                }}
              >
                {t('setupIndexersStep.configureManually')}
              </button>
            </div>
          ) : displayedDefinitions.length === 0 ? (
            <div className="space-y-3">
              <p className="text-gray-400">{t('setupIndexersStep.noResultsForSearch')}</p>
              <p className="text-sm text-gray-500">
                {t('setupIndexersStep.manualHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedDefinitions.map((def) => (
                <div
                  key={def.id}
                  role="button"
                  tabIndex={0}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-primary-500 cursor-pointer transition-colors"
                  onClick={() => handleSelectDefinition(def)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectDefinition(def)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-white mb-1">{def.name}</h4>
                      {def.description && (
                        <p className="text-sm text-gray-400 mb-2">{def.description}</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{def.protocol}</span>
                        {def.language && (
                          <span className="px-2 py-0.5 bg-gray-700/80 text-gray-400 text-xs rounded">{def.language}</span>
                        )}
                        {def.country && (
                          <span className="px-2 py-0.5 bg-gray-700/80 text-gray-400 text-xs rounded">{def.country}</span>
                        )}
                        {def.requiresApiKey && (
                          <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 text-xs rounded">{t('setupIndexersStep.apiKeyRequired')}</span>
                        )}
                        {def.requiresAuth && (
                          <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded">{t('indexersManager.authRequired')}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-primary-400 text-sm font-medium">{t('setupIndexersStep.select')}</span>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg"
                  onClick={() => {
                    setShowDefinitionSelector(false);
                    setSelectedDefinition(null);
                    setShowForm(true);
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
                  }}
                >
                  {t('setupIndexersStep.configureManually')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : !showForm ? (
        <>
          <div className="space-y-4">
            {indexers.length > 0 ? (
              <div className="space-y-2">
                {indexers.map((indexer) => (
                  <div key={indexer.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-white">{indexer.name}</h4>
                          {indexer.isDefault && (
                            <span className="px-2 py-1 bg-primary-600 text-white text-xs font-semibold rounded">Par défaut</span>
                          )}
                          {!indexer.isEnabled && (
                            <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs font-semibold rounded">Désactivé</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mb-1">{indexer.baseUrl}</p>
                        {indexer.jackettIndexerName && (
                          <p className="text-xs text-gray-500">Indexer: {indexer.jackettIndexerName}</p>
                        )}
                        <p className="text-xs text-gray-500">Priorité: {indexer.priority}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button
                          className="w-full sm:w-auto px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                          onClick={() => handleEdit(indexer)}
                        >
                          Éditer
                        </button>
                        <button
                          className="w-full sm:w-auto px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => handleDelete(indexer.id)}
                          disabled={deleting === indexer.id}
                        >
                          {deleting === indexer.id ? (
                            <span className="loading loading-spinner loading-sm"></span>
                          ) : (
                            'Supprimer'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucun indexer configuré</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              onClick={handleAddIndexer}
              disabled={loadingDefinitions}
            >
              {loadingDefinitions ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  {t('common.loading')}
                </>
              ) : (
                t('setupIndexersStep.addIndexer')
              )}
            </button>
            <button
              type="button"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-center flex items-center justify-center gap-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDocs(true);
              }}
              title={t('indexerDefinitionDocs.open')}
            >
              <Info className="w-4 h-4" />
              <span>{t('indexerDefinitionDocs.open')}</span>
            </button>
            {hasCloudToken && (
              <a
                href="/settings/indexer-definitions"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-center"
              >
                {t('setupIndexersStep.addDefinition')}
              </a>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingIndexer && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-blue-300">
              <span>Édition de l'indexer: {editingIndexer.name}</span>
            </div>
          )}
          {selectedDefinition && !editingIndexer && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-gray-300 text-sm">
              {t('setupIndexersStep.basedOnDefinition')}{' '}
              <strong className="text-white">{selectedDefinition.name}</strong>
            </div>
          )}

          {(() => {
            const effectiveDef = selectedDefinition || (editingIndexer?.indexerTypeId && definitions.find((d) => d.id === editingIndexer?.indexerTypeId)) || null;
            const uiFields = Array.isArray(effectiveDef?.ui?.fields) ? effectiveDef!.ui!.fields : [];
            const fieldLabel = (field: { name?: string; label?: string }) => field?.label || (field?.name ? t(`indexersManager.form.${field.name}` as any) : '') || field?.name || '';
            const inputClass = 'w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent';
            return (
              <>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">{t('indexersManager.form.name')}</label>
            <input
              type="text"
              className={inputClass}
              value={formData.name}
              onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
              required
            />
          </div>
          {uiFields.length > 0 ? uiFields.map((field: { name?: string; label?: string; type?: string; required?: boolean; placeholder?: string }) => {
            const name = field?.name;
            if (!name) return null;
            if (name === 'baseUrl') {
              return (
                <div key={name} className="space-y-2">
                  <label className="block text-sm font-semibold text-white">{fieldLabel(field)}</label>
                  <input type="url" className={inputClass} value={formData.baseUrl} onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })} required placeholder={field.placeholder} />
                </div>
              );
            }
            if (name === 'apiKey') {
              return (
                <div key={name} className="space-y-2">
                  <label className="block text-sm font-semibold text-white">{fieldLabel(field)}{effectiveDef?.requiresApiKey && <span className="text-red-400 ml-1">*</span>}</label>
                  <input type="password" className={inputClass} value={formData.apiKey} onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })} required={effectiveDef?.requiresApiKey ?? false} placeholder={field.placeholder} />
                </div>
              );
            }
            const isPassword = name !== 'cookie' && (field.type || '').toLowerCase() === 'password';
            return (
              <div key={name} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-sm font-semibold text-white">{fieldLabel(field)}{field.required && <span className="text-red-400 ml-1">*</span>}</label>
                  {name === 'cookie' && (
                    <button
                      type="button"
                      className="text-sm font-medium px-3 py-1.5 rounded border border-primary-500/50 text-primary-400 hover:text-primary-300 hover:bg-primary-500/10"
                      onClick={() => setShowCookieWizard(true)}
                    >
                      {t('indexersManager.form.cookieWizardOpen')}
                    </button>
                  )}
                </div>
                <input
                  type={isPassword ? 'password' : 'text'}
                  className={inputClass}
                  value={formData.extraConfig?.[name] ?? ''}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    const final = name === 'cookie' ? normalizeCookieInput(v) : v;
                    setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), [name]: final } });
                  }}
                  required={!!field.required}
                  placeholder={field.placeholder || (name === 'cookie' ? t('indexersManager.form.cookiePlaceholder') : '')}
                />
                {name === 'cookie' && (
                  <>
                    <div
                      className="mt-2 rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/50 p-4 text-center text-sm text-gray-400 hover:border-primary-500/50 hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      tabIndex={0}
                      role="button"
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).classList.add('!border-primary-500', '!bg-primary-500/10'); }}
                      onDragLeave={(e) => { (e.currentTarget as HTMLElement).classList.remove('!border-primary-500', '!bg-primary-500/10'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const el = e.currentTarget as HTMLElement;
                        el.classList.remove('!border-primary-500', '!bg-primary-500/10');
                        const text = e.dataTransfer?.getData?.('text/plain')?.trim();
                        if (text) setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text) } });
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData?.getData?.('text/plain')?.trim();
                        if (text) { e.preventDefault(); setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text) } }); }
                      }}
                    >
                      {t('indexersManager.form.cookieDropZone')}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-sm px-3 py-1.5 rounded border border-primary-500/50 text-primary-400 hover:bg-primary-500/10"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text?.trim()) setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text.trim()) } });
                        } catch (_) {}
                      }}
                    >
                      {t('indexersManager.form.cookiePasteButton')}
                    </button>
                    <p className="text-sm text-gray-400">{t('indexersManager.form.cookieHelp')}</p>
                  </>
                )}
              </div>
            );
          }) : (
            <>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">{t('indexersManager.form.baseUrl')}</label>
            <input type="url" className={inputClass} value={formData.baseUrl} onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })} required />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">{t('indexersManager.form.apiKey')}</label>
            <input type="password" className={inputClass} value={formData.apiKey} onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })} placeholder={t('indexersManager.optional')} />
          </div>
            </>
          )}
          {(effectiveDef?.protocol === 'torznab' || formData.jackettIndexerName !== undefined) && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">{t('indexersManager.form.jackettName')}</label>
            <input type="text" className={inputClass} value={formData.jackettIndexerName} onInput={(e) => setFormData({ ...formData, jackettIndexerName: (e.target as HTMLInputElement).value })} />
          </div>
          )}
          {effectiveDef?.protocol === 'custom' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-primary-600 bg-gray-900 border-gray-700 rounded focus:ring-primary-600"
                  checked={formData.useFlareSolverr ?? false}
                  onChange={(e) => setFormData({ ...formData, useFlareSolverr: (e.target as HTMLInputElement).checked })}
                />
                <span className="text-white">{t('indexersManager.form.useFlareSolverr')}</span>
              </label>
              <p className="text-sm text-gray-400 ml-6">{t('indexersManager.form.useFlareSolverrHelp')}</p>
            </div>
          )}
              </>
            );
          })()}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">Priorité</label>
            <input
              type="number"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              value={formData.priority}
              onInput={(e) => setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value) || 0 })}
              min="0"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary-600 bg-gray-900 border-gray-700 rounded focus:ring-primary-600"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: (e.target as HTMLInputElement).checked })}
              />
              <span className="text-white">Activer</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary-600 bg-gray-900 border-gray-700 rounded focus:ring-primary-600"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: (e.target as HTMLInputElement).checked })}
              />
              <span className="text-white">Par défaut</span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              className="w-full sm:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              onClick={handleCancel}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Sauvegarde...
                </>
              ) : (
                editingIndexer ? 'Mettre à jour' : 'Créer'
              )}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-4 mt-8">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onNext}
          disabled={!hasIndexers}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}