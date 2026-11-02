/**
 * Torrent bloqué par le tracker (compte sans marge) et sans aucune donnée reçue :
 * candidat au bouton « Relancer avec un autre compte » (ouvert à tout membre connecté,
 * le serveur revérifie tout : blocage actif, 0 octet, limites, autre compte disponible).
 */
export interface AccountBlockCandidate {
  info_hash?: string | null;
  state?: string | null;
  downloaded_bytes?: number | null;
  progress?: number | null;
  files_available?: boolean | null;
  tracker_account_blocked?: boolean | null;
}

const HEX_HASH = /^[a-fA-F0-9]{40}$/;

export function isAccountBlockedStalled(t: AccountBlockCandidate | null | undefined): boolean {
  if (!t || t.tracker_account_blocked !== true) return false;
  if (!t.info_hash || !HEX_HASH.test(String(t.info_hash).trim())) return false;
  if (t.state === 'completed' || t.state === 'seeding' || t.files_available === true) return false;
  if ((t.downloaded_bytes ?? 0) > 0 || (t.progress ?? 0) > 0) return false;
  return true;
}

/** Message d'échec : texte serveur (français, sans secret) sinon libellé générique. */
export function resnatchFailureMessage(
  res: { message?: string; error?: string } | null | undefined,
  fallback: string,
): string {
  const m = (res?.message || res?.error || '').trim();
  return m || fallback;
}
