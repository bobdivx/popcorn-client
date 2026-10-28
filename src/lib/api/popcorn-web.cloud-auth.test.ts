import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Erreur levée par fetch quand l'AbortController du timeout se déclenche. */
function abortError(): Error {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okLogin = {
  success: true,
  data: {
    user: { id: 'u1', email: 'a@b.c', is_admin: false },
    accessToken: 'at',
    refreshToken: 'rt',
  },
};

async function load() {
  vi.doMock('../utils/tauri.js', () => ({ isTauri: () => false }));
  return import('./popcorn-web.js');
}

describe('popcorn-web : authentification cloud (timeout + nouvelle tentative)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('utilise un délai de 25 s', async () => {
    const mod = await load();
    expect(mod.CLOUD_AUTH_TIMEOUT_MS).toBe(25000);
  });

  it('réessaie une fois après un timeout puis réussit', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(jsonResponse(200, okLogin));
    vi.stubGlobal('fetch', fetchSpy);
    const { loginCloud } = await load();
    const res = await loginCloud('a@b.c', 'secret123');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res?.accessToken).toBe('at');
  });

  it('réessaie une fois après un 5xx puis réussit', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, okLogin));
    vi.stubGlobal('fetch', fetchSpy);
    const { loginCloud } = await load();
    const res = await loginCloud('a@b.c', 'secret123');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res?.user.id).toBe('u1');
  });

  it('deux timeouts : CloudTimeoutError (message distinct), pas de 3e appel', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('fetch', fetchSpy);
    const { loginCloud, isCloudTimeoutError, CLOUD_TIMEOUT_MESSAGE } = await load();
    const err = await loginCloud('a@b.c', 'secret123').catch((e) => e);
    expect(isCloudTimeoutError(err)).toBe(true);
    expect((err as Error).message).toBe(CLOUD_TIMEOUT_MESSAGE);
    expect(CLOUD_TIMEOUT_MESSAGE).toBe('Le service cloud met trop de temps à répondre. Réessayez.');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('deux 5xx : null (CloudUnavailable côté appelant)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    vi.stubGlobal('fetch', fetchSpy);
    const { loginCloud } = await load();
    expect(await loginCloud('a@b.c', 'secret123')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('401 : pas de nouvelle tentative, erreur propagée', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'Unauthorized', message: 'Email ou mot de passe incorrect' }));
    vi.stubGlobal('fetch', fetchSpy);
    const { loginCloud } = await load();
    const err = await loginCloud('a@b.c', 'bad').catch((e) => e);
    expect((err as Error & { status?: number }).status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('inscription : deux timeouts → CloudTimeoutError', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('fetch', fetchSpy);
    const { registerCloud, isCloudTimeoutError } = await load();
    const err = await registerCloud('a@b.c', 'secret123').catch((e) => e);
    expect(isCloudTimeoutError(err)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('inscription : 400 de validation non réessayé', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: 'ValidationError', message: 'Email invalide' }));
    vi.stubGlobal('fetch', fetchSpy);
    const { registerCloud } = await load();
    await registerCloud('x', 'secret123').catch(() => null);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('isAbortLikeError reconnaît « Fetch is aborted » (WebView)', async () => {
    const { isAbortLikeError } = await load();
    expect(isAbortLikeError(new Error('Fetch is aborted'))).toBe(true);
    expect(isAbortLikeError(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('server-api : message CloudTimeout', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('loginCloud renvoie error=CloudTimeout et le message dédié', async () => {
    vi.doMock('../utils/tauri.js', () => ({ isTauri: () => false }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError()));
    const { authMethods } = await import('../client/server-api/auth.js');
    const ctx: any = {
      saveTokens: vi.fn(),
      saveUser: vi.fn(),
      backendRequest: vi.fn(),
      generateClientTokens: vi.fn(),
      getUser: vi.fn(),
      clearTokens: vi.fn(),
    };
    const res = await authMethods.loginCloud.call(ctx, 'a@b.c', 'secret123');
    expect(res.success).toBe(false);
    expect(res.error).toBe('CloudTimeout');
    expect(res.message).toBe('Le service cloud met trop de temps à répondre. Réessayez.');
  });
});
