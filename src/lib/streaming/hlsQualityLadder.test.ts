import { describe, expect, it } from 'vitest';
import {
  pinHlsToLowestLevel,
  playlistDurationSeconds,
} from './hlsQualityLadder';

describe('playlistDurationSeconds', () => {
  it('somme les EXTINF', () => {
    const m3u8 = `#EXTM3U
#EXTINF:4.0,
v720/segment_00000.ts
#EXTINF:4.0,
v720/segment_00001.ts
#EXTINF:3.5,
v720/segment_00002.ts
`;
    expect(playlistDurationSeconds(m3u8)).toBe(11.5);
  });
});

describe('pinHlsToLowestLevel', () => {
  it('ignore une seule qualité', () => {
    const hls = { levels: [{}], autoLevelCapping: -1, currentLevel: 0, startLevel: -1 };
    expect(pinHlsToLowestLevel(hls)).toBe(false);
  });

  it('bloque sur le 720p si ladder', () => {
    const hls = {
      levels: [{ url: '/v720' }, { url: '/v1080' }],
      autoLevelCapping: -1,
      currentLevel: 1,
      startLevel: -1,
    };
    expect(pinHlsToLowestLevel(hls)).toBe(true);
    expect(hls.autoLevelCapping).toBe(0);
    expect(hls.currentLevel).toBe(0);
    expect(hls.startLevel).toBe(0);
  });
});
