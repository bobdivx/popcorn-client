import { describe, expect, it } from 'vitest';
import type { SeedingDiagnostic } from '../hooks/useSeedingHealth';
import {
  connectivityHasActionableIssue,
  connectivityWarningFingerprint,
  isInformationalSeedingWarning,
} from './connectivity-warning';

function diag(partial: Partial<SeedingDiagnostic>): SeedingDiagnostic {
  return {
    status: 'ok',
    total_seeding: 0,
    warnings: [],
    listen_port: 51413,
    upnp_enabled: true,
    ...partial,
  };
}

const swarmFr = (seeding: number, seen: number, notNeeded: number) =>
  `${seeding} torrent(s) en partage, ${seen} pair(s) vus (${notNeeded} non nécessaires), 0 connecté. ` +
  `Ce n’est en général pas un problème de port : le tracker répond et les peers sont atteints, ` +
  `mais le swarm est saturé de seeders (peu ou pas de leechers). L’upload / ratio ne monte que lorsqu’un leecher ` +
  `télécharge réellement chez vous. Laissez tourner, ou privilégiez des torrents récents / moins seedés.`;

describe('isInformationalSeedingWarning', () => {
  it('reconnaît le message swarm saturé', () => {
    expect(isInformationalSeedingWarning(swarmFr(20, 13, 173))).toBe(true);
  });

  it('ne classe pas un vrai souci réseau comme informatif', () => {
    expect(
      isInformationalSeedingWarning(
        'Problème de connectivité probable : 20 torrent(s) en partage mais aucun pair vu/connecté.'
      )
    ).toBe(false);
  });
});

describe('connectivityHasActionableIssue', () => {
  it('ignore un warning swarm saturé (même si status=warning, vieux backend)', () => {
    expect(
      connectivityHasActionableIssue(
        diag({ status: 'warning', total_seeding: 20, warnings: [swarmFr(20, 13, 173)] })
      )
    ).toBe(false);
  });

  it('signale une erreur librqbit', () => {
    expect(
      connectivityHasActionableIssue(
        diag({
          status: 'error',
          warnings: ['Impossible de joindre l’API librqbit'],
        })
      )
    ).toBe(true);
  });

  it('signale 0 peer vu', () => {
    expect(
      connectivityHasActionableIssue(
        diag({
          status: 'warning',
          warnings: [
            'Problème de connectivité probable : 20 torrent(s) en partage mais aucun pair vu/connecté.',
          ],
        })
      )
    ).toBe(true);
  });
});

describe('connectivityWarningFingerprint', () => {
  it('reste stable quand les compteurs de peers changent', () => {
    const a = connectivityWarningFingerprint(
      diag({
        status: 'warning',
        warnings: ['Problème de connectivité probable : 20 torrent(s) en partage mais aucun pair vu/connecté. Ouvrez le port TCP/UDP 51413.'],
      })
    );
    const b = connectivityWarningFingerprint(
      diag({
        status: 'warning',
        warnings: ['Problème de connectivité probable : 21 torrent(s) en partage mais aucun pair vu/connecté. Ouvrez le port TCP/UDP 51413.'],
      })
    );
    expect(a).toBe(b);
  });
});
