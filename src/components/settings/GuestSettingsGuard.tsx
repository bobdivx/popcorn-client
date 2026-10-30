import { useEffect } from 'preact/hooks';
import { isLocalUser, isMsStoreLocalServerAdmin } from '../../lib/permissions';

/**
 * Invités (profils du compte principal) : seules les pages de réglages personnelles sont
 * accessibles (profil, interface, lecture, favoris). Toute autre page de réglages (serveur,
 * indexers, bibliothèque, utilisateurs, amis, abonnement…) renvoie vers le hub /settings,
 * qui n'affiche aux invités que leurs réglages personnels.
 * Le serveur refuse de toute façon ces actions aux invités (403) : ceci n'est que l'interface.
 */
const GUEST_ALLOWED_SETTINGS = [
  '/settings',
  '/settings/account',
  '/settings/ui-preferences',
  '/settings/interface',
  '/settings/playback',
  '/settings/favorites',
];

const GUEST_ALLOWED_ACCOUNT_SUBS = ['profile'];

export function isSettingsPathAllowedForGuest(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (!GUEST_ALLOWED_SETTINGS.includes(path)) return false;
  if (path === '/settings/account') {
    const sub = new URLSearchParams(search).get('sub');
    return !sub || GUEST_ALLOWED_ACCOUNT_SUBS.includes(sub);
  }
  return true;
}

export default function GuestSettingsGuard() {
  useEffect(() => {
    const check = () => {
      if (typeof window === 'undefined' || !isLocalUser() || isMsStoreLocalServerAdmin()) return;
      const { pathname, search } = window.location;
      if (!isSettingsPathAllowedForGuest(pathname, search)) {
        window.location.replace('/settings');
      }
    };
    check();
    document.addEventListener('astro:page-load', check);
    return () => document.removeEventListener('astro:page-load', check);
  }, []);
  return null;
}
