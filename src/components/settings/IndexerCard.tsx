import type { ComponentChildren } from 'preact';
import IndexerCategoriesSelector from './IndexerCategoriesSelector';

interface IndexerCardProps {
  name: string;
  baseUrl: string;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  indexerId?: string;
  categoryMapping?: Record<string, any>;
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  isTesting?: boolean;
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
    }>;
    sampleResult?: {
      title?: string;
      size?: number;
      seeders?: number;
    };
  };
  children?: ComponentChildren;
}

export function IndexerCard({
  name,
  baseUrl,
  isEnabled,
  isDefault,
  priority,
  indexerId,
  categoryMapping,
  onEdit,
  onDelete,
  onTest,
  isTesting = false,
  testResult,
  children,
}: IndexerCardProps) {
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
            Actif
          </span>
        ) : (
          <span class="px-4 py-2 bg-red-900/30 border border-red-600 text-red-300 rounded-lg text-base sm:text-lg font-semibold">
            Inactif
          </span>
        )}
        {isDefault && (
          <span class="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-300 rounded-lg text-base sm:text-lg font-semibold">
            Par défaut
          </span>
        )}
        <span class="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base sm:text-lg">
          Priorité: {priority}
        </span>
      </div>

      {children && (
        <div class="mb-6">
          {children}
        </div>
      )}

      {indexerId && categoryMapping && Object.keys(categoryMapping).length > 0 && (
        <div class="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <IndexerCategoriesSelector
            indexerId={indexerId}
            availableCategories={categoryMapping}
          />
        </div>
      )}

      {testResult && (
        <div class={`mb-4 p-4 sm:p-6 rounded-lg border ${
          testResult.success 
            ? 'bg-green-900/30 border-green-600 text-green-300' 
            : 'bg-red-900/30 border-red-600 text-red-300'
        }`}>
          <div class="flex items-start gap-3">
            <span class="text-2xl sm:text-3xl">
              {testResult.success ? '✅' : '❌'}
            </span>
            <div class="flex-1">
              <p class="text-base sm:text-lg font-semibold mb-1">
                {testResult.success ? 'Test réussi' : 'Test échoué'}
              </p>
              <p class="text-sm sm:text-base opacity-90 mb-3">
                {testResult.message || (testResult.success ? 'Connexion réussie' : 'Erreur de connexion')}
              </p>
              
              {testResult.success && (
                <div class="space-y-3 mt-3 pt-3 border-t border-green-600/30">
                  {/* Statistiques générales */}
                  {(testResult as any).totalResults !== undefined && (
                    <div class="flex items-center gap-2">
                      <span class="text-lg">📊</span>
                      <span class="text-sm sm:text-base font-semibold">
                        {((testResult as any).totalResults || 0).toLocaleString()} torrent(s) trouvé(s) au total
                      </span>
                    </div>
                  )}
                  
                  {/* Catégories trouvées */}
                  {(testResult as any).categoriesFound && Array.isArray((testResult as any).categoriesFound) && (testResult as any).categoriesFound.length > 0 && (
                    <div class="flex items-start gap-2">
                      <span class="text-lg">📁</span>
                      <div class="flex-1">
                        <span class="text-sm sm:text-base font-semibold block mb-1">Catégories retournées :</span>
                        <div class="flex flex-wrap gap-2">
                          {((testResult as any).categoriesFound as string[]).map((cat: string) => (
                            <span key={cat} class="px-2 py-1 bg-blue-900/30 border border-blue-600 text-blue-300 rounded text-xs capitalize">
                              {cat === 'films' ? 'Films' : cat === 'series' ? 'Séries' : cat}
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
                        {((testResult as any).successfulQueries || 0)} requête(s) réussie(s) sur {((testResult as any).testQueries?.length || 0)}
                      </span>
                    </div>
                  )}
                  
                  {/* Requêtes échouées */}
                  {(testResult as any).failedQueries && Array.isArray((testResult as any).failedQueries) && (testResult as any).failedQueries.length > 0 && (
                    <div class="bg-yellow-900/20 border border-yellow-600/30 rounded p-2">
                      <p class="text-xs sm:text-sm font-semibold mb-1">⚠️ Requêtes échouées :</p>
                      {(testResult as any).failedQueries.map((failed: any, idx: number) => (
                        <p key={idx} class="text-xs opacity-75">
                          • "{failed[0] || failed.query}": {failed[1] || failed.error}
                        </p>
                      ))}
                    </div>
                  )}
                  
                  {/* Exemples de résultats */}
                  {(testResult as any).sampleResults && Array.isArray((testResult as any).sampleResults) && (testResult as any).sampleResults.length > 0 && (
                    <div class="bg-gray-900/50 rounded p-3 mt-2">
                      <p class="text-xs sm:text-sm font-semibold mb-2">📋 Exemples de résultats :</p>
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
                                  <span>{result.seeders} seeders</span>
                                </span>
                              )}
                              {(result.peers !== undefined || result.leechers !== undefined) && (
                                <span class="flex items-center gap-1">
                                  <span>👥</span>
                                  <span>{result.peers || result.leechers} peers</span>
                                </span>
                              )}
                              {result.category && (
                                <span class="flex items-center gap-1 capitalize">
                                  <span>📁</span>
                                  <span>{result.category === 'films' ? 'Films' : result.category === 'series' ? 'Séries' : result.category}</span>
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
                                  <span>Pas d'ID TMDB</span>
                                </span>
                              )}
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
                        📊 {((testResult as any).resultsCount || 0).toLocaleString()} torrent(s) trouvé(s) lors du test
                      </p>
                      {(testResult as any).sampleResult && (
                        <div class="mt-2 text-xs sm:text-sm opacity-75">
                          <p class="font-semibold">Exemple de résultat :</p>
                          <p class="truncate">{(testResult as any).sampleResult.title || 'N/A'}</p>
                          {(testResult as any).sampleResult.size && (
                            <p class="text-gray-400">
                              Taille: {((testResult as any).sampleResult.size / 1024 / 1024 / 1024).toFixed(2)} GB
                              {(testResult as any).sampleResult.seeders !== undefined && (
                                <> • Seeders: {(testResult as any).sampleResult.seeders}</>
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

      {(onEdit || onDelete || onTest) && (
        <div class="flex flex-wrap gap-4 sm:gap-5 mt-8">
          {onTest && (
            <button
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 sm:py-5 sm:px-8 md:py-5 md:px-10 rounded-lg text-lg sm:text-xl md:text-2xl transition-all duration-200 min-h-[56px] sm:min-h-[64px] md:min-h-[72px] focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <span class="loading loading-spinner loading-sm"></span>
                  Test en cours...
                </>
              ) : (
                '🧪 Tester'
              )}
            </button>
          )}
          {onEdit && (
            <button
              class="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-4 px-6 sm:py-5 sm:px-8 md:py-5 md:px-10 rounded-lg text-lg sm:text-xl md:text-2xl transition-all duration-200 min-h-[56px] sm:min-h-[64px] md:min-h-[72px] focus:outline-none focus:ring-4 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex-1"
              onClick={onEdit}
            >
              ✏️ Modifier
            </button>
          )}
          {onDelete && (
            <button
              class="bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 sm:py-5 sm:px-8 md:py-5 md:px-10 rounded-lg text-lg sm:text-xl md:text-2xl transition-all duration-200 min-h-[56px] sm:min-h-[64px] md:min-h-[72px] focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex-1"
              onClick={onDelete}
            >
              🗑️ Supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
