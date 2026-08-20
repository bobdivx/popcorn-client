import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatEtaSeconds,
  getNetworkPlaybackProfile,
} from './networkPlaybackProfile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatEtaSeconds', () => {
  it('formate les durées', () => {
    expect(formatEtaSeconds(null)).toBe('…');
    expect(formatEtaSeconds(0)).toBe('prêt');
    expect(formatEtaSeconds(4)).toBe('4 s');
    expect(formatEtaSeconds(18)).toBe('~18 s');
    expect(formatEtaSeconds(90)).toBe('~2 min');
  });
});

describe('getNetworkPlaybackProfile', () => {
  it('sans Network Information API : qualité auto', () => {
    vi.stubGlobal('navigator', {});
    const p = getNetworkPlaybackProfile(false, { isTv: false });
    expect(p.effectiveType).toBe('unknown');
    expect(p.suggestedMaxHeight).toBeNull();
    expect(p.startLevel).toBe(-1);
  });

  it('4G : 720p, buffer court, startLevel 0', () => {
    vi.stubGlobal('navigator', {
      connection: { effectiveType: '4g', downlink: 4, saveData: false },
    });
    const p = getNetworkPlaybackProfile(false, { isTv: false });
    expect(p.effectiveType).toBe('4g');
    expect(p.suggestedMaxHeight).toBe(720);
    expect(p.startLevel).toBe(0);
    expect(p.maxBufferLength).toBe(32);
  });

  it('Wi‑Fi : pas de plafond de hauteur', () => {
    vi.stubGlobal('navigator', {
      connection: { type: 'wifi', effectiveType: '4g', downlink: 50, saveData: false },
    });
    const p = getNetworkPlaybackProfile(false, { isTv: false });
    expect(p.effectiveType).toBe('wifi');
    expect(p.suggestedMaxHeight).toBeNull();
    expect(p.startLevel).toBe(-1);
  });

  it('TV / webOS : plafond 1080p même en Wi‑Fi', () => {
    vi.stubGlobal('navigator', {
      connection: { type: 'wifi', effectiveType: '4g', downlink: 50, saveData: false },
    });
    const p = getNetworkPlaybackProfile(false, { isTv: true });
    expect(p.suggestedMaxHeight).toBe(1080);
    expect(p.startLevel).toBe(0);
    expect(p.maxBufferLength).toBeLessThanOrEqual(24);
  });
});
