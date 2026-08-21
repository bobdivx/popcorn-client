import type { SeedingDiagnostic } from '../hooks/useSeedingHealth';

export const CONNECTIVITY_DISMISS_STORAGE_KEY = 'popcorn_connectivity_warning_dismissed';

/** Swarm saturé de seeders : informatif, pas un problème de port / connectivité. */
export function isInformationalSeedingWarning(warning: string): boolean {
  return /pas un problème de port|swarm est saturé|saturated with seeders|peu ou pas de leechers|not (usually )?a port (problem|issue)/i.test(
    warning
  );
}

function normalizeWarningForFingerprint(warning: string): string {
  return warning.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

export function connectivityActionableWarnings(diagnostic: SeedingDiagnostic): string[] {
  return (diagnostic.warnings ?? []).filter((w) => !isInformationalSeedingWarning(w));
}

/** Badge / carte : uniquement les vrais soucis (librqbit, port, 0 peer vu). */
export function connectivityHasActionableIssue(diagnostic: SeedingDiagnostic): boolean {
  if (diagnostic.status === 'error') return true;
  if (diagnostic.status === 'ok') return false;
  return connectivityActionableWarnings(diagnostic).length > 0;
}

export function connectivityWarningFingerprint(diagnostic: SeedingDiagnostic): string {
  const parts = connectivityActionableWarnings(diagnostic).map(normalizeWarningForFingerprint);
  return `${diagnostic.status}|${parts.join('\u0000')}`;
}

export function readConnectivityDismissedFingerprint(): string | null {
  try {
    return localStorage.getItem(CONNECTIVITY_DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeConnectivityDismissedFingerprint(fingerprint: string): void {
  try {
    localStorage.setItem(CONNECTIVITY_DISMISS_STORAGE_KEY, fingerprint);
  } catch {
    /* ignore */
  }
}

export function clearConnectivityDismissedFingerprint(): void {
  try {
    localStorage.removeItem(CONNECTIVITY_DISMISS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
