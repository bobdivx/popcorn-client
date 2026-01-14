import { useState, useRef } from 'preact/hooks';
import type { SetupStatus } from '../../../lib/client/types';

export function useWizardNavigation(setupStatus: SetupStatus | null) {
  const [currentStep, setCurrentStep] = useState(1);
  const [focusedButtonIndex, setFocusedButtonIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Navigation entre étapes
  const goToNext = () => {
    if (currentStep < 8) {
      setCurrentStep(currentStep + 1);
      setFocusedButtonIndex(0);
    }
  };

  const goToPrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
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
