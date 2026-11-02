import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DEMO_LIBRARY_BACKEND_URL,
  forgetUnreachableBackend,
  getStoredBackendUrlToVerify,
  probeBackendReachable,
  setBackendUrl,
  setDemoMode,
} from './backend-config';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

const okResponse = (status = 200) => ({ status, ok: status >= 200 && status < 300 }) as Response;

describe('getStoredBackendUrlToVerify', () => {
  it('aucune URL enregistrée → rien à vérifier (premier lancement géré par /setup)', () => {
    expect(getStoredBackendUrlToVerify()).toBeNull();
  });

  it('URL serveur étrangère enregistrée → à vérifier (sans slash final)', () => {
    localStorage.setItem('popcorn_backend_url', 'https://backend.example.org/');
    expect(getStoredBackendUrlToVerify()).toBe('https://backend.example.org');
  });

  it('bibliothèque de démonstration → jamais vérifiée (aucun serveur contacté)', () => {
    setBackendUrl(DEMO_LIBRARY_BACKEND_URL);
    expect(getStoredBackendUrlToVerify()).toBeNull();
  });

  it('backend même origine que la page (déploiement dédié) → pas vérifié ici', () => {
    localStorage.setItem('popcorn_backend_url', `${window.location.protocol}//${window.location.hostname}:3000`);
    expect(getStoredBackendUrlToVerify()).toBeNull();
  });

  it('backend fixé par /config.json (flag runtime) → pas vérifié ici', () => {
    localStorage.setItem('popcorn_backend_url', 'https://backend.example.org');
    sessionStorage.setItem('popcorn_backend_from_runtime', '1');
    expect(getStoredBackendUrlToVerify()).toBeNull();
  });

  it('valeur non http(s) → ignorée', () => {
    localStorage.setItem('popcorn_backend_url', 'not-an-url');
    expect(getStoredBackendUrlToVerify()).toBeNull();
  });
});

describe('probeBackendReachable', () => {
  it('2xx → joignable, interroge /api/client/health, une seule requête', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(200));
    const res = await probeBackendReachable('https://backend.example.org/', { fetchImpl, retryDelayMs: 0 });
    expect(res).toEqual({ reachable: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://backend.example.org/api/client/health');
  });

  it('4xx (serveur qui répond) → joignable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(401));
    const res = await probeBackendReachable('https://backend.example.org', { fetchImpl, retryDelayMs: 0 });
    expect(res.reachable).toBe(true);
  });

  it('5xx (ex. 502 du proxy) deux fois → injoignable, avec réessai', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(502));
    const res = await probeBackendReachable('https://backend.example.org', { fetchImpl, retryDelayMs: 0 });
    expect(res).toEqual({ reachable: false, reason: 'server_error', status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('échec réseau / CORS (TypeError) deux fois → injoignable (network)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await probeBackendReachable('https://backend.example.org', { fetchImpl, retryDelayMs: 0 });
    expect(res).toEqual({ reachable: false, reason: 'network' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('coupure passagère : échec puis succès au réessai → joignable (pas de faux positif)', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse(200));
    const res = await probeBackendReachable('https://backend.example.org', { fetchImpl, retryDelayMs: 0 });
    expect(res.reachable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('pas de réponse dans le délai → injoignable (timeout)', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const p = probeBackendReachable('https://backend.example.org', { fetchImpl, timeoutMs: 5000, retryDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000 + 1000 + 5000 + 100);
    await expect(p).resolves.toEqual({ reachable: false, reason: 'timeout' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ne modifie jamais le stockage', async () => {
    setBackendUrl('https://backend.example.org');
    setDemoMode(true);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await probeBackendReachable('https://backend.example.org', { fetchImpl, retryDelayMs: 0 });
    expect(localStorage.getItem('popcorn_backend_url')).toBe('https://backend.example.org');
    expect(localStorage.getItem('popcorn_my_backend_url')).toBe('https://backend.example.org');
    expect(localStorage.getItem('popcorn_demo_mode')).toBe('1');
  });
});

describe('forgetUnreachableBackend (« Changer de serveur »)', () => {
  it('efface URL serveur, « mon serveur » et mode démo, rien d’autre', () => {
    setBackendUrl('https://backend.example.org');
    setDemoMode(true);
    localStorage.setItem('popcorn_intro_skipped', '1');
    forgetUnreachableBackend();
    expect(localStorage.getItem('popcorn_backend_url')).toBeNull();
    expect(localStorage.getItem('popcorn_my_backend_url')).toBeNull();
    expect(localStorage.getItem('popcorn_demo_mode')).toBeNull();
    expect(localStorage.getItem('popcorn_intro_skipped')).toBe('1');
  });
});
