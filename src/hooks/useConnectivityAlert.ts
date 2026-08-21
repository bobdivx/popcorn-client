import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { SeedingDiagnostic } from './useSeedingHealth';
import {
  connectivityHasActionableIssue,
  connectivityWarningFingerprint,
  readConnectivityDismissedFingerprint,
  writeConnectivityDismissedFingerprint,
  clearConnectivityDismissedFingerprint,
} from '../lib/connectivity-warning';

export function useConnectivityAlert(
  diagnostic: SeedingDiagnostic | null,
  loading: boolean
) {
  const prevActionableRef = useRef<boolean | undefined>();
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(() =>
    readConnectivityDismissedFingerprint()
  );

  const actionable = !!diagnostic && connectivityHasActionableIssue(diagnostic);
  const fingerprint =
    actionable && diagnostic ? connectivityWarningFingerprint(diagnostic) : '';

  useEffect(() => {
    if (!diagnostic) return;

    const prev = prevActionableRef.current;
    prevActionableRef.current = actionable;

    if (prev === false && actionable) {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
      return;
    }

    if (!fingerprint) return;

    const stored = readConnectivityDismissedFingerprint();
    if (stored && stored !== fingerprint) {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
    }
  }, [actionable, fingerprint, diagnostic]);

  const isDismissed = fingerprint !== '' && dismissedFingerprint === fingerprint;
  const hasIssue = !loading && actionable && !isDismissed;
  const hasHiddenAlert = !loading && actionable && isDismissed;

  const dismiss = useCallback(() => {
    if (!fingerprint) return;
    setDismissedFingerprint(fingerprint);
    writeConnectivityDismissedFingerprint(fingerprint);
  }, [fingerprint]);

  const restore = useCallback(() => {
    setDismissedFingerprint(null);
    clearConnectivityDismissedFingerprint();
  }, []);

  return { hasIssue, hasHiddenAlert, dismiss, restore };
}
