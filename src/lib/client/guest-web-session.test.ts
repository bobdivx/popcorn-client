import { afterEach, describe, expect, it } from 'vitest';
import { clearGuestWebToken, getGuestWebToken, readJwtExpiryMs, setGuestWebToken } from './guest-web-session';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

describe('guest-web-session', () => {
  afterEach(() => clearGuestWebToken());

  it('lit l’expiration d’un JWT', () => {
    expect(readJwtExpiryMs(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
    expect(readJwtExpiryMs('pas-un-jwt')).toBeNull();
  });

  it('rend le jeton valide uniquement pour le même invité', () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    setGuestWebToken(token, 'guest-1');
    expect(getGuestWebToken('guest-1')).toBe(token);
    expect(getGuestWebToken('guest-2')).toBeNull();
    // Un autre invité sur l'appareil : l'ancien jeton est purgé.
    expect(getGuestWebToken('guest-1')).toBeNull();
  });

  it('ignore un jeton expiré', () => {
    setGuestWebToken(jwt({ exp: Math.floor(Date.now() / 1000) - 10 }), 'guest-1');
    expect(getGuestWebToken('guest-1')).toBeNull();
  });
});
