import { useEffect } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
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

export default function Wizard() {
  const { loading, setupStatus, checkSetupStatus } = useSetupStatus();
  const {
    currentStep,
    setCurrentStep,
    focusedButtonIndex,
    setFocusedButtonIndex,
    buttonRefs,
  } = useWizardNavigation(setupStatus);

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
      window.location.href = '/settings/diagnostics';
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

          <StepIndicator currentStep={1} totalSteps={9} />

          <ServerUrlStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={async () => {
              await checkSetupStatus();
              setCurrentStep(2);
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

        <StepIndicator currentStep={currentStep} totalSteps={9} />

        {currentStep === 1 && (
          <ServerUrlStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={async () => {
              await checkSetupStatus();
              setCurrentStep(2);
            }}
          />
        )}

        {currentStep === 2 && (
          <DisclaimerStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && (
          <AuthStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => setCurrentStep(4)}
            onStatusChange={checkSetupStatus}
          />
        )}

        {currentStep === 4 && (
          <WelcomeStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={(saveToCloud) => {
              // Stocker la préférence de sauvegarde cloud
              if (typeof window !== 'undefined') {
                localStorage.setItem('popcorn_client_save_to_cloud', String(saveToCloud));
              }
              setCurrentStep(5);
            }}
          />
        )}

        {currentStep === 5 && (
          <IndexersStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(4)}
            onNext={() => setCurrentStep(6)}
            onStatusChange={checkSetupStatus}
          />
        )}

        {currentStep === 6 && (
          <TmdbStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(5)}
            onNext={() => setCurrentStep(7)}
            onSave={handleSaveTmdb}
            onStatusChange={checkSetupStatus}
          />
        )}

        {currentStep === 7 && (
          <DownloadLocationStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(6)}
            onNext={() => setCurrentStep(8)}
            onSave={handleSaveDownloadLocation}
          />
        )}

        {currentStep === 8 && (
          <SyncStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(7)}
            onNext={() => setCurrentStep(9)}
          />
        )}

        {currentStep === 9 && (
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
        )}

        <Footer />
      </div>
    </div>
  );
}
