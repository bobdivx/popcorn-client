import { useMemo } from 'preact/hooks';
import type { SetupStatus } from '../../../lib/client/types';

export type WizardStepId =
  | 'serverUrl'
  | 'language'
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

/** Ordre des étapes pour la navigation (backend déjà configuré : login d'abord) */
const STEP_ORDER_WITH_BACKEND: WizardStepId[] = ['auth', 'language', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];

/** Ordre des étapes quand l'URL backend n'est pas encore connue / reachable */
const STEP_ORDER_SERVER_FIRST: WizardStepId[] = ['serverUrl', 'language', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'];

/**
 * Calcule la liste des étapes à afficher pour un statut donné (utilisé par useWizardSteps et getNextStepNumberAfterWelcome).
 * @param hasBackendUrl - quand false (premier lancement), l'étape 1 est Auth puis ServerUrl en étape 2
 */
function computeSteps(
  setupStatus: SetupStatus | null,
  forceShowStepIds: WizardStepId[],
  forceAllSteps: boolean,
  wizardStartedWithNeedsSetup: boolean,
  hasBackendUrl: boolean
): WizardStep[] {
  const labels: Record<WizardStepId, string> = {
    serverUrl: 'Serveur', language: 'Langue', auth: 'Connexion', welcome: 'Bienvenue',
    indexers: 'Indexers', tmdb: 'TMDB', downloadLocation: 'Téléchargement', sync: 'Sync', complete: 'Terminé',
  };
  // Pas de backend URL : étape 1 = Connexion (Auth), étape 2 = Serveur (URL), puis le reste
  if (!setupStatus) {
    const order = hasBackendUrl ? STEP_ORDER_WITH_BACKEND : (['auth', 'serverUrl', 'language', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete'] as WizardStepId[]);
    return order.map((id, i) => ({ id, number: i + 1, label: labels[id], shouldShow: true }));
  }
  if (setupStatus.backendReachable === false && !forceAllSteps) {
    // Backend URL configurée mais injoignable : on affiche Auth puis ServerUrl pour corriger l'URL
    return [
      { id: 'auth' as WizardStepId, number: 1, label: 'Connexion', shouldShow: true },
      { id: 'serverUrl' as WizardStepId, number: 2, label: 'Serveur', shouldShow: true },
    ];
  }
  if (setupStatus.needsSetup === false && setupStatus.hasUsers === true && !forceAllSteps && !wizardStartedWithNeedsSetup) {
    return [{ id: 'auth' as WizardStepId, number: 1, label: 'Connexion', shouldShow: false }];
  }
  // Backend reachable : auth puis optionnellement Serveur (si forcé via sidebar), puis le reste
  const allSteps: Omit<WizardStep, 'number'>[] = [
    { id: 'auth', label: 'Connexion', shouldShow: true },
    { id: 'serverUrl', label: 'Serveur', shouldShow: forceShowStepIds.includes('serverUrl') },
    { id: 'language', label: 'Langue', shouldShow: true },
    { id: 'welcome', label: 'Bienvenue', shouldShow: true },
    { id: 'indexers', label: 'Indexers', shouldShow: forceAllSteps || !setupStatus.hasIndexers || forceShowStepIds.includes('indexers') },
    { id: 'tmdb', label: 'TMDB', shouldShow: forceAllSteps || !setupStatus.hasTmdbKey || forceShowStepIds.includes('tmdb') },
    { id: 'downloadLocation', label: 'Téléchargement', shouldShow: forceAllSteps || !setupStatus.hasDownloadLocation || forceShowStepIds.includes('downloadLocation') },
    { id: 'sync', label: 'Sync', shouldShow: forceAllSteps || (setupStatus.hasIndexers && setupStatus.hasTmdbKey) || forceShowStepIds.includes('sync') },
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
  wizardStartedWithNeedsSetup: boolean,
  hasBackendUrl: boolean
): number | null {
  const steps = computeSteps(setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup, hasBackendUrl);
  const welcomeIndex = steps.findIndex(s => s.id === 'welcome');
  const nextStep = steps[welcomeIndex + 1];
  return nextStep ? nextStep.number : null;
}

/**
 * Détermine dynamiquement les étapes du wizard à afficher selon le statut du setup.
 * L'étape 1 est toujours Connexion (Auth). Sans URL backend, l'étape 2 est Serveur.
 */
export function useWizardSteps(
  setupStatus: SetupStatus | null,
  forceShowStepIds: WizardStepId[] = [],
  forceAllSteps: boolean = false,
  wizardStartedWithNeedsSetup: boolean = false,
  hasBackendUrl: boolean = false
): {
  steps: WizardStep[];
  totalSteps: number;
  getStepNumber: (stepId: WizardStepId) => number | null;
  getStepId: (stepNumber: number) => WizardStepId | null;
  getNextStepNumber: (stepId: WizardStepId) => number | null;
  getPreviousStepNumber: (stepId: WizardStepId) => number | null;
} {
  const steps = useMemo(
    () => computeSteps(setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup, hasBackendUrl),
    [setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup, hasBackendUrl]
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
    const stepOrder = steps.map(s => s.id);
    const currentIndex = stepOrder.indexOf(stepId);
    if (currentIndex === -1 || currentIndex === stepOrder.length - 1) return null;
    const nextStepNumber = getStepNumber(stepOrder[currentIndex + 1] as WizardStepId);
    return nextStepNumber;
  };

  // Fonction pour obtenir l'étape précédente disponible avant une étape donnée
  const getPreviousStepNumber = (stepId: WizardStepId): number | null => {
    const currentStepNumber = getStepNumber(stepId);
    if (currentStepNumber === null) return null;
    const stepOrder = steps.map(s => s.id);
    const currentIndex = stepOrder.indexOf(stepId);
    if (currentIndex <= 0) return null;
    const prevStepNumber = getStepNumber(stepOrder[currentIndex - 1] as WizardStepId);
    return prevStepNumber;
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
