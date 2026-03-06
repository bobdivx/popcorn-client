import { useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { PreferencesManager } from '../../../lib/client/storage';
import { TokenManager } from '../../../lib/client/storage';
import { saveUserConfigMerge } from '../../../lib/api/popcorn-web';
import type { IndexerFormData } from '../../../lib/client/types';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';

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

  const saveTmdbKey = async (key: string): Promise<{ success: true } | { success: false; message: string }> => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const cleanedKey = key.trim().replace(/\s+/g, '');
      if (isTmdbKeyMaskedOrInvalid(key)) {
        const msg = 'Veuillez entrer une clé API TMDB complète (32 caractères), pas une valeur masquée.';
        setError(msg);
        return { success: false, message: msg };
      }
      const response = await serverApi.saveTmdbKey(cleanedKey);
      if (response.success) {
        setSuccess('Clé TMDB sauvegardée avec succès');
        // Pousser la clé vers le cloud si l'utilisateur est connecté
        const cloudToken = TokenManager.getCloudAccessToken();
        if (cloudToken) {
          try {
            await saveUserConfigMerge({ tmdbApiKey: cleanedKey }, cloudToken);
          } catch (cloudErr) {
            console.warn('[WIZARD] ⚠️ Impossible de synchroniser la clé TMDB vers le cloud:', cloudErr);
          }
        }
        return { success: true };
      } else {
        const msg = response.message || 'Erreur lors de la sauvegarde de la clé TMDB';
        setError(msg);
        return { success: false, message: msg };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      return { success: false, message: msg };
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
        const cloudToken = TokenManager.getCloudAccessToken();
        if (cloudToken) {
          console.log('[WIZARD] 💾 Sauvegarde de la configuration dans popcorn-web...');
          try {
            const { getBackendUrl } = await import('../../../lib/backend-config');
            const [indexersRes, tmdbRes, syncRes] = await Promise.all([
              serverApi.getIndexers(),
              serverApi.getTmdbKeyExport(),
              serverApi.getSyncSettings(),
            ]);

            const indexers = indexersRes.success && Array.isArray(indexersRes.data)
              ? indexersRes.data.map((idx: any) => ({
                  id: idx.id,
                  name: idx.name,
                  baseUrl: idx.baseUrl,
                  apiKey: idx.apiKey ?? null,
                  jackettIndexerName: idx.jackettIndexerName ?? null,
                  isEnabled: idx.isEnabled,
                  isDefault: idx.isDefault,
                  priority: idx.priority ?? 0,
                  indexerTypeId: idx.indexerTypeId ?? null,
                  configJson: idx.configJson ?? null,
                }))
              : [];

            const rawTmdb = tmdbRes.success && tmdbRes.data?.apiKey ? tmdbRes.data.apiKey : null;
            const tmdbApiKey = rawTmdb && !isTmdbKeyMaskedOrInvalid(rawTmdb) ? rawTmdb : null;

            let syncSettings: any = null;
            if (syncRes.success && syncRes.data) {
              const s = syncRes.data;
              syncSettings = {
                syncEnabled: s.is_enabled === 1 || s.is_enabled === true,
                syncFrequencyMinutes: s.sync_frequency_minutes,
                maxTorrentsPerCategory: s.max_torrents_per_category,
                rssIncrementalEnabled: s.rss_incremental_enabled === 1 || s.rss_incremental_enabled === true,
                syncQueriesFilms: Array.isArray(s.sync_queries_films) ? s.sync_queries_films : undefined,
                syncQueriesSeries: Array.isArray(s.sync_queries_series) ? s.sync_queries_series : undefined,
              };
            }

            let indexerCategories: Record<string, { enabled: boolean; genres?: number[] }> | null = null;
            try {
              if (indexers.length > 0) {
                const categoriesMap: Record<string, { enabled: boolean; genres?: number[] }> = {};
                for (const indexer of indexers) {
                  if (indexer.id) {
                    try {
                      const categoriesResponse = await serverApi.getIndexerCategories(indexer.id);
                      if (categoriesResponse.success && categoriesResponse.data) {
                        categoriesMap[indexer.id] = categoriesResponse.data;
                      }
                    } catch {
                      // ignore
                    }
                  }
                }
                if (Object.keys(categoriesMap).length > 0) indexerCategories = categoriesMap;
              }
            } catch {
              // ignore
            }

            const downloadLocation = PreferencesManager.getDownloadLocation();
            const prefLang = PreferencesManager.getPreferences().language;
            const language = prefLang === 'fr' || prefLang === 'en' ? prefLang : null;

            const saveResult = await saveUserConfigMerge({
              backendUrl: getBackendUrl() || null,
              indexers,
              tmdbApiKey,
              downloadLocation: downloadLocation || null,
              language,
              syncSettings,
              indexerCategories: indexerCategories ?? undefined,
            });

            if (saveResult?.success) {
              console.log('[WIZARD] ✅ Configuration sauvegardée dans popcorn-web');
            } else {
              console.warn('[WIZARD] ⚠️ Impossible de sauvegarder la configuration:', saveResult?.message);
            }
          } catch (saveError) {
            console.error('[WIZARD] ❌ Erreur lors de la sauvegarde de la configuration:', saveError);
          }
        } else {
          console.warn('[WIZARD] ⚠️ Pas de token cloud, impossible de sauvegarder la configuration');
        }
      }

      // Démarrer automatiquement la synchronisation des torrents après le setup
      // Ne pas attendre la fin - CompleteStep affichera la progression et l'utilisateur pourra choisir
      console.log('[WIZARD] 🚀 Démarrage automatique de la synchronisation des torrents...');
      const syncResponse = await serverApi.startSync();
      if (syncResponse.success) {
        console.log('[WIZARD] ✅ Synchronisation démarrée avec succès');
        console.log('[WIZARD] ℹ️ La progression sera affichée dans CompleteStep');
        // Ne pas attendre la fin ici - CompleteStep gérera l'affichage de la progression
        // L'utilisateur pourra voir la synchronisation en cours et choisir d'attendre ou d'accéder au dashboard
      } else {
        console.warn('[WIZARD] ⚠️ Impossible de démarrer la synchronisation:', syncResponse.message);
        // Ne pas bloquer si la sync ne démarre pas
      }
    } catch (error) {
      console.error('[WIZARD] ❌ Erreur lors du démarrage de la synchronisation:', error);
      // Ne pas bloquer en cas d'erreur
    }
    
    // Ne pas rediriger automatiquement - CompleteStep gérera la redirection
    // L'utilisateur pourra voir la synchronisation en cours et choisir quand accéder au dashboard
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
