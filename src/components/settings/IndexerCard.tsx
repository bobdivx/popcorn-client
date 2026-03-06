import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';

interface IndexerCardProps {
  name: string;
  baseUrl: string;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  /** Ratio sur le tracker (si fourni par le backend) */
  ratio?: number | null;
  indexerId?: string;
  categoryMapping?: Record<string, any>;
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  onSync?: () => void;
  isTesting?: boolean;
  isSyncing?: boolean;
  testProgress?: { index: number; total: number; lastQuery?: string; lastCount?: number; lastSuccess?: boolean };
  testResult?: { 
    success: boolean; 
    message?: string;
    totalResults?: number;
    resultsCount?: number;
    successfulQueries?: number;
    failedQueries?: Array<[string, string]>;
    testQueries?: string[];
    categoriesFound?: string[];
    sampleResults?: Array<{
      title?: string;
      size?: number;
      seeders?: number;
      peers?: number;
      leechers?: number;
      category?: string;
      tmdbId?: number;
      slug?: string;
      _externalLink?: string;
      _externalMagnetUri?: string;
      downloadUrl?: string;
    }>;
    sampleResult?: {
      title?: string;
      size?: number;
      seeders?: number;
    };
    /** Résultat du test passkey/API (indexers avec template de téléchargement nécessitant une clé) */
    apiKeyTest?: { valid: boolean; message: string };
  };
  children?: ComponentChildren;
}

export function IndexerCard({
  name,
  baseUrl,
  isEnabled,
  isDefault,
  priority,
  ratio,
  indexerId,
  categoryMapping,
  onEdit,
  onDelete,
  onTest,
  onSync,
  isTesting = false,
  isSyncing = false,
  testProgress,
  testResult,
  children,
}: IndexerCardProps) {
  const { t } = useI18n();
  return (
    <div class="bg-gray-800/50 rounded-xl border border-gray-700 p-6 sm:p-8 md:p-10 lg:p-12 hover:border-gray-600 transition-colors">
      <div class="mb-6">
        <h3 class="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3 break-words">{name}</h3>
        <code class="text-sm sm:text-base text-gray-400 bg-gray-900/50 px-4 py-3 rounded block break-all overflow-wrap-anywhere">
          {baseUrl}
        </code>
      </div>
      
      <div class="flex flex-wrap gap-3 mb-6">
        {isEnabled ? (
          <span class="px-4 py-2 bg-green-900/30 border border-green-600 text-green-300 rounded-lg text-base sm:text-lg font-semibold">
            {t('indexerCard.active')}
          </span>
        ) : (
          <span class="px-4 py-2 bg-primary-900/30 border border-primary-600 text-primary-300 rounded-lg text-base sm:text-lg font-semibold glass-panel">
            {t('indexerCard.inactive')}
          </span>
        )}
        {isDefault && (
          <span class="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-300 rounded-lg text-base sm:text-lg font-semibold">
            {t('indexerCard.default')}
          </span>
        )}
        <span class="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base sm:text-lg">
          {t('indexerCard.priority')}: {priority}
        </span>
        <span class="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base sm:text-lg" title={ratio != null ? undefined : t('indexerCard.ratioNotAvailable')}>
          {t('indexerCard.ratio')}: {ratio != null && Number.isFinite(ratio) ? ratio.toFixed(2) : t('indexerCard.ratioNotAvailable')}
        </span>
      </div>

      {children && (
        <div class="mb-6">
          {children}
        </div>
      )}

      {testResult && (
        <div class={`mb-4 p-4 sm:p-6 rounded-lg border ${
          testResult.success 
            ? 'bg-green-900/30 border-green-600 text-green-300' 
            : 'bg-primary-900/30 border-primary-600 text-primary-300 glass-panel'
        }`}>
          <div class="flex items-start gap-3">
            <span class="text-2xl sm:text-3xl">
              {testResult.success ? '✅' : '❌'}
            </span>
            <div class="flex-1">
              <p class="text-base sm:text-lg font-semibold mb-1">
                {testResult.success ? t('indexerCard.testSuccess') : t('indexerCard.testFailed')}
              </p>

              {/* Test clé API / passkey en premier (indexers type ygg-api, etc.) */}
              {testResult.apiKeyTest && (
                <div class={`mb-3 p-3 rounded-lg border ${testResult.apiKeyTest.valid ? 'bg-green-900/20 border-green-600/50 text-green-200' : 'bg-red-900/20 border-red-600/50 text-red-200'}`}>
                  <p class="text-xs sm:text-sm font-semibold mb-1">
                    🔑 {t('indexerCard.apiKeyTest')} — {t('indexerCard.firstTested')}
                  </p>
                  <p class="text-xs sm:text-sm opacity-90">
                    {testResult.apiKeyTest.valid ? '✅' : '❌'} {testResult.apiKeyTest.message}
                  </p>
                </div>
              )}

              <p class="text-sm sm:text-base opacity-90 mb-3">
                {testResult.message || (testResult.success ? t('indexerCard.connectionSuccess') : t('indexerCard.connectionError'))}
              </p>
              
              {testResult.success && (
                <div class="space-y-3 mt-3 pt-3 border-t border-green-600/30">
                  {/* Statistiques générales */}
                  {(testResult as any).totalResults !== undefined && (
                    <div class="flex items-center gap-2">
                      <span class="text-lg">📊</span>
                      <span class="text-sm sm:text-base font-semibold">
                        {((testResult as any).totalResults || 0).toLocaleString()} {t('indexerCard.torrentsFoundTotal')}
                      </span>
                    </div>
                  )}
                  
                  {/* Catégories trouvées */}
                  {(testResult as any).categoriesFound && Array.isArray((testResult as any).categoriesFound) && (testResult as any).categoriesFound.length > 0 && (
                    <div class="flex items-start gap-2">
                      <span class="text-lg">📁</span>
                      <div class="flex-1">
                        <span class="text-sm sm:text-base font-semibold block mb-1">{t('indexerCard.categoriesReturned')}</span>
                        <div class="flex flex-wrap gap-2">
                          {((testResult as any).categoriesFound as string[]).map((cat: string) => (
                            <span key={cat} class="px-2 py-1 bg-blue-900/30 border border-blue-600 text-blue-300 rounded text-xs capitalize">
                              {cat === 'films' ? t('indexerCard.films') : cat === 'series' ? t('indexerCard.series') : cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Requêtes testées */}
                  {(testResult as any).successfulQueries !== undefined && (
                    <div class="flex items-center gap-2">
                      <span class="text-lg">🔍</span>
                      <span class="text-sm sm:text-base">
                        {((testResult as any).successfulQueries || 0)} {t('indexerCard.queriesSuccessOutOf')} {((testResult as any).testQueries?.length || 0)}
                      </span>
                    </div>
                  )}
                  
                  {/* Requêtes échouées */}
                  {(testResult as any).failedQueries && Array.isArray((testResult as any).failedQueries) && (testResult as any).failedQueries.length > 0 && (
                    <div class="bg-yellow-900/20 border border-yellow-600/30 rounded p-2">
                      <p class="text-xs sm:text-sm font-semibold mb-1">⚠️ {t('indexerCard.failedQueries')}</p>
                      {(testResult as any).failedQueries.map((failed: any, idx: number) => (
                        <p key={idx} class="text-xs opacity-75">
                          • "{failed[0] || failed.query}": {failed[1] || failed.error}
                        </p>
                      ))}
                    </div>
                  )}
                  
                  {/* Statistiques sur les formats de téléchargement selon Torznab */}
                  {(testResult as any).sampleResults && Array.isArray((testResult as any).sampleResults) && (testResult as any).sampleResults.length > 0 && (
                    <div class="bg-gray-900/50 rounded p-3 mt-2 border border-gray-700/50">
                      <p class="text-xs sm:text-sm font-semibold mb-2">📊 {t('indexerCard.downloadFormatsAvailable')}</p>
                      <div class="flex flex-wrap gap-2 mb-2">
                        {(testResult as any).sampleResults.some((r: any) => r._externalMagnetUri || (r._externalLink && r._externalLink.startsWith('magnet:')) || (r.downloadUrl && r.downloadUrl.startsWith('magnet:'))) && (
                          <span class="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-600 text-purple-300 rounded text-xs" title="Magnet link depuis &lt;torznab:attr name='magneturl'&gt; ou &lt;enclosure url='magnet:...'&gt;">
                            <span>🔗</span>
                            <span>{t('indexerCard.magnetAvailable')}</span>
                          </span>
                        )}
                        {(testResult as any).sampleResults.some((r: any) => (r._externalLink && !r._externalLink.startsWith('magnet:')) || (r.downloadUrl && !r.downloadUrl.startsWith('magnet:'))) && (
                          <span class="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-600 text-green-300 rounded text-xs" title="Fichier .torrent depuis &lt;enclosure url='...'&gt;, &lt;link&gt; ou &lt;guid&gt;">
                            <span>📄</span>
                            <span>{t('indexerCard.torrentFileAvailable')}</span>
                          </span>
                        )}
                      </div>
                      <div class="text-xs text-gray-500 space-y-1">
                        <p>
                          {((testResult as any).sampleResults.filter((r: any) => r._externalMagnetUri || (r._externalLink && r._externalLink.startsWith('magnet:')) || (r.downloadUrl && r.downloadUrl.startsWith('magnet:'))).length)} {t('indexerCard.resultsWithMagnet')} {(testResult as any).sampleResults.length} {t('indexerCard.tested')}
                        </p>
                        <p>
                          {((testResult as any).sampleResults.filter((r: any) => (r._externalLink && !r._externalLink.startsWith('magnet:')) || (r.downloadUrl && !r.downloadUrl.startsWith('magnet:'))).length)} {t('indexerCard.resultsWithTorrentFile')} {(testResult as any).sampleResults.length} {t('indexerCard.tested')}
                        </p>
                        <p class="text-gray-600 mt-2 italic">
                          ℹ️ {t('indexerCard.torznabLinkOrder')} <code class="bg-gray-800 px-1 rounded">enclosure_url</code> → <code class="bg-gray-800 px-1 rounded">link</code> → <code class="bg-gray-800 px-1 rounded">guid</code> → <code class="bg-gray-800 px-1 rounded">magneturl</code>
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Exemples de résultats */}
                  {(testResult as any).sampleResults && Array.isArray((testResult as any).sampleResults) && (testResult as any).sampleResults.length > 0 && (
                    <div class="bg-gray-900/50 rounded p-3 mt-2">
                      <p class="text-xs sm:text-sm font-semibold mb-2">📋 {t('indexerCard.exampleResults')}</p>
                      <div class="space-y-3">
                        {(testResult as any).sampleResults.slice(0, 5).map((result: any, idx: number) => (
                          <div key={idx} class="text-xs sm:text-sm border-l-2 border-green-600/50 pl-3 py-2 bg-gray-800/30 rounded-r">
                            <p class="font-semibold truncate mb-2" title={result.title || 'N/A'}>
                              {result.title || 'N/A'}
                            </p>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-400">
                              {result.size && (
                                <span class="flex items-center gap-1">
                                  <span>💾</span>
                                  <span>{(result.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                </span>
                              )}
                              {result.seeders !== undefined && (
                                <span class="flex items-center gap-1">
                                  <span>🌱</span>
                                  <span>{result.seeders} {t('indexerCard.seeders')}</span>
                                </span>
                              )}
                              {(result.peers !== undefined || result.leechers !== undefined) && (
                                <span class="flex items-center gap-1">
                                  <span>👥</span>
                                  <span>{result.peers || result.leechers} {t('indexerCard.peers')}</span>
                                </span>
                              )}
                              {result.category && (
                                <span class="flex items-center gap-1 capitalize">
                                  <span>📁</span>
                                  <span>{result.category === 'films' ? t('indexerCard.films') : result.category === 'series' ? t('indexerCard.series') : result.category}</span>
                                </span>
                              )}
                              {result.tmdbId && (
                                <span class="flex items-center gap-1 text-blue-400">
                                  <span>🎬</span>
                                  <span>TMDB: {result.tmdbId}</span>
                                </span>
                              )}
                              {!result.tmdbId && (
                                <span class="flex items-center gap-1 text-yellow-400">
                                  <span>⚠️</span>
                                  <span>{t('indexerCard.noTmdbId')}</span>
                                </span>
                              )}
                            </div>
                            
                              {/* Informations sur le GUID */}
                              {(result as any)._guid && (
                                <div class="mt-2 pt-2 border-t border-gray-700/50">
                                  <p class="text-xs font-semibold mb-1 text-gray-400 flex items-center gap-1">
                                    <span>🔑</span>
                                    <span>{t('indexerCard.guidTorznab')}</span>
                                  </p>
                                  <code class="block text-xs bg-gray-900/70 p-2 rounded break-all text-gray-400 mt-1 font-mono">
                                    {(result as any)._guid}
                                  </code>
                                  <p class="text-xs text-gray-500 mt-1 italic">
                                    ℹ️ {t('indexerCard.guidUsedForDownload')}
                                  </p>
                                </div>
                              )}
                              
                              {/* Informations sur le téléchargement selon la spécification Torznab */}
                              <div class="mt-2 pt-2 border-t border-gray-700/50">
                                <p class="text-xs font-semibold mb-1 text-gray-400">📥 {t('indexerCard.downloadFormatTorznab')}</p>
                                <div class="flex flex-wrap gap-2 mb-2">
                                  {(result as any)._externalMagnetUri ? (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-600 text-purple-300 rounded text-xs" title="Magnet link depuis l'attribut Torznab magneturl ou enclosure">
                                      <span>🔗</span>
                                      <span>{t('indexerCard.magnetLinkEnclosure')}</span>
                                    </span>
                                  ) : (result as any)._externalLink && (result as any)._externalLink.startsWith('magnet:') ? (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-600 text-purple-300 rounded text-xs" title="Magnet link depuis _externalLink">
                                      <span>🔗</span>
                                      <span>{t('indexerCard.magnetLink')}</span>
                                    </span>
                                  ) : (result as any)._externalLink && !(result as any)._externalLink.startsWith('magnet:') ? (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-600 text-green-300 rounded text-xs" title="Fichier .torrent depuis enclosure, link ou guid">
                                      <span>📄</span>
                                      <span>{t('indexerCard.torrentFile')}</span>
                                    </span>
                                  ) : (result as any).downloadUrl && !(result as any).downloadUrl.startsWith('magnet:') ? (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-600 text-green-300 rounded text-xs" title="Fichier .torrent depuis downloadUrl">
                                      <span>📄</span>
                                      <span>{t('indexerCard.torrentFile')}</span>
                                    </span>
                                  ) : (result as any).downloadUrl && (result as any).downloadUrl.startsWith('magnet:') ? (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-600 text-purple-300 rounded text-xs" title="Magnet link depuis downloadUrl">
                                      <span>🔗</span>
                                      <span>{t('indexerCard.magnetLink')}</span>
                                    </span>
                                  ) : (
                                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-yellow-900/30 border border-yellow-600 text-yellow-300 rounded text-xs" title={t('indexerCard.noLinkAvailable')}>
                                      <span>⚠️</span>
                                      <span>{t('indexerCard.noLinkAvailable')}</span>
                                    </span>
                                  )}
                                </div>
                                
                                {/* Résultat du test de téléchargement */}
                                {(result as any).downloadTest && (
                                  <div class={`mt-2 p-2 rounded border ${
                                    (result as any).downloadTest.success
                                      ? 'bg-green-900/20 border-green-600/30'
                                      : 'bg-primary-900/20 border-primary-600/30 glass-panel'
                                  }`}>
                                    <p class={`text-xs font-semibold mb-1 flex items-center gap-1 ${
                                      (result as any).downloadTest.success ? 'text-green-300' : 'text-red-300'
                                    }`}>
                                      <span>{(result as any).downloadTest.success ? '✅' : '❌'}</span>
                                      <span>{t('indexerCard.downloadTestTorrentFile')}</span>
                                    </p>
                                    <p class="text-xs text-gray-400 mb-1">
                                      {(result as any).downloadTest.message}
                                    </p>
                                    {((result as any).downloadTest.torrentIdUsed ?? (result as any).downloadTest.guidUsed) && (
                                      <p class="text-xs text-gray-500 mt-1">
                                        <span class="font-semibold">{t('indexerCard.guidUsed')}</span>{' '}
                                        <code class="bg-gray-900/70 px-1 rounded">{(result as any).downloadTest.torrentIdUsed ?? (result as any).downloadTest.guidUsed}</code>
                                      </p>
                                    )}
                                  </div>
                                )}
                              {/* Détails du lien selon la spécification Torznab */}
                              <div class="mt-2 pt-2 border-t border-gray-700/50">
                                <p class="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
                                  <span>📋</span>
                                  <span>{t('indexerCard.detailsTorznab')}</span>
                                </p>
                                {((result as any)._externalLink || (result as any)._externalMagnetUri || (result as any).downloadUrl) ? (
                                  <div class="space-y-2 text-xs">
                                    {(result as any)._externalMagnetUri && (
                                      <div class="bg-purple-900/20 border border-purple-600/30 p-2 rounded">
                                        <p class="font-semibold text-purple-300 mb-1 flex items-center gap-1">
                                          <span>🔗</span>
                                          <span>{t('indexerCard.magnetUri')}</span>
                                        </p>
                                        <code class="block text-xs bg-gray-900/70 p-2 rounded break-all text-gray-400 mt-1 font-mono">
                                          {(result as any)._externalMagnetUri}
                                        </code>
                                      </div>
                                    )}
                                    {(result as any)._externalLink && (
                                      <div class="bg-gray-900/50 border border-gray-700/50 p-2 rounded">
                                        <p class="font-semibold text-gray-300 mb-1 flex items-center gap-1">
                                          <span>{(result as any)._externalLink.startsWith('magnet:') ? '🔗' : '📄'}</span>
                                          <span>{t('indexerCard.downloadLink')}</span>
                                          <span class="text-xs text-gray-500 font-normal ml-1">
                                            {t('indexerCard.torznabSourceOrder')}
                                          </span>
                                        </p>
                                        <code class="block text-xs bg-gray-900/70 p-2 rounded break-all text-gray-400 mt-1 font-mono">
                                          {(result as any)._externalLink}
                                        </code>
                                        <p class="text-xs text-gray-500 mt-2 italic">
                                          ℹ️ {t('indexerCard.torznabSource')}
                                        </p>
                                      </div>
                                    )}
                                    {(result as any).downloadUrl && (result as any).downloadUrl !== (result as any)._externalLink && (
                                      <div class="bg-blue-900/20 border border-blue-600/30 p-2 rounded">
                                        <p class="font-semibold text-blue-300 mb-1 flex items-center gap-1">
                                          <span>🔗</span>
                                          <span>{t('indexerCard.downloadUrlAlternative')}</span>
                                        </p>
                                        <code class="block text-xs bg-gray-900/70 p-2 rounded break-all text-gray-400 mt-1 font-mono">
                                          {(result as any).downloadUrl}
                                        </code>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div class="bg-yellow-900/20 border border-yellow-600/30 p-2 rounded">
                                    <p class="text-yellow-300 text-xs">
                                      ⚠️ {t('indexerCard.noDownloadLinkInResults')}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Ancien format pour compatibilité */}
                  {(testResult as any).resultsCount !== undefined && !(testResult as any).totalResults && (
                    <div class="mt-2 pt-2 border-t border-green-600/30">
                      <p class="text-sm sm:text-base font-semibold">
                        📊 {((testResult as any).resultsCount || 0).toLocaleString()} {t('indexerCard.torrentsFoundTest')}
                      </p>
                      {(testResult as any).sampleResult && (
                        <div class="mt-2 text-xs sm:text-sm opacity-75">
                          <p class="font-semibold">{t('indexerCard.exampleResult')}</p>
                          <p class="truncate" title={(testResult as any).sampleResult.title || 'N/A'}>{(testResult as any).sampleResult.title || 'N/A'}</p>
                          {(testResult as any).sampleResult.size && (
                            <p class="text-gray-400">
                              {t('indexerCard.size')} {((testResult as any).sampleResult.size / 1024 / 1024 / 1024).toFixed(2)} GB
                              {(testResult as any).sampleResult.seeders !== undefined && (
                                <> • {t('indexerCard.seeders')}: {(testResult as any).sampleResult.seeders}</>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(onEdit || onDelete || onTest || onSync) && (
        <div class="flex flex-wrap gap-3 sm:gap-4">
          {onSync && isEnabled && (
            <button
              type="button"
              class="ds-btn-accent btn btn-sm gap-2 px-4 py-2.5 font-semibold text-[var(--ds-text-on-accent)] disabled:opacity-50 min-h-[var(--ds-touch-target-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex-1 min-w-0"
              onClick={onSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  {t('indexerCard.syncing')}
                </>
              ) : (
                `🔄 ${t('indexerCard.syncButton')}`
              )}
            </button>
          )}
          {onTest && (
            <button
              type="button"
              class="ds-btn-accent btn btn-sm gap-2 px-4 py-2.5 font-semibold text-[var(--ds-text-on-accent)] disabled:opacity-50 min-h-[var(--ds-touch-target-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex-1 min-w-0"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  {testProgress && testProgress.total > 0 ? (
                    <>
                      {t('indexerCard.testing')} — {testProgress.index}/{testProgress.total}
                      {testProgress.lastQuery !== undefined && (
                        <> : « {testProgress.lastQuery} » → {testProgress.lastSuccess ? `${testProgress.lastCount ?? 0} résultat(s)` : t('indexerCard.testFailed')}</>
                      )}
                    </>
                  ) : (
                    t('indexerCard.testing')
                  )}
                </>
              ) : (
                `🧪 ${t('indexerCard.testButton')}`
              )}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              class="ds-btn-secondary btn btn-sm gap-2 px-4 py-2.5 font-semibold text-[var(--ds-text-primary)] min-h-[var(--ds-touch-target-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex-1 min-w-0"
              onClick={onEdit}
            >
              ✏️ {t('indexerCard.edit')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              class="ds-btn-danger btn btn-sm gap-2 px-4 py-2.5 font-semibold text-white min-h-[var(--ds-touch-target-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex-1 min-w-0"
              onClick={onDelete}
            >
              🗑️ {t('indexerCard.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
