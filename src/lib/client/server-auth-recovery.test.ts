import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldForceReloginOn401,
  dispatchSessionExpiredOnce,
  __resetSessionExpiredDebounce,
} from './server-auth-recovery';

const base = { status: 401, isAuthBootstrap: false, hasCloudToken: false, hasServerSession: false };

describe('shouldForceReloginOn401', () => {
  it('401 sans aucun token vérifiable (seul le JWT local reste) → reconnexion', () => {
    expect(shouldForceReloginOn401(base)).toBe(true);
  });
  it('session pls1 expirée/révoquée → reconnexion (comportement existant)', () => {
    expect(shouldForceReloginOn401({ ...base, hasServerSession: true })).toBe(true);
  });
  it('token cloud encore présent (refresh réseau en échec) → pas de reconnexion forcée', () => {
    expect(shouldForceReloginOn401({ ...base, hasCloudToken: true })).toBe(false);
    expect(shouldForceReloginOn401({ ...base, hasCloudToken: true, hasServerSession: true })).toBe(false);
  });
  it('401 de connexion/inscription = identifiants invalides, pas une session expirée', () => {
    expect(shouldForceReloginOn401({ ...base, isAuthBootstrap: true })).toBe(false);
  });
  it('autres statuts ignorés', () => {
    for (const status of [200, 403, 404, 426, 500]) {
      expect(shouldForceReloginOn401({ ...base, status })).toBe(false);
    }
  });
});

describe('dispatchSessionExpiredOnce', () => {
  beforeEach(() => {
    __resetSessionExpiredDebounce();
  });
  it('une seule redirection pour une rafale de 401 parallèles', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class { type: string; constructor(t: string) { this.type = t; } });
    try {
      expect(dispatchSessionExpiredOnce(1000)).toBe(true);
      expect(dispatchSessionExpiredOnce(1500)).toBe(false);
      expect(dispatchSessionExpiredOnce(2000)).toBe(false);
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      expect(dispatchEvent.mock.calls[0][0].type).toBe('popcorn:session-expired');
      expect(dispatchSessionExpiredOnce(7000)).toBe(true);
      expect(dispatchEvent).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
