import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Capacités simulées du serveur (`null` = inconnues / serveur ancien). */
let features: Record<string, boolean> | null = null;

vi.mock('../../lib/capabilities', () => ({
  getCachedCapabilities: () => (features ? { features, modules: { installed: [] } } : null),
  isCapabilityAvailable: (f: string) => (features ? features[f] === true : true),
  loadCapabilities: () => Promise.resolve(null),
  useServerCapabilities: () => null,
}));

import { getIndexersStepContinueAction } from './indexersStepPolicy';
import { getNextStepNumberAfterWelcome, isWizardStepAvailable } from './hooks/useWizardSteps';
import type { SetupStatus } from '../../lib/client/types';

const status = (over: Partial<SetupStatus> = {}): SetupStatus => ({
  needsSetup: true,
  hasUsers: false,
  hasIndexers: false,
  hasBackendConfig: true,
  hasTmdbKey: false,
  hasTorrents: false,
  hasDownloadLocation: false,
  backendReachable: true,
  ...over,
});

describe('étape Indexers facultative', () => {
  beforeEach(() => {
    features = null;
  });

  it('sans indexer : on peut toujours continuer (« Passer cette étape »)', () => {
    expect(getIndexersStepContinueAction(0)).toBe('skip');
  });

  it('avec au moins un indexer : « Suivant »', () => {
    expect(getIndexersStepContinueAction(1)).toBe('next');
    expect(getIndexersStepContinueAction(3)).toBe('next');
  });

  it('serveur complet : étape toujours proposée après Bienvenue (comportement inchangé)', () => {
    features = { torrent: true, indexers: true };
    expect(isWizardStepAvailable('indexers')).toBe(true);
    // Connexion(1) → Langue(2) → Bienvenue(3) → Indexers(4)
    expect(getNextStepNumberAfterWelcome(status(), [], false, true, true)).toBe(4);
    // Indexers déjà configurés : l'étape disparaît, TMDB suit Bienvenue (même numéro 4)
    expect(getNextStepNumberAfterWelcome(status({ hasIndexers: true }), [], false, true, true)).toBe(4);
  });

  it('édition de base sans module indexers : étape absente', () => {
    features = { torrent: false, indexers: false };
    expect(isWizardStepAvailable('indexers')).toBe(false);
    expect(isWizardStepAvailable('downloadLocation')).toBe(false);
    expect(isWizardStepAvailable('sync')).toBe(false);
  });

  it('édition de base + module indexers : étape proposée (et facultative)', () => {
    features = { torrent: false, indexers: true };
    expect(isWizardStepAvailable('indexers')).toBe(true);
    expect(isWizardStepAvailable('sync')).toBe(false);
  });
});
