import { useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n/useI18n';
import type { Indexer } from '../../../lib/client/server-api/types';

interface SyncCardProps {
  type?: 'all' | 'films' | 'series';
}

export function SyncCard({ type = 'all' }: SyncCardProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncIndexersToBackend = async () => {
    try {
      // Récupérer tous les indexers activés depuis la DB locale
      const response = await serverApi.getIndexers();
      if (!response.success || !response.data) {
        return;
      }

      const enabledIndexers = response.data.filter((idx: Indexer) => idx.isEnabled === true);
      if (enabledIndexers.length === 0) {
        return;
      }

      console.log(`[SYNC CARD] 🔄 Synchronisation de ${enabledIndexers.length} indexer(s) activé(s) vers le backend Rust...`);
      
      // Récupérer l'URL du backend
      const { getBackendUrlAsync } = await import('../../../lib/backend-url.js');
      const backendUrl = await getBackendUrlAsync();
      
      // Récupérer le token d'accès pour l'authentification
      const userId = serverApi.getCurrentUserId();
      // Récupérer le token depuis localStorage (comme le fait serverApi)
      const accessToken = typeof window !== 'undefined' 
        ? localStorage.getItem('access_token') 
        : null;
      
      // Synchroniser chaque indexer
      const syncPromises = enabledIndexers.map(async (indexer: Indexer) => {
        try {
          const syncUrl = `${backendUrl}/api/client/admin/indexers`;
          const syncController = new AbortController();
          const syncTimeout = setTimeout(() => syncController.abort(), 2000);
          
          const payload = {
            id: indexer.id,
            name: indexer.name,
            base_url: indexer.baseUrl,
            api_key: indexer.apiKey || null,
            jackett_indexer_name: indexer.jackettIndexerName || null,
            is_enabled: indexer.isEnabled === true,
            is_default: indexer.isDefault || false,
            priority: indexer.priority || 0,
            indexer_type_id: indexer.indexerTypeId || null,
            config_json: indexer.configJson || null,
          };
          
          // Préparer les headers avec authentification
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          
          if (userId) {
            headers['X-User-ID'] = userId;
          }
          
          console.log(`[SYNC CARD] 📤 Envoi de l'indexer ${indexer.name} vers le backend:`, {
            id: payload.id,
            name: payload.name,
            base_url: payload.base_url,
            is_enabled: payload.is_enabled,
            has_api_key: !!payload.api_key,
            api_key_length: payload.api_key?.length || 0,
            indexer_type_id: payload.indexer_type_id,
            has_auth: !!accessToken,
            has_user_id: !!userId,
            full_payload: payload,
          });
          
          const syncResponse = await fetch(syncUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: syncController.signal,
          });
          
          clearTimeout(syncTimeout);
          
          if (syncResponse.ok) {
            // Lire la réponse pour vérifier que l'indexer est bien enregistré avec is_enabled
            try {
              const responseData = await syncResponse.json().catch(() => null);
              if (responseData?.data) {
                console.log(`[SYNC CARD] ✅ Indexer ${indexer.name} synchronisé avec succès:`, {
                  id: responseData.data.id,
                  name: responseData.data.name,
                  is_enabled: responseData.data.is_enabled,
                });
              } else {
                console.log(`[SYNC CARD] ✅ Indexer ${indexer.name} synchronisé avec succès (réponse: ${syncResponse.status})`);
              }
            } catch (e) {
              console.log(`[SYNC CARD] ✅ Indexer ${indexer.name} synchronisé avec succès (status: ${syncResponse.status})`);
            }
            return true;
          } else {
            const errorText = await syncResponse.text().catch(() => '');
            console.warn(`[SYNC CARD] ⚠️ Erreur lors de la synchronisation de ${indexer.name}:`, {
              status: syncResponse.status,
              statusText: syncResponse.statusText,
              error: errorText,
            });
            return false;
          }
        } catch (syncError) {
          if (syncError instanceof Error && syncError.name === 'AbortError') {
            console.warn(`[SYNC CARD] ⚠️ Timeout lors de la synchronisation de ${indexer.name} (2s)`);
          } else {
            console.warn(`[SYNC CARD] ⚠️ Erreur lors de la synchronisation de ${indexer.name}:`, syncError);
          }
          return false;
        }
      });
      
      const results = await Promise.all(syncPromises);
      const successful = results.filter(r => r).length;
      console.log(`[SYNC CARD] 📊 Synchronisation des indexers terminée: ${successful}/${enabledIndexers.length} réussi(s)`);
      
      // Attendre un peu pour que le backend enregistre les indexers
      if (successful > 0) {
        console.log('[SYNC CARD] ⏳ Attente de 2 secondes pour que le backend enregistre les indexers...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Vérifier que les indexers sont bien enregistrés en les récupérant depuis le backend
        try {
          const verifyResponse = await serverApi.getIndexers();
          if (verifyResponse.success && verifyResponse.data) {
            const enabledCount = verifyResponse.data.filter((idx: Indexer) => idx.isEnabled === true).length;
            console.log(`[SYNC CARD] 🔍 Vérification: ${enabledCount} indexer(s) activé(s) trouvé(s) dans le backend`);
          }
        } catch (err) {
          console.warn('[SYNC CARD] ⚠️ Erreur lors de la vérification des indexers:', err);
        }
      }
    } catch (err) {
      console.warn('[SYNC CARD] ⚠️ Erreur lors de la synchronisation des indexers:', err);
      // Ne pas bloquer si la synchronisation échoue
    }
  };

  const syncTmdbKeyToBackend = async () => {
    try {
      // D'abord, vérifier si une clé TMDB existe déjà dans le backend
      const tmdbResponse = await serverApi.getTmdbKey();
      if (tmdbResponse.success && tmdbResponse.data?.hasKey) {
        console.log('[SYNC CARD] ✅ Clé TMDB déjà configurée dans le backend');
        return;
      }

      // Si pas de clé dans le backend, essayer de la récupérer depuis le cloud
      console.log('[SYNC CARD] 🔄 Tentative de récupération de la clé TMDB depuis le cloud...');
      try {
        const { getUserConfig } = await import('../../../lib/api/popcorn-web.js');
        const cloudConfig = await getUserConfig();
        
        if (cloudConfig?.tmdbApiKey) {
          const { isTmdbKeyMaskedOrInvalid } = await import('../../../lib/utils/tmdb-key.js');
          const cleanedKey = cloudConfig.tmdbApiKey.trim().replace(/\s+/g, '');
          
          if (!isTmdbKeyMaskedOrInvalid(cleanedKey)) {
            console.log('[SYNC CARD] 📥 Clé TMDB trouvée dans le cloud, synchronisation vers le backend...');
            const saveResponse = await serverApi.saveTmdbKey(cleanedKey);
            
            if (saveResponse.success) {
              console.log('[SYNC CARD] ✅ Clé TMDB synchronisée depuis le cloud avec succès');
            } else {
              console.warn('[SYNC CARD] ⚠️ Erreur lors de la synchronisation de la clé TMDB:', saveResponse.message || saveResponse.error);
            }
          } else {
            console.warn('[SYNC CARD] ⚠️ Clé TMDB du cloud masquée ou invalide');
          }
        } else {
          console.log('[SYNC CARD] ℹ️ Aucune clé TMDB dans le cloud');
        }
      } catch (cloudErr) {
        console.warn('[SYNC CARD] ⚠️ Erreur lors de la récupération depuis le cloud:', cloudErr);
      }
    } catch (err) {
      console.warn('[SYNC CARD] ⚠️ Erreur lors de la vérification de la clé TMDB:', err);
    }
  };

  const handleStartSync = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Synchroniser les indexers activés vers le backend Rust avant de démarrer la sync
      console.log('[SYNC CARD] 🔄 Synchronisation des indexers avant démarrage de la sync...');
      await syncIndexersToBackend();
      
      // Vérifier la clé TMDB
      console.log('[SYNC CARD] 🔄 Vérification de la clé TMDB...');
      await syncTmdbKeyToBackend();
      
      // Attendre un peu pour que le backend traite les synchronisations
      console.log('[SYNC CARD] ⏳ Attente de 500ms avant de démarrer la sync...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[SYNC CARD] 🔄 Démarrage de la synchronisation...');
      
      const response = await serverApi.startSync();
      
      console.log('[SYNC CARD] 📥 Réponse de startSync:', {
        success: response.success,
        error: response.error,
        message: response.message,
        fullResponse: response,
      });
      
      if (response.success) {
        // Notification native de démarrage si disponible
        if (typeof window !== 'undefined' && 'notifySyncStart' in window) {
          try {
            await (window as any).notifySyncStart();
          } catch (err) {
            console.warn('Erreur lors de la notification:', err);
          }
        }
        // Rediriger vers la page de synchronisation pour voir la progression
        window.location.href = '/settings/indexers';
      } else {
        // Afficher l'erreur détaillée
        let errorMessage = response.message || response.error || 'Erreur lors du démarrage de la synchronisation';
        
        // Messages d'erreur plus explicites
        if (errorMessage.includes('indexer') || errorMessage.includes('Indexer')) {
          errorMessage = t('sync.noIndexerActivated');
        } else if (errorMessage.includes('TMDB') || errorMessage.includes('tmdb')) {
          errorMessage = t('sync.tmdbTokenMissing');
        }
        
        setError(errorMessage);
        console.error('[SYNC CARD] Erreur lors du démarrage de la sync:', {
          success: response.success,
          error: response.error,
          message: response.message,
          fullResponse: response,
        });
      }
    } catch (err) {
      console.error('[SYNC CARD] Erreur lors du démarrage de la sync:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'films':
        return t('sync.noFilmsSynced');
      case 'series':
        return t('sync.noSeriesSynced');
      default:
        return t('sync.noTorrentsSynced');
    }
  };

  const getDescription = () => {
    switch (type) {
      case 'films':
        return t('sync.startSyncDescription');
      case 'series':
        return t('sync.startSyncSeriesDescription');
      default:
        return t('sync.startSyncAllDescription');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 pb-12">
      <div className="max-w-2xl w-full">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border-2 border-gray-700 shadow-2xl">
          <div className="text-center mb-6">
            <div className="mb-4 flex justify-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center border-2 border-blue-500/50">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-10 w-10 text-blue-400" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                  />
                </svg>
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-3">
              {getTitle()}
            </h2>
            
            <p className="text-gray-400 text-lg mb-6">
              {getDescription()}
            </p>
          </div>

          {error && (
            <div className="alert alert-error mb-6 animate-fade-in">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <span>{error}</span>
                {(error.includes('indexer') || error.includes('configurer')) && !error.includes('TMDB') && (
                  <div className="mt-2">
                    <a href="/settings/indexers" className="link link-hover text-sm underline">
                      {t('sync.goToSyncSettings')}
                    </a>
                  </div>
                )}
                {(error.includes('TMDB') || error.includes('tmdb') || error.includes('clé')) && (
                  <div className="mt-3">
                    <a href="/settings/indexers" className="btn btn-sm btn-primary">
                      {t('sync.configureTmdbKey')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleStartSync}
              disabled={loading}
              className="btn btn-primary btn-lg px-8"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  {t('sync.starting')}
                </>
              ) : (
                <>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-5 w-5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                    />
                  </svg>
                  {t('sync.startSync')}
                </>
              )}
            </button>
            
            <a
              href="/settings/indexers"
              className="btn btn-outline btn-lg px-8"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
                />
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                />
              </svg>
              {t('sync.configureIndexers')}
            </a>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-gray-500 text-sm text-center">
              {t('sync.syncInfo')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
