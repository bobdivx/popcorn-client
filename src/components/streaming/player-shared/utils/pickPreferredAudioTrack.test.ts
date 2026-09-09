import { describe, expect, it } from 'vitest';
import {
  audioTrackMatchesPreferred,
  pickPreferredAudioTrackId,
  resolvePreferredAudioLanguage,
} from './pickPreferredAudioTrack';

describe('resolvePreferredAudioLanguage', () => {
  it('utilise la langue UX quand la config est auto', () => {
    expect(resolvePreferredAudioLanguage('auto', 'fr')).toBe('fr');
    expect(resolvePreferredAudioLanguage(undefined, 'en')).toBe('en');
  });

  it('priorise une préférence lecteur explicite', () => {
    expect(resolvePreferredAudioLanguage('en', 'fr')).toBe('en');
  });
});

describe('audioTrackMatchesPreferred', () => {
  it('reconnaît les codes ffprobe français', () => {
    expect(audioTrackMatchesPreferred({ id: 1, lang: 'fre' }, 'fr')).toBe(true);
    expect(audioTrackMatchesPreferred({ id: 1, lang: 'fra' }, 'fr')).toBe(true);
    expect(audioTrackMatchesPreferred({ id: 1, lang: 'fr-FR' }, 'fr')).toBe(true);
  });

  it('reconnaît un titre VF / Français', () => {
    expect(audioTrackMatchesPreferred({ id: 1, title: 'Français' }, 'fr')).toBe(true);
    expect(audioTrackMatchesPreferred({ id: 1, name: 'TrueFrench' }, 'fr')).toBe(true);
    expect(audioTrackMatchesPreferred({ id: 1, name: 'VFF' }, 'fr')).toBe(true);
  });

  it('ne confond pas VO anglais avec fr', () => {
    expect(audioTrackMatchesPreferred({ id: 0, lang: 'eng', name: 'English' }, 'fr')).toBe(false);
  });
});

describe('pickPreferredAudioTrackId', () => {
  const multi = [
    { id: 0, lang: 'eng', name: 'English', default: true },
    { id: 1, lang: 'fre', name: 'Français' },
  ];

  it('choisit le français pour UX fr même si default = eng', () => {
    expect(pickPreferredAudioTrackId(multi, 'fr')).toBe(1);
  });

  it('choisit l’anglais pour UX en', () => {
    expect(pickPreferredAudioTrackId(multi, 'en')).toBe(0);
  });

  it('fallback default puis première piste', () => {
    expect(pickPreferredAudioTrackId(multi, 'de')).toBe(0);
    expect(
      pickPreferredAudioTrackId(
        [
          { id: 2, lang: 'jpn' },
          { id: 3, lang: 'kor' },
        ],
        'de',
      ),
    ).toBe(2);
  });
});
