import { useEffect, useRef, useState } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
import { useWizardSteps, getNextStepNumberAfterWelcome } from './hooks/useWizardSteps';
import type { WizardStepId } from './hooks/useWizardSteps';
import { StepIndicator } from './components/StepIndicator';
import { useI18n } from '../../lib/i18n';
import { DisclaimerStep } from './steps/DisclaimerStep';
import { ServerUrlStep } from './steps/ServerUrlStep';
import { LanguageStep } from './steps/LanguageStep';
import { AuthStep } from './steps/AuthStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { IndexersStep } from './steps/IndexersStep';
import { TmdbStep } from './steps/TmdbStep';
import { DownloadLocationStep } from './steps/DownloadLocationStep';
import { SyncStep } from './steps/SyncStep';
import { CompleteStep } from './steps/CompleteStep';
import { hasBackendUrl } from '../../lib/backend-config.js';
import { serverApi } from '../../lib/client/server-api';
import { PreferencesManager, TokenManager } from '../../lib/client/storage';
import { redirectTo } from '../../lib/utils/navigation.js';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

export default function Wizard() {
  const { t } = useI18n();
  const { loading, setupStatus, checkSetupStatus } = useSetupStatus();
  const [forceShowStepIds, setForceShowStepIds] = useState<WizardStepId[]>([]);
  const [pendingNavStepId, setPendingNavStepId] = useState<WizardStepId | null>(null);
  const initialNeedsSetupRef = useRef<boolean | null>(null);
  // Garder en state pour que useWizardSteps garde toutes les étapes (évite liste minimale → redirection au milieu du wizard)
  const [wizardStartedWithNeedsSetup, setWizardStartedWithNeedsSetup] = useState(false);

  // ?force=1 = accès depuis "Configuration initiale" dans paramètres → afficher toutes les étapes
  const forceAllSteps = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';

  const { steps, totalSteps, getStepNumber, getStepId, getNextStepNumber, getPreviousStepNumber } = useWizardSteps(setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup);
  const {
    currentStep,
    setCurrentStep,
    focusedButtonIndex,
    setFocusedButtonIndex,
    buttonRefs,
  } = useWizardNavigation(setupStatus, getStepId, getStepNumber, getNextStepNumber, getPreviousStepNumber);

  const {
    saving,
    error,
    success,
    setError,
    setSuccess,
    saveIndexer,
    saveTmdbKey,
    saveDownloadLocation,
    completeSetup,
  } = useWizardActions();

  const ensureTmdbStepIfMissing = async (): Promise<boolean> => {
    try {
      const res = await serverApi.getTmdbKey();
      const hasKey = !!(res.success && res.data?.hasKey);
      if (!hasKey) {
        setForceShowStepIds((prev) => (prev.includes('tmdb') ? prev : [...prev, 'tmdb']));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  // Signaler que l'app a rendu (masquer l'écran de chargement initial, évite écran noir webOS)
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('popcorn-app-ready')), 100);
    return () => clearTimeout(t);
  }, []);

  // Navigation "forcée" vers une étape potentiellement masquée (édition post-import cloud)
  useEffect(() => {
    if (!pendingNavStepId) return;
    const stepNumber = getStepNumber(pendingNavStepId);
    if (stepNumber !== null) {
      setCurrentStep(stepNumber);
      setPendingNavStepId(null);
    }
  }, [pendingNavStepId, getStepNumber, setCurrentStep]);

  // Capturer l'état initial du setup au moment où on entre dans le wizard.
  // Important: si on est ici parce que le setup est requis, ne pas auto-rediriger en plein wizard
  // dès qu'une action (ex: ajout indexer) fait passer needsSetup -> false.
  // On met aussi en state pour que useWizardSteps ne passe pas à la liste minimale d'étapes.
  useEffect(() => {
    if (initialNeedsSetupRef.current !== null) return;
    if (loading || !setupStatus) return;
    const needsSetup = setupStatus.needsSetup;
    initialNeedsSetupRef.current = needsSetup;
    setWizardStartedWithNeedsSetup(needsSetup);
  }, [loading, setupStatus]);

  // Vérifier si l'utilisateur doit être redirigé vers /login
  // Si le setup est complet (needsSetup === false et hasUsers === true), rediriger
  // SAUF si ?force=1 : accès explicite (ex. "Configuration initiale" depuis paramètres) → garder le wizard
  useEffect(() => {
    const checkAndRedirect = async () => {
      // Si l'URL backend n'est pas configurée, on reste sur le wizard
      if (!hasBackendUrl()) {
        return;
      }

      // Si le setupStatus n'est pas encore chargé, attendre
      if (loading || !setupStatus) {
        return;
      }

      // Accès explicite au wizard (ex. "Configuration initiale" depuis /settings) : ne pas rediriger
      const forceWizard = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';
      if (forceWizard) {
        return;
      }

      // Si le backend est accessible ET que le setup est complet (needsSetup === false et hasUsers === true)
      // rediriger vers /login ou /dashboard selon l'état d'authentification
      if (setupStatus.backendReachable && setupStatus.needsSetup === false && setupStatus.hasUsers === true) {
        // Ne jamais rediriger quand l'utilisateur est au milieu du wizard (ex: vient d'ajouter un indexer,
        // ou sur Bienvenue juste après l'import cloud qui a rempli indexers/TMDB/download).
        const currentStepId = getStepId(currentStep);
        const middleSteps: WizardStepId[] = ['welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync'];
        if (currentStepId && middleSteps.includes(currentStepId)) {
          return;
        }
        // Si on a démarré ici parce qu'on avait besoin du setup, ne pas rediriger automatiquement.
        if (initialNeedsSetupRef.current === true) {
          return;
        }
        // Vérifier aussi si l'utilisateur est déjà authentifié
        if (serverApi.isAuthenticated()) {
          redirectTo('/dashboard');
        } else {
          redirectTo('/login');
        }
      }
    };

    checkAndRedirect();
  }, [loading, setupStatus, currentStep, getStepId]);

  // Désactiver le polling automatique - le statut sera rafraîchi manuellement après les actions
  // (suppression du polling pour éviter les rafraîchissements inutiles)
  // Le statut est déjà vérifié au chargement initial via useSetupStatus

  // Déclarer Footer et ses dépendances avant les premiers return
  const appVersion = (() => {
    try {
      return ((import.meta as any).env?.PUBLIC_APP_VERSION as string) || 'dev';
    } catch {
      return 'dev';
    }
  })();

  const appVersionCode = (() => {
    try {
      const raw = (import.meta as any).env?.PUBLIC_APP_VERSION_CODE as string | undefined;
      return raw ? String(raw) : '';
    } catch {
      return '';
    }
  })();

  const openDiagnostics = () => {
    try {
      redirectTo('/settings/diagnostics');
    } catch {
      // ignore
    }
  };

  const Footer = () => (
    <div className="mt-8 flex flex-col items-center gap-3">
      <button className="btn btn-outline btn-sm" type="button" onClick={openDiagnostics}>
        Ouvrir diagnostics
      </button>
      <div className="text-xs text-gray-400">
        Version&nbsp;<span className="text-gray-200 font-mono">{appVersion}</span>
        {appVersionCode ? (
          <>
            &nbsp;•&nbsp;build&nbsp;<span className="text-gray-200 font-mono">{appVersionCode}</span>
          </>
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black">
        <div className="text-center">
          <HLSLoadingSpinner size="lg" text="Chargement..." />
        </div>
      </div>
    );
  }

  // Premier lancement: aucune URL backend -> on affiche directement l'étape URL
  // (sans exiger setupStatus, car il ne peut pas être chargé sans backend).
  if (!hasBackendUrl()) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="w-full max-w-5xl glass-panel-lg rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-10 lg:p-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 sm:mb-3 text-center">
            {t('wizard.serverUrl.step1FirstTimeTitle')}
          </h2>
          <p className="text-gray-400 text-sm sm:text-base text-center mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto">
            {t('wizard.serverUrl.step1FirstTimeSubtitle')}
          </p>

          <StepIndicator currentStep={1} totalSteps={1} stepLabels={['Serveur']} />

          <ServerUrlStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onStatusChange={checkSetupStatus}
            onNext={async () => {
              // Rafraîchir le statut après configuration de l'URL
              await checkSetupStatus();
              
              // Vérifier le statut mis à jour pour déterminer la prochaine étape
              const updatedStatus = await serverApi.getSetupStatus();
              if (updatedStatus.success && updatedStatus.data) {
                // Si le backend est déjà complètement configuré, rediriger
                if (updatedStatus.data.backendReachable && updatedStatus.data.needsSetup === false && updatedStatus.data.hasUsers === true && !forceAllSteps) {
                  if (serverApi.isAuthenticated()) {
                    redirectTo('/dashboard');
                  } else {
                    redirectTo('/login');
                  }
                  return;
                }
                
                // Passer à la prochaine étape (ou continuer si ?force=1)
                // Le hook useWizardSteps va recalculer les étapes avec le nouveau statut
                const nextStepNumber = getNextStepNumber('serverUrl');
                if (nextStepNumber) {
                  setCurrentStep(nextStepNumber);
                }
              } else {
                // Si la vérification échoue, essayer quand même de passer à l'étape suivante
                const nextStepNumber = getNextStepNumber('serverUrl');
                if (nextStepNumber) {
                  setCurrentStep(nextStepNumber);
                }
              }
            }}
          />

          <Footer />
        </div>
      </div>
    );
  }

  if (!setupStatus) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl border border-primary-600 p-6">
          <div className="p-4 bg-primary-900/30 border border-primary-700 rounded-lg">
            <span className="text-primary-300 text-lg">Impossible de charger le statut du setup</span>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  const handleSaveTmdb = async (key: string) => {
    const result = await saveTmdbKey(key);
    if (!result.success) {
      throw new Error(result.message);
    }
    // Forcer l'affichage de l'étape TMDB pour éviter qu'elle disparaisse après la sauvegarde
    setForceShowStepIds((prev) => (prev.includes('tmdb') ? prev : [...prev, 'tmdb']));
    await checkSetupStatus();
  };

  const handleSaveDownloadLocation = async (path: string) => {
    const result = await saveDownloadLocation(path);
    if (result) await checkSetupStatus();
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="w-full max-w-5xl glass-panel-lg rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-10 lg:p-12">
        <div className="mb-8 sm:mb-10 md:mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 sm:mb-3 text-center">
            {forceAllSteps ? t('wizard.serverUrl.step1ReconfigureTitle') : t('wizard.serverUrl.step1FirstTimeTitle')}
          </h2>
          {/* Sous-titre étape 1 : toujours affiché quand on est sur l'étape Serveur (currentStep 1 = serverUrl) */}
          {(forceAllSteps ? (
            <p className="text-gray-400 text-sm sm:text-base text-center max-w-2xl mx-auto">
              {t('wizard.serverUrl.step1ReconfigureSubtitle')}
            </p>
          ) : getStepId(currentStep) === 'serverUrl' ? (
            <p className="text-gray-400 text-sm sm:text-base text-center max-w-2xl mx-auto">
              {t('wizard.serverUrl.step1FirstTimeSubtitle')}
            </p>
          ) : null)}
        </div>
          
        {error && (
          <div className="mb-6 p-4 bg-primary-900/30 border border-primary-700/50 rounded-lg glass-panel">
            <span className="text-primary-300 text-base sm:text-lg">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg glass-panel animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-300 text-base sm:text-lg font-medium">{success}</span>
            </div>
          </div>
        )}

        <StepIndicator 
          currentStep={currentStep} 
          totalSteps={totalSteps}
          stepLabels={steps.map(s => s.label)}
        />

        {(() => {
          const currentStepId = getStepId(currentStep);
          if (!currentStepId) return null;

          switch (currentStepId) {
            case 'serverUrl': {
              return (
                <ServerUrlStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onStatusChange={checkSetupStatus}
                  onNext={async () => {
                    // Rafraîchir le statut après configuration de l'URL
                    await checkSetupStatus();
                    
                    // Vérifier le statut mis à jour pour déterminer la prochaine étape
                    const updatedStatus = await serverApi.getSetupStatus();
                    if (updatedStatus.success && updatedStatus.data) {
                      // Si le backend est déjà complètement configuré, rediriger
                      // SAUF si ?force=1 : l'utilisateur veut refaire toutes les étapes
                      if (updatedStatus.data.backendReachable && updatedStatus.data.needsSetup === false && updatedStatus.data.hasUsers === true && !forceAllSteps) {
                        if (serverApi.isAuthenticated()) {
                          redirectTo('/dashboard');
                        } else {
                          redirectTo('/login');
                        }
                        return;
                      }
                      
                      // Passer à la prochaine étape (ou continuer si ?force=1)
                      const nextStepNumber = getNextStepNumber('serverUrl');
                      if (nextStepNumber) {
                        setCurrentStep(nextStepNumber);
                      }
                    } else {
                      // Si la vérification échoue, essayer quand même de passer à l'étape suivante
                      const nextStepNumber = getNextStepNumber('serverUrl');
                      if (nextStepNumber) {
                        setCurrentStep(nextStepNumber);
                      }
                    }
                  }}
                />
              );
            }

            case 'language': {
              return (
                <LanguageStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('language');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                />
              );
            }

            case 'disclaimer': {
              return (
                <DisclaimerStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('disclaimer');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                />
              );
            }

            case 'auth': {
              return (
                <AuthStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('auth');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                  onStatusChange={checkSetupStatus}
                />
              );
            }

            case 'welcome': {
              return (
                <WelcomeStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onNext={async (saveToCloud) => {
                    // Stocker la préférence de sauvegarde cloud
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('popcorn_client_save_to_cloud', String(saveToCloud));
                    }
                    // Rafraîchir le statut avant de calculer la prochaine étape : après import cloud,
                    // indexers peuvent être présents → on doit aller à TMDB (ou autre) et non à Indexers.
                    const freshStatus = await checkSetupStatus();
                    const tmdbMissing = await ensureTmdbStepIfMissing();
                    if (tmdbMissing) {
                      const tmdbStepNumber = getStepNumber('tmdb');
                      if (tmdbStepNumber !== null) {
                        setCurrentStep(tmdbStepNumber);
                        return;
                      }
                    }
                    const nextStepNumber = freshStatus !== null
                      ? getNextStepNumberAfterWelcome(freshStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup)
                      : getNextStepNumber('welcome');
                    if (nextStepNumber !== null) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                  onNavigateToStep={(stepId) => {
                    const id = stepId as WizardStepId;
                    setForceShowStepIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                    setPendingNavStepId(id);
                  }}
                />
              );
            }

            case 'indexers': {
              return (
                <IndexersStep
                  setupStatus={setupStatus}
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onPrevious={() => {
                    const prevStepNumber = getPreviousStepNumber('indexers');
                    if (prevStepNumber) {
                      setCurrentStep(prevStepNumber);
                    }
                  }}
                  onNext={() => {
                    (async () => {
                      const tmdbMissing = await ensureTmdbStepIfMissing();
                      if (tmdbMissing) {
                        const tmdbStepNumber = getStepNumber('tmdb');
                        if (tmdbStepNumber !== null) {
                          setCurrentStep(tmdbStepNumber);
                          return;
                        }
                      }
                      const nextStepNumber = getNextStepNumber('indexers');
                      if (nextStepNumber) {
                        setCurrentStep(nextStepNumber);
                      }
                    })();
                  }}
                  onStatusChange={checkSetupStatus}
                />
              );
            }

            case 'tmdb': {
              return (
                <TmdbStep
                  setupStatus={setupStatus}
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onPrevious={() => {
                    const prevStepNumber = getPreviousStepNumber('tmdb');
                    if (prevStepNumber) {
                      setCurrentStep(prevStepNumber);
                    }
                  }}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('tmdb');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                  onSave={handleSaveTmdb}
                  onStatusChange={checkSetupStatus}
                />
              );
            }

            case 'downloadLocation': {
              return (
                <DownloadLocationStep
                  setupStatus={setupStatus}
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onPrevious={() => {
                    const prevStepNumber = getPreviousStepNumber('downloadLocation');
                    if (prevStepNumber) {
                      setCurrentStep(prevStepNumber);
                    }
                  }}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('downloadLocation');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                  onSave={handleSaveDownloadLocation}
                />
              );
            }

            case 'sync': {
              return (
                <SyncStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onPrevious={() => {
                    const prevStepNumber = getPreviousStepNumber('sync');
                    if (prevStepNumber) {
                      setCurrentStep(prevStepNumber);
                    }
                  }}
                  onNext={() => {
                    const nextStepNumber = getNextStepNumber('sync');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
                  }}
                />
              );
            }

            case 'complete': {
              const prevStepNumber = getStepNumber('sync') || getStepNumber('downloadLocation') || getStepNumber('tmdb') || getStepNumber('indexers') || getStepNumber('welcome') || getStepNumber('auth') || getStepNumber('disclaimer') || getStepNumber('language') || getStepNumber('serverUrl');
              return (
                <CompleteStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onComplete={async () => {
                    // Récupérer la préférence de sauvegarde cloud depuis localStorage
                    const saveToCloud = typeof window !== 'undefined' 
                      ? localStorage.getItem('popcorn_client_save_to_cloud') === 'true'
                      : false;
                    // Sauvegarder la configuration dans popcorn-web si demandé (sans route export-config, build depuis backend + local)
                    if (saveToCloud) {
                      try {
                        const cloudToken = TokenManager.getCloudAccessToken();
                        if (cloudToken) {
                          const { getBackendUrl } = await import('../../lib/backend-config');
                          const { isTmdbKeyMaskedOrInvalid } = await import('../../lib/utils/tmdb-key');
                          const { saveUserConfigMerge } = await import('../../lib/api/popcorn-web');

                          // getTmdbKeyExport pour obtenir la clé réelle (getTmdbKey renvoie une clé masquée)
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

                          const downloadLocation = PreferencesManager.getDownloadLocation();
                          const prefLang = PreferencesManager.getPreferences().language;
                          const language = prefLang === 'fr' || prefLang === 'en' ? prefLang : null;

                          await saveUserConfigMerge({
                            backendUrl: getBackendUrl() || null,
                            indexers,
                            tmdbApiKey,
                            downloadLocation: downloadLocation || null,
                            language,
                            syncSettings,
                            indexerCategories: null,
                          });
                        }
                      } catch (error) {
                        console.warn('[WIZARD] ⚠️ Erreur lors de la sauvegarde cloud:', error);
                      }
                    }
                    redirectTo('/dashboard');
                  }}
                />
              );
            }

            default:
              return null;
          }
        })()}

        <Footer />
      </div>
    </div>
  );
}
