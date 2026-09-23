import { describe, expect, it } from 'vitest';
import { shouldKeepPreviousTorrentStats } from './torrentStatsMerge';

describe('shouldKeepPreviousTorrentStats', () => {
  it('applique un downloading à 0 % avec pairs (démarrage réel)', () => {
    expect(
      shouldKeepPreviousTorrentStats(
        { state: 'downloading', progress: 0 },
        { state: 'queued', progress: 0 },
      ),
    ).toBe(false);
  });

  it('ignore une réponse unknown qui écraserait la file', () => {
    expect(
      shouldKeepPreviousTorrentStats(
        { state: 'unknown', progress: 0 },
        { state: 'queued', progress: 0 },
      ),
    ).toBe(true);
  });

  it('ignore un retour à 0 % alors que la progression est déjà avancée', () => {
    expect(
      shouldKeepPreviousTorrentStats(
        { state: 'downloading', progress: 0 },
        { state: 'downloading', progress: 0.4 },
      ),
    ).toBe(true);
  });

  it('accepte la première réponse s\'il n\'y a pas encore de stats', () => {
    expect(shouldKeepPreviousTorrentStats({ state: 'queued', progress: 0 }, null)).toBe(false);
  });
});
