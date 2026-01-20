import { useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { PreferencesManager } from '../../../lib/client/storage';
import { TokenManager } from '../../../lib/client/storage';
import { saveUserConfig } from '../../../lib/api/popcorn-web';
import type { IndexerFormData } from '../../../lib/client/types';

export function useWizardActions() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const saveIndexer = async (data: IndexerFormData) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.createIndexer(data);
      if (response.success) {
        setSuccess('Indexer créé avec succès');
        return true;
      } else {
        setError(response.message || 'Erreur lors de la création de l\'indexer');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTmdbKey = async (key: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.saveTmdbKey(key);
      if (response.success) {
        setSuccess('Clé TMDB sauvegardée avec succès');
        return true;
      } else {
        setError(response.message || 'Erreur lors de la sauvegarde de la clé TMDB');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDownloadLocation = async (path: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Sauvegarder côté client uniquement
      PreferencesManager.setDownloadLocation(path);
      setSuccess('Emplacement de téléchargement sauvegardé');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeSetup = async (saveToCloud: boolean = false) => {
    try {
      // Sauvegarder la configuration dans popcorn-web si demandé
      if (saveToCloud) {
        // Utiliser le token cloud pour sauvegarder dans popcorn-web
        const cloudToken = TokenManager.getCloudAccessToken();
        if (cloudToken) {
          console.log('[WIZARD] 💾 Sauvegarde de la configuration dans popcorn-web...');
          
          try {
            // Récupérer la configuration complète via l'API (utiliser le token local pour l'API locale)
            const localToken = TokenManager.getAccessToken();
            const configResponse = await fetch('/api/v1/setup/export-config', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${localToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (configResponse.ok) {
              const configData = await configResponse.json();
              
              if (configData.success && configData.data) {
                // Récupérer les catégories d'indexers depuis le backend
                let indexerCategories: Record<string, { enabled: boolean; genres?: number[] }> | null = null;
                try {
                  if (configData.data.indexers && Array.isArray(configData.data.indexers)) {
                    const categoriesMap: Record<string, { enabled: boolean; genres?: number[] }> = {};
                    for (const indexer of configData.data.indexers) {
                      if (indexer.id) {
                        try {
                          const categoriesResponse = await serverApi.getIndexerCategories(indexer.id);
                          if (categoriesResponse.success && categoriesResponse.data) {
                            categoriesMap[indexer.id] = categoriesResponse.data;
                          }
                        } catch (catError) {
                          console.warn(`[WIZARD] ⚠️ Impossible de récupérer les catégories pour ${indexer.name}:`, catError);
                        }
                      }
                    }
                    if (Object.keys(categoriesMap).length > 0) {
                      indexerCategories = categoriesMap;
                    }
                  }
                } catch (catError) {
                  console.warn('[WIZARD] ⚠️ Erreur lors de la récupération des catégories:', catError);
                }
                
                // Sauvegarder dans popcorn-web (saveUserConfig utilise maintenant automatiquement le token cloud)
                const saveResult = await saveUserConfig({
                  indexers: configData.data.indexers || [],
                  tmdbApiKey: configData.data.tmdbApiKey || null,
                  downloadLocation: configData.data.downloadLocation || null,
                  syncSettings: configData.data.syncSettings || null,
                  indexerCategories: indexerCategories,
                });

                if (saveResult?.success) {
                  console.log('[WIZARD] ✅ Configuration sauvegardée dans popcorn-web');
                } else {
                  console.warn('[WIZARD] ⚠️ Impossible de sauvegarder la configuration:', saveResult?.message);
                  // Ne pas bloquer si la sauvegarde échoue
                }
              } else {
                console.warn('[WIZARD] ⚠️ Impossible de récupérer la configuration complète');
              }
            } else {
              console.warn('[WIZARD] ⚠️ Erreur lors de la récupération de la configuration:', configResponse.status);
            }
          } catch (saveError) {
            console.error('[WIZARD] ❌ Erreur lors de la sauvegarde de la configuration:', saveError);
            // Ne pas bloquer si la sauvegarde échoue
          }
        } else {
          console.warn('[WIZARD] ⚠️ Pas de token cloud, impossible de sauvegarder la configuration');
        }
      }

      // Démarrer automatiquement la synchronisation des torrents après le setup
      console.log('[WIZARD] 🚀 Démarrage automatique de la synchronisation des torrents...');
      const syncResponse = await serverApi.startSync();
      if (syncResponse.success) {
        console.log('[WIZARD] ✅ Synchronisation démarrée avec succès');
        
        // Attendre que la synchronisation soit terminée
        console.log('[WIZARD] ⏳ Attente de la fin de la synchronisation...');
        await waitForSyncComplete();
        console.log('[WIZARD] ✅ Synchronisation terminée');
      } else {
        console.warn('[WIZARD] ⚠️ Impossible de démarrer la synchronisation:', syncResponse.message);
        // Ne pas bloquer la redirection si la sync ne démarre pas
      }
    } catch (error) {
      console.error('[WIZARD] ❌ Erreur lors du démarrage de la synchronisation:', error);
      // Ne pas bloquer la redirection en cas d'erreur
    }
    
    // Rediriger vers le dashboard
    window.location.href = '/dashboard';
  };

  /**
   * Attend que la synchronisation soit terminée en vérifiant régulièrement le statut
   */
  const waitForSyncComplete = async (): Promise<void> => {
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes maximum
    const checkInterval = 2000; // Vérifier toutes les 2 secondes
    const startTime = Date.now();
    let lastLogTime = 0;
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const statusResponse = await serverApi.getSyncStatus();
        
        if (statusResponse.success && statusResponse.data) {
          const syncInProgress = statusResponse.data.sync_in_progress;
          
          if (!syncInProgress) {
            // La synchronisation est terminée
            console.log('[WIZARD] ✅ Synchronisation terminée');
            return;
          }
          
          // Afficher un log toutes les 10 secondes pour indiquer que ça avance
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          if (elapsed - lastLogTime >= 10) {
            console.log(`[WIZARD] ⏳ Synchronisation en cours... (${elapsed}s)`);
            lastLogTime = elapsed;
          }
        }
      } catch (error) {
        console.warn('[WIZARD] ⚠️ Erreur lors de la vérification du statut de synchronisation:', error);
        // Continuer à attendre même en cas d'erreur
      }
      
      // Attendre avant de vérifier à nouveau
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Si on arrive ici, on a dépassé le temps maximum
    console.warn('[WIZARD] ⚠️ Timeout: La synchronisation prend plus de 5 minutes, redirection vers le dashboard');
  };

  return {
    saving,
    error,
    success,
    setError,
    setSuccess,
    saveIndexer,
    saveTmdbKey,
    saveDownloadLocation,
    completeSetup,
  };
}
