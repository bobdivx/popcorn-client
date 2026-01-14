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

  if (!setupStatus) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl border border-primary-600 p-6">
          <div className="p-4 bg-primary-900/30 border border-primary-700 rounded-lg">
            <span className="text-primary-300 text-lg">Impossible de charger le statut du setup</span>
          </div>
        </div>
      </div>
    );
  }

  const handleSaveTmdb = async (key: string) => {
    const result = await saveTmdbKey(key);
    if (result) {
      await checkSetupStatus();
    }
    return result;
  };

  const handleSaveDownloadLocation = async (path: string) => {
    const result = await saveDownloadLocation(path);
    if (result) {
      await checkSetupStatus();
    }
    return result;
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
          <DisclaimerStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <ServerUrlStep
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
      </div>
    </div>
  );
}
