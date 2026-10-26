import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus, Indexer, IndexerFormData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n';
import { getIndexerDefinitionsWithBackendFallback, type IndexerDefinition } from '../../../lib/api/popcorn-web';
import { TokenManager } from '../../../lib/client/storage';
import {
  filterAndSortIndexerDefinitions,
  getUniqueLanguagesAndCountries,
} from '../../../lib/utils/indexer-definitions-filter';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { Info } from 'lucide-preact';
import { StepHeader, StepLoading, Alert, Spinner, CheckButton, IconArrowLeft, IconArrowRight } from '../wizardUi';
import { getIndexersStepContinueAction } from '../indexersStepPolicy';

const STORAGE_KEY_USE_JACKETT = 'popcorn-indexer-use-jackett';
function getStoredUseJackett(): boolean {
  try { return localStorage.getItem(STORAGE_KEY_USE_JACKETT) === 'true'; } catch { return false; }
}
import { IndexerDefinitionDocsModal } from '../../indexers/IndexerDefinitionDocsModal';
import { CookieWizardModal } from '../../settings/CookieWizardModal';
import { normalizeCookieInput } from '../../../lib/utils/cookie-format';
import { useConfirmDialog } from '../../ui/useConfirmDialog';

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
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
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
      const backendUrl = serverApi.getServerUrl?.() ?? null;
      const defs = await getIndexerDefinitionsWithBackendFallback(backendUrl);
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
    if (!(await confirm({
      title: t('common.delete') || 'Supprimer',
      message: t('indexersManager.confirmDelete'),
      danger: true,
      confirmLabel: t('common.delete') || 'Supprimer',
    }))) {
      return;
    }

    setDeleting(id);
    setError(null);

    try {
      const response = await serverApi.deleteIndexer(id);
      if (response.success) {
        await loadIndexers();
        onStatusChange();
        // Sync incrémentale vers le cloud (non-bloquant)
        syncIndexersToCloud().catch(() => {});
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
        // Sync incrémentale vers le cloud (non-bloquant)
        syncIndexersToCloud().catch(() => {});
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

  const header = (
    <StepHeader
      kicker="Sources"
      title={t('setupIndexersStep.title')}
      lead={t('setupIndexersStep.leadOptional')}
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <StepLoading />
      </div>
    );
  }

  const hasIndexers = indexers.length > 0;
  // Étape facultative : sans indexer, on peut passer (bibliothèque locale seule).
  const continueAction = getIndexersStepContinueAction(indexers.length);

  const openManualForm = () => {
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
  };

  const required = <span class="wz-accent" style="margin-left:4px;">*</span>;

  return (
    <div class="ix-step">
      <style>{`
        .ix-filters { display: flex; flex-wrap: wrap; margin: 0 -6px; }
        .ix-filters > * { margin: 0 6px 12px; }
        .ix-filters > .ix-filters__search { flex: 1 1 240px; min-width: 0; }
        .ix-filters > select { flex: 0 1 180px; }
        @media (max-width: 639px) { .ix-filters > select { flex: 1 1 140px; } }
        .ix-def { display: flex; align-items: flex-start; width: 100%; text-align: left; }
        .ix-def .wz-option__end { margin-left: 16px; align-self: center; }
        .ix-def + .ix-def { margin-top: 10px; }
        .ix-tags { display: flex; flex-wrap: wrap; margin-top: 10px; }
        .ix-tags > .wz-badge { margin: 0 6px 6px 0; }
        .ix-item { display: flex; align-items: flex-start; padding: 18px 0; border-bottom: 1px solid var(--wz-line); }
        .ix-item:first-child { border-top: 1px solid var(--wz-line); }
        .ix-item__body { flex: 1; min-width: 0; }
        .ix-item__name { display: flex; flex-wrap: wrap; align-items: center; }
        .ix-item__name > .wz-badge { margin-left: 10px; }
        .ix-item__meta { margin-top: 6px; font-size: 0.78rem; color: var(--wz-ink-faint); font-family: var(--wz-mono); word-break: break-all; }
        .ix-item__actions { display: flex; flex-shrink: 0; margin-left: 16px; }
        .ix-item__actions > * + * { margin-left: 8px; }
        @media (max-width: 639px) {
          .ix-item { flex-direction: column; }
          .ix-item__actions { margin: 14px 0 0; width: 100%; }
          .ix-item__actions > .wz-btn { flex: 1; }
        }
        .ix-tools { display: flex; flex-wrap: wrap; align-items: center; margin-top: 24px; }
        .ix-tools > * { margin: 0 12px 12px 0; }
        @media (max-width: 639px) { .ix-tools { flex-direction: column; align-items: stretch; } .ix-tools > * { margin-right: 0; } }
        .ix-drop { margin-top: 10px; padding: 18px; border: 1px dashed var(--wz-line-strong); text-align: center; font-size: 0.82rem; color: var(--wz-ink-dim); cursor: pointer; transition: border-color 0.2s, background-color 0.2s; }
        .ix-drop:hover, .ix-drop.is-over { border-color: var(--wz-accent); background: var(--wz-accent-soft); }
        .ix-field-head { display: flex; align-items: center; justify-content: space-between; }
        .ix-field-head > .wz-label { margin-bottom: 0; }
        .ix-field-head + .wz-input { margin-top: 10px; }
        .ix-checks > .wz-check + .wz-check { margin-top: 10px; }
        .ix-form-actions { display: flex; justify-content: flex-end; margin-top: 28px; }
        .ix-form-actions > * + * { margin-left: 12px; }
        @media (max-width: 639px) { .ix-form-actions { flex-direction: column-reverse; } .ix-form-actions > * + * { margin-left: 0; margin-bottom: 10px; } }
      `}</style>
      {confirmDialog}
      <CookieWizardModal isOpen={showCookieWizard} onClose={() => setShowCookieWizard(false)} />
      <IndexerDefinitionDocsModal isOpen={showDocs} onClose={() => setShowDocs(false)} />
      {header}

      <div class="wz-stack">
      {hasIndexers ? (
        <Alert tone="success">{t('setupIndexersStep.configured')}</Alert>
      ) : (
        <Alert tone="info">
          {t('setupIndexersStep.optionalNotice')}
          {' '}
          <span class="wz-muted">{t('setupIndexersStep.importDelayHint')}</span>
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {showDefinitionSelector ? (
        <div>
          <div class="wz-between" style="margin-bottom:12px;">
            <div class="wz-inline">
              <h3 class="wz-h3" style="margin:0;">{t('setupIndexersStep.selectDefinitionTitle')}</h3>
              <button
                type="button"
                class="wz-icon-btn"
                data-focusable
                style="margin-left:10px;"
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
              class="wz-btn wz-btn--ghost wz-btn--sm"
              data-focusable
              onClick={() => {
                setShowDefinitionSelector(false);
                setDefinitions([]);
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
          <p class="wz-text-sm" style="margin:0 0 20px;">
            {t('setupIndexersStep.manualHint')}
          </p>
          {definitions.length > 0 && (
            <CheckButton
              checked={useJackett}
              onToggle={(next) => toggleUseJackett(next)}
              desc={t('indexersManager.useJackettDescription')}
              descId="setup-use-jackett-desc"
              style="margin-bottom:20px;"
            >
              <span style="color:var(--wz-ink);">{t('indexersManager.useJackettLabel')}</span>
            </CheckButton>
          )}
          {definitions.length > 0 && (
            <div class="ix-filters" style="margin-bottom:8px;">
              <input
                type="search"
                class="wz-input ix-filters__search"
                placeholder={t('setupIndexersStep.searchPlaceholder')}
                value={definitionSearchQuery}
                onInput={(e) => setDefinitionSearchQuery((e.target as HTMLInputElement).value)}
              />
              <select
                class="wz-input"
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
                class="wz-input"
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
            <div class="wz-panel wz-panel--quiet">
              <p class="wz-text" style="margin:0 0 16px;">{t('setupIndexersStep.noDefinitions')}</p>
              <button
                type="button"
                class="wz-btn wz-btn--ghost"
                data-focusable
                onClick={openManualForm}
              >
                {t('setupIndexersStep.configureManually')}
              </button>
            </div>
          ) : displayedDefinitions.length === 0 ? (
            <div class="wz-panel wz-panel--quiet">
              <p class="wz-text" style="margin:0 0 6px;">{t('setupIndexersStep.noResultsForSearch')}</p>
              <p class="wz-help" style="margin:0;">
                {t('setupIndexersStep.manualHint')}
              </p>
            </div>
          ) : (
            <div>
              {displayedDefinitions.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  data-focusable
                  class="wz-option ix-def"
                  onClick={() => handleSelectDefinition(def)}
                >
                  <span class="wz-option__body">
                    <span class="wz-option__title">{def.name}</span>
                    {def.description && (
                      <span class="wz-option__desc">{def.description}</span>
                    )}
                    <span class="ix-tags">
                      <span class="wz-badge">{def.protocol}</span>
                      {def.language && (
                        <span class="wz-badge">{def.language}</span>
                      )}
                      {def.country && (
                        <span class="wz-badge">{def.country}</span>
                      )}
                      {def.requiresApiKey && (
                        <span class="wz-badge wz-badge--warn">{t('setupIndexersStep.apiKeyRequired')}</span>
                      )}
                      {def.requiresAuth && (
                        <span class="wz-badge wz-badge--accent">{t('indexersManager.authRequired')}</span>
                      )}
                    </span>
                  </span>
                  <span class="wz-option__end wz-link wz-link--accent">{t('setupIndexersStep.select')}</span>
                </button>
              ))}
              <div style="margin-top:20px;">
                <button
                  type="button"
                  class="wz-btn wz-btn--ghost"
                  data-focusable
                  onClick={openManualForm}
                >
                  {t('setupIndexersStep.configureManually')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : !showForm ? (
        <div>
          {indexers.length > 0 ? (
            <div>
              <span class="wz-section-label">Indexers configurés</span>
              {indexers.map((indexer) => (
                <div key={indexer.id} class="ix-item">
                  <div class="ix-item__body">
                    <div class="ix-item__name">
                      <span class="wz-option__title">{indexer.name}</span>
                      {indexer.isDefault && (
                        <span class="wz-badge wz-badge--accent">Par défaut</span>
                      )}
                      {!indexer.isEnabled && (
                        <span class="wz-badge">Désactivé</span>
                      )}
                    </div>
                    <div class="ix-item__meta">{indexer.baseUrl}</div>
                    {indexer.jackettIndexerName && (
                      <div class="ix-item__meta">Indexer: {indexer.jackettIndexerName}</div>
                    )}
                    <div class="ix-item__meta">Priorité: {indexer.priority}</div>
                  </div>
                  <div class="ix-item__actions">
                    <button
                      type="button"
                      class="wz-btn wz-btn--ghost wz-btn--sm"
                      data-focusable
                      onClick={() => handleEdit(indexer)}
                    >
                      Éditer
                    </button>
                    <button
                      type="button"
                      class="wz-btn wz-btn--danger wz-btn--sm"
                      data-focusable
                      onClick={() => handleDelete(indexer.id)}
                      disabled={deleting === indexer.id}
                    >
                      {deleting === indexer.id ? (
                        <span class="ed-spinner ed-spinner--xs" aria-hidden="true" />
                      ) : (
                        'Supprimer'
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p class="wz-muted" style="margin:0;">Aucun indexer configuré</p>
          )}

          <div class="ix-tools">
            <button
              type="button"
              class="wz-btn wz-btn--primary"
              data-focusable
              onClick={handleAddIndexer}
              disabled={loadingDefinitions}
            >
              {loadingDefinitions ? (
                <>
                  <Spinner />
                  {t('common.loading')}
                </>
              ) : (
                t('setupIndexersStep.addIndexer')
              )}
            </button>
            <button
              type="button"
              class="wz-btn wz-btn--ghost"
              data-focusable
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDocs(true);
              }}
              title={t('indexerDefinitionDocs.open')}
            >
              <Info className="w-4 h-4 is-lead" />
              <span>{t('indexerDefinitionDocs.open')}</span>
            </button>
            {hasCloudToken && (
              <a
                href="/settings/indexer-definitions"
                target="_blank"
                rel="noopener noreferrer"
                class="wz-btn wz-btn--quiet"
              >
                {t('setupIndexersStep.addDefinition')} ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} class="wz-panel">
          {editingIndexer && (
            <Alert tone="info" style="margin-bottom:20px;">Édition de l'indexer: {editingIndexer.name}</Alert>
          )}
          {selectedDefinition && !editingIndexer && (
            <p class="wz-text-sm" style="margin:0 0 20px;">
              {t('setupIndexersStep.basedOnDefinition')}{' '}
              <strong style="color:var(--wz-ink);font-weight:500;">{selectedDefinition.name}</strong>
            </p>
          )}

          {(() => {
            const effectiveDef = selectedDefinition || (editingIndexer?.indexerTypeId && definitions.find((d) => d.id === editingIndexer?.indexerTypeId)) || null;
            const uiFields = Array.isArray(effectiveDef?.ui?.fields) ? effectiveDef!.ui!.fields : [];
            const fieldLabel = (field: { name?: string; label?: string }) => field?.label || (field?.name ? t(`indexersManager.form.${field.name}` as any) : '') || field?.name || '';
            const inputClass = 'wz-input';
            return (
              <>
          <div class="wz-field">
            <label class="wz-label">{t('indexersManager.form.name')}</label>
            <input
              type="text"
              class={inputClass}
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
                <div key={name} class="wz-field">
                  <label class="wz-label">{fieldLabel(field)}</label>
                  <input type="url" class={`${inputClass} wz-input--mono`} value={formData.baseUrl} onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })} required placeholder={field.placeholder} />
                </div>
              );
            }
            if (name === 'apiKey') {
              return (
                <div key={name} class="wz-field">
                  <label class="wz-label">{fieldLabel(field)}{effectiveDef?.requiresApiKey && required}</label>
                  <input type="password" autoComplete="new-password" class={`${inputClass} wz-input--mono`} value={formData.apiKey} onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })} required={effectiveDef?.requiresApiKey ?? false} placeholder={field.placeholder} />
                </div>
              );
            }
            const isPassword = name !== 'cookie' && (field.type || '').toLowerCase() === 'password';
            return (
              <div key={name} class="wz-field">
                <div class="ix-field-head">
                  <label class="wz-label">{fieldLabel(field)}{field.required && required}</label>
                  {name === 'cookie' && (
                    <button
                      type="button"
                      class="wz-btn wz-btn--ghost wz-btn--sm"
                      data-focusable
                      onClick={() => setShowCookieWizard(true)}
                    >
                      {t('indexersManager.form.cookieWizardOpen')}
                    </button>
                  )}
                </div>
                <input
                  type={isPassword ? 'password' : 'text'}
                  class={inputClass}
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
                      class="ix-drop"
                      tabIndex={0}
                      role="button"
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).classList.add('is-over'); }}
                      onDragLeave={(e) => { (e.currentTarget as HTMLElement).classList.remove('is-over'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const el = e.currentTarget as HTMLElement;
                        el.classList.remove('is-over');
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
                      class="wz-btn wz-btn--ghost wz-btn--sm"
                      data-focusable
                      style="margin-top:10px;"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text?.trim()) setFormData({ ...formData, extraConfig: { ...(formData.extraConfig || {}), cookie: normalizeCookieInput(text.trim()) } });
                        } catch (_) {}
                      }}
                    >
                      {t('indexersManager.form.cookiePasteButton')}
                    </button>
                    <p class="wz-help">{t('indexersManager.form.cookieHelp')}</p>
                  </>
                )}
              </div>
            );
          }) : (
            <>
          <div class="wz-field">
            <label class="wz-label">{t('indexersManager.form.baseUrl')}</label>
            <input type="url" class={`${inputClass} wz-input--mono`} value={formData.baseUrl} onInput={(e) => setFormData({ ...formData, baseUrl: (e.target as HTMLInputElement).value })} required />
          </div>
          <div class="wz-field">
            <label class="wz-label">{t('indexersManager.form.apiKey')}</label>
            <input type="password" autoComplete="new-password" class={`${inputClass} wz-input--mono`} value={formData.apiKey} onInput={(e) => setFormData({ ...formData, apiKey: (e.target as HTMLInputElement).value })} placeholder={t('indexersManager.optional')} />
          </div>
            </>
          )}
          {(effectiveDef?.protocol === 'torznab' || formData.jackettIndexerName !== undefined) && (
          <div class="wz-field">
            <label class="wz-label">{t('indexersManager.form.jackettName')}</label>
            <input type="text" class={inputClass} value={formData.jackettIndexerName} onInput={(e) => setFormData({ ...formData, jackettIndexerName: (e.target as HTMLInputElement).value })} />
          </div>
          )}
          {effectiveDef?.protocol === 'custom' && (
            <div class="wz-field">
              <CheckButton
                checked={formData.useFlareSolverr ?? false}
                onToggle={(next) => setFormData({ ...formData, useFlareSolverr: next })}
                desc={t('indexersManager.form.useFlareSolverrHelp')}
              >
                <span style="color:var(--wz-ink);">{t('indexersManager.form.useFlareSolverr')}</span>
              </CheckButton>
            </div>
          )}
              </>
            );
          })()}

          <div class="wz-field">
            <label class="wz-label">Priorité</label>
            <input
              type="number"
              class="wz-input"
              style="max-width:160px;"
              value={formData.priority}
              onInput={(e) => setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value) || 0 })}
              min="0"
            />
          </div>

          <div class="wz-field ix-checks">
            <CheckButton
              checked={formData.isEnabled}
              onToggle={(next) => setFormData({ ...formData, isEnabled: next })}
            >
              Activer
            </CheckButton>
            <CheckButton
              checked={formData.isDefault}
              onToggle={(next) => setFormData({ ...formData, isDefault: next })}
            >
              Par défaut
            </CheckButton>
          </div>

          <div class="ix-form-actions">
            <button
              type="button"
              class="wz-btn wz-btn--ghost"
              data-focusable
              onClick={handleCancel}
            >
              Annuler
            </button>
            <button
              type="submit"
              class="wz-btn wz-btn--primary"
              data-focusable
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner />
                  Sauvegarde...
                </>
              ) : (
                editingIndexer ? 'Mettre à jour' : 'Créer'
              )}
            </button>
          </div>
        </form>
      )}
      </div>

      <div class="wz-actions">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          type="button"
          class="wz-btn wz-btn--ghost"
          data-focusable
          onClick={onPrevious}
        >
          <IconArrowLeft />
          Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          type="button"
          class="wz-btn wz-btn--primary"
          data-focusable
          onClick={onNext}
          data-action={continueAction}
        >
          {continueAction === 'skip' ? t('setupIndexersStep.skip') : t('common.next')}
          <IconArrowRight />
        </button>
      </div>
    </div>
  );
}
