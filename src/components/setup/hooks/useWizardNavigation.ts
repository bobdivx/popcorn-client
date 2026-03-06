import { useState, useRef, useEffect } from 'preact/hooks';
import type { SetupStatus } from '../../../lib/client/types';
import type { WizardStepId } from './useWizardSteps';

export function useWizardNavigation(
  setupStatus: SetupStatus | null,
  getStepId: (stepNumber: number) => WizardStepId | null,
  getStepNumber: (stepId: WizardStepId) => number | null,
  getNextStepNumber: (stepId: WizardStepId) => number | null,
  getPreviousStepNumber: (stepId: WizardStepId) => number | null
) {
  const [currentStep, setCurrentStep] = useState(1);
  const [focusedButtonIndex, setFocusedButtonIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Réinitialiser à l'étape 1 si le setupStatus change (par exemple après configuration de l'URL)
  useEffect(() => {
    if (setupStatus && setupStatus.backendReachable) {
      // Si le backend est accessible, on commence à l'étape 1 (serverUrl)
      // mais le wizard déterminera automatiquement quelle est la première étape à afficher
      const firstStepId = getStepId(1);
      if (firstStepId) {
        const firstStepNumber = getStepNumber(firstStepId);
        if (firstStepNumber && firstStepNumber !== currentStep) {
          setCurrentStep(firstStepNumber);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus?.backendReachable]);

  // Navigation entre étapes - utilise les fonctions dynamiques pour sauter les étapes non affichées
  const goToNext = () => {
    const currentStepId = getStepId(currentStep);
    if (!currentStepId) return;

    // Utiliser getNextStepNumber pour trouver la prochaine étape disponible
    const nextStepNumber = getNextStepNumber(currentStepId);
    if (nextStepNumber) {
      setCurrentStep(nextStepNumber);
      setFocusedButtonIndex(0);
    }
  };

  const goToPrevious = () => {
    const currentStepId = getStepId(currentStep);
    if (!currentStepId) return;

    // Utiliser getPreviousStepNumber pour trouver l'étape précédente disponible
    const prevStepNumber = getPreviousStepNumber(currentStepId);
    if (prevStepNumber) {
      setCurrentStep(prevStepNumber);
      setFocusedButtonIndex(0);
    }
  };

  return {
    currentStep,
    setCurrentStep,
    focusedButtonIndex,
    setFocusedButtonIndex,
    buttonRefs,
    goToNext,
    goToPrevious,
  };
}
