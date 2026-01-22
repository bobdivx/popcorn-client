import { useEffect, useState } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
import { useWizardSteps } from './hooks/useWizardSteps';
import type { WizardStepId } from './hooks/useWizardSteps';
import { StepIndicator } from './components/StepIndicator';
import { DisclaimerStep } from './steps/DisclaimerStep';
import { ServerUrlStep } from './steps/ServerUrlStep';
import { AuthStep } from './steps/AuthStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { IndexersStep } from './steps/IndexersStep';
import { TmdbStep } from './steps/TmdbStep';
import { DownloadLocationStep } from './steps/DownloadLocationStep';
import { SyncStep } from './steps/SyncStep';
import { CompleteStep } from './steps/CompleteStep';
import { hasBackendUrl } from '../../lib/backend-config.js';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';

export default function Wizard() {
  const { loading, setupStatus, checkSetupStatus } = useSetupStatus();
  const [forceShowStepIds, setForceShowStepIds] = useState<WizardStepId[]>([]);
  const [pendingNavStepId, setPendingNavStepId] = useState<WizardStepId | null>(null);

  const { steps, totalSteps, getStepNumber, getStepId, getNextStepNumber, getPreviousStepNumber } = useWizardSteps(setupStatus, forceShowStepIds);
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

  // Navigation "forcée" vers une étape potentiellement masquée (édition post-import cloud)
  useEffect(() => {
    if (!pendingNavStepId) return;
    const stepNumber = getStepNumber(pendingNavStepId);
    if (stepNumber !== null) {
      setCurrentStep(stepNumber);
      setPendingNavStepId(null);
    }
  }, [pendingNavStepId, getStepNumber, setCurrentStep]);

  // Vérifier si l'utilisateur doit être redirigé vers /login
  // Si le setup est complet (needsSetup === false et hasUsers === true), rediriger
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

      // Si le backend est accessible ET que le setup est complet (needsSetup === false et hasUsers === true)
      // rediriger vers /login ou /dashboard selon l'état d'authentification
      if (setupStatus.backendReachable && setupStatus.needsSetup === false && setupStatus.hasUsers === true) {
        // Vérifier aussi si l'utilisateur est déjà authentifié
        if (serverApi.isAuthenticated()) {
          redirectTo('/dashboard');
        } else {
          redirectTo('/login');
        }
      }
    };

    checkAndRedirect();
  }, [loading, setupStatus]);

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
          <span className="loading loading-spinner loading-lg text-primary-600"></span>
          <p className="mt-4 text-white text-xl">Chargement...</p>
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
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8 sm:mb-10 md:mb-12 text-center">
            Configuration initiale
          </h2>

          <StepIndicator currentStep={1} totalSteps={1} stepLabels={['Serveur']} />

          <ServerUrlStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={async () => {
              // Rafraîchir le statut après configuration de l'URL
              await checkSetupStatus();
              
              // Vérifier le statut mis à jour pour déterminer la prochaine étape
              const updatedStatus = await serverApi.getSetupStatus();
              if (updatedStatus.success && updatedStatus.data) {
                // Si le backend est déjà complètement configuré, rediriger
                if (updatedStatus.data.backendReachable && updatedStatus.data.needsSetup === false && updatedStatus.data.hasUsers === true) {
                  if (serverApi.isAuthenticated()) {
                    redirectTo('/dashboard');
                  } else {
                    redirectTo('/login');
                  }
                  return;
                }
                
                // Sinon, passer à la prochaine étape disponible selon le nouveau statut
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
    if (result) await checkSetupStatus();
  };

  const handleSaveDownloadLocation = async (path: string) => {
    const result = await saveDownloadLocation(path);
    if (result) await checkSetupStatus();
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="w-full max-w-5xl glass-panel-lg rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-10 lg:p-12">
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8 sm:mb-10 md:mb-12 text-center">
          Configuration initiale
        </h2>
          
        {error && (
          <div className="mb-6 p-4 bg-primary-900/30 border border-primary-700/50 rounded-lg glass-panel">
            <span className="text-primary-300 text-base sm:text-lg">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg glass-panel">
            <span className="text-green-300 text-base sm:text-lg">{success}</span>
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
                  onNext={async () => {
                    // Rafraîchir le statut après configuration de l'URL
                    await checkSetupStatus();
                    
                    // Vérifier le statut mis à jour pour déterminer la prochaine étape
                    const updatedStatus = await serverApi.getSetupStatus();
                    if (updatedStatus.success && updatedStatus.data) {
                      // Si le backend est déjà complètement configuré, rediriger
                      if (updatedStatus.data.backendReachable && updatedStatus.data.needsSetup === false && updatedStatus.data.hasUsers === true) {
                        if (serverApi.isAuthenticated()) {
                          redirectTo('/dashboard');
                        } else {
                          redirectTo('/login');
                        }
                        return;
                      }
                      
                      // Sinon, passer à la prochaine étape disponible selon le nouveau statut
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
                  onNext={(saveToCloud) => {
                    // Stocker la préférence de sauvegarde cloud
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('popcorn_client_save_to_cloud', String(saveToCloud));
                    }
                    const nextStepNumber = getNextStepNumber('welcome');
                    if (nextStepNumber) {
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
                    const nextStepNumber = getNextStepNumber('indexers');
                    if (nextStepNumber) {
                      setCurrentStep(nextStepNumber);
                    }
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
              const prevStepNumber = getStepNumber('sync') || getStepNumber('downloadLocation') || getStepNumber('tmdb') || getStepNumber('indexers') || getStepNumber('welcome') || getStepNumber('auth') || getStepNumber('disclaimer') || getStepNumber('serverUrl');
              return (
                <CompleteStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onComplete={() => {
                    // Récupérer la préférence de sauvegarde cloud depuis localStorage
                    const saveToCloud = typeof window !== 'undefined' 
                      ? localStorage.getItem('popcorn_client_save_to_cloud') === 'true'
                      : false;
                    completeSetup(saveToCloud);
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
