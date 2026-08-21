import { describe, expect, it } from 'vitest';
import {
  getBufferAheadPercent,
  getBufferAheadSeconds,
  getBufferedEndAround,
  getBufferedTimelinePercent,
  getEngineBufferAhead,
  isTimeInBuffered,
  hasMediaPlaybackStarted,
  isVideoVisiblyPlaying,
  nextBufferingOverlayVisible,
  canRevealPlayback,
  type TimeRangesLike,
} from './bufferMetrics';

function ranges(pairs: Array<[number, number]>): TimeRangesLike {
  return {
    length: pairs.length,
    start: (i: number) => pairs[i][0],
    end: (i: number) => pairs[i][1],
  };
}

describe('getBufferAheadSeconds', () => {
  it('retourne 0 si hors buffer', () => {
    expect(getBufferAheadSeconds(ranges([[10, 20]]), 5)).toBe(0);
  });

  it('mesure le ahead dans la range courante', () => {
    expect(getBufferAheadSeconds(ranges([[100, 115]]), 105)).toBe(10);
  });

  it('ne prend pas buffered.end / duration pour faux 100%', () => {
    // Seek à 2700s avec 8s de buffer : ahead=8, pas ~100%
    const ahead = getBufferAheadSeconds(ranges([[2700, 2708]]), 2700);
    expect(ahead).toBe(8);
    expect(getBufferAheadPercent(ahead, 20)).toBe(40);
  });
});

describe('isVideoVisiblyPlaying', () => {
  it('détecte paused=false même à t=0', () => {
    expect(
      isVideoVisiblyPlaying({ paused: false, currentTime: 0 } as HTMLVideoElement),
    ).toBe(true);
  });

  it('détecte une tête qui a avancé même si paused est coincé à true (webOS)', () => {
    expect(
      isVideoVisiblyPlaying({ paused: true, currentTime: 1.2 } as HTMLVideoElement),
    ).toBe(true);
  });

  it('reste faux au tout début', () => {
    expect(
      isVideoVisiblyPlaying({ paused: true, currentTime: 0 } as HTMLVideoElement),
    ).toBe(false);
  });
});

describe('hasMediaPlaybackStarted', () => {
  it('n’accepte pas un simple readyState HAVE_CURRENT_DATA (ce n’est pas encore du play)', () => {
    expect(
      hasMediaPlaybackStarted({
        paused: true,
        currentTime: 0,
        readyState: 2,
        videoWidth: 0,
        videoHeight: 0,
      } as HTMLVideoElement),
    ).toBe(false);
  });

  it('accepte une frame décodée (videoWidth) sans TimeRanges', () => {
    expect(
      hasMediaPlaybackStarted({
        paused: true,
        currentTime: 0,
        readyState: 0,
        videoWidth: 1920,
        videoHeight: 1080,
      } as HTMLVideoElement),
    ).toBe(true);
  });

  it('reste faux tant qu’aucune image n’est décodée', () => {
    expect(
      hasMediaPlaybackStarted({
        paused: true,
        currentTime: 0,
        readyState: 0,
        videoWidth: 0,
        videoHeight: 0,
      } as HTMLVideoElement),
    ).toBe(false);
  });
});

describe('getEngineBufferAhead', () => {
  it('prend le max entre TimeRanges et le buffer hls.js', () => {
    expect(getEngineBufferAhead(ranges([[0, 3]]), 0, { len: 12, start: 0, end: 12 })).toBe(12);
    expect(getEngineBufferAhead(ranges([[0, 10]]), 0, { len: 4 })).toBe(10);
  });

  it('utilise hls.js si video.buffered est vide', () => {
    expect(getEngineBufferAhead(ranges([]), 0, { end: 8 })).toBe(8);
  });
});

describe('canRevealPlayback', () => {
  it('attend un vrai buffer, pas un simple play()', () => {
    expect(canRevealPlayback({ bufferAheadSec: 3, primedSeconds: 0.4, minBufferSec: 8 })).toBe(
      false,
    );
    expect(canRevealPlayback({ bufferAheadSec: 8, primedSeconds: 0, minBufferSec: 8 })).toBe(true);
  });

  it('accepte un amorçage assez long si TimeRanges est vide (TV)', () => {
    expect(canRevealPlayback({ bufferAheadSec: 0, primedSeconds: 8, minBufferSec: 8 })).toBe(true);
  });
});

describe('nextBufferingOverlayVisible', () => {
  const loading = { isLoading: true, isWaiting: false, isSeekSettling: false };
  const idle = { isLoading: false, isWaiting: false, isSeekSettling: false };
  const waiting = { isLoading: false, isWaiting: true, isSeekSettling: false };

  it('reste visible pendant le chargement même avec un peu de buffer', () => {
    expect(nextBufferingOverlayVisible(true, 4, loading)).toBe(true);
  });

  it('reste visible pendant l’amorçage (play muted, isLoading)', () => {
    expect(
      nextBufferingOverlayVisible(true, 3, { ...loading, isPlaying: true }),
    ).toBe(true);
  });

  it('se masque au moment du play réel (buffer prêt, isLoading false)', () => {
    expect(
      nextBufferingOverlayVisible(true, 8, { ...idle, isPlaying: true }),
    ).toBe(false);
  });

  it('ne se masque qu’au-dessus du seuil hide', () => {
    expect(nextBufferingOverlayVisible(true, 4, idle)).toBe(true);
    expect(nextBufferingOverlayVisible(true, 8, idle)).toBe(false);
  });

  it('ne revient que si waiting et buffer vraiment bas', () => {
    expect(nextBufferingOverlayVisible(false, 5, waiting)).toBe(false);
    expect(nextBufferingOverlayVisible(false, 1, waiting)).toBe(true);
  });
});

describe('getBufferedTimelinePercent', () => {
  it('utilise la durée réelle comme dénominateur', () => {
    expect(getBufferedTimelinePercent(ranges([[2700, 2710]]), 2700, 3600)).toBeCloseTo(
      (2710 / 3600) * 100,
      5,
    );
  });
});

describe('isTimeInBuffered / getBufferedEndAround', () => {
  it('détecte une position dans le buffer', () => {
    const b = ranges([[50, 80]]);
    expect(isTimeInBuffered(b, 60)).toBe(true);
    expect(isTimeInBuffered(b, 100)).toBe(false);
    expect(getBufferedEndAround(b, 60)).toBe(80);
  });
});
