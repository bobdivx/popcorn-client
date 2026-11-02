import { describe, expect, it } from 'vitest';
import { isAccountBlockedStalled, resnatchFailureMessage } from './accountBlockedTorrent';

const HASH = 'dd9a41800e64c347e5008164a38d7d9969726dc7';

describe('isAccountBlockedStalled', () => {
  it('vrai pour un torrent bloqué par le tracker sans aucune donnée', () => {
    expect(
      isAccountBlockedStalled({ info_hash: HASH, state: 'downloading', downloaded_bytes: 0, progress: 0, tracker_account_blocked: true }),
    ).toBe(true);
    expect(isAccountBlockedStalled({ info_hash: HASH, state: 'paused', tracker_account_blocked: true })).toBe(true);
  });

  it('faux sans blocage de compte', () => {
    expect(isAccountBlockedStalled({ info_hash: HASH, state: 'downloading', downloaded_bytes: 0 })).toBe(false);
    expect(isAccountBlockedStalled({ info_hash: HASH, tracker_account_blocked: false })).toBe(false);
    expect(isAccountBlockedStalled(null)).toBe(false);
  });

  it('faux si des données ont été reçues ou si le torrent est complet', () => {
    expect(isAccountBlockedStalled({ info_hash: HASH, downloaded_bytes: 10, tracker_account_blocked: true })).toBe(false);
    expect(isAccountBlockedStalled({ info_hash: HASH, progress: 0.2, tracker_account_blocked: true })).toBe(false);
    expect(isAccountBlockedStalled({ info_hash: HASH, state: 'seeding', tracker_account_blocked: true })).toBe(false);
    expect(isAccountBlockedStalled({ info_hash: HASH, files_available: true, tracker_account_blocked: true })).toBe(false);
  });

  it('faux sans info_hash valide', () => {
    expect(isAccountBlockedStalled({ info_hash: 'local_12', tracker_account_blocked: true })).toBe(false);
    expect(isAccountBlockedStalled({ tracker_account_blocked: true })).toBe(false);
  });
});

describe('resnatchFailureMessage', () => {
  it('préfère le message serveur, sinon le libellé générique', () => {
    expect(resnatchFailureMessage({ message: 'Trop de relances' }, 'x')).toBe('Trop de relances');
    expect(resnatchFailureMessage({ error: 'Aucun autre compte' }, 'x')).toBe('Aucun autre compte');
    expect(resnatchFailureMessage({}, 'Échec')).toBe('Échec');
    expect(resnatchFailureMessage(null, 'Échec')).toBe('Échec');
  });
});
