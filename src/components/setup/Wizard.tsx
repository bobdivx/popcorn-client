import { useEffect } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
import { StepIndicator } from './components/StepIndicator';
import { DisclaimerStep } from './steps/DisclaimerStep';
import { ServerUrlStep } from './steps/ServerUrlStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { IndexersStep } from './steps/IndexersStep';
import { TmdbStep } from './steps/TmdbStep';
import { DownloadLocationStep } from './steps/DownloadLocationStep';
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

  // Rafraîchir le statut périodiquement uniquement si le setup n'est pas terminé
  // et seulement sur certaines étapes qui nécessitent une vérification
  useEffect(() => {
    // Ne pas poller si le setup est terminé
    if (setupStatus && !setupStatus.needsSetup) {
      return;
    }

    // Ne poller que sur les étapes qui nécessitent une vérification (indexers, TMDB, etc.)
    const stepsThatNeedPolling = [4, 5, 6]; // Indexers, TMDB, DownloadLocation
    if (!stepsThatNeedPolling.includes(currentStep)) {
      return;
    }

    // Poller toutes les 15 secondes au lieu de 3 secondes
    const interval = setInterval(() => {
      checkSetupStatus();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [currentStep, checkSetupStatus, setupStatus]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-red-600"></span>
          <p className="mt-4 text-white text-xl">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!setupStatus) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl border border-red-600 p-6">
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <span className="text-red-300 text-lg">Impossible de charger le statut du setup</span>
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
    <div className="min-h-screen bg-black flex items-center justify-center p-6 sm:p-8 md:p-12">
      <div className="w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-6 sm:p-8 md:p-12">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 sm:mb-8 text-center">
          Configuration initiale
        </h2>
          
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <span className="text-red-300 text-lg">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
            <span className="text-green-300 text-lg">{success}</span>
          </div>
        )}

        <StepIndicator currentStep={currentStep} totalSteps={7} />

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
          <WelcomeStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <IndexersStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(3)}
            onNext={() => setCurrentStep(5)}
            onStatusChange={checkSetupStatus}
          />
        )}

        {currentStep === 5 && (
          <TmdbStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(4)}
            onNext={() => setCurrentStep(6)}
            onSave={handleSaveTmdb}
            onStatusChange={checkSetupStatus}
          />
        )}

        {currentStep === 6 && (
          <DownloadLocationStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => setCurrentStep(5)}
            onNext={() => setCurrentStep(7)}
            onSave={handleSaveDownloadLocation}
          />
        )}

        {currentStep === 7 && (
          <CompleteStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onComplete={completeSetup}
          />
        )}
      </div>
    </div>
  );
}
