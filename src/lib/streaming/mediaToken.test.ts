import { describe, expect, it } from 'vitest';
import { addMediaToken, isSignableMediaUrl, stripMediaToken } from './mediaToken';

const B = 'https://srv.example.org';

describe('mediaToken URL helpers', () => {
  it('signe seulement les routes de lecture du backend configuré', () => {
    expect(isSignableMediaUrl(`${B}/api/local/stream/a.mkv/playlist.m3u8?info_hash=h`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/local/hls/abc/segment_00001.ts`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/local/duration?path=a`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/local/audio-streams?path=a`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/stream-torrent/h/0/a.mkv?access_token=x`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/remote-stream/proxy?backend=x&path=y`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/library/scrub-thumbnails/42/1`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/client/torrents/abc/stats/v1`, B)).toBe(true);
    expect(isSignableMediaUrl(`${B}/api/client/torrents/abc/files`, B)).toBe(false);
    expect(isSignableMediaUrl(`${B}/api/library/media`, B)).toBe(false);
    expect(isSignableMediaUrl(`https://evil.example.com/api/local/stream/a`, B)).toBe(false);
    expect(isSignableMediaUrl(`blob:${B}/x`, B)).toBe(false);
    expect(isSignableMediaUrl(`https://image.tmdb.org/t/p/w500/x.jpg`, B)).toBe(false);
  });

  it('ajoute et retire le jeton sans toucher au reste', () => {
    expect(addMediaToken('/a.ts', 'T')).toBe('/a.ts?pmt=T');
    expect(addMediaToken('/a.m3u8?info_hash=h', 'T')).toBe('/a.m3u8?info_hash=h&pmt=T');
    expect(addMediaToken('/a.m3u8?pmt=OLD', 'T')).toBe('/a.m3u8?pmt=OLD');
    expect(addMediaToken('/a.ts#t=5', 'T')).toBe('/a.ts?pmt=T#t=5');
    expect(stripMediaToken('/a.m3u8?info_hash=h&pmt=T')).toBe('/a.m3u8?info_hash=h');
    expect(stripMediaToken('/a.ts?pmt=T')).toBe('/a.ts');
    expect(stripMediaToken('/a.ts?pmt=T#t=5')).toBe('/a.ts#t=5');
    expect(stripMediaToken('/a.ts?x=1')).toBe('/a.ts?x=1');
  });
});
