import { describe, expect, it } from 'vitest';
import {
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
    expect(resolveBootIntroMp4('file:')).toBe('./intro.mp4');
    expect(resolveBootIntroGif('file:')).toBe('./intro.gif');
  });

  it('utilise la racine absolue en HTTP', () => {
    expect(resolveBootIntroMp4('https:')).toBe('/intro.mp4');
    expect(resolveBootIntroGif('http:')).toBe('/intro.gif');
  });
});
