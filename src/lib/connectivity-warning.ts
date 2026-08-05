import type { SeedingDiagnostic } from '../hooks/useSeedingHealth';

export const CONNECTIVITY_DISMISS_STORAGE_KEY = 'popcorn_connectivity_warning_dismissed';

export function connectivityWarningFingerprint(diagnostic: SeedingDiagnostic): string {
  return `${diagnostic.status}|${(diagnostic.warnings ?? []).join('\u0000')}`;
}

export function readConnectivityDismissedFingerprint(): string | null {
  try {
    return sessionStorage.getItem(CONNECTIVITY_DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeConnectivityDismissedFingerprint(fingerprint: string): void {
  try {
    sessionStorage.setItem(CONNECTIVITY_DISMISS_STORAGE_KEY, fingerprint);
  } catch {
    /* ignore */
  }
}

export function clearConnectivityDismissedFingerprint(): void {
  try {
    sessionStorage.removeItem(CONNECTIVITY_DISMISS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
