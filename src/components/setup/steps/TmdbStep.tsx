import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { getUserConfig } from '../../../lib/api/popcorn-web';
import type { SetupStatus } from '../../../lib/client/types';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';
import { useI18n } from '../../../lib/i18n';

interface TmdbStepProps {
  setupStatus: SetupStatus | null;
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
  onSave: (key: string) => Promise<void>;
  onStatusChange?: () => void;
}

export function TmdbStep({
  setupStatus,
  focusedButtonIndex,
  buttonRefs,
  onPrevious,
  onNext,
  onSave,
  onStatusChange,
}: TmdbStepProps) {
  const { t } = useI18n();
  const [tmdbKey, setTmdbKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudKeyWarning, setCloudKeyWarning] = useState<string | null>(null);
  const [isUserEditing, setIsUserEditing] = useState(false); // Pour savoir si l'utilisateur modifie la clé manuellement
  const isUserEditingRef = useRef(false); // Ref pour accès synchrone à l'état d'édition

  const maskKeyPreview = (key: string) =>
    key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****';

  useEffect(() => {
    loadTmdbKey();
  }, []);

  // La clé peut être importée en arrière-plan depuis AuthStep via CloudImportManager.
  // On re-tente quelques fois si aucune clé n'est trouvée (évite l'impression "rien ne se passe").
  useEffect(() => {
    if (loading) return;
    // Ne pas vérifier si l'utilisateur est en train de modifier la clé manuellement
    if (isUserEditing) return;
    // Arrêter si on a déjà une clé masquée (contient ... ou *)
    if (tmdbKey && (tmdbKey.includes('...') || tmdbKey.includes('*'))) {
      return;
    }
    // Arrêter si l'utilisateur a saisi une clé valide (longueur > 20 caractères et pas de masquage)
    if (tmdbKey && tmdbKey.length > 20 && !tmdbKey.includes('*') && !tmdbKey.includes('...')) {
      return; // L'utilisateur a probablement saisi une clé valide, ne pas la réinitialiser
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10; // ~20s (10 * 2s) - réduit pour éviter trop de requêtes
    let cloudKeyChecked = false; // Pour éviter de vérifier le cloud plusieurs fois

    const interval = setInterval(async () => {
      if (cancelled) return;
      // Vérifier la ref pour un accès synchrone
      if (isUserEditingRef.current || isUserEditing) {
        clearInterval(interval);
        return;
      }
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await serverApi.getTmdbKey();
        if (res.success && res.data?.hasKey && res.data.apiKey) {
          // Vérifier que la clé retournée n'est pas masquée
          if (!isTmdbKeyMaskedOrInvalid(res.data.apiKey)) {
            // Ne pas réinitialiser si l'utilisateur est en train de modifier
            if (!isUserEditing) {
              setTmdbKey(res.data.apiKey);
              setCloudKeyWarning(null); // Effacer l'avertissement si la clé est maintenant dans le backend
              onStatusChange?.();
              clearInterval(interval);
            }
          } else {
            // Clé masquée dans le backend, arrêter les tentatives
            clearInterval(interval);
          }
        } else {
          // Si pas de clé dans le backend, vérifier dans le cloud (une seule fois)
          if (!cloudKeyChecked && !isUserEditing) {
            cloudKeyChecked = true;
            try {
              const cloudConfig = await getUserConfig();
              if (cloudConfig?.tmdbApiKey) {
                // Vérifier si la clé du cloud est masquée ou invalide
                if (isTmdbKeyMaskedOrInvalid(cloudConfig.tmdbApiKey)) {
                  // Clé masquée dans le cloud, arrêter les tentatives
                  const masked = maskKeyPreview(cloudConfig.tmdbApiKey);
                  if (!isUserEditing) {
                    setTmdbKey(masked);
                    setCloudKeyWarning('Une clé TMDB existe dans votre compte cloud mais n\'a pas pu être importée (clé invalide). Entrez une nouvelle clé v3 valide pour la remplacer.');
                  }
                  clearInterval(interval);
                } else if (!tmdbKey || !tmdbKey.includes('...')) {
                  // Clé valide dans le cloud, tenter l'import immédiatement
                  try {
                    await serverApi.saveTmdbKey(cloudConfig.tmdbApiKey.trim().replace(/\s+/g, ''));
                    if (!isUserEditing) {
                      setTmdbKey(maskKeyPreview(cloudConfig.tmdbApiKey));
                      setCloudKeyWarning(null);
                      onStatusChange?.();
                    }
                    clearInterval(interval);
                  } catch (saveErr) {
                    console.warn('[TMDB] Échec import clé depuis le cloud:', saveErr);
                  }
                }
              } else {
                // Pas de clé dans le cloud, arrêter après quelques tentatives
                if (attempts >= 5) {
                  clearInterval(interval);
                }
              }
            } catch {
              // ignore
            }
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
  }, [loading, tmdbKey, isUserEditing]);

  const loadTmdbKey = async () => {
    try {
      setLoading(true);
      // D'abord, essayer de charger depuis le backend local
      const response = await serverApi.getTmdbKey();
      if (response.success && response.data?.hasKey && response.data.apiKey) {
        // Afficher la clé masquée pour indiquer qu'une clé existe
        setTmdbKey(response.data.apiKey);
        setCloudKeyWarning(null);
      } else {
        // Si pas de clé dans le backend local, vérifier dans le cloud
        try {
          const cloudConfig = await getUserConfig();
          if (cloudConfig?.tmdbApiKey) {
            // Vérifier si la clé du cloud est masquée ou invalide
            if (isTmdbKeyMaskedOrInvalid(cloudConfig.tmdbApiKey)) {
              // Créer une version masquée de la clé cloud pour l'affichage
              const masked = maskKeyPreview(cloudConfig.tmdbApiKey);
              setTmdbKey(masked);
              setCloudKeyWarning('Une clé TMDB existe dans votre compte cloud mais n\'a pas pu être importée (clé invalide). Entrez une nouvelle clé v3 valide pour la remplacer.');
            } else {
              // Clé valide dans le cloud, importer si le backend local n'en a pas
              try {
                await serverApi.saveTmdbKey(cloudConfig.tmdbApiKey.trim().replace(/\s+/g, ''));
                setTmdbKey(maskKeyPreview(cloudConfig.tmdbApiKey));
                setCloudKeyWarning(null);
                onStatusChange?.();
              } catch (saveErr) {
                console.warn('[TMDB] Échec import clé depuis le cloud:', saveErr);
              }
            }
            // Si la clé est valide et importée, on affiche un preview masqué
          }
        } catch (cloudErr) {
          // Ignorer les erreurs de récupération cloud (CORS, etc.)
          console.log('[TMDB] Impossible de récupérer la clé depuis le cloud:', cloudErr);
        }
      }
    } catch (err) {
      console.error('Erreur lors du chargement de la clé TMDB:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tmdbKey.trim()) {
      setError('Veuillez entrer une clé API TMDB');
      return;
    }

    // Si c'est une clé masquée (contient des * ou ...), ne pas sauvegarder
    if (tmdbKey.includes('*') || tmdbKey.includes('...')) {
      setError('Veuillez entrer une nouvelle clé API TMDB complète');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await onSave(tmdbKey);
      setSuccess('Clé TMDB sauvegardée avec succès');
      isUserEditingRef.current = false;
      setIsUserEditing(false);
      // Ne pas recharger la clé après sauvegarde - elle vient d'être sauvegardée avec succès
      // Afficher simplement la clé masquée pour indiquer qu'elle est configurée
      const savedKeyPreview = tmdbKey.length > 8 
        ? `${tmdbKey.substring(0, 4)}...${tmdbKey.substring(tmdbKey.length - 4)}`
        : '****';
      setTmdbKey(savedKeyPreview);
      setCloudKeyWarning(null); // Effacer l'avertissement
      // Mettre à jour le statut du setup (comme dans IndexersStep)
      await Promise.resolve(onStatusChange?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      isUserEditingRef.current = false;
      setIsUserEditing(false); // Réactiver les vérifications en cas d'erreur
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const hasExistingKey = setupStatus?.hasTmdbKey || (tmdbKey && (tmdbKey.includes('*') || tmdbKey.includes('...')));

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de la clé API TMDB</h3>
      
      {hasExistingKey ? (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Clé API TMDB configurée</span>
        </div>
      ) : (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Clé API TMDB obligatoire — configurez-en une pour continuer.</span>
        </div>
      )}

      <p className="text-gray-400">
        Le token TMDB permet d'enrichir automatiquement les torrents avec des métadonnées
        (synopsis, date de sortie, genres, note, etc.).
      </p>

      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-500 transition-colors"
        >
          Obtenir une clé API TMDB gratuite →
        </a>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>{success}</span>
        </div>
      )}

      {cloudKeyWarning && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300">
          <span>⚠️ {cloudKeyWarning}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          Clé API TMDB
        </label>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="password"
            className="w-full sm:flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            placeholder={hasExistingKey ? "Entrez une nouvelle clé pour remplacer" : "Entrez votre clé API TMDB"}
            value={tmdbKey}
            onInput={(e) => {
              isUserEditingRef.current = true;
              setIsUserEditing(true);
              setTmdbKey((e.target as HTMLInputElement).value);
            }}
            onFocus={() => {
              isUserEditingRef.current = true;
              setIsUserEditing(true);
            }}
            onBlur={() => {
              // Ne pas réactiver les vérifications automatiques si l'utilisateur a saisi une clé valide
              if (tmdbKey && tmdbKey.length > 20 && !tmdbKey.includes('*') && !tmdbKey.includes('...')) {
                // L'utilisateur a saisi une clé valide, ne pas réactiver les vérifications
                // Elles seront réactivées après sauvegarde
                return;
              }
              // Attendre un peu avant de réactiver les vérifications automatiques
              setTimeout(() => {
                // Ne réactiver que si la clé n'est pas valide (masquée ou trop courte)
                if (!tmdbKey || tmdbKey.length < 20 || tmdbKey.includes('*') || tmdbKey.includes('...')) {
                  isUserEditingRef.current = false;
                  setIsUserEditing(false);
                }
              }, 3000);
            }}
            disabled={saving}
          />
          <button
            ref={(el) => { buttonRefs.current[0] = el; }}
            className="w-full sm:w-auto whitespace-nowrap px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || !tmdbKey.trim() || tmdbKey.includes('*') || tmdbKey.includes('...')}
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Sauvegarde...
              </>
            ) : (
              hasExistingKey ? 'Remplacer' : 'Sauvegarder'
            )}
          </button>
        </div>
        {hasExistingKey && (
          <p className="text-sm text-gray-500">
            Une clé est déjà configurée. Entrez une nouvelle clé complète pour la remplacer.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-4 mt-8">
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onPrevious}
        >
          ← Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onNext}
          disabled={!hasExistingKey}
          title={!hasExistingKey ? 'Configurez une clé TMDB pour continuer' : undefined}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
