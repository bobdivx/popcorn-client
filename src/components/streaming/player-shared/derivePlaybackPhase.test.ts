import { describe, expect, it } from 'vitest';
import {
  computeReliableProgressPercent,
  derivePlaybackPhase,
  isTorrentReallyComplete,
} from './derivePlaybackPhase';

describe('computeReliableProgressPercent', () => {
  it('prend le min entre progress API et octets', () => {
    expect(
      computeReliableProgressPercent({
        progress: 1,
        downloaded_bytes: 50,
        total_bytes: 100,
      }),
    ).toBe(50);
  });

  it('utilise les octets si pas de progress API', () => {
    expect(
      computeReliableProgressPercent({
        downloaded_bytes: 25,
        total_bytes: 100,
      }),
    ).toBe(25);
  });
});

describe('isTorrentReallyComplete', () => {
  it('refuse progress 0.99 seul', () => {
    expect(isTorrentReallyComplete({ progress: 0.99, state: 'downloading' })).toBe(false);
  });

  it('accepte seeding / completed', () => {
    expect(isTorrentReallyComplete({ state: 'seeding', progress: 0.5 })).toBe(true);
    expect(isTorrentReallyComplete({ state: 'completed' })).toBe(true);
  });

  it('accepte files_available + fichiers UI', () => {
    expect(isTorrentReallyComplete({ files_available: true, state: 'downloading' }, { hasVideoFiles: true })).toBe(
      true,
    );
  });
});

describe('derivePlaybackPhase', () => {
  it('mappe adding → resolving', () => {
    const d = derivePlaybackPhase({ playStatus: 'adding', isActiveSession: true });
    expect(d.phase).toBe('resolving');
  });

  it('détecte findingPeers', () => {
    const d = derivePlaybackPhase({
      playStatus: 'downloading',
      torrentStats: {
        state: 'downloading',
        progress: 0,
        download_speed: 0,
        peers_connected: 0,
        total_bytes: 1_000_000,
        downloaded_bytes: 0,
      },
    });
    expect(d.phase).toBe('findingPeers');
  });

  it('détecte downloading actif', () => {
    const d = derivePlaybackPhase({
      playStatus: 'downloading',
      torrentStats: {
        state: 'downloading',
        progress: 0.42,
        download_speed: 8_000_000,
        peers_connected: 12,
        total_bytes: 100,
        downloaded_bytes: 42,
      },
    });
    expect(d.phase).toBe('downloading');
    expect(d.progressPercent).toBe(42);
  });

  it('n’affiche pas preparing pendant le DL', () => {
    const d = derivePlaybackPhase({
      playStatus: 'downloading',
      isHlsPreparing: true,
      torrentStats: {
        state: 'downloading',
        progress: 0.5,
        download_speed: 1_000_000,
        peers_connected: 5,
        total_bytes: 100,
        downloaded_bytes: 50,
      },
    });
    expect(d.phase).toBe('downloading');
  });

  it('passe en preparingPlayback quand terminé + HLS', () => {
    const d = derivePlaybackPhase({
      playStatus: 'ready',
      isHlsPreparing: true,
      hasVideoFiles: true,
      torrentStats: { state: 'seeding', progress: 1, files_available: true, total_bytes: 100, downloaded_bytes: 100 },
    });
    expect(d.phase).toBe('preparingPlayback');
  });

  it('passe en error', () => {
    expect(derivePlaybackPhase({ playStatus: 'error', errorMessage: 'boom' }).phase).toBe('error');
  });
});
