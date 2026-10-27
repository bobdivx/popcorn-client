import { describe, expect, it } from 'vitest';
import { checkBackendUrlForGuests, isPrivateOrLocalHost, guestBackendIssueKey } from './guest-invite-readiness';

describe('checkBackendUrlForGuests', () => {
  it('accepte une URL publique en HTTPS', () => {
    expect(checkBackendUrlForGuests('https://popcorn.example.com')).toEqual({ ok: true, url: 'https://popcorn.example.com' });
    expect(checkBackendUrlForGuests(' https://1.2.3.4:8443/ ').ok).toBe(true);
  });

  it('signale une URL absente', () => {
    expect(checkBackendUrlForGuests('')).toMatchObject({ ok: false, issue: 'missing' });
    expect(checkBackendUrlForGuests(null)).toMatchObject({ ok: false, issue: 'missing' });
    expect(checkBackendUrlForGuests(undefined)).toMatchObject({ ok: false, issue: 'missing' });
  });

  it('signale une URL invalide', () => {
    expect(checkBackendUrlForGuests('pas une url')).toMatchObject({ ok: false, issue: 'invalid' });
    expect(checkBackendUrlForGuests('ftp://example.com')).toMatchObject({ ok: false, issue: 'invalid' });
  });

  it('signale le HTTP public (contenu mixte depuis client.popcornn.app)', () => {
    expect(checkBackendUrlForGuests('http://popcorn.example.com:3000')).toMatchObject({ ok: false, issue: 'http' });
  });

  it('signale le réseau local / privé, même en HTTPS', () => {
    for (const u of [
      'http://192.168.1.20:3000',
      'https://10.0.0.5',
      'http://172.20.1.1',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://nas.local',
      'http://nas:3000',
      'http://100.101.102.103:3000',
      'http://[fd12:3456::1]:3000',
      'http://[::1]:3000',
    ]) {
      expect(checkBackendUrlForGuests(u), u).toMatchObject({ ok: false, issue: 'private' });
    }
  });
});

describe('isPrivateOrLocalHost', () => {
  it('ne considère pas les adresses publiques comme privées', () => {
    expect(isPrivateOrLocalHost('172.32.0.1')).toBe(false);
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrLocalHost('popcornn.app')).toBe(false);
    expect(isPrivateOrLocalHost('[2001:db8::1]')).toBe(false);
  });
});

describe('guestBackendIssueKey', () => {
  it('renvoie une clé i18n par problème', () => {
    expect(guestBackendIssueKey('missing')).toBe('settingsMenu.localUsers.serverMissing');
    expect(guestBackendIssueKey('http')).toBe('settingsMenu.localUsers.serverHttp');
  });
});
