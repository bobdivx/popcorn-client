import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canAccess, isMsStoreLocalServerAdmin } from './permissions';

const setLocalSession = (role: string) => {
  localStorage.setItem('popcorn_user', JSON.stringify({ id: 'u1', email: 'tester@example.com', role }));
  localStorage.setItem('server_session_token', 'pls1.1.abc.def');
};

describe('permissions — local server admin (Microsoft Store edition)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('gives the msstore local server admin access to server and library settings', () => {
    vi.stubEnv('PUBLIC_DISTRIBUTION', 'msstore');
    setLocalSession('admin');
    expect(isMsStoreLocalServerAdmin()).toBe(true);
    expect(canAccess('settings.server')).toBe(true);
    expect(canAccess('library.manage')).toBe(true);
  });

  it('keeps invited local users restricted in the msstore edition', () => {
    vi.stubEnv('PUBLIC_DISTRIBUTION', 'msstore');
    setLocalSession('local');
    expect(canAccess('settings.server')).toBe(false);
  });

  it('does not change other editions', () => {
    vi.stubEnv('PUBLIC_DISTRIBUTION', '');
    setLocalSession('admin');
    expect(isMsStoreLocalServerAdmin()).toBe(false);
    expect(canAccess('settings.server')).toBe(false);
  });
});
