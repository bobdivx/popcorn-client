import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/backend-config', () => ({ getBackendUrl: () => 'http://srv' }));

import type { ServerCapabilities } from '../lib/capabilities';
import { markSeedingDiagnosticUnsupported, shouldFetchSeedingDiagnostic } from './useSeedingHealth';

const caps = (torrent: boolean, processHost?: boolean) =>
  ({ features: { torrent }, modules: { processHost } }) as unknown as ServerCapabilities;

describe('diagnostic de seeding', () => {
  it('serveur historique avec torrent intégré : interrogé', () => {
    expect(shouldFetchSeedingDiagnostic(caps(true))).toBe(true);
  });
  it('sans module torrent ou sur un serveur à modules : jamais interrogé', () => {
    expect(shouldFetchSeedingDiagnostic(caps(false))).toBe(false);
    expect(shouldFetchSeedingDiagnostic(caps(true, true))).toBe(false);
  });
  it('après un 404 : plus interrogé pour ce serveur', () => {
    markSeedingDiagnosticUnsupported('http://srv');
    expect(shouldFetchSeedingDiagnostic(caps(true))).toBe(false);
  });
});
