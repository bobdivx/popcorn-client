import { useMemo } from 'preact/hooks';
import type { SetupStatus } from '../../../lib/client/types';

export type WizardStepId = 
  | 'serverUrl'
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
  number: number; // Numéro d'ordre dans la séquence affichée (1, 2, 3...)
  label: string;
  shouldShow: boolean;
}

/**
 * Détermine dynamiquement les étapes du wizard à afficher selon le statut du setup
 */
export function useWizardSteps(
  setupStatus: SetupStatus | null,
  forceShowStepIds: WizardStepId[] = []
): {
  steps: WizardStep[];
  totalSteps: number;
  getStepNumber: (stepId: WizardStepId) => number | null;
  getStepId: (stepNumber: number) => WizardStepId | null;
  getNextStepNumber: (stepId: WizardStepId) => number | null;
  getPreviousStepNumber: (stepId: WizardStepId) => number | null;
} {
  const steps = useMemo(() => {
    // Si pas de statut, on affiche toutes les étapes par défaut
    if (!setupStatus) {
      return [
        { id: 'serverUrl' as WizardStepId, number: 1, label: 'Serveur', shouldShow: true },
        { id: 'disclaimer' as WizardStepId, number: 2, label: 'Disclaimer', shouldShow: true },
        { id: 'auth' as WizardStepId, number: 3, label: 'Auth', shouldShow: true },
        { id: 'welcome' as WizardStepId, number: 4, label: 'Bienvenue', shouldShow: true },
        { id: 'indexers' as WizardStepId, number: 5, label: 'Indexers', shouldShow: true },
        { id: 'tmdb' as WizardStepId, number: 6, label: 'TMDB', shouldShow: true },
        { id: 'downloadLocation' as WizardStepId, number: 7, label: 'Téléchargement', shouldShow: true },
        { id: 'sync' as WizardStepId, number: 8, label: 'Sync', shouldShow: true },
        { id: 'complete' as WizardStepId, number: 9, label: 'Terminé', shouldShow: true },
      ];
    }

    // Si le backend n'est pas accessible, on affiche seulement l'étape serveur
    if (setupStatus.backendReachable === false) {
      return [
        { id: 'serverUrl' as WizardStepId, number: 1, label: 'Serveur', shouldShow: true },
      ];
    }

    // Si le setup est déjà complet (needsSetup === false et hasUsers === true),
    // on ne devrait pas afficher le wizard, mais on retourne quand même les étapes
    // pour que le composant parent puisse gérer la redirection
    if (setupStatus.needsSetup === false && setupStatus.hasUsers === true) {
      return [
        { id: 'serverUrl' as WizardStepId, number: 1, label: 'Serveur', shouldShow: false },
      ];
    }

    // Construire la liste des étapes à afficher
    const allSteps: Omit<WizardStep, 'number'>[] = [
      { id: 'serverUrl', label: 'Serveur', shouldShow: true },
      { id: 'disclaimer', label: 'Disclaimer', shouldShow: true },
      { id: 'auth', label: 'Auth', shouldShow: true },
      { id: 'welcome', label: 'Bienvenue', shouldShow: true },
      { id: 'indexers', label: 'Indexers', shouldShow: !setupStatus.hasIndexers || forceShowStepIds.includes('indexers') },
      { id: 'tmdb', label: 'TMDB', shouldShow: !setupStatus.hasTmdbKey || forceShowStepIds.includes('tmdb') },
      { id: 'downloadLocation', label: 'Téléchargement', shouldShow: !setupStatus.hasDownloadLocation || forceShowStepIds.includes('downloadLocation') },
      { id: 'sync', label: 'Sync', shouldShow: true },
      { id: 'complete', label: 'Terminé', shouldShow: true },
    ];

    // Filtrer et numéroter uniquement les étapes à afficher
    let stepNumber = 1;
    return allSteps
      .filter(step => step.shouldShow)
      .map(step => ({
        ...step,
        number: stepNumber++,
      }));
  }, [setupStatus, forceShowStepIds]);

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
    const stepOrder: WizardStepId[] = ['serverUrl', 'disclaimer', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];
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
    const stepOrder: WizardStepId[] = ['serverUrl', 'disclaimer', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];
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
