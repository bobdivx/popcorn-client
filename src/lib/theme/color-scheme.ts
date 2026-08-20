import { PreferencesManager } from '../client/storage';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

/** Clair de 7 h (inclus) à 20 h (exclus). Sombre le reste de la journée. */
export const THEME_DAY_START_HOUR = 7;
export const THEME_NIGHT_START_HOUR = 20;

export const THEME_CHANGED_EVENT = 'popcorn-theme-changed';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export function themeFromTimeOfDay(date: Date = new Date()): ResolvedTheme {
  const hour = date.getHours();
  return hour >= THEME_DAY_START_HOUR && hour < THEME_NIGHT_START_HOUR ? 'light' : 'dark';
}

export function resolveTheme(preference: ThemePreference, date: Date = new Date()): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return themeFromTimeOfDay(date);
}

export function readThemePreference(): ThemePreference {
  const stored = PreferencesManager.getPreferences().theme;
  return isThemePreference(stored) ? stored : 'auto';
}

export function applyTheme(preference: ThemePreference = readThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

export function saveTheme(preference: ThemePreference): ResolvedTheme {
  PreferencesManager.updatePreferences({ theme: preference });
  const resolved = applyTheme(preference);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme: preference, resolved } }));
  }
  return resolved;
}

/** Clic header : clair → sombre → automatique (heure) → clair. */
export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'auto';
  return 'light';
}

export function msUntilNextThemeSwitch(date: Date = new Date()): number {
  const next = new Date(date.getTime());
  const hour = date.getHours();
  if (hour >= THEME_DAY_START_HOUR && hour < THEME_NIGHT_START_HOUR) {
    next.setHours(THEME_NIGHT_START_HOUR, 0, 0, 0);
  } else if (hour < THEME_DAY_START_HOUR) {
    next.setHours(THEME_DAY_START_HOUR, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(THEME_DAY_START_HOUR, 0, 0, 0);
  }
  return Math.max(1_000, next.getTime() - date.getTime());
}
