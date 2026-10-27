/**
 * Prérequis côté propriétaire avant d'inviter quelqu'un.
 *
 * L'invité ouvre son lien d'invitation puis Popcornn sur https://client.popcornn.app (HTTPS,
 * depuis Internet) : l'URL du serveur enregistrée dans la configuration cloud (backendUrl) doit
 * donc être joignable publiquement en HTTPS. Une adresse vide, en HTTP (contenu mixte bloqué par
 * le navigateur) ou sur le réseau local / privé (192.168.x.x, 10.x, localhost, *.local, Tailscale
 * 100.64/10…) ne fonctionnera pas chez l'invité.
 */

export type GuestBackendIssue = 'missing' | 'invalid' | 'private' | 'http';

export type GuestBackendCheck = { ok: true; url: string } | { ok: false; issue: GuestBackendIssue; url: string };

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;
  // fc00::/7 (adresses uniques locales) et fe80::/10 (lien local)
  return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
}

/** Nom d'hôte non joignable depuis Internet (réseau local, privé ou machine elle-même). */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/\.(local|lan|home|internal|intranet|localdomain|home\.arpa)$/.test(host)) return true;
  // Nom sans point (ex. « nas ») : résolu uniquement sur le réseau local.
  if (!host.includes('.') && !host.includes(':')) return true;
  return isPrivateIPv4(host) || isPrivateIPv6(host);
}

/** Vérifie que l'URL du serveur du propriétaire sera utilisable par un invité. */
export function checkBackendUrlForGuests(backendUrl: string | null | undefined): GuestBackendCheck {
  const url = String(backendUrl ?? '').trim();
  if (!url) return { ok: false, issue: 'missing', url };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, issue: 'invalid', url };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, issue: 'invalid', url };
  if (isPrivateOrLocalHost(parsed.hostname)) return { ok: false, issue: 'private', url };
  if (parsed.protocol !== 'https:') return { ok: false, issue: 'http', url };
  return { ok: true, url };
}

/** Clé i18n (settingsMenu.localUsers.*) du message d'avertissement pour un problème donné. */
export function guestBackendIssueKey(issue: GuestBackendIssue): string {
  switch (issue) {
    case 'missing':
      return 'settingsMenu.localUsers.serverMissing';
    case 'invalid':
      return 'settingsMenu.localUsers.serverInvalid';
    case 'private':
      return 'settingsMenu.localUsers.serverPrivate';
    case 'http':
      return 'settingsMenu.localUsers.serverHttp';
  }
}
