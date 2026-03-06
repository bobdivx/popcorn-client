import { useState, useEffect, useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { TokenManager } from '../../lib/client/storage';
import { serverApi } from '../../lib/client/server-api';
import { Info, Search } from 'lucide-preact';
import {
  getIndexerDefinitionsWithBackendFallback,
  createIndexerDefinition,
  updateIndexerDefinition,
  deleteIndexerDefinition,
  type IndexerDefinition,
  type IndexerDefinitionBody,
} from '../../lib/api/popcorn-web';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { Modal } from '../ui/Modal';
import { IndexerDefinitionDocsModal } from '../indexers/IndexerDefinitionDocsModal';

const DEFAULT_SEARCH_PARAMS: Record<string, string> = {};
const DEFAULT_RESPONSE_MAPPING: Record<string, string> = { results: 'Results', title: 'Title', id: 'Guid', size: 'Size', seeders: 'Seeders', leechers: 'Peers', uploaded_at: 'PublishDate', link: 'Link' };
const DEFAULT_CATEGORY_MAPPING: Record<string, string> = { films: '2000', series: '5000' };
const DEFAULT_UI: Record<string, any> = { icon: '', color: '', fields: [] };

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    if (!str.trim()) return fallback;
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export default function IndexerDefinitionsManager() {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<IndexerDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IndexerDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [user, setUser] = useState<{ id?: string; is_admin?: boolean } | null>(null);
  const [hasCloudToken, setHasCloudToken] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    version: '1.0.0',
    description: '',
    protocol: 'torznab' as 'rest' | 'torznab' | 'newznab' | 'custom',
    searchEndpoint: '',
    searchMethod: 'GET',
    searchParams: JSON.stringify(DEFAULT_SEARCH_PARAMS, null, 2),
    responseMapping: JSON.stringify(DEFAULT_RESPONSE_MAPPING, null, 2),
    categoryMapping: JSON.stringify(DEFAULT_CATEGORY_MAPPING, null, 2),
    ui: JSON.stringify(DEFAULT_UI, null, 2),
    country: '',
    language: '',
    type: 'public' as 'public' | 'semi-private' | 'private',
    downloadUrlTemplate: '',
    requiresApiKey: true,
    requiresAuth: false,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const backendUrl = serverApi.getServerUrl?.() ?? null;
      const list = await getIndexerDefinitionsWithBackendFallback(backendUrl);
      setDefinitions(list ?? []);
    } catch (e) {
      setError(t('indexerDefinitionsManager.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setUser(TokenManager.getUser());
    setHasCloudToken(TokenManager.getCloudAccessToken() !== null);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filteredDefinitions = useMemo(() => {
    if (!q) return [];
    return definitions.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q))
    );
  }, [definitions, q]);

  const canEdit = (def: IndexerDefinition) => {
    if (!user?.id) return false;
    return def.createdBy === user.id || user.is_admin === true || user.is_admin === 1;
  };

  const isUnauthorizedMessage = (msg: string | undefined) =>
    msg === 'UNAUTHORIZED_CLOUD' ||
    msg?.includes('Unauthorized') ||
    msg?.includes('Token') ||
    msg?.includes('401');

  const handleDelete = async (def: IndexerDefinition) => {
    if (!confirm(t('indexerDefinitionsManager.confirmDeleteDefinition'))) return;
    setError(null);
    const res = await deleteIndexerDefinition(def.id);
    if (res.success) await load();
    else
      setError(
        isUnauthorizedMessage(res.message)
          ? t('indexerDefinitionsManager.loginRequired')
          : (res.message ?? t('indexerDefinitionsManager.errorDelete'))
      );
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      protocol: 'torznab',
      searchEndpoint: '',
      searchMethod: 'GET',
      searchParams: JSON.stringify(DEFAULT_SEARCH_PARAMS, null, 2),
      responseMapping: JSON.stringify(DEFAULT_RESPONSE_MAPPING, null, 2),
      categoryMapping: JSON.stringify(DEFAULT_CATEGORY_MAPPING, null, 2),
      ui: JSON.stringify(DEFAULT_UI, null, 2),
      country: '',
      language: '',
      type: 'public',
      downloadUrlTemplate: '',
      requiresApiKey: true,
      requiresAuth: false,
    });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (def: IndexerDefinition) => {
    setEditing(def);
    setFormData({
      id: def.id,
      name: def.name,
      version: def.version,
      description: def.description ?? '',
      protocol: def.protocol,
      searchEndpoint: def.searchEndpoint,
      searchMethod: def.searchMethod,
      searchParams: JSON.stringify(def.searchParams ?? {}, null, 2),
      responseMapping: JSON.stringify(def.responseMapping ?? {}, null, 2),
      categoryMapping: JSON.stringify(def.categoryMapping ?? {}, null, 2),
      ui: JSON.stringify(def.ui ?? {}, null, 2),
      country: def.country ?? '',
      language: def.language ?? '',
      type: (def.type && ['public', 'semi-private', 'private'].includes(def.type) ? def.type : 'public') as 'public' | 'semi-private' | 'private',
      downloadUrlTemplate: def.downloadUrlTemplate ?? '',
      requiresApiKey: def.requiresApiKey ?? true,
      requiresAuth: def.requiresAuth ?? false,
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: IndexerDefinitionBody = {
        id: formData.id.trim(),
        name: formData.name.trim(),
        version: formData.version.trim(),
        description: formData.description.trim() || null,
        protocol: formData.protocol,
        searchEndpoint: formData.searchEndpoint.trim(),
        searchMethod: formData.searchMethod.trim(),
        searchParams: safeJsonParse(formData.searchParams, {}),
        responseMapping: safeJsonParse(formData.responseMapping, {}),
        categoryMapping: safeJsonParse(formData.categoryMapping, {}),
        ui: safeJsonParse(formData.ui, {}),
        country: formData.country.trim() || null,
        language: formData.language.trim() || null,
        type: formData.type,
        downloadUrlTemplate: formData.downloadUrlTemplate.trim() || null,
        requiresApiKey: formData.requiresApiKey,
        requiresAuth: formData.requiresAuth,
      };
      if (editing) {
        const res = await updateIndexerDefinition(editing.id, body);
        if (res.success) {
          setShowForm(false);
          setEditing(null);
          await load();
        } else
          setError(
            isUnauthorizedMessage(res.message)
              ? t('indexerDefinitionsManager.loginRequired')
              : (res.message ?? t('indexerDefinitionsManager.errorUpdate'))
          );
      } else {
        const res = await createIndexerDefinition(body);
        if (res.success) {
          setShowForm(false);
          await load();
        } else
          setError(
            isUnauthorizedMessage(res.message)
              ? t('indexerDefinitionsManager.loginRequired')
              : (res.message ?? t('indexerDefinitionsManager.errorCreate'))
          );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[300px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <IndexerDefinitionDocsModal isOpen={showDocs} onClose={() => setShowDocs(false)} />
      <h2 class="text-2xl font-bold text-white">{t('indexerDefinitionsManager.title')}</h2>

      {error && (
        <div class="rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3">
          {error}
        </div>
      )}

      {!hasCloudToken && (
        <p class="text-amber-200/90 text-sm">{t('indexerDefinitionsManager.loginRequired')}</p>
      )}

      <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <span class="text-gray-400 text-sm">
          {t('indexerDefinitionsManager.definitionsCount', { count: definitions.length })}
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 sm:flex-initial min-w-[200px]">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="search"
              class="input input-bordered w-full pl-9 bg-gray-900 text-white placeholder-gray-500"
              placeholder={t('indexerDefinitionsManager.searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              aria-label={t('indexerDefinitionsManager.searchPlaceholder')}
            />
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowDocs(true);
            }}
            title={t('indexerDefinitionDocs.open')}
            aria-label={t('indexerDefinitionDocs.open')}
          >
            <Info class="w-4 h-4" />
          </button>
          {hasCloudToken && (
            <button type="button" class="btn btn-primary" onClick={openCreate}>
              {t('indexerDefinitionsManager.addDefinition')}
            </button>
          )}
        </div>
      </div>

      {definitions.length === 0 ? (
        <div class="text-center py-12 text-gray-400">
          {t('indexerDefinitionsManager.noDefinitions')}
        </div>
      ) : q ? (
        <div class="space-y-2">
          {filteredDefinitions.length === 0 ? (
            <p class="text-gray-400 text-sm py-4">{t('indexerDefinitionsManager.noResultsSearch')}</p>
          ) : (
            <ul class="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
              {filteredDefinitions.map((def) => (
                <li key={def.id} class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white/5 hover:bg-white/10">
                  <div class="min-w-0">
                    <span class="font-medium text-white">{def.name}</span>
                    <span class="text-gray-500 font-mono text-sm ml-2">{def.id}</span>
                  </div>
                  {hasCloudToken && canEdit(def) && (
                    <span class="flex gap-2">
                      <button type="button" class="btn btn-ghost btn-sm" onClick={() => openEdit(def)}>
                        {t('common.edit')}
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm text-red-400" onClick={() => handleDelete(def)}>
                        {t('common.delete')}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        title={editing ? t('common.edit') : t('indexerDefinitionsManager.addDefinition')}
        size="xl"
      >
        <div class="flex justify-end mb-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.preventDefault();
              setShowDocs(true);
            }}
            title={t('indexerDefinitionDocs.open')}
          >
            <Info class="w-4 h-4" />
            <span class="ml-1">{t('indexerDefinitionDocs.open')}</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.idLabel')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.id}
                  onInput={(e) => setFormData({ ...formData, id: (e.target as HTMLInputElement).value })}
                  required
                  disabled={!!editing}
                  placeholder={t('indexerDefinitionsManager.form.idPlaceholder')}
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.nameLabel')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.name}
                  onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
                  required
                  placeholder={t('indexerDefinitionsManager.form.namePlaceholder')}
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.versionLabel')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.version}
                  onInput={(e) => setFormData({ ...formData, version: (e.target as HTMLInputElement).value })}
                  required
                  placeholder="1.0.0"
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.protocol')}</label>
                <select
                  class="select select-bordered w-full bg-gray-900 text-white"
                  value={formData.protocol}
                  onChange={(e) => setFormData({ ...formData, protocol: (e.target as HTMLSelectElement).value as any })}
                >
                  <option class="bg-gray-900 text-white" value="rest">rest</option>
                  <option class="bg-gray-900 text-white" value="torznab">torznab</option>
                  <option class="bg-gray-900 text-white" value="newznab">newznab</option>
                  <option class="bg-gray-900 text-white" value="custom">custom</option>
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.descriptionLabel')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.description}
                  onInput={(e) => setFormData({ ...formData, description: (e.target as HTMLInputElement).value })}
                  placeholder={t('indexerDefinitionsManager.form.descriptionPlaceholder')}
                />
              </div>
              <div class="md:col-span-2">
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.searchEndpointLabel')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm"
                  value={formData.searchEndpoint}
                  onInput={(e) => setFormData({ ...formData, searchEndpoint: (e.target as HTMLInputElement).value })}
                  required
                  placeholder={t('indexerDefinitionsManager.form.searchEndpointPlaceholder')}
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.httpMethodLabel')}</label>
                <select
                  class="select select-bordered w-full bg-gray-900 text-white"
                  value={formData.searchMethod}
                  onChange={(e) => setFormData({ ...formData, searchMethod: (e.target as HTMLSelectElement).value })}
                >
                  <option class="bg-gray-900 text-white" value="GET">GET</option>
                  <option class="bg-gray-900 text-white" value="POST">POST</option>
                </select>
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.country')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.country}
                  onInput={(e) => setFormData({ ...formData, country: (e.target as HTMLInputElement).value })}
                  placeholder={t('indexerDefinitionsManager.form.countryPlaceholder')}
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.language')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500"
                  value={formData.language}
                  onInput={(e) => setFormData({ ...formData, language: (e.target as HTMLInputElement).value })}
                  placeholder={t('indexerDefinitionsManager.form.languagePlaceholder')}
                />
              </div>
              <div>
                <label class="label text-gray-300">{t('indexerDefinitionsManager.connectionType')}</label>
                <select
                  class="select select-bordered w-full bg-gray-900 text-white"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: (e.target as HTMLSelectElement).value as 'public' | 'semi-private' | 'private' })}
                >
                  <option class="bg-gray-900 text-white" value="public">{t('indexerDefinitionsManager.type.public')}</option>
                  <option class="bg-gray-900 text-white" value="semi-private">{t('indexerDefinitionsManager.type.semiPrivate')}</option>
                  <option class="bg-gray-900 text-white" value="private">{t('indexerDefinitionsManager.type.private')}</option>
                </select>
              </div>
              <div class="flex items-center gap-4">
                <label class="label cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    checked={formData.requiresApiKey}
                    onChange={(e) => setFormData({ ...formData, requiresApiKey: (e.target as HTMLInputElement).checked })}
                  />
                  <span class="text-gray-300">{t('indexerDefinitionsManager.form.requiresApiKey')}</span>
                </label>
                <label class="label cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    checked={formData.requiresAuth}
                    onChange={(e) => setFormData({ ...formData, requiresAuth: (e.target as HTMLInputElement).checked })}
                  />
                  <span class="text-gray-300">{t('indexerDefinitionsManager.form.requiresAuth')}</span>
                </label>
              </div>
            </div>
            <div class="space-y-2">
              <label class="label text-gray-300">{t('indexerDefinitionsManager.form.searchParams')}</label>
              <textarea
                class="textarea textarea-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm min-h-[80px]"
                value={formData.searchParams}
                onInput={(e) => setFormData({ ...formData, searchParams: (e.target as HTMLTextAreaElement).value })}
                spellcheck={false}
              />
            </div>
            <div class="space-y-2">
              <label class="label text-gray-300">{t('indexerDefinitionsManager.form.responseMapping')}</label>
              <textarea
                class="textarea textarea-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm min-h-[100px]"
                value={formData.responseMapping}
                onInput={(e) => setFormData({ ...formData, responseMapping: (e.target as HTMLTextAreaElement).value })}
                spellcheck={false}
              />
            </div>
            <div class="space-y-2">
              <label class="label text-gray-300">{t('indexerDefinitionsManager.form.categoryMapping')}</label>
              <textarea
                class="textarea textarea-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm min-h-[60px]"
                value={formData.categoryMapping}
                onInput={(e) => setFormData({ ...formData, categoryMapping: (e.target as HTMLTextAreaElement).value })}
                spellcheck={false}
              />
            </div>
            <div class="space-y-2">
              <label class="label text-gray-300">{t('indexerDefinitionsManager.form.ui')}</label>
              <textarea
                class="textarea textarea-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm min-h-[120px]"
                value={formData.ui}
                onInput={(e) => setFormData({ ...formData, ui: (e.target as HTMLTextAreaElement).value })}
                spellcheck={false}
              />
            </div>
            <details class="collapse collapse-arrow bg-white/5 rounded-lg">
              <summary class="collapse-title text-gray-300 font-medium">{t('indexerDefinitionsManager.form.advanced')}</summary>
              <div class="collapse-content space-y-2">
                <label class="label text-gray-300">{t('indexerDefinitionsManager.form.downloadUrlTemplate')}</label>
                <input
                  type="text"
                  class="input input-bordered w-full bg-gray-900 text-white placeholder-gray-500 font-mono text-sm"
                  value={formData.downloadUrlTemplate}
                  onInput={(e) => setFormData({ ...formData, downloadUrlTemplate: (e.target as HTMLInputElement).value })}
                  placeholder="{baseUrl}/torrents/{id}/download"
                />
                <p class="text-gray-500 text-xs">{t('indexerDefinitionsManager.form.downloadUrlTemplateHelp')}</p>
              </div>
            </details>
            <div class="flex gap-2 pt-4">
              <button type="submit" class="btn btn-primary" disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => { setShowForm(false); setEditing(null); }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
      </Modal>
    </div>
  );
}
