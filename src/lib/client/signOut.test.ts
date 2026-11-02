import { describe, expect, it, vi } from 'vitest';
import { serverRoleLabel, signOutEverywhere } from './signOut';

describe('signOutEverywhere', () => {
  it('appelle la déconnexion serveur, efface tous les jetons et le jeton média', async () => {
    const calls: string[] = [];
    await signOutEverywhere({
      serverLogout: () => void calls.push('server'),
      clearAllTokens: () => void calls.push('tokens'),
      clearMediaToken: () => void calls.push('media'),
    });
    expect(calls).toEqual(['server', 'tokens', 'media']);
  });

  it('continue même si une étape échoue', async () => {
    const clearAllTokens = vi.fn();
    const clearMediaToken = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await signOutEverywhere({
      serverLogout: () => {
        throw new Error('boom');
      },
      clearAllTokens,
      clearMediaToken,
    });
    expect(clearAllTokens).toHaveBeenCalledOnce();
    expect(clearMediaToken).toHaveBeenCalledOnce();
  });

  it('par défaut, retire les jetons serveur et cloud du stockage', async () => {
    for (const k of ['access_token', 'refresh_token', 'cloud_access_token', 'cloud_refresh_token', 'server_session_token']) {
      localStorage.setItem(k, 'x');
    }
    await signOutEverywhere();
    for (const k of ['access_token', 'refresh_token', 'cloud_access_token', 'cloud_refresh_token', 'server_session_token']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
  });
});

describe('serverRoleLabel', () => {
  it('traduit le rôle serveur', () => {
    expect(serverRoleLabel(true)).toBe('admin');
    expect(serverRoleLabel(false)).toBe('member');
    expect(serverRoleLabel(null)).toBe('unknown');
    expect(serverRoleLabel(undefined)).toBe('unknown');
  });
});
