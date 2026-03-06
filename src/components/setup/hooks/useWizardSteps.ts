import { useMemo } from 'preact/hooks';
import type { SetupStatus } from '../../../lib/client/types';

export type WizardStepId =
  | 'serverUrl'
  | 'language'
  | 'disclaimer'
  | 'auth'
  | 'welcome'
  | 'indexers'
  | 'tmdb'
  | 'downloadLocation'
  | 'sync'
  | 'complete';

export interface WizardStep {
  id: WizardStepId;
  number: number;
  label: string;
  shouldShow: boolean;
}

/** Ordre des étapes pour la navigation */
const STEP_ORDER: WizardStepId[] = ['serverUrl', 'language', 'disclaimer', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];

/**
 * Calcule la liste des étapes à afficher pour un statut donné (utilisé par useWizardSteps et getNextStepNumberAfterWelcome).
 */
function computeSteps(
  setupStatus: SetupStatus | null,
  forceShowStepIds: WizardStepId[],
  forceAllSteps: boolean,
  wizardStartedWithNeedsSetup: boolean
): WizardStep[] {
  if (!setupStatus) {
    const labels: Record<WizardStepId, string> = {
      serverUrl: 'Serveur', language: 'Langue', disclaimer: 'Disclaimer', auth: 'Auth', welcome: 'Bienvenue',
      indexers: 'Indexers', tmdb: 'TMDB', downloadLocation: 'Téléchargement', sync: 'Sync', complete: 'Terminé',
    };
    return STEP_ORDER.map((id, i) => ({ id, number: i + 1, label: labels[id], shouldShow: true }));
  }
  if (setupStatus.backendReachable === false && !forceAllSteps) {
    return [{ id: 'serverUrl' as WizardStepId, number: 1, label: 'Serveur', shouldShow: true }];
  }
  if (setupStatus.needsSetup === false && setupStatus.hasUsers === true && !forceAllSteps && !wizardStartedWithNeedsSetup) {
    return [{ id: 'serverUrl' as WizardStepId, number: 1, label: 'Serveur', shouldShow: false }];
  }
  const allSteps: Omit<WizardStep, 'number'>[] = [
    { id: 'serverUrl', label: 'Serveur', shouldShow: true },
    { id: 'language', label: 'Langue', shouldShow: true },
    { id: 'disclaimer', label: 'Disclaimer', shouldShow: true },
    { id: 'auth', label: 'Auth', shouldShow: true },
    { id: 'welcome', label: 'Bienvenue', shouldShow: true },
    { id: 'indexers', label: 'Indexers', shouldShow: forceAllSteps || !setupStatus.hasIndexers || forceShowStepIds.includes('indexers') },
    { id: 'tmdb', label: 'TMDB', shouldShow: forceAllSteps || !setupStatus.hasTmdbKey || forceShowStepIds.includes('tmdb') },
    { id: 'downloadLocation', label: 'Téléchargement', shouldShow: forceAllSteps || !setupStatus.hasDownloadLocation || forceShowStepIds.includes('downloadLocation') },
    { id: 'sync', label: 'Sync', shouldShow: true },
    { id: 'complete', label: 'Terminé', shouldShow: true },
  ];
  let stepNumber = 1;
  return allSteps
    .filter(step => step.shouldShow)
    .map(step => ({ ...step, number: stepNumber++ })) as WizardStep[];
}

/**
 * Retourne le numéro de la première étape visible après « welcome » pour un statut donné.
 * Utilisé au clic « Suivant » sur Bienvenue pour aller directement à TMDB (ou autre) si les indexers
 * viennent d’être importés du cloud et ne sont pas encore reflétés dans le state.
 */
export function getNextStepNumberAfterWelcome(
  setupStatus: SetupStatus,
  forceShowStepIds: WizardStepId[],
  forceAllSteps: boolean,
  wizardStartedWithNeedsSetup: boolean
): number | null {
  const steps = computeSteps(setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup);
  const welcomeIndex = steps.findIndex(s => s.id === 'welcome');
  const nextStep = steps[welcomeIndex + 1];
  return nextStep ? nextStep.number : null;
}

/**
 * Détermine dynamiquement les étapes du wizard à afficher selon le statut du setup.
 * @param forceAllSteps - Si true (ex. ?force=1 depuis paramètres), affiche toutes les étapes
 *   pour permettre à l'utilisateur de refaire toute la configuration.
 * @param wizardStartedWithNeedsSetup - Si true, l'utilisateur a ouvert le wizard quand le setup
 *   était requis ; on ne passe pas à la liste minimale d'étapes (évite redirection au milieu du wizard).
 */
export function useWizardSteps(
  setupStatus: SetupStatus | null,
  forceShowStepIds: WizardStepId[] = [],
  forceAllSteps: boolean = false,
  wizardStartedWithNeedsSetup: boolean = false
): {
  steps: WizardStep[];
  totalSteps: number;
  getStepNumber: (stepId: WizardStepId) => number | null;
  getStepId: (stepNumber: number) => WizardStepId | null;
  getNextStepNumber: (stepId: WizardStepId) => number | null;
  getPreviousStepNumber: (stepId: WizardStepId) => number | null;
} {
  const steps = useMemo(
    () => computeSteps(setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup),
    [setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup]
  );

  const totalSteps = steps.length;

  // Fonction pour obtenir le numéro d'étape à partir de l'ID
  const getStepNumber = (stepId: WizardStepId): number | null => {
    const step = steps.find(s => s.id === stepId);
    return step ? step.number : null;
  };

  // Fonction pour obtenir l'ID d'étape à partir du numéro
  const getStepId = (stepNumber: number): WizardStepId | null => {
    const step = steps.find(s => s.number === stepNumber);
    return step ? step.id : null;
  };

  // Fonction pour obtenir la prochaine étape disponible après une étape donnée
  const getNextStepNumber = (stepId: WizardStepId): number | null => {
    const currentStepNumber = getStepNumber(stepId);
    if (currentStepNumber === null) return null;
    
    // Chercher la prochaine étape dans l'ordre
    const stepOrder: WizardStepId[] = ['serverUrl', 'language', 'disclaimer', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];
    const currentIndex = stepOrder.indexOf(stepId);
    if (currentIndex === -1 || currentIndex === stepOrder.length - 1) return null;
    
    // Chercher la prochaine étape disponible
    for (let i = currentIndex + 1; i < stepOrder.length; i++) {
      const nextStepId = stepOrder[i];
      const nextStepNumber = getStepNumber(nextStepId);
      if (nextStepNumber !== null) {
        return nextStepNumber;
      }
    }
    
    return null;
  };

  // Fonction pour obtenir l'étape précédente disponible avant une étape donnée
  const getPreviousStepNumber = (stepId: WizardStepId): number | null => {
    const currentStepNumber = getStepNumber(stepId);
    if (currentStepNumber === null) return null;
    
    // Chercher l'étape précédente dans l'ordre
    const stepOrder: WizardStepId[] = ['serverUrl', 'language', 'disclaimer', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];
    const currentIndex = stepOrder.indexOf(stepId);
    if (currentIndex === -1 || currentIndex === 0) return null;
    
    // Chercher l'étape précédente disponible
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevStepId = stepOrder[i];
      const prevStepNumber = getStepNumber(prevStepId);
      if (prevStepNumber !== null) {
        return prevStepNumber;
      }
    }
    
    return null;
  };

  return {
    steps,
    totalSteps,
    getStepNumber,
    getStepId,
    getNextStepNumber,
    getPreviousStepNumber,
  };
}
