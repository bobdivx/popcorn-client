import { describe, expect, it } from 'vitest';
import { detectSystemLanguage } from './i18n-store';

describe('detectSystemLanguage', () => {
  it('maps regional tags to a supported language', () => {
    expect(detectSystemLanguage(['en-US', 'fr-FR'])).toBe('en');
    expect(detectSystemLanguage(['fr-CA'])).toBe('fr');
  });
  it('skips unsupported languages', () => {
    expect(detectSystemLanguage(['de-DE', 'en-GB'])).toBe('en');
    expect(detectSystemLanguage(['de-DE'])).toBeNull();
    expect(detectSystemLanguage([])).toBeNull();
  });
});
