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

  // Au premier chargement uniquement : si le backend est accessible et qu'on est encore à l'étape 1,
  // s'assurer d'afficher la première étape du wizard. Ne pas réinitialiser si l'utilisateur a déjà
  // avancé (ex. connexion cloud puis passage à l'étape Serveur).
  useEffect(() => {
    if (!setupStatus || !setupStatus.backendReachable) return;
    if (currentStep !== 1) return;
    const firstStepId = getStepId(1);
    if (!firstStepId) return;
    const firstStepNumber = getStepNumber(firstStepId);
    if (firstStepNumber != null && firstStepNumber !== currentStep) {
      setCurrentStep(firstStepNumber);
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
