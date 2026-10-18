import { beforeEach, describe, expect, it, vi } from 'vitest';

const serverRows: unknown[] = [];
vi.mock('../client/server-api', () => ({
  serverApi: {
    listResumeWatching: async () => ({ success: true, data: serverRows }),
    backendRequest: async () => ({ success: true }),
    getCurrentUserId: () => null,
  },
}));

import { finalizeResumeSeconds, invalidateServerResumeCache, resolveResumeSeconds } from './resumePosition';
import { savePlaybackPositionByMedia } from './torrent-storage';
import { recordEpisodeProgress } from '../watchedEpisodes';

const DEVICE = 'dev-1';

beforeEach(() => {
  localStorage.clear();
  serverRows.length = 0;
  invalidateServerResumeCache();
});

describe('finalizeResumeSeconds', () => {
  it('repart du début au-delà de 95 %', () => {
    expect(finalizeResumeSeconds(960, 1000)).toBeNull();
    expect(finalizeResumeSeconds(940, 1000)).toBe(940);
  });
  it('ignore les positions minuscules', () => {
    expect(finalizeResumeSeconds(2, 1000)).toBeNull();
  });
});

describe('resolveResumeSeconds', () => {
  it('film : reprend depuis la reprise serveur (autre appareil, rien en local)', async () => {
    serverRows.push({ tmdb_id: 42, tmdb_type: 'movie', position_seconds: 1234, duration_seconds: 6000, last_watched: Date.now() });
    expect(await resolveResumeSeconds({ tmdbId: 42, tmdbType: 'movie', deviceId: DEVICE })).toBe(1234);
  });

  it('film terminé à 96 % → début', async () => {
    serverRows.push({ tmdb_id: 42, tmdb_type: 'movie', position_seconds: 5760, duration_seconds: 6000, last_watched: Date.now() });
    expect(await resolveResumeSeconds({ tmdbId: 42, tmdbType: 'movie', deviceId: DEVICE })).toBeNull();
  });

  it('série : ignore la clé média d’un autre épisode, prend la progression de CET épisode', async () => {
    await savePlaybackPositionByMedia(7, 'tv', DEVICE, 1500, { season: 1, episode: 3 });
    recordEpisodeProgress(7, 1, 5, 600, 2400);
    expect(await resolveResumeSeconds({ tmdbId: 7, tmdbType: 'tv', season: 1, episode: 5, deviceId: DEVICE })).toBe(600);
    expect(await resolveResumeSeconds({ tmdbId: 7, tmdbType: 'tv', season: 1, episode: 4, deviceId: DEVICE })).toBeNull();
  });

  it('la sauvegarde la plus récente gagne', async () => {
    serverRows.push({ tmdb_id: 9, tmdb_type: 'movie', position_seconds: 300, duration_seconds: 6000, last_watched: Date.now() - 86_400_000 });
    await savePlaybackPositionByMedia(9, 'movie', DEVICE, 2000);
    expect(await resolveResumeSeconds({ tmdbId: 9, tmdbType: 'movie', deviceId: DEVICE })).toBe(2000);
  });
});
