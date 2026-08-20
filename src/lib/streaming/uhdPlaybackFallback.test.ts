import { describe, expect, it } from 'vitest';
import {
  isUhdQualityAttempt,
  shouldFallbackUhdPlayback,
  UHD_FALLBACK_AFTER_PLAYLIST_MS,
  UHD_FALLBACK_WITHOUT_PLAYLIST_MS,
} from './uhdPlaybackFallback';

describe('isUhdQualityAttempt', () => {
  it('auto / source et 4K : oui', () => {
    expect(isUhdQualityAttempt(null)).toBe(true);
    expect(isUhdQualityAttempt(undefined)).toBe(true);
    expect(isUhdQualityAttempt(2160)).toBe(true);
  });

  it('1080p et moins : non', () => {
    expect(isUhdQualityAttempt(1080)).toBe(false);
    expect(isUhdQualityAttempt(720)).toBe(false);
  });
});

describe('shouldFallbackUhdPlayback', () => {
  const base = {
    isUhdAttempt: true,
    alreadyFellBack: false,
    hasStartedPlayback: false,
    playlistOrBufferReady: false,
    elapsedMs: 0,
    fatalMediaError: false,
  };

  it('erreur média fatale : immédiat', () => {
    expect(shouldFallbackUhdPlayback({ ...base, fatalMediaError: true })).toBe(true);
  });

  it('lecture déjà démarrée : jamais', () => {
    expect(
      shouldFallbackUhdPlayback({
        ...base,
        hasStartedPlayback: true,
        fatalMediaError: true,
        elapsedMs: 90_000,
      }),
    ).toBe(false);
  });

  it('playlist prête sans playing : après le délai court', () => {
    expect(
      shouldFallbackUhdPlayback({
        ...base,
        playlistOrBufferReady: true,
        elapsedMs: UHD_FALLBACK_AFTER_PLAYLIST_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldFallbackUhdPlayback({
        ...base,
        playlistOrBufferReady: true,
        elapsedMs: UHD_FALLBACK_AFTER_PLAYLIST_MS,
      }),
    ).toBe(true);
  });

  it('sans playlist : attendre le délai long', () => {
    expect(
      shouldFallbackUhdPlayback({
        ...base,
        elapsedMs: UHD_FALLBACK_AFTER_PLAYLIST_MS,
      }),
    ).toBe(false);
    expect(
      shouldFallbackUhdPlayback({
        ...base,
        elapsedMs: UHD_FALLBACK_WITHOUT_PLAYLIST_MS,
      }),
    ).toBe(true);
  });
});
