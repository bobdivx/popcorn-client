import { describe, expect, it } from 'vitest';
import {
  BOOT_INTRO_GIF_FILE,
  BOOT_INTRO_MP4_FILE,
  playIntroWithSound,
  resolveBootIntroGif,
  resolveBootIntroMp4,
  shouldShowBootIntro,
} from './boot-intro';

describe('shouldShowBootIntro', () => {
  it('TV : affiche à chaque nouvelle session', () => {
    expect(
      shouldShowBootIntro({ isTvBoot: true, sessionSeen: false, foreverSkipped: true }),
    ).toBe(true);
    expect(
      shouldShowBootIntro({ isTvBoot: true, sessionSeen: true, foreverSkipped: false }),
    ).toBe(false);
  });

  it('desktop : une seule fois via foreverSkipped', () => {
    expect(
      shouldShowBootIntro({ isTvBoot: false, sessionSeen: false, foreverSkipped: false }),
    ).toBe(true);
    expect(
      shouldShowBootIntro({ isTvBoot: false, sessionSeen: false, foreverSkipped: true }),
    ).toBe(false);
  });
});

describe('resolveBootIntro assets', () => {
  it('utilise un chemin relatif sous file:// (webOS IPK)', () => {
    expect(resolveBootIntroMp4('file:')).toBe(`./${BOOT_INTRO_MP4_FILE}`);
    expect(resolveBootIntroGif('file:')).toBe(`./${BOOT_INTRO_GIF_FILE}`);
  });

  it('utilise la racine absolue en HTTP', () => {
    expect(resolveBootIntroMp4('https:')).toBe(`/${BOOT_INTRO_MP4_FILE}`);
    expect(resolveBootIntroGif('http:')).toBe(`/${BOOT_INTRO_GIF_FILE}`);
  });

  it('noms versionnés (cache-busting) et présents dans public/', async () => {
    expect(BOOT_INTRO_MP4_FILE).toMatch(/^intro-[0-9a-f]{8}\.mp4$/);
    expect(BOOT_INTRO_GIF_FILE).toMatch(/^intro-[0-9a-f]{8}\.gif$/);
    const { existsSync } = await import('node:fs');
    expect(existsSync(`public/${BOOT_INTRO_MP4_FILE}`)).toBe(true);
    expect(existsSync(`public/${BOOT_INTRO_GIF_FILE}`)).toBe(true);
  });
});

function fakeVideo(blockSound: boolean, failAll = false) {
  const v = {
    muted: true,
    defaultMuted: true,
    volume: 0.5,
    playsInline: false,
    setAttribute: () => {},
    removeAttribute: () => {},
    play: () => {
      if (failAll) return Promise.reject(Object.assign(new Error('codec'), { name: 'NotSupportedError' }));
      if (blockSound && !v.muted) {
        return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      }
      return Promise.resolve();
    },
  };
  return v as unknown as HTMLVideoElement & { muted: boolean; volume: number };
}

describe('playIntroWithSound', () => {
  it('joue avec le son quand l\'autoplay sonore est autorisé (apps TV / Android / Tauri)', async () => {
    const v = fakeVideo(false);
    await expect(playIntroWithSound(v)).resolves.toBe('sound');
    expect(v.muted).toBe(false);
    expect(v.volume).toBe(1);
  });

  it('se replie en muet si le navigateur bloque l\'autoplay sonore (web)', async () => {
    const v = fakeVideo(true);
    await expect(playIntroWithSound(v)).resolves.toBe('muted');
    expect(v.muted).toBe(true);
  });

  it('rejette si même la lecture muette échoue (fallback GIF côté composant)', async () => {
    const v = fakeVideo(true, true);
    await expect(playIntroWithSound(v)).rejects.toBeTruthy();
  });
});
