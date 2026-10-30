import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { getUserConfig } from '../../../lib/api/popcorn-web';
import type { SetupStatus } from '../../../lib/client/types';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';
import { useI18n } from '../../../lib/i18n';
import { StepHeader, StepLoading, Alert, Spinner, IconArrowLeft, IconArrowRight } from '../wizardUi';
import { isLocalAccountSetupEnabled } from '../../../lib/setup/local-account-setup';

/** Microsoft Store edition: the TMDB key is optional (it can be added later in Settings → Library). */
const TMDB_KEY_OPTIONAL = isLocalAccountSetupEnabled();

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
      <div>
        <StepHeader kicker="Métadonnées" title="Configuration de la clé API TMDB" />
        <StepLoading />
      </div>
    );
  }

  const hasExistingKey = setupStatus?.hasTmdbKey || (tmdbKey && (tmdbKey.includes('*') || tmdbKey.includes('...')));

  return (
    <div>
      <StepHeader
        kicker={TMDB_KEY_OPTIONAL ? t('wizard.tmdb.storeKicker') : "Métadonnées"}
        title={TMDB_KEY_OPTIONAL ? t('wizard.tmdb.storeTitle') : "Configuration de la clé API TMDB"}
        lead={
          TMDB_KEY_OPTIONAL
            ? t('wizard.tmdb.storeLead')
            : "Le token TMDB permet d'enrichir automatiquement les torrents avec des métadonnées (synopsis, date de sortie, genres, note, etc.)."
        }
      />

      <div class="wz-stack">
      {hasExistingKey ? (
        <Alert tone="success">Clé API TMDB configurée</Alert>
      ) : (
        TMDB_KEY_OPTIONAL ? (
          <Alert tone="info">{t('wizard.tmdb.storeOptionalHint')}</Alert>
        ) : (
          <Alert tone="warning">Clé API TMDB obligatoire — configurez-en une pour continuer.</Alert>
        )
      )}

      <div>
        <a
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          class="wz-link wz-link--accent"
        >
          Obtenir une clé API TMDB gratuite ↗
        </a>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {success && <Alert tone="success">{success}</Alert>}

      {cloudKeyWarning && <Alert tone="warning">{cloudKeyWarning}</Alert>}

      <div class="wz-panel">
        <label class="wz-label" for="wz-tmdb-key">
          Clé API TMDB
        </label>
        <div class="wz-input-row">
          <input
            id="wz-tmdb-key"
            type="password"
            autoComplete="new-password"
            class="wz-input wz-input--mono"
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
              setTmdbKey((prev) =>
                prev.includes('*') || prev.includes('...') ? '' : prev
              );
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
            type="button"
            class="wz-btn wz-btn--ghost"
            data-focusable
            onClick={handleSave}
            disabled={saving || !tmdbKey.trim() || tmdbKey.includes('*') || tmdbKey.includes('...')}
          >
            {saving ? (
              <>
                <Spinner />
                Sauvegarde...
              </>
            ) : (
              hasExistingKey ? 'Remplacer' : 'Sauvegarder'
            )}
          </button>
        </div>
        {hasExistingKey && (
          <p class="wz-help">
            Une clé est déjà configurée. Entrez une nouvelle clé complète pour la remplacer.
          </p>
        )}
      </div>
      </div>

      <div class="wz-actions">
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          type="button"
          class="wz-btn wz-btn--ghost"
          data-focusable
          onClick={onPrevious}
        >
          <IconArrowLeft />
          Précédent
        </button>
        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          type="button"
          class="wz-btn wz-btn--primary"
          data-focusable
          onClick={onNext}
          disabled={!hasExistingKey && !TMDB_KEY_OPTIONAL}
          title={!hasExistingKey && !TMDB_KEY_OPTIONAL ? 'Configurez une clé TMDB pour continuer' : undefined}
        >
          {!hasExistingKey && TMDB_KEY_OPTIONAL ? t('wizard.tmdb.skipForNow') : 'Suivant'}
          <IconArrowRight />
        </button>
      </div>
    </div>
  );
}


