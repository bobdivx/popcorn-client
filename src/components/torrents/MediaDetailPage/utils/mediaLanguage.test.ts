import { describe, expect, it } from 'vitest';
import {
  collectAvailableMediaLanguages,
  mediaLanguageLabel,
  normalizeMediaLanguage,
  variantMediaLanguage,
} from './mediaLanguage';

describe('mediaLanguage', () => {
  it('normalise les alias FR / VF', () => {
    expect(normalizeMediaLanguage('fr')).toBe('FRENCH');
    expect(normalizeMediaLanguage('VF')).toBe('FRENCH');
    expect(normalizeMediaLanguage('vostfr')).toBe('VOSTFR');
    expect(normalizeMediaLanguage('ENG')).toBe('ENGLISH');
  });

  it('affiche des labels courts', () => {
    expect(mediaLanguageLabel('FRENCH')).toBe('VF');
    expect(mediaLanguageLabel('MULTI')).toBe('Multi');
    expect(mediaLanguageLabel('VOSTFR')).toBe('VOSTFR');
  });

  it('collecte les langues uniques des variantes', () => {
    const langs = collectAvailableMediaLanguages([
      { language: 'FRENCH' },
      { quality: { language: 'vostfr' } },
      { language: 'FR' },
      { language: null },
    ]);
    expect(langs).toEqual(['FRENCH', 'VOSTFR']);
  });

  it('extrait la langue depuis le nom si besoin', () => {
    expect(variantMediaLanguage({ name: 'Film.2024.FRENCH.1080p.WEB' })).toBe('FRENCH');
    expect(
      collectAvailableMediaLanguages([
        { name: 'A.MULTI.1080p' },
        { name: 'A.VOSTFR.720p' },
      ]),
    ).toEqual(['MULTI', 'VOSTFR']);
  });
});
