import { describe, expect, it } from 'vitest';
import {
  cycleThemePreference,
  msUntilNextThemeSwitch,
  resolveTheme,
  themeFromTimeOfDay,
} from './color-scheme';

describe('themeFromTimeOfDay', () => {
  it('est clair de 7 h à 20 h', () => {
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 7, 0, 0))).toBe('light');
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 12, 0, 0))).toBe('light');
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 19, 59, 0))).toBe('light');
  });

  it('est sombre le soir et tôt le matin', () => {
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 20, 0, 0))).toBe('dark');
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 23, 0, 0))).toBe('dark');
    expect(themeFromTimeOfDay(new Date(2026, 7, 20, 6, 59, 0))).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('respecte le choix manuel', () => {
    const night = new Date(2026, 7, 20, 23, 0, 0);
    expect(resolveTheme('light', night)).toBe('light');
    expect(resolveTheme('dark', new Date(2026, 7, 20, 10, 0, 0))).toBe('dark');
  });

  it('suit l’heure en mode auto', () => {
    expect(resolveTheme('auto', new Date(2026, 7, 20, 10, 0, 0))).toBe('light');
    expect(resolveTheme('auto', new Date(2026, 7, 20, 22, 0, 0))).toBe('dark');
  });
});

describe('cycleThemePreference', () => {
  it('enchaîne clair → sombre → auto', () => {
    expect(cycleThemePreference('light')).toBe('dark');
    expect(cycleThemePreference('dark')).toBe('auto');
    expect(cycleThemePreference('auto')).toBe('light');
  });
});

describe('msUntilNextThemeSwitch', () => {
  it('vise 20 h pendant la journée', () => {
    const atNoon = new Date(2026, 7, 20, 12, 0, 0);
    const untilNight = new Date(2026, 7, 20, 20, 0, 0).getTime() - atNoon.getTime();
    expect(msUntilNextThemeSwitch(atNoon)).toBe(untilNight);
  });
});
