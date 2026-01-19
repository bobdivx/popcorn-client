import { beforeEach, describe, expect, it, vi } from 'vitest';

function setBackendUrl(url: string) {
  localStorage.setItem('popcorn_backend_url', url);
}

describe('server-api (mode Tauri)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setBackendUrl('http://127.0.0.1:3000');
  });

  it('getFilmsData appelle le backend et renvoie un tableau', async () => {
    vi.doMock('../utils/tauri.js', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-http', () => ({
      fetch: (...args: any[]) => (globalThis as any).fetch(...args),
    }));

    const fetchSpy = vi.fn(async (url: any) => {
      // endpoint attendu (pas /api/v1/* en Tauri)
      expect(String(url)).toContain('http://127.0.0.1:3000/api/torrents/list');
      expect(String(url)).toContain('category=FILM');
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              slug: 'my-film',
              cleanTitle: 'My Film',
              category: 'FILM',
              imageUrl: 'https://img',
              heroImageUrl: 'https://hero',
              releaseDate: '2024-01-01',
              genres: ['Action'],
            },
          ],
        }),
      } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    const { serverApi } = await import('./server-api.ts');
    const res = await serverApi.getFilmsData();
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data?.[0]?.type).toBe('movie');
    expect(res.data?.[0]?.id).toBe('my-film');
  });

  it('getSeriesData appelle le backend et renvoie un tableau', async () => {
    vi.doMock('../utils/tauri.js', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-http', () => ({
      fetch: (...args: any[]) => (globalThis as any).fetch(...args),
    }));

    const fetchSpy = vi.fn(async (url: any) => {
      expect(String(url)).toContain('http://127.0.0.1:3000/api/torrents/list');
      expect(String(url)).toContain('category=SERIES');
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              slug: 'my-serie',
              cleanTitle: 'My Serie',
              category: 'SERIES',
              releaseDate: '2023-01-01',
            },
          ],
        }),
      } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    const { serverApi } = await import('./server-api.ts');
    const res = await serverApi.getSeriesData();
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data?.[0]?.type).toBe('tv');
    expect(res.data?.[0]?.id).toBe('my-serie');
  });

  it('getDashboardData ne jette pas et renvoie des listes', async () => {
    vi.doMock('../utils/tauri.js', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-http', () => ({
      fetch: (...args: any[]) => (globalThis as any).fetch(...args),
    }));

    const fetchSpy = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('category=FILM')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ slug: 'm1', cleanTitle: 'Movie 1', category: 'FILM' }],
          }),
        } as any;
      }
      if (u.includes('category=SERIES')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ slug: 's1', cleanTitle: 'Series 1', category: 'SERIES', tmdbType: 'tv' }],
          }),
        } as any;
      }
      throw new Error(`unexpected url: ${u}`);
    });
    (globalThis as any).fetch = fetchSpy;

    const { serverApi } = await import('./server-api.ts');
    const res = await serverApi.getDashboardData();
    expect(res.success).toBe(true);
    expect(res.data).toBeTruthy();
    expect(Array.isArray(res.data?.popularMovies)).toBe(true);
    expect(Array.isArray(res.data?.popularSeries)).toBe(true);
    expect(Array.isArray(res.data?.recentAdditions)).toBe(true);
  });
});

